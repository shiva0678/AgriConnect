import { pool } from '../config/db.js';

export async function findUserByEmail(email) {
  const result = await pool.query(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email]
  );

  return result.rows[0] || null;
}

export async function findUserById(id) {
  const result = await pool.query(
    `SELECT id, name, email, phone, role, farm_name, company_name, location, created_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

export async function updateUserProfile(id, profile) {
  const result = await pool.query(
    `UPDATE users
     SET name = $2,
         email = $3,
         phone = $4,
         farm_name = $5,
         company_name = $6,
         location = $7
     WHERE id = $1
     RETURNING id, name, email, phone, role, farm_name, company_name, location, created_at`,
    [
      id,
      profile.name,
      profile.email,
      profile.phone,
      profile.farm || null,
      profile.company || null,
      profile.location || null,
    ]
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
