import { pool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { isOrderStatusTransitionAllowed } from '../utils/orderStatus.js';

export async function getBuyerOrders({ buyerId, page, limit, status = null }) {
  const normalizedPage = Number(page) || 1;
  const normalizedLimit = Number(limit) || 10;
  const offset = (normalizedPage - 1) * normalizedLimit;
  const conditions = ['o.buyer_id = $1'];
  const values = [buyerId];

  if (status) {
    conditions.push(`o.status = $${values.length + 1}`);
    values.push(status);
  }

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM orders o
    WHERE ${conditions.join(' AND ')}`;

  const listingQuery = `
    SELECT
      o.id,
      o.buyer_id,
      o.farmer_id,
      o.crop_id,
      o.quantity,
      o.unit,
      o.unit_price,
      o.total_amount,
      o.status,
      o.created_at,
      o.updated_at,
      c.name AS crop_name,
      c.category AS crop_category,
      c.location AS crop_location,
      COALESCE(u.farm_name, u.name) AS farmer_name
    FROM orders o
    JOIN crops c ON c.id = o.crop_id
    JOIN users u ON u.id = o.farmer_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;

  const [countResult, listingResult] = await Promise.all([
    pool.query(countQuery, values),
    pool.query(listingQuery, [...values, normalizedLimit, offset]),
  ]);

  return {
    orders: listingResult.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

export async function getFarmerOrders({ farmerId, page, limit, status = null }) {
  const offset = (page - 1) * limit;
  const conditions = ['o.farmer_id = $1'];
  const values = [farmerId];

  if (status) {
    conditions.push(`o.status = $${values.length + 1}`);
    values.push(status);
  }

  const whereClause = conditions.join(' AND ');
  const [countResult, listingResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM orders o
       WHERE ${whereClause}`,
      values
    ),
    pool.query(
      `SELECT
         o.id,
         o.buyer_id,
         o.farmer_id,
         o.crop_id,
         o.quantity,
         o.unit,
         o.unit_price,
         o.total_amount,
         o.status,
         o.created_at,
         o.updated_at,
         c.name AS crop_name,
         c.category AS crop_category,
         c.unit AS crop_unit,
         u.name AS buyer_name
       FROM orders o
       JOIN crops c ON c.id = o.crop_id
       JOIN users u ON u.id = o.buyer_id
       WHERE ${whereClause}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    ),
  ]);

  return {
    orders: listingResult.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

export async function updateFarmerOrderStatus({ orderId, farmerId, status }) {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const existingResult = await client.query(
      `SELECT id, status
       FROM orders
       WHERE id = $1 AND farmer_id = $2
       FOR UPDATE`,
      [orderId, farmerId]
    );
    const existingOrder = existingResult.rows[0];

    if (!existingOrder) {
      throw new AppError(404, 'Order not found.');
    }

    if (!isOrderStatusTransitionAllowed(existingOrder.status, status)) {
      throw new AppError(400, `Order status cannot transition from ${existingOrder.status} to ${status}.`);
    }

    await client.query(
      `UPDATE orders
       SET status = $3,
           updated_at = NOW()
       WHERE id = $1 AND farmer_id = $2`,
      [orderId, farmerId, status]
    );

    const updatedResult = await client.query(
      `SELECT
         o.id,
         o.buyer_id,
         o.farmer_id,
         o.crop_id,
         o.quantity,
         o.unit,
         o.unit_price,
         o.total_amount,
         o.status,
         o.created_at,
         o.updated_at,
         c.name AS crop_name,
         c.category AS crop_category,
         c.unit AS crop_unit,
         u.name AS buyer_name
       FROM orders o
       JOIN crops c ON c.id = o.crop_id
       JOIN users u ON u.id = o.buyer_id
       WHERE o.id = $1 AND o.farmer_id = $2`,
      [orderId, farmerId]
    );

    await client.query('COMMIT');
    transactionStarted = false;
    return updatedResult.rows[0];
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function createOrder({ buyerId, cropId, quantity }) {
  const normalizedQuantity = Number(quantity);

  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
    throw new AppError(400, 'Quantity must be a positive number.');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const cropResult = await client.query(
      `SELECT id, farmer_id, price, unit, quantity, status
       FROM crops
       WHERE id = $1
       FOR UPDATE`,
      [cropId]
    );

    const crop = cropResult.rows[0];
    if (!crop) {
      throw new AppError(404, 'Crop not found.');
    }

    if (crop.status !== 'available') {
      throw new AppError(409, 'Crop is not available for ordering.');
    }

    const availableQuantity = Number(crop.quantity);
    if (normalizedQuantity > availableQuantity) {
      throw new AppError(409, 'Requested quantity exceeds available stock.');
    }

    const unitPrice = Number(crop.price);
    const totalAmount = normalizedQuantity * unitPrice;
    const remainingQuantity = availableQuantity - normalizedQuantity;
    const nextStatus = remainingQuantity === 0 ? 'sold_out' : 'available';

    const orderResult = await client.query(
      `INSERT INTO orders (
        buyer_id,
        farmer_id,
        crop_id,
        quantity,
        unit,
        unit_price,
        total_amount,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *`,
      [
        buyerId,
        crop.farmer_id,
        crop.id,
        normalizedQuantity,
        crop.unit,
        unitPrice,
        totalAmount,
      ]
    );

    await client.query(
      `UPDATE crops
       SET quantity = $1,
           status = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [remainingQuantity, nextStatus, crop.id]
    );

    await client.query('COMMIT');
    return orderResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
