import { AppError } from '../utils/AppError.js';
import { ObjectId } from 'mongodb';
import { getGridFSBucket, initializeMongoDB } from '../config/mongo.js';
import {
  findCropImageForCrop,
  findCropImagesForCrop,
} from '../models/cropImageModel.js';
import {
  deleteCropImage,
  uploadCropImages,
} from '../services/cropImageService.js';

function mayViewCropImages(crop, user) {
  return crop.crop_status === 'available' ||
    (user?.role === 'farmer' && user.id === crop.farmer_id);
}

function getImageCacheControl(crop) {
  return crop.crop_status === 'available'
    ? 'public, max-age=60'
    : 'private, no-store';
}

function unavailableImageStorage() {
  return new AppError(503, 'Image storage is unavailable. Please try again later.');
}

function imageNotFound() {
  return new AppError(404, 'Image not found.');
}

export function createCropImageRetrievalHandlers({
  findImages = findCropImagesForCrop,
  findImage = findCropImageForCrop,
  initializeMongo = initializeMongoDB,
  getBucket = getGridFSBucket,
} = {}) {
  async function getCropImagesController(request, response, next) {
    try {
      const rows = await findImages(request.params.cropId);
      if (rows.length === 0 || !mayViewCropImages(rows[0], request.user)) {
        throw imageNotFound();
      }

      response
        .set('Cache-Control', getImageCacheControl(rows[0]))
        .status(200)
        .json({
          success: true,
          images: rows
            .filter((row) => row.image_id !== null)
            .map((row) => ({
              id: row.image_id,
              cropId: row.crop_id,
              contentType: row.content_type,
              fileSize: row.file_size,
              checksum: row.checksum,
              displayOrder: row.display_order,
              createdAt: row.created_at,
            })),
        });
    } catch (error) {
      next(error instanceof AppError
        ? error
        : new AppError(500, 'Unable to retrieve crop images.'));
    }
  }

  async function getCropImageController(request, response, next) {
    let downloadStream;
    try {
      const image = await findImage(request.params.cropId, request.params.imageId);
      if (!image || !mayViewCropImages(image, request.user)) {
        throw imageNotFound();
      }

      let bucket;
      let gridfsFileId;
      try {
        await initializeMongo();
        bucket = getBucket();
        gridfsFileId = new ObjectId(image.gridfs_file_id.trim());
      } catch {
        throw unavailableImageStorage();
      }

      let exists;
      try {
        const gridfsFile = await bucket.find({ _id: gridfsFileId }).limit(1).next();
        exists = Boolean(gridfsFile);
      } catch {
        throw unavailableImageStorage();
      }
      if (!exists) {
        throw imageNotFound();
      }

      try {
        downloadStream = bucket.openDownloadStream(gridfsFileId);
      } catch {
        throw unavailableImageStorage();
      }

      response.status(200).set({
        'Content-Type': image.content_type,
        'Content-Length': String(image.file_size),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': getImageCacheControl(image),
        ETag: `"${image.checksum}"`,
      });

      downloadStream.once('error', () => {
        if (response.headersSent) {
          response.destroy();
          return;
        }
        next(unavailableImageStorage());
      });
      response.once('close', () => {
        if (!downloadStream.destroyed) {
          downloadStream.destroy();
        }
      });
      downloadStream.pipe(response);
    } catch (error) {
      if (downloadStream && !downloadStream.destroyed) {
        downloadStream.destroy();
      }
      next(error instanceof AppError
        ? error
        : new AppError(500, 'Unable to retrieve crop image.'));
    }
  }

  return { getCropImagesController, getCropImageController };
}

export const {
  getCropImagesController,
  getCropImageController,
} = createCropImageRetrievalHandlers();

export async function uploadCropImagesController(request, response, next) {
  try {
    const images = await uploadCropImages({
      cropId: request.params.cropId,
      farmerId: request.user.id,
      files: request.files,
      tempDirectory: request.cropImageTempDirectory,
    });

    response.status(201).json({
      success: true,
      images: images.map((image) => ({
        id: image.id,
        cropId: image.crop_id,
        gridfsFileId: image.gridfs_file_id.trim(),
        contentType: image.content_type,
        fileSize: image.file_size,
        checksum: image.checksum,
        displayOrder: image.display_order,
        createdAt: image.created_at,
      })),
    });
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(500, 'Unable to upload crop images.'));
  }
}

export function createCropImageDeletionHandler({
  deleteImage = deleteCropImage,
} = {}) {
  return async function deleteCropImageController(request, response, next) {
    try {
      const result = await deleteImage({
        cropId: request.params.cropId,
        imageId: request.params.imageId,
        farmerId: request.user.id,
      });

      response.status(result.cleanupPending ? 202 : 200).json({
        success: true,
        message: result.cleanupPending
          ? 'Image reference removed; storage cleanup is pending.'
          : 'Crop image deleted successfully.',
        cleanupPending: result.cleanupPending,
      });
    } catch (error) {
      next(error instanceof AppError
        ? error
        : new AppError(500, 'Unable to delete crop image.'));
    }
  };
}

export const deleteCropImageController = createCropImageDeletionHandler();
