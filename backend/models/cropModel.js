import { pool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';

const cropDateProjection = `
  TO_CHAR(harvest_date, 'YYYY-MM-DD') AS harvest_date,
  TO_CHAR(expiry_date, 'YYYY-MM-DD') AS expiry_date
`;

const marketplaceSortOrders = {
  newest: 'c.created_at DESC',
  oldest: 'c.created_at ASC',
  price_asc: 'c.price ASC',
  price_desc: 'c.price DESC',
};

function buildMarketplaceFilters(filters) {
  const conditions = ["c.status = 'available'"];
  const values = [];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`c.name ILIKE $${values.length}`);
  }

  if (filters.category) {
    values.push(filters.category);
    conditions.push(`c.category ILIKE $${values.length}`);
  }

  if (filters.location) {
    values.push(`%${filters.location}%`);
    conditions.push(`c.location ILIKE $${values.length}`);
  }

  return {
    whereClause: conditions.join(' AND '),
    values,
  };
}

export async function findMarketplaceCrops({ page, limit, search, category, location, sort }) {
  const { whereClause, values } = buildMarketplaceFilters({ search, category, location });
  const offset = (page - 1) * limit;
  const orderBy = marketplaceSortOrders[sort] || marketplaceSortOrders.newest;
  const listingValues = [...values, limit, offset];

  const [listingResult, countResult] = await Promise.all([
    pool.query(
      `SELECT c.*, ${cropDateProjection}, u.name AS farmer_name, u.farm_name
       FROM crops c
       LEFT JOIN users u ON u.id = c.farmer_id
       WHERE ${whereClause}
       ORDER BY ${orderBy}, c.id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      listingValues
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM crops c
       WHERE ${whereClause}`,
      values
    ),
  ]);

  return {
    crops: listingResult.rows,
    total: countResult.rows[0]?.total ?? 0,
  };
}

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
    RETURNING *, ${cropDateProjection}`,
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

export async function findAvailableCropById(id) {
  const result = await pool.query(
    `SELECT c.*, ${cropDateProjection}, u.name AS farmer_name, u.farm_name
     FROM crops c
     LEFT JOIN users u ON u.id = c.farmer_id
     WHERE c.id = $1 AND c.status = 'available'
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

export async function findCropById(id) {
  const result = await pool.query(
    `SELECT c.*, ${cropDateProjection}, u.name AS farmer_name, u.email AS farmer_email
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
    `SELECT c.*, ${cropDateProjection}, u.name AS farmer_name, u.email AS farmer_email
     FROM crops c
     LEFT JOIN users u ON u.id = c.farmer_id
     WHERE c.farmer_id = $1
     ORDER BY c.created_at DESC`,
    [farmerId]
  );

  return result.rows;
}

export async function updateCrop(id, updates, expectedQuantity) {
  if (!updates || Object.keys(updates).length === 0) {
    return null;
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const currentResult = await client.query(
      'SELECT quantity, unit FROM crops WHERE id = $1 FOR UPDATE',
      [id],
    );
    const currentCrop = currentResult.rows[0];

    if (!currentCrop || (
      expectedQuantity !== undefined &&
      Number(currentCrop.quantity) !== expectedQuantity
    )) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return null;
    }

    if (updates.unit !== undefined && updates.unit !== currentCrop.unit) {
      const ordersResult = await client.query(
        'SELECT EXISTS (SELECT 1 FROM orders WHERE crop_id = $1) AS has_orders',
        [id],
      );
      if (ordersResult.rows[0].has_orders) {
        throw new AppError(409, 'The unit cannot be changed after orders have been placed.');
      }
    }

    const keys = Object.keys(updates);
    const assignments = keys
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    const result = await client.query(
      `UPDATE crops
       SET ${assignments}, updated_at = NOW()
       WHERE id = $1
       RETURNING *, ${cropDateProjection}`,
      [id, ...Object.values(updates)],
    );

    await client.query('COMMIT');
    transactionStarted = false;
    return result.rows[0] || null;
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteCrop(id) {
  const result = await pool.query(
    'DELETE FROM crops WHERE id = $1 RETURNING id',
    [id]
  );

  return result.rows[0] || null;
}
