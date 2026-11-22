import { GridFSBucket, MongoClient } from "mongodb";

let client;
let database;
let bucket;
let connectionPromise;
let closePromise;

function readMongoConfiguration() {
  const uri = process.env.MONGODB_URI?.trim();
  const databaseName = process.env.MONGODB_DATABASE?.trim();
  const bucketName = process.env.GRIDFS_BUCKET_NAME?.trim();

  if (!uri || !databaseName || !bucketName) {
    throw new Error(
      "MONGODB_URI, MONGODB_DATABASE, and GRIDFS_BUCKET_NAME must be configured",
    );
  }

  return { uri, databaseName, bucketName };
}

export async function initializeMongoDB() {
  if (closePromise) {
    await closePromise;
  }

  if (bucket) {
    return { database, bucket };
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  const { uri, databaseName, bucketName } = readMongoConfiguration();
  connectionPromise = (async () => {
    let connectingClient;
    try {
      connectingClient = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
      client = connectingClient;
      await connectingClient.connect();

      database = connectingClient.db(databaseName);
      bucket = new GridFSBucket(database, { bucketName });
      return { database, bucket };
    } catch {
      if (connectingClient) {
        await connectingClient.close().catch(() => {});
      }
      if (client === connectingClient) {
        client = undefined;
        database = undefined;
        bucket = undefined;
      }
      throw new Error("MongoDB initialization failed");
    } finally {
      connectionPromise = undefined;
    }
  })();

  return connectionPromise;
}

export function getMongoDatabase() {
  if (!database) {
    throw new Error("MongoDB is not initialized");
  }
  return database;
}

export function getGridFSBucket() {
  if (!bucket) {
    throw new Error("MongoDB is not initialized");
  }
  return bucket;
}

export async function closeMongoDB() {
  if (closePromise) {
    return closePromise;
  }

  closePromise = (async () => {
    if (connectionPromise) {
      await connectionPromise.catch(() => {});
    }

    const activeClient = client;
    try {
      if (activeClient) {
        await activeClient.close();
      }
    } finally {
      if (client === activeClient) {
        client = undefined;
        database = undefined;
        bucket = undefined;
      }
    }
  })();

  try {
    await closePromise;
  } finally {
    closePromise = undefined;
  }
}