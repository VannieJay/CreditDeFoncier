// Apply a SQL migration file to the configured database.
// Usage: node config/migrate.js config/migrate-002-admin.sql

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');

(async () => {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node config/migrate.js <migration-file.sql>');
    process.exit(1);
  }
  const sqlPath = path.isAbsolute(file) ? file : path.join(__dirname, '..', file);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await pool.query(sql);
    const { rows } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position"
    );
    console.log('MIGRATION APPLIED:', sqlPath);
    console.log('users columns:', rows.map((r) => r.column_name).join(', '));
    await pool.end();
  } catch (e) {
    console.error('MIGRATION FAILED:', e.message);
    process.exit(1);
  }
})();