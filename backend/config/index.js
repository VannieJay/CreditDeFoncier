// Pure validator. dotenv is loaded by the entry point (server.js / seed.js)
// BEFORE this module or config/db.js are required.

// When DATABASE_URL is provided (managed Postgres), discrete DB_* vars are optional.
const BASE_REQUIRED = ['PORT', 'JWT_SECRET'];
const DISCRETE_DB_REQUIRED = ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD', 'DB_PORT'];

function validateEnv() {
  const required = process.env.DATABASE_URL
    ? BASE_REQUIRED
    : [...BASE_REQUIRED, ...DISCRETE_DB_REQUIRED];

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
  return process.env;
}

module.exports = { validateEnv };