// Drop all user accounts except admins. Cascades profiles, holdings, transactions.
require('dotenv').config();
const pool = require('./db');

(async () => {
  const before = await pool.query('SELECT id, email, role FROM users ORDER BY id');
  console.log('BEFORE:', before.rows.map((u) => `${u.id}:${u.email}(${u.role})`).join('  '));

  const del = await pool.query("DELETE FROM users WHERE role <> 'admin'");
  console.log('DELETED:', del.rowCount, 'accounts');

  const after = await pool.query('SELECT id, email, role, active FROM users ORDER BY id');
  after.rows.forEach((u) => console.log('REMAINS:', u.id, u.email, '[' + u.role + ']', 'active=' + u.active));

  const tx = await pool.query('SELECT COUNT(*) AS c FROM transactions');
  const h = await pool.query('SELECT COUNT(*) AS c FROM holdings');
  const p = await pool.query('SELECT COUNT(*) AS c FROM profiles');
  console.log(`left -> transactions: ${tx.rows[0].c}, holdings: ${h.rows[0].c}, profiles: ${p.rows[0].c}`);

  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});