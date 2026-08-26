const pool = require('../config/db');

async function getOrCreateProfile(userId) {
  let { rows } = await pool.query(
    'SELECT * FROM profiles WHERE user_id = $1',
    [userId]
  );
  if (rows[0]) return rows[0];

  await pool.query(
    `INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  ({ rows } = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [userId]));
  return rows[0];
}

async function updateProfile(userId, fields) {
  const allowed = {
    name: 'name',
    client_id: 'client_id',
    tax_id: 'tax_id',
    tier: 'tier',
    kyc_status: 'kyc_status',
    credit_limit: 'credit_limit',
    identity_verified: 'identity_verified',
    business_registered: 'business_registered',
    liquidity_verified: 'liquidity_verified',
  };

  const keys = Object.keys(fields).filter((k) => allowed[k]);
  if (keys.length === 0) return getOrCreateProfile(userId);

  const setClauses = keys.map((k, i) => `${allowed[k]} = $${i + 2}`).join(', ');
  const values = [userId, ...keys.map((k) => fields[k])];

  const { rows } = await pool.query(
    `UPDATE profiles SET ${setClauses} WHERE user_id = $1 RETURNING *`,
    values
  );
  return rows[0] || null;
}

module.exports = { getOrCreateProfile, updateProfile };