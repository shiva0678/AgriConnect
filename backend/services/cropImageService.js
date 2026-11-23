import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ObjectId } from 'mongodb';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';
import { pool } from '../config/db.js';
import { getGridFSBucket, initializeMongoDB } from '../config/mongo.js';
import {
  cleanupCropImageTempFiles,
  MAX_CROP_IMAGES,
  MAX_IMAGE_SIZE_BYTES,
} from '../middleware/cropImageUpload.js';
import {
  deleteOwnedCropImageReference,
  findOwnedCropImageForDeletion,
} from '../models/cropImageModel.js';
import { AppError } from '../utils/AppError.js';

const FORMATS = {
  jpeg: { contentType: 'image/jpeg', extension: 'jpg', encode: (image) => image.jpeg({ quality: 85 }) },
  png: { contentType: 'image/png', extension: 'png', encode: (image) => image.png({ compressionLevel: 9 }) },
  webp: { contentType: 'image/webp', extension: 'webp', encode: (image) => image.webp({ quality: 85 }) },
};
const MAX_IMAGE_PIXELS = 40_000_000;

function isImageValidationError(error) {
  return error instanceof AppError;
}

async function startsWithSvg(filePath) {
  let prefix = '';
  for await (const chunk of createReadStream(filePath, { start: 0, end: 1023 })) {
    prefix += chunk.toString('utf8');
  }
  return /^\s*(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(prefix);
}

async function checksumFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function prepareImage(file, tempDirectory, imageProcessor) {
  if (!file || file.size > MAX_IMAGE_SIZE_BYTES || file.size <= 0) {
    throw new AppError(413, 'Each image must be 5 MB or smaller.');
  }

  let detectedType;
  try {
    detectedType = await fileTypeFromFile(file.path);
  } catch {
    throw new AppError(400, 'Unable to validate the uploaded image.');
  }
  if (!detectedType) {
    if (await startsWithSvg(file.path)) {
      throw new AppError(415, 'Only JPEG, PNG, and WebP images are supported.');
    }
    throw new AppError(400, 'Uploaded file has an invalid image signature.');
  }
  const [formatName, format] = Object.entries(FORMATS).find(([, candidate]) => (
    candidate.contentType === detectedType?.mime
  )) || [];
  if (!format) {
    throw new AppError(415, 'Only JPEG, PNG, and WebP images are supported.');
  }

  const image = imageProcessor(file.path, {
    failOn: 'error',
    limitInputPixels: MAX_IMAGE_PIXELS,
  });
  try {
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.format !== formatName ||
      !FORMATS[metadata.format]
    ) {
      throw new AppError(415, 'Only JPEG, PNG, and WebP images are supported.');
    }
    if (metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new AppError(413, 'Image dimensions exceed the allowed limit.');
    }

    const outputPath = join(tempDirectory, randomUUID());
    await format.encode(image.rotate()).toFile(outputPath);
    const { size } = await stat(outputPath);
    if (size <= 0 || size > MAX_IMAGE_SIZE_BYTES) {
      throw new AppError(413, 'Processed image must be 5 MB or smaller.');
    }

    return {
      contentType: format.contentType,
      extension: format.extension,
      fileSize: size,
      checksum: await checksumFile(outputPath),
      outputPath,
    };
  } catch (error) {
    if (isImageValidationError(error)) {
      throw error;
    }
    throw new AppError(400, 'Uploaded file is not a valid supported image.');
  }
}

async function removeGridFSFile(bucket, fileId, cropId, logger) {
  try {
    await bucket.delete(fileId);
  } catch {
    logger.error('GridFS cleanup failed; an orphan may need reconciliation.', {
      cropId,
      fileId: fileId.toHexString(),
    });
  }
}

export function createCropImageDeletionService({
  databasePool = pool,
  findImage = findOwnedCropImageForDeletion,
  deleteImageReference = deleteOwnedCropImageReference,
  initializeMongo = initializeMongoDB,
  getBucket = getGridFSBucket,
  logger = console,
} = {}) {
  return async function deleteCropImage({ cropId, imageId, farmerId }) {
    let image;
    try {
      image = await findImage(cropId, imageId, farmerId, databasePool);
    } catch {
      logger.error('PostgreSQL crop image lookup failed during deletion.');
      throw new AppError(500, 'Unable to delete crop image.');
    }

    if (!image) {
      throw new AppError(404, 'Image not found.');
    }

    let fileId;
    try {
      fileId = new ObjectId(image.gridfs_file_id.trim());
    } catch {
      logger.error('Invalid stored GridFS reference during crop image deletion.');
      throw new AppError(500, 'Unable to delete crop image.');
    }

    let bucket;
    try {
      await initializeMongo();
      bucket = getBucket();
    } catch {
      logger.warn('MongoDB unavailable during crop image deletion.');
      throw new AppError(503, 'Image storage is unavailable. Please try again later.');
    }

    let gridfsFile;
    try {
      gridfsFile = await bucket.find({ _id: fileId }).limit(1).next();
    } catch {
      logger.warn('MongoDB image lookup failed during crop image deletion.');
      throw new AppError(503, 'Image storage is unavailable. Please try again later.');
    }

    let deletedReference;
    try {
      deletedReference = await deleteImageReference(
        cropId,
        imageId,
        farmerId,
        databasePool,
      );
    } catch {
      logger.error('PostgreSQL crop image reference deletion failed.');
      throw new AppError(500, 'Unable to delete crop image.');
    }

    if (!deletedReference) {
      throw new AppError(404, 'Image not found.');
    }

    if (!gridfsFile) {
      return { cleanupPending: false };
    }

    try {
      await bucket.delete(fileId);
      return { cleanupPending: false };
    } catch {
      let remainingFile;
      try {
        remainingFile = await bucket.find({ _id: fileId }).limit(1).next();
      } catch {
        logger.error(
          'GridFS cleanup failed after reference deletion; an orphan may need reconciliation.',
        );
        return { cleanupPending: true };
      }

      if (!remainingFile) {
        return { cleanupPending: false };
      }

      logger.error(
        'GridFS cleanup failed after reference deletion; an orphan may need reconciliation.',
      );
      return { cleanupPending: true };
    }
  };
}

export const deleteCropImage = createCropImageDeletionService();

export function createCropImageService({
  databasePool = pool,
  initializeMongo = initializeMongoDB,
  getBucket = getGridFSBucket,
  imageProcessor = sharp,
  logger = console,
} = {}) {
  return async function uploadCropImages({ cropId, farmerId, files, tempDirectory }) {
    let bucket;
    const storedFiles = [];
    let client;
    let transactionStarted = false;

    try {
      if (!Array.isArray(files) || files.length === 0) {
        throw new AppError(400, 'At least one image is required.');
      }
      if (files.length > MAX_CROP_IMAGES) {
        throw new AppError(400, 'Upload no more than 5 images at a time.');
      }

      const preparedFiles = [];
      for (const file of files) {
        preparedFiles.push(await prepareImage(file, tempDirectory, imageProcessor));
      }

      try {
        await initializeMongo();
        bucket = getBucket();
      } catch {
        throw new AppError(503, 'Image storage is unavailable. Please try again later.');
      }

      for (const prepared of preparedFiles) {
        const fileId = new ObjectId();
        const filename = `crop-${cropId}-${randomUUID()}.${prepared.extension}`;
        let uploadStream;
        try {
          uploadStream = bucket.openUploadStreamWithId(fileId, filename, {
            contentType: prepared.contentType,
            metadata: {
              cropId,
              farmerId,
              contentType: prepared.contentType,
              fileSize: prepared.fileSize,
              checksum: prepared.checksum,
            },
          });
          await pipeline(createReadStream(prepared.outputPath), uploadStream);
        } catch {
          if (uploadStream) {
            try {
              await uploadStream.abort();
            } catch {
              logger.warn('GridFS upload abort failed; incomplete data may need reconciliation.');
            }
          }
          await removeGridFSFile(bucket, fileId, cropId, logger);
          throw new AppError(503, 'Image storage is unavailable. Please try again later.');
        }

        storedFiles.push({ fileId, ...prepared });
      }

      client = await databasePool.connect();
      await client.query('BEGIN');
      transactionStarted = true;

      const crop = await client.query(
        'SELECT id FROM crops WHERE id = $1 AND farmer_id = $2 FOR UPDATE',
        [cropId, farmerId],
      );
      if (crop.rowCount === 0) {
        throw new AppError(404, 'Crop not found.');
      }

      const countResult = await client.query(
        'SELECT COUNT(*)::int AS count FROM crop_images WHERE crop_id = $1',
        [cropId],
      );
      const currentCount = countResult.rows[0].count;
      if (currentCount + storedFiles.length > MAX_CROP_IMAGES) {
        throw new AppError(400, 'A crop can have no more than 5 images.');
      }

      const savedImages = [];
      for (const [index, file] of storedFiles.entries()) {
        const result = await client.query(
          `INSERT INTO crop_images (
            crop_id, gridfs_file_id, content_type, file_size, checksum, display_order
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, crop_id, gridfs_file_id, content_type, file_size,
            checksum, display_order, created_at`,
          [
            cropId,
            file.fileId.toHexString(),
            file.contentType,
            file.fileSize,
            file.checksum,
            currentCount + index,
          ],
        );
        savedImages.push(result.rows[0]);
      }

      await client.query('COMMIT');
      transactionStarted = false;
      return savedImages;
    } catch (error) {
      if (client && transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch {
          logger.error('PostgreSQL image reference rollback failed.');
        }
      }

      for (const file of storedFiles) {
        await removeGridFSFile(bucket, file.fileId, cropId, logger);
      }

      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Crop image upload could not be completed.');
      throw new AppError(500, 'Unable to save crop images.');
    } finally {
      client?.release();
      try {
        await cleanupCropImageTempFiles({ cropImageTempDirectory: tempDirectory });
      } catch {
        logger.warn('Temporary image upload cleanup failed.');
      }
    }
  };
}

export const uploadCropImages = createCropImageService();
