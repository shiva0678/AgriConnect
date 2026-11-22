export async function startServerLifecycle({
  initializeDatabase,
  initializeMongoDB,
  listen,
  logger = console,
}) {
  await initializeDatabase();

  try {
    await initializeMongoDB();
  } catch {
    logger.warn(
      "MongoDB unavailable; image storage will remain unavailable until initialization succeeds.",
    );
  }

  return listen();
}