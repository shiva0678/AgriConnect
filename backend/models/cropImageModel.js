import { pool } from '../config/db.js';

export async function findCropImagesForCrop(cropId) {
  const result = await pool.query(
    `SELECT
       c.id AS crop_id,
       c.farmer_id,
       c.status AS crop_status,
       ci.id AS image_id,
       ci.content_type,
       ci.file_size,
       ci.checksum,
       ci.display_order,
       ci.created_at
     FROM crops c
     LEFT JOIN crop_images ci ON ci.crop_id = c.id
     WHERE c.id = $1
     ORDER BY ci.display_order ASC`,
    [cropId],
  );
  return result.rows;
}

export async function findCropImageForCrop(cropId, imageId) {
  const result = await pool.query(
    `SELECT
       c.id AS crop_id,
       c.farmer_id,
       c.status AS crop_status,
       ci.id AS image_id,
       ci.gridfs_file_id,
       ci.content_type,
       ci.file_size,
       ci.checksum,
       ci.display_order,
       ci.created_at
     FROM crops c
     JOIN crop_images ci ON ci.crop_id = c.id
     WHERE c.id = $1 AND ci.id = $2
     LIMIT 1`,
    [cropId, imageId],
  );
  return result.rows[0] || null;
}

export async function findOwnedCropImageForDeletion(
  cropId,
  imageId,
  farmerId,
  database = pool,
) {
  const result = await database.query(
    `SELECT ci.id AS image_id, ci.gridfs_file_id
     FROM crop_images ci
     JOIN crops c ON c.id = ci.crop_id
     WHERE c.id = $1 AND ci.id = $2 AND c.farmer_id = $3
     LIMIT 1`,
    [cropId, imageId, farmerId],
  );
  return result.rows[0] || null;
}

export async function deleteOwnedCropImageReference(
  cropId,
  imageId,
  farmerId,
  database = pool,
) {
  const result = await database.query(
    `DELETE FROM crop_images ci
     USING crops c
     WHERE c.id = $1
       AND ci.id = $2
       AND c.farmer_id = $3
       AND ci.crop_id = c.id
     RETURNING ci.id`,
    [cropId, imageId, farmerId],
  );
  return result.rows[0] || null;
}
