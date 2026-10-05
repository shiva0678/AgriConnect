import { pool } from '../config/db.js';

export async function createCrop(crop) {
  const result = await pool.query(
    `INSERT INTO crops (
      farmer_id,
      name,
      category,
      description,
      price,
      unit,
      quantity,
      location,
      harvest_date,
      expiry_date,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      crop.farmer_id,
      crop.name,
      crop.category,
      crop.description ?? null,
      crop.price,
      crop.unit,
      crop.quantity,
      crop.location,
      crop.harvest_date,
      crop.expiry_date ?? null,
      crop.status || 'available',
    ]
  );

  return result.rows[0] || null;
}

export async function findCropById(id) {
  const result = await pool.query(
    `SELECT c.*, u.name AS farmer_name, u.email AS farmer_email
     FROM crops c
     LEFT JOIN users u ON u.id = c.farmer_id
     WHERE c.id = $1
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

export async function findCropsByFarmerId(farmerId) {
  const result = await pool.query(
    `SELECT c.*, u.name AS farmer_name, u.email AS farmer_email
     FROM crops c
     LEFT JOIN users u ON u.id = c.farmer_id
     WHERE c.farmer_id = $1
     ORDER BY c.created_at DESC`,
    [farmerId]
  );

  return result.rows;
}

export async function updateCrop(id, updates) {
  if (!updates || Object.keys(updates).length === 0) {
    return null;
  }

  const keys = Object.keys(updates);
  const assignments = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
  const values = [id, ...Object.values(updates)];

  const result = await pool.query(
    `UPDATE crops
     SET ${assignments}, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    values
  );

  return result.rows[0] || null;
}

export async function deleteCrop(id) {
  const result = await pool.query(
    'DELETE FROM crops WHERE id = $1 RETURNING id',
    [id]
  );

  return result.rows[0] || null;
}
