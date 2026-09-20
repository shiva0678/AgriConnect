import { pool } from '../config/db.js';

export async function findUserByEmail(email) {
  const result = await pool.query(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email]
  );

  return result.rows[0] || null;
}

export async function createUser({ name, email, phone, password, role }) {
  const result = await pool.query(
    `INSERT INTO users (name, email, phone, password, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, role`,
    [name, email, phone, password, role]
  );

  return result.rows[0];
}
