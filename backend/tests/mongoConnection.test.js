import test from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import {
  closeMongoDB,
  getGridFSBucket,
  getMongoDatabase,
  initializeMongoDB,
} from "../config/mongo.js";
import { startServerLifecycle } from "../utils/serverStartup.js";

const originalEnvironment = {
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DATABASE: process.env.MONGODB_DATABASE,
  GRIDFS_BUCKET_NAME: process.env.GRIDFS_BUCKET_NAME,
};

function configureMongo() {
  process.env.MONGODB_URI = "mongodb://localhost:27017";
  process.env.MONGODB_DATABASE = "agriconnect-test";
  process.env.GRIDFS_BUCKET_NAME = "cropImages";
}

async function withMockedConnect(connect, callback) {
  const originalConnect = MongoClient.prototype.connect;
  MongoClient.prototype.connect = connect;
  try {
    await callback();
  } finally {
    MongoClient.prototype.connect = originalConnect;
  }
}

test.after(async () => {
  await closeMongoDB();
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("connects once and initializes the configured GridFS bucket", async () => {
  configureMongo();

  await withMockedConnect(async function connect() {
    return this;
  }, async () => {
    const first = await initializeMongoDB();
    const second = await initializeMongoDB();

    assert.equal(first.database, second.database);
    assert.equal(first.bucket, second.bucket);
    assert.equal(getMongoDatabase(), first.database);
    assert.equal(getGridFSBucket(), first.bucket);
    assert.equal(first.bucket.s.options.bucketName, "cropImages");
    await closeMongoDB();
  });
});

test("rejects missing MongoDB configuration without connecting", async () => {
  await closeMongoDB();
  delete process.env.MONGODB_URI;

  await assert.rejects(
    initializeMongoDB(),
    /MONGODB_URI, MONGODB_DATABASE, and GRIDFS_BUCKET_NAME must be configured/,
  );
  assert.throws(getMongoDatabase, /MongoDB is not initialized/);
  assert.throws(getGridFSBucket, /MongoDB is not initialized/);
});

test("sanitizes connection failures and permits a later retry", async () => {
  await closeMongoDB();
  configureMongo();
  process.env.MONGODB_URI = "mongodb://user:secret@localhost:27017";

  let shouldFail = true;
  await withMockedConnect(async function connect() {
    if (shouldFail) {
      throw new Error("failed to connect to mongodb://user:secret@localhost");
    }
    return this;
  }, async () => {
    await assert.rejects(initializeMongoDB(), (error) => {
      assert.equal(error.message, "MongoDB initialization failed");
      assert.doesNotMatch(error.message, /secret|mongodb:\/\//i);
      return true;
    });

    process.env.MONGODB_URI = "mongodb://localhost:27017";
    shouldFail = false;
    const recovered = await initializeMongoDB();
    assert.equal(recovered.bucket.s.options.bucketName, "cropImages");
    await closeMongoDB();
  });
});

test("closes cleanly and can establish a fresh connection afterward", async () => {
  configureMongo();

  await withMockedConnect(async function connect() {
    return this;
  }, async () => {
    const first = await initializeMongoDB();
    await closeMongoDB();

    assert.throws(getGridFSBucket, /MongoDB is not initialized/);
    const second = await initializeMongoDB();
    assert.notEqual(second.database, first.database);
    await closeMongoDB();
  });
});

test("continues server startup when MongoDB initialization fails", async () => {
  const warnings = [];
  let listening = false;

  const result = await startServerLifecycle({
    initializeDatabase: async () => {},
    initializeMongoDB: async () => {
      throw new Error("connection details must not be logged");
    },
    listen: () => {
      listening = true;
      return "server";
    },
    logger: { warn: (message) => warnings.push(message) },
  });

  assert.equal(result, "server");
  assert.equal(listening, true);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /MongoDB unavailable/);
  assert.doesNotMatch(warnings[0], /connection details/);
});