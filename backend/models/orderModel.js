import { pool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';

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
