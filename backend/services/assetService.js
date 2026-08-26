const pool = require('../config/db');

async function getAssets() {
  const { rows } = await pool.query(
    'SELECT symbol, name, price, fee, available, color FROM assets ORDER BY symbol'
  );
  return rows;
}

async function getAssetBySymbol(symbol) {
  const { rows } = await pool.query(
    'SELECT symbol, name, price, fee, available, color FROM assets WHERE symbol = $1',
    [symbol]
  );
  return rows[0] || null;
}

async function getUserHoldings(userId) {
  const { rows } = await pool.query(
    `SELECT h.asset_symbol, h.balance, a.name, a.price, a.color
     FROM holdings h
     JOIN assets a ON a.symbol = h.asset_symbol
     WHERE h.user_id = $1
     ORDER BY h.asset_symbol`,
    [userId]
  );
  return rows;
}

async function getHolding(userId, symbol) {
  const { rows } = await pool.query(
    'SELECT balance FROM holdings WHERE user_id = $1 AND asset_symbol = $2',
    [userId, symbol]
  );
  return rows[0] || null;
}

async function getAvailableBalance(userId, symbol) {
  const holding = await getHolding(userId, symbol);
  return holding ? parseFloat(holding.balance) : 0;
}

async function debitBalance(userId, symbol, amount) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE holdings
         SET balance = balance - $1
         WHERE user_id = $2 AND asset_symbol = $3 AND balance >= $1
         RETURNING balance`,
      [amount, userId, symbol]
    );
    if (rows.length === 0) {
      throw new Error('INSUFFICIENT_BALANCE');
    }
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function creditBalance(userId, symbol, amount) {
  const { rows } = await pool.query(
    `UPDATE holdings
        SET balance = balance + $1
      WHERE user_id = $2 AND asset_symbol = $3
      RETURNING balance`,
    [amount, userId, symbol]
  );
  if (rows.length === 0) {
    // No holding row yet - create one.
    await pool.query(
      `INSERT INTO holdings (user_id, asset_symbol, balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, asset_symbol) DO UPDATE SET balance = holdings.balance + $3`,
      [userId, symbol, amount]
    );
  }
  return rows[0] || null;
}

module.exports = {
  getAssets,
  getAssetBySymbol,
  getUserHoldings,
  getHolding,
  getAvailableBalance,
  debitBalance,
  creditBalance,
};