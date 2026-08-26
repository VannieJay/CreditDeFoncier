// Create or promote an admin account.
// Usage: node config/createAdmin.js <email> <password>

require('dotenv').config();
const pool = require('./db');
const authService = require('../services/authService');

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.error('Usage: node config/createAdmin.js <email> <password-min-8-chars>');
    process.exit(1);
  }
  try {
    const existing = await authService.findUserByEmail(email);
    if (existing) {
      await pool.query("UPDATE users SET role = 'admin', active = true WHERE id = $1", [
        existing.id,
      ]);
      console.log(`PROMOTED existing user id=${existing.id} (${email}) to admin`);
    } else {
      const user = await authService.createUser({
        email,
        password,
        role: 'admin',
        profile: { name: 'Administrator', tier: 'Tier 3', credit_limit: 0 },
      });
      console.log(`ADMIN CREATED: id=${user.id} ${user.email}`);
    }
    await pool.end();
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exit(1);
  }
})();