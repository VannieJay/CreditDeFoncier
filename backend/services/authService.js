const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const SALT_ROUNDS = 12;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

async function findUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, email, password_hash, role, active FROM users WHERE email = $1',
    [email]
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const { rows } = await pool.query(
    'SELECT id, email, role, active FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

// Creates the auth record and its profile row atomically.
async function createUser({ email, password, role = 'individual', profile = {} }) {
  const hash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role`,
      [email, hash, role]
    );
    const user = rows[0];
    await client.query(
      `INSERT INTO profiles (user_id, name, client_id, tier, credit_limit)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        profile.name || null,
        profile.client_id || null,
        profile.tier || 'Tier 1',
        profile.credit_limit || 0,
      ]
    );
    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { hashPassword, verifyPassword, signToken, findUserByEmail, findUserById, createUser };