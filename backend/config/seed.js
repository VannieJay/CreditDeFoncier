// Seed the demo corporate account (Stratos Maritime Ltd) used by the frontend.
// Run with: node backend/config/seed.js

require('dotenv').config();

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT, 10) || 5432,
      }
);

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Demo corporate user
    const hash = await bcrypt.hash('Password123!', 12);
    const userRes = await client.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'corporate')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      ['stratos@maritime.dev', hash]
    );
    const userId = userRes.rows[0].id;

    // Profile
    await client.query(
      `INSERT INTO profiles (user_id, name, client_id, tax_id, tier, kyc_status,
        credit_limit, utilized, identity_verified, business_registered, liquidity_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id) DO UPDATE SET
         name = EXCLUDED.name, client_id = EXCLUDED.client_id, tax_id = EXCLUDED.tax_id,
         tier = EXCLUDED.tier, kyc_status = EXCLUDED.kyc_status,
         credit_limit = EXCLUDED.credit_limit, utilized = EXCLUDED.utilized,
         identity_verified = EXCLUDED.identity_verified, business_registered = EXCLUDED.business_registered,
         liquidity_verified = EXCLUDED.liquidity_verified`,
      [userId, 'Stratos Maritime Ltd', 'CL-001', 'TX-MRD-8F3A92K', 'Tier 3', 'verified',
       5000000, 1850000, true, true, false]
    );

    // Holdings
    const holdings = [
      ['ETH', 12.50],
      ['BTC', 0.85],
      ['USDT', 145000],
    ];
    for (const [symbol, balance] of holdings) {
      await client.query(
        `INSERT INTO holdings (user_id, asset_symbol, balance)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, asset_symbol) DO UPDATE SET balance = EXCLUDED.balance`,
        [userId, symbol, balance]
      );
    }

    // Transactions (recent history)
    await client.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
    const txs = [
      ['ETH', 2.45, '0x4a7b8f23c1', 8420, 3.42, 'confirmed', '2025-12-18 10:23:00'],
      ['BTC', 0.15, 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkf8hxwaw', 9750, 1.85, 'confirmed', '2025-12-15 14:11:00'],
      ['USDT', 8500, 'TR7Nq2Kh2GnCj3k9p', 8500, 0.85, 'pending', '2025-12-14 09:45:00'],
    ];
    for (const [symbol, amount, address, usd, fee, status, date] of txs) {
      await client.query(
        `INSERT INTO transactions (user_id, asset_symbol, amount, address, usd_value, fee, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [userId, symbol, amount, address, usd, fee, status, date]
      );
    }

    await client.query('COMMIT');
    console.log('Seed complete for user', userId);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();