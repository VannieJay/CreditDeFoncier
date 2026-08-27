const pool = require('../config/db');

async function createTransaction({ userId, assetSymbol, amount, address, usdValue, fee }) {
  const { rows } = await pool.query(
    `INSERT INTO transactions (user_id, asset_symbol, amount, address, usd_value, fee)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, asset_symbol, amount, address, usd_value, fee, status, tx_hash, created_at`,
    [userId, assetSymbol, amount, address, usdValue, fee]
  );
  return rows[0];
}

async function getUserTransactions(userId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT id, asset_symbol, amount, address, usd_value, fee, status, tx_hash, created_at
     FROM transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function updateTransactionStatus(id, status, txHash = null) {
  const { rows } = await pool.query(
    `UPDATE transactions
     SET status = $1, tx_hash = COALESCE($2, tx_hash)
     WHERE id = $3
     RETURNING id, asset_symbol, amount, address, usd_value, fee, status, tx_hash, created_at`,
    [status, txHash, id]
  );
  return rows[0] || null;
}

async function isAuthUsed(userId, service) {
  const { rows } = await pool.query(
    `SELECT used FROM authorization_codes WHERE user_id = $1 AND service = $2 AND used = true LIMIT 1`,
    [userId, service]
  );
  return rows.length > 0;
}

async function verifyAuthCode(userId, service, code) {
  const { rows } = await pool.query(
    `SELECT id, used FROM authorization_codes WHERE user_id = $1 AND service = $2 AND code = $3 AND used = false`,
    [userId, service, code]
  );
  if (rows.length === 0) return false;
  // Mark as used
  await pool.query(
    `UPDATE authorization_codes SET used = true WHERE id = $1`,
    [rows[0].id]
  );
  return true;
}

module.exports = { createTransaction, getUserTransactions, updateTransactionStatus, isAuthUsed, verifyAuthCode };