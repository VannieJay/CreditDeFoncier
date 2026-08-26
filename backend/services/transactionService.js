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

module.exports = { createTransaction, getUserTransactions, updateTransactionStatus };