import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import {
  createCropImageDeletionHandler,
} from '../controllers/cropImageController.js';
import { createCropImageDeletionService } from '../services/cropImageService.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import {
  requireFarmerForImageDeletion,
  validateCropImageParams,
} from '../middleware/cropImageUpload.js';
import { AppError } from '../utils/AppError.js';

const JWT_SECRET = process.env.JWT_SECRET || 'crop-image-deletion-test-secret';
process.env.JWT_SECRET = JWT_SECRET;

const CROP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const IMAGE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_FARMER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const GRIDFS_ID = '0123456789abcdef01234567';

function makeDatabase({ hasReference = true, deleteFailure = false } = {}) {
  let referenceExists = hasReference;
  const queries = [];
  const database = {
    queries,
    get referenceExists() {
      return referenceExists;
    },
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.startsWith('SELECT ci.id AS image_id')) {
        const [cropId, imageId, farmerId] = values;
        const ownedReference = referenceExists
          && cropId === CROP_ID
          && imageId === IMAGE_ID
          && farmerId === OWNER_ID;
        return {
          rowCount: ownedReference ? 1 : 0,
          rows: ownedReference
            ? [{ image_id: IMAGE_ID, gridfs_file_id: GRIDFS_ID }]
            : [],
        };
      }

      if (sql.startsWith('DELETE FROM crop_images ci')) {
        if (deleteFailure) {
          throw new Error('private PostgreSQL connection details');
        }

        const [cropId, imageId, farmerId] = values;
        const ownedReference = referenceExists
          && cropId === CROP_ID
          && imageId === IMAGE_ID
          && farmerId === OWNER_ID;
        if (ownedReference) {
          referenceExists = false;
        }
        return {
          rowCount: ownedReference ? 1 : 0,
          rows: ownedReference ? [{ id: IMAGE_ID }] : [],
        };
      }

      throw new Error('Unexpected PostgreSQL query.');
    },
  };
  return database;
}

function makeBucket({
  fileExists = true,
  deleteFailure = false,
  findFailure = false,
} = {}) {
  let hasFile = fileExists;
  const deleteCalls = [];
  const bucket = {
    deleteCalls,
    find({ _id }) {
      assert.equal(_id.toHexString(), GRIDFS_ID);
      return {
        limit() {
          return this;
        },
        async next() {
          if (findFailure) {
            throw new Error('private MongoDB connection details');
          }
          return hasFile ? { _id } : null;
        },
      };
    },
    async delete(_id) {
      deleteCalls.push(_id.toHexString());
      if (deleteFailure) {
        throw new Error('private MongoDB connection details');
      }
      hasFile = false;
    },
  };
  return bucket;
}

function makeScenario({
  hasReference = true,
  gridfsFileExists = true,
  mongoError,
  mongoDeleteFailure = false,
  mongoFindFailure = false,
  postgresDeleteFailure = false,
} = {}) {
  const database = makeDatabase({
    hasReference,
    deleteFailure: postgresDeleteFailure,
  });
  const bucket = makeBucket({
    fileExists: gridfsFileExists,
    deleteFailure: mongoDeleteFailure,
    findFailure: mongoFindFailure,
  });
  const logs = [];
  const logger = {
    error: (...args) => logs.push(args),
    warn: (...args) => logs.push(args),
  };
  const deleteImage = createCropImageDeletionService({
    databasePool: database,
    initializeMongo: async () => {
      if (mongoError) throw mongoError;
    },
    getBucket: () => bucket,
    logger,
  });
  const app = express();
  app.delete(
    '/crops/:cropId/images/:imageId',
    authenticateToken,
    requireFarmerForImageDeletion,
    validateCropImageParams,
    createCropImageDeletionHandler({ deleteImage }),
  );
  app.use((error, request, response, next) => {
    const status = error instanceof AppError ? error.status : 500;
    response.status(status).json({ success: false, message: error.message });
  });
  return { app, database, bucket, logs };
}

function tokenFor(id, role = 'farmer') {
  return jwt.sign({ id, role, email: `${role}@example.com` }, JWT_SECRET);
}

function deleteRequest(app, cropId = CROP_ID, imageId = IMAGE_ID) {
  return request(app).delete(`/crops/${cropId}/images/${imageId}`);
}

test('allows the crop owner to delete the image reference and GridFS file', async () => {
  const { app, database, bucket } = makeScenario();
  const response = await deleteRequest(app)
    .set('Authorization', `Bearer ${tokenFor(OWNER_ID)}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    success: true,
    message: 'Crop image deleted successfully.',
    cleanupPending: false,
  });
  assert.equal(database.referenceExists, false);
  assert.deepEqual(bucket.deleteCalls, [GRIDFS_ID]);
});

test('rejects unauthenticated deletion requests', async () => {
  const { app, database } = makeScenario();
  const response = await deleteRequest(app);

  assert.equal(response.status, 401);
  assert.equal(database.queries.length, 0);
});

test('rejects buyer deletion requests', async () => {
  const { app, database } = makeScenario();
  const response = await deleteRequest(app)
    .set('Authorization', `Bearer ${tokenFor(OWNER_ID, 'buyer')}`);

  assert.equal(response.status, 403);
  assert.equal(database.queries.length, 0);
});

test('hides image references from farmers who do not own the crop', async () => {
  const { app, database, bucket } = makeScenario();
  const response = await deleteRequest(app)
    .set('Authorization', `Bearer ${tokenFor(OTHER_FARMER_ID)}`);

  assert.equal(response.status, 404);
  assert.equal(database.referenceExists, true);
  assert.deepEqual(bucket.deleteCalls, []);
});

test('rejects invalid crop and image IDs before querying PostgreSQL', async () => {
  const { app, database } = makeScenario();
  const token = tokenFor(OWNER_ID);
  const invalidCrop = await deleteRequest(app, 'not-a-uuid')
    .set('Authorization', `Bearer ${token}`);
  const invalidImage = await deleteRequest(app, CROP_ID, 'not-a-uuid')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(invalidCrop.status, 400);
  assert.equal(invalidImage.status, 400);
  assert.equal(database.queries.length, 0);
});

test('returns not found when the PostgreSQL image reference does not exist', async () => {
  const { app, database, bucket } = makeScenario({ hasReference: false });
  const response = await deleteRequest(app)
    .set('Authorization', `Bearer ${tokenFor(OWNER_ID)}`);

  assert.equal(response.status, 404);
  assert.equal(database.referenceExists, false);
  assert.deepEqual(bucket.deleteCalls, []);
});

test('preserves the PostgreSQL reference when MongoDB is unavailable', async () => {
  const { app, database, bucket, logs } = makeScenario({
    mongoError: new Error('private MongoDB connection details'),
  });
  const response = await deleteRequest(app)
    .set('Authorization', `Bearer ${tokenFor(OWNER_ID)}`);

  assert.equal(response.status, 503);
  assert.equal(response.body.message, 'Image storage is unavailable. Please try again later.');
  assert.equal(database.referenceExists, true);
  assert.deepEqual(bucket.deleteCalls, []);
  assert.doesNotMatch(JSON.stringify(logs), /private|connection details/i);
});

test('preserves the GridFS file when PostgreSQL reference deletion fails', async () => {
  const { app, database, bucket, logs } = makeScenario({
    postgresDeleteFailure: true,
  });
  const response = await deleteRequest(app)
    .set('Authorization', `Bearer ${tokenFor(OWNER_ID)}`);

  assert.equal(response.status, 500);
  assert.equal(response.body.message, 'Unable to delete crop image.');
  assert.equal(database.referenceExists, true);
  assert.deepEqual(bucket.deleteCalls, []);
  assert.doesNotMatch(JSON.stringify(logs), /private|connection details/i);
});

test('removes a stale PostgreSQL reference when its GridFS file is missing', async () => {
  const { app, database, bucket } = makeScenario({
    gridfsFileExists: false,
  });
  const response = await deleteRequest(app)
    .set('Authorization', `Bearer ${tokenFor(OWNER_ID)}`);

  assert.equal(response.status, 200);
  assert.equal(database.referenceExists, false);
  assert.deepEqual(bucket.deleteCalls, []);
});

test('reports pending cleanup without retaining a broken PostgreSQL reference', async () => {
  const { app, database, bucket, logs } = makeScenario({
    mongoDeleteFailure: true,
  });
  const response = await deleteRequest(app)
    .set('Authorization', `Bearer ${tokenFor(OWNER_ID)}`);

  assert.equal(response.status, 202);
  assert.equal(response.body.cleanupPending, true);
  assert.equal(database.referenceExists, false);
  assert.deepEqual(bucket.deleteCalls, [GRIDFS_ID]);
  assert.doesNotMatch(JSON.stringify(logs), /private|connection details/i);
});
