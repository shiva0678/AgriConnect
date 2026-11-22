import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import sharp from 'sharp';
import app from '../server.js';
import { pool } from '../config/db.js';
import {
  limitConcurrentCropImageUploads,
  parseCropImageMultipart,
} from '../middleware/cropImageUpload.js';
import { createCropImageService } from '../services/cropImageService.js';

const JWT_SECRET = process.env.JWT_SECRET;
const CROP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FARMER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function makePngFile(directory, name = randomUUID(), data) {
  const filePath = join(directory, name);
  const bytes = data || await sharp({
    create: {
      width: 3,
      height: 2,
      channels: 3,
      background: { r: 30, g: 120, b: 40 },
    },
  }).png().toBuffer();
  await writeFile(filePath, bytes);
  return { path: filePath, size: bytes.length };
}

async function makeTemporaryDirectory() {
  return mkdtemp(join(tmpdir(), 'agriconnect-image-test-'));
}

function makeDatabasePool({ insertFailure = false, imageCount = 0 } = {}) {
  const queries = [];
  const client = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql === 'SELECT id FROM crops WHERE id = $1 AND farmer_id = $2 FOR UPDATE') {
        return { rowCount: 1, rows: [{ id: CROP_ID }] };
      }
      if (sql.startsWith('SELECT COUNT(*)')) {
        return { rowCount: 1, rows: [{ count: imageCount }] };
      }
      if (sql.startsWith('INSERT INTO crop_images')) {
        if (insertFailure) {
          throw new Error('simulated PostgreSQL failure');
        }
        return {
          rowCount: 1,
          rows: [{
            id: randomUUID(),
            crop_id: values[0],
            gridfs_file_id: values[1],
            content_type: values[2],
            file_size: values[3],
            checksum: values[4],
            display_order: values[5],
            created_at: new Date().toISOString(),
          }],
        };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  return {
    queries,
    pool: { connect: async () => client },
  };
}

function makeGridFSBucket() {
  const uploaded = [];
  const deleted = [];
  return {
    uploaded,
    deleted,
    openUploadStreamWithId(id, filename, options) {
      uploaded.push({ id, filename, options });
      return new Writable({ write(chunk, encoding, callback) { callback(); } });
    },
    async delete(id) {
      deleted.push(id.toHexString());
    },
  };
}

function createService({ databasePool, bucket, initializeError, logger } = {}) {
  return createCropImageService({
    databasePool,
    initializeMongo: async () => {
      if (initializeError) throw initializeError;
    },
    getBucket: () => bucket,
    logger: logger || { error() {}, warn() {} },
  });
}

test('stores a verified farmer image in GridFS and commits its PostgreSQL reference', async () => {
  const directory = await makeTemporaryDirectory();
  const file = await makePngFile(directory);
  const database = makeDatabasePool();
  const bucket = makeGridFSBucket();
  const upload = createService({ databasePool: database.pool, bucket });

  const images = await upload({
    cropId: CROP_ID,
    farmerId: FARMER_ID,
    files: [file],
    tempDirectory: directory,
  });

  assert.equal(images.length, 1);
  assert.equal(images[0].crop_id, CROP_ID);
  assert.equal(images[0].content_type, 'image/png');
  assert.ok(images[0].file_size > 0);
  assert.match(images[0].checksum, /^[a-f0-9]{64}$/);
  assert.equal(bucket.uploaded.length, 1);
  assert.equal(bucket.uploaded[0].options.metadata.cropId, CROP_ID);
  assert.equal(bucket.uploaded[0].options.metadata.farmerId, FARMER_ID);
  assert.equal(bucket.uploaded[0].options.metadata.contentType, 'image/png');
  assert.equal(bucket.uploaded[0].options.metadata.checksum, images[0].checksum);
  assert.ok(database.queries.some(({ sql }) => sql === 'COMMIT'));
  assert.equal(bucket.deleted.length, 0);
});

test('rejects invalid signatures and unsupported SVG before contacting MongoDB', async () => {
  const invalidDirectory = await makeTemporaryDirectory();
  const invalidFile = await makePngFile(invalidDirectory, 'invalid', Buffer.from('not an image'));
  let mongoCalls = 0;
  const invalidUpload = createCropImageService({
    databasePool: makeDatabasePool().pool,
    initializeMongo: async () => { mongoCalls += 1; },
    getBucket: makeGridFSBucket,
    logger: { error() {}, warn() {} },
  });
  await assert.rejects(
    invalidUpload({
      cropId: CROP_ID,
      farmerId: FARMER_ID,
      files: [invalidFile],
      tempDirectory: invalidDirectory,
    }),
    { status: 400 },
  );
  assert.equal(mongoCalls, 0);

  const svgDirectory = await makeTemporaryDirectory();
  const svgFile = await makePngFile(
    svgDirectory,
    'vector',
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  );
  await assert.rejects(
    invalidUpload({
      cropId: CROP_ID,
      farmerId: FARMER_ID,
      files: [svgFile],
      tempDirectory: svgDirectory,
    }),
    { status: 415 },
  );
});

test('rejects oversized and over-count service inputs', async () => {
  const directory = await makeTemporaryDirectory();
  const bucket = makeGridFSBucket();
  const upload = createService({
    databasePool: makeDatabasePool().pool,
    bucket,
  });

  await assert.rejects(
    upload({
      cropId: CROP_ID,
      farmerId: FARMER_ID,
      files: [{ path: join(directory, 'large'), size: 5 * 1024 * 1024 + 1 }],
      tempDirectory: directory,
    }),
    { status: 413 },
  );
  await assert.rejects(
    upload({
      cropId: CROP_ID,
      farmerId: FARMER_ID,
      files: Array.from({ length: 6 }, () => ({})),
      tempDirectory: directory,
    }),
    { status: 400 },
  );
  assert.equal(bucket.uploaded.length, 0);
});

test('returns service unavailable when MongoDB cannot initialize', async () => {
  const directory = await makeTemporaryDirectory();
  const file = await makePngFile(directory);
  const upload = createService({
    databasePool: makeDatabasePool().pool,
    bucket: makeGridFSBucket(),
    initializeError: new Error('private connection details'),
  });

  await assert.rejects(
    upload({
      cropId: CROP_ID,
      farmerId: FARMER_ID,
      files: [file],
      tempDirectory: directory,
    }),
    (error) => {
      assert.equal(error.status, 503);
      assert.doesNotMatch(error.message, /private|mongodb/i);
      return true;
    },
  );
});

test('removes GridFS files when PostgreSQL reference insertion fails', async () => {
  const directory = await makeTemporaryDirectory();
  const file = await makePngFile(directory);
  const database = makeDatabasePool({ insertFailure: true });
  const bucket = makeGridFSBucket();
  const upload = createService({
    databasePool: database.pool,
    bucket,
    logger: { error() {}, warn() {} },
  });

  await assert.rejects(
    upload({
      cropId: CROP_ID,
      farmerId: FARMER_ID,
      files: [file],
      tempDirectory: directory,
    }),
    { status: 500 },
  );
  assert.equal(bucket.uploaded.length, 1);
  assert.deepEqual(bucket.deleted, [bucket.uploaded[0].id.toHexString()]);
  assert.ok(database.queries.some(({ sql }) => sql === 'ROLLBACK'));
});

test('rejects uploads that would exceed the per-crop image limit', async () => {
  const directory = await makeTemporaryDirectory();
  const file = await makePngFile(directory);
  const bucket = makeGridFSBucket();
  const upload = createService({
    databasePool: makeDatabasePool({ imageCount: 5 }).pool,
    bucket,
  });

  await assert.rejects(
    upload({
      cropId: CROP_ID,
      farmerId: FARMER_ID,
      files: [file],
      tempDirectory: directory,
    }),
    { status: 400 },
  );
  assert.equal(bucket.deleted.length, 1);
});

test('rejects unauthenticated and buyer upload requests', async () => {
  const cropId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const unauthenticated = await request(app)
    .post(`/api/crops/${cropId}/images`);
  assert.equal(unauthenticated.status, 401);

  const buyerToken = jwt.sign(
    { id: FARMER_ID, role: 'buyer', email: 'buyer@example.com' },
    JWT_SECRET,
  );
  const buyerResponse = await request(app)
    .post(`/api/crops/${cropId}/images`)
    .set('Authorization', `Bearer ${buyerToken}`);
  assert.equal(buyerResponse.status, 403);
});

test('rejects farmer uploads to crops they do not own', async () => {
  const farmerToken = jwt.sign(
    { id: FARMER_ID, role: 'farmer', email: 'farmer@example.com' },
    JWT_SECRET,
  );
  const originalQuery = pool.query;
  pool.query = async () => ({
    rowCount: 1,
    rows: [{ id: CROP_ID, farmer_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }],
  });
  try {
    const response = await request(app)
      .post(`/api/crops/${CROP_ID}/images`)
      .set('Authorization', `Bearer ${farmerToken}`);
    assert.equal(response.status, 403);
  } finally {
    pool.query = originalQuery;
  }
});

test('enforces multipart file-count and size limits', async () => {
  const uploadApp = express();
  uploadApp.post('/images', parseCropImageMultipart, (request, response) => {
    response.status(200).json({ files: request.files.length });
  });
  uploadApp.use((error, request, response, next) => {
    response.status(error.status || 500).json({ message: error.message });
  });

  const smallImage = Buffer.from('x');
  const tooMany = await request(uploadApp)
    .post('/images')
    .attach('images', smallImage, '1.png')
    .attach('images', smallImage, '2.png')
    .attach('images', smallImage, '3.png')
    .attach('images', smallImage, '4.png')
    .attach('images', smallImage, '5.png')
    .attach('images', smallImage, '6.png');
  assert.equal(tooMany.status, 400);

  const tooLarge = await request(uploadApp)
    .post('/images')
    .attach('images', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png');
  assert.equal(tooLarge.status, 413);
});

test('enforces a global concurrent upload cap and releases capacity on completion', () => {
  const firstResponse = new EventEmitter();
  const secondResponse = new EventEmitter();
  const rejectedResponse = new EventEmitter();
  let firstNext;
  let secondNext;
  let rejectedError;

  limitConcurrentCropImageUploads({}, firstResponse, (error) => { firstNext = error; });
  limitConcurrentCropImageUploads({}, secondResponse, (error) => { secondNext = error; });
  limitConcurrentCropImageUploads({}, rejectedResponse, (error) => { rejectedError = error; });

  assert.equal(firstNext, undefined);
  assert.equal(secondNext, undefined);
  assert.equal(rejectedError.status, 503);
  firstResponse.emit('finish');

  let acceptedAfterRelease = false;
  limitConcurrentCropImageUploads({}, new EventEmitter(), () => { acceptedAfterRelease = true; });
  assert.equal(acceptedAfterRelease, true);

  secondResponse.emit('finish');
});
