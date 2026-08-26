const pool = require('../config/db');

// List all users with profile + credit summary.
async function listUsers() {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.role, u.active, u.created_at,
            p.name, p.client_id, p.tier, p.kyc_status,
            p.credit_limit, p.utilized,
            p.identity_verified, p.business_registered, p.liquidity_verified
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
      ORDER BY u.created_at DESC`
  );
  return rows;
}

async function setUserActive(userId, active) {
  const { rows } = await pool.query(
    'UPDATE users SET active = $1 WHERE id = $2 RETURNING id, email, role, active',
    [active, userId]
  );
  return rows[0] || null;
}

async function completeKyc(userId, fields) {
  const kyc = {
    kyc_status: 'verified',
    identity_verified: true,
    business_registered: true,
    liquidity_verified: true,
    ...fields,
  };
  const { rows } = await pool.query(
    `UPDATE profiles SET
        kyc_status = $2,
        identity_verified = $3,
        business_registered = $4,
        liquidity_verified = $5
      WHERE user_id = $1
      RETURNING user_id, kyc_status, identity_verified, business_registered, liquidity_verified`,
    [
      userId,
      kyc.kyc_status,
      kyc.identity_verified,
      kyc.business_registered,
      kyc.liquidity_verified,
    ]
  );
  if (rows.length === 0) return null;
  const { rows: users } = await pool.query(
    'SELECT id, email, role FROM users WHERE id = $1',
    [userId]
  );
  return { ...rows[0], user: users[0] };
}

async function deleteUser(userId) {
  // ON DELETE CASCADE removes profile, holdings and transactions.
  const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  return rowCount > 0;
}

async function getUserWithProfile(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.role, u.active, p.name
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = $1`,
    [userId]
  );
  return rows[0] || null;
}

module.exports = { listUsers, setUserActive, completeKyc, deleteUser, getUserWithProfile };