import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import multer from 'multer';
import { pool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';

export const MAX_CROP_IMAGES = 5;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_CONCURRENT_UPLOADS = 2;
let activeUploads = 0;

export function requireFarmerForImageUpload(request, response, next) {
  if (request.user?.role !== 'farmer') {
    return next(new AppError(403, 'Only farmers can upload crop images.'));
  }
  next();
}

export function validateCropImageId(request, response, next) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.cropId)) {
    return next(new AppError(400, 'Invalid crop ID.'));
  }
  next();
}

export function validateCropImageParams(request, response, next) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.cropId) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.imageId)
  ) {
    return next(new AppError(400, 'Invalid crop or image ID.'));
  }
  next();
}

export async function verifyCropImageOwnership(request, response, next) {
  try {
    const result = await pool.query(
      'SELECT id, farmer_id FROM crops WHERE id = $1',
      [request.params.cropId],
    );
    if (result.rowCount === 0) {
      return next(new AppError(404, 'Crop not found.'));
    }
    if (result.rows[0].farmer_id !== request.user.id) {
      return next(new AppError(403, 'You can only upload images for your own crops.'));
    }
    next();
  } catch {
    next(new AppError(500, 'Unable to verify crop ownership.'));
  }
}

export function limitConcurrentCropImageUploads(request, response, next) {
  if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
    return next(new AppError(503, 'Image upload capacity is currently full.'));
  }

  activeUploads += 1;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      activeUploads -= 1;
    }
  };
  response.once('finish', release);
  response.once('close', release);
  next();
}

const storage = multer.diskStorage({
  destination(request, file, callback) {
    if (request.cropImageTempDirectory) {
      callback(null, request.cropImageTempDirectory);
      return;
    }

    mkdtemp(join(tmpdir(), 'agriconnect-crop-upload-'))
      .then((directory) => {
        request.cropImageTempDirectory = directory;
        callback(null, directory);
      })
      .catch(() => callback(new AppError(500, 'Unable to prepare image upload.')));
  },
  filename(request, file, callback) {
    callback(null, randomUUID());
  },
});

const parseMultipart = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: MAX_CROP_IMAGES,
    fields: 0,
    parts: MAX_CROP_IMAGES,
  },
}).array('images', MAX_CROP_IMAGES);

export async function cleanupCropImageTempFiles(request) {
  if (request.cropImageTempDirectory) {
    const directory = request.cropImageTempDirectory;
    request.cropImageTempDirectory = undefined;
    await rm(directory, { recursive: true, force: true });
  }
}

export function parseCropImageMultipart(request, response, next) {
  parseMultipart(request, response, async (error) => {
    if (error) {
      try {
        await cleanupCropImageTempFiles(request);
      } catch {
        return next(new AppError(500, 'Unable to clean temporary upload data.'));
      }

      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, 'Each image must be 5 MB or smaller.'));
      }
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_COUNT') {
        return next(new AppError(400, 'Upload no more than 5 images at a time.'));
      }
      if (error instanceof multer.MulterError) {
        return next(new AppError(400, 'Invalid image upload request.'));
      }
      return next(error);
    }
    next();
  });
}
