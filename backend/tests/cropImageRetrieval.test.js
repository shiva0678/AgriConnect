import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import {
  createCropImageRetrievalHandlers,
} from '../controllers/cropImageController.js';
import { optionalAuthenticateToken } from '../middleware/authMiddleware.js';
import {
  validateCropImageId,
  validateCropImageParams,
} from '../middleware/cropImageUpload.js';
import { AppError } from '../utils/AppError.js';

const JWT_SECRET = process.env.JWT_SECRET;
const CROP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const IMAGE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_FARMER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const GRIDFS_ID = '0123456789abcdef01234567';
const IMAGE_BYTES = Buffer.from('safe-raster-image');

function makeImage({ cropStatus = 'available', farmerId = OWNER_ID } = {}) {
  return {
    crop_id: CROP_ID,
    farmer_id: farmerId,
    crop_status: cropStatus,
    image_id: IMAGE_ID,
    gridfs_file_id: GRIDFS_ID,
    content_type: 'image/png',
    file_size: IMAGE_BYTES.length,
    checksum: 'a'.repeat(64),
    display_order: 0,
    created_at: '2026-11-22T00:00:00.000Z',
  };
}

function makeBucket({ exists = true, streamError } = {}) {
  let downloadedId;
  return {
    get downloadedId() {
      return downloadedId;
    },
    find(filter) {
      assert.equal(filter._id.toHexString(), GRIDFS_ID);
      return {
        limit() {
          return this;
        },
        next: async () => (exists ? { _id: filter._id } : null),
      };
    },
    openDownloadStream(id) {
      downloadedId = id.toHexString();
      const stream = new Readable({
        read() {
          if (streamError) {
            this.destroy(streamError);
            return;
          }
          this.push(IMAGE_BYTES);
          this.push(null);
        },
      });
      return stream;
    },
  };
}

function makeRetrievalApp({
  rows = [makeImage()],
  image = makeImage(),
  bucket = makeBucket(),
  initializeError,
} = {}) {
  const handlers = createCropImageRetrievalHandlers({
    findImages: async () => rows,
    findImage: async () => image,
    initializeMongo: async () => {
      if (initializeError) throw initializeError;
    },
    getBucket: () => bucket,
  });
  const app = express();
  app.get(
    '/crops/:cropId/images',
    optionalAuthenticateToken,
    validateCropImageId,
    handlers.getCropImagesController,
  );
  app.get(
    '/crops/:cropId/images/:imageId',
    optionalAuthenticateToken,
    validateCropImageParams,
    handlers.getCropImageController,
  );
  app.use((error, request, response, next) => {
    const status = error instanceof AppError ? error.status : 500;
    response.status(status).json({
      success: false,
      message: error.message,
    });
  });
  return app;
}

function tokenFor(id, role = 'farmer') {
  return jwt.sign({ id, role, email: `${role}@example.com` }, JWT_SECRET);
}

test('returns public crop image metadata without GridFS identifiers', async () => {
  const response = await request(makeRetrievalApp())
    .get(`/crops/${CROP_ID}/images`);

  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'public, max-age=60');
  assert.deepEqual(response.body.images, [{
    id: IMAGE_ID,
    cropId: CROP_ID,
    contentType: 'image/png',
    fileSize: IMAGE_BYTES.length,
    checksum: 'a'.repeat(64),
    displayOrder: 0,
    createdAt: '2026-11-22T00:00:00.000Z',
  }]);
  assert.equal('gridfs_file_id' in response.body.images[0], false);
});

test('streams a referenced GridFS image with verified security and cache headers', async () => {
  const bucket = makeBucket();
  const response = await request(makeRetrievalApp({ bucket }))
    .get(`/crops/${CROP_ID}/images/${IMAGE_ID}`);

  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'image/png');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['cache-control'], 'public, max-age=60');
  assert.equal(response.headers.etag, `"${'a'.repeat(64)}"`);
  assert.equal(response.body.toString(), IMAGE_BYTES.toString());
  assert.equal(bucket.downloadedId, GRIDFS_ID);
});

test('rejects invalid crop and image identifiers before querying storage', async () => {
  const app = makeRetrievalApp();
  const invalidCrop = await request(app).get('/crops/not-a-uuid/images');
  const invalidImage = await request(app)
    .get(`/crops/${CROP_ID}/images/not-a-uuid`);

  assert.equal(invalidCrop.status, 400);
  assert.equal(invalidImage.status, 400);
});

test('returns a safe not-found response when the PostgreSQL image reference is missing', async () => {
  const response = await request(makeRetrievalApp({ image: null }))
    .get(`/crops/${CROP_ID}/images/${IMAGE_ID}`);

  assert.equal(response.status, 404);
  assert.equal(response.body.message, 'Image not found.');
});

test('allows available crops publicly and lets only the owner view private crop images', async () => {
  const publicResponse = await request(makeRetrievalApp())
    .get(`/crops/${CROP_ID}/images/${IMAGE_ID}`);
  assert.equal(publicResponse.status, 200);

  const privateImage = makeImage({ cropStatus: 'inactive' });
  const privateApp = makeRetrievalApp({ image: privateImage });
  const forbidden = await request(privateApp)
    .get(`/crops/${CROP_ID}/images/${IMAGE_ID}`)
    .set('Authorization', `Bearer ${tokenFor(OTHER_FARMER_ID)}`);
  assert.equal(forbidden.status, 404);

  const owner = await request(privateApp)
    .get(`/crops/${CROP_ID}/images/${IMAGE_ID}`)
    .set('Authorization', `Bearer ${tokenFor(OWNER_ID)}`);
  assert.equal(owner.status, 200);
  assert.equal(owner.headers['cache-control'], 'private, no-store');
});

test('returns not found when the referenced GridFS file is absent', async () => {
  const response = await request(makeRetrievalApp({
    bucket: makeBucket({ exists: false }),
  })).get(`/crops/${CROP_ID}/images/${IMAGE_ID}`);

  assert.equal(response.status, 404);
  assert.equal(response.body.message, 'Image not found.');
});

test('returns service unavailable when MongoDB cannot initialize', async () => {
  const response = await request(makeRetrievalApp({
    initializeError: new Error('private MongoDB connection details'),
  })).get(`/crops/${CROP_ID}/images/${IMAGE_ID}`);

  assert.equal(response.status, 503);
  assert.equal(
    response.body.message,
    'Image storage is unavailable. Please try again later.',
  );
  assert.doesNotMatch(response.body.message, /private|mongodb/i);
});

test('returns empty metadata for a crop with no image references', async () => {
  const response = await request(makeRetrievalApp({
    rows: [{ ...makeImage(), image_id: null }],
  })).get(`/crops/${CROP_ID}/images`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.images, []);
});
