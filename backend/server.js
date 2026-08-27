// Load environment BEFORE any module that reads process.env (db pool config).
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const pool = require('./config/db');
const { validateEnv } = require('./config/index');

validateEnv();

const app = express();
const port = parseInt(process.env.PORT, 10) || 3000;

// ---- Security headers ----
app.use(
  helmet({
    contentSecurityPolicy: false, // frontend uses CDN scripts (tailwindcss/lucide)
    crossOriginEmbedderPolicy: false,
  })
);

// ---- Logging (console for hosted platforms + rolling file locally) ----
const accessLogStream = fs.createWriteStream(
  path.join(__dirname, 'access.log'),
  { flags: 'a' }
);
morgan.token('real-ip', (req) => req.headers['x-forwarded-for'] || req.ip);
app.use(morgan('combined', { stream: accessLogStream }));
app.use(morgan(':real-ip :method :url :status :response-time ms'));

// ---- CORS (manual: same-origin always trusted, allow-list for extras) ----
// The Express app serves BOTH the frontend and the API from one host, so any
// Origin matching the serving Host is same-origin and must never be blocked.
// The env allow-list covers genuinely external clients, if any appear later.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin) return next(); // same-origin navigations/GETs often omit it

  const originHost = origin.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const host = req.headers.host || '';
  const isSameOrigin = originHost === host || originHost === `www.${host}`;
  const isAllowed = allowedOrigins.includes(origin);

  if (!isSameOrigin && !isAllowed) {
    return next(new Error('Not allowed by CORS'));
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---- Rate limiting ----
app.use(
  '/api/',
  rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  })
);

app.use(express.json({ limit: '1mb' }));

// ---- Static frontend ----
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Health check — also tops up live price cache (keeps prices fresh via pinger)
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    require('./services/priceService').ensureFreshPrices().catch(() => {});
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ---- Routes ----
app.use('/api/auth', require('./routes/auth'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/admin', require('./routes/admin'));

// SPA fallback + API 404 (Express 5: no bare '*' wildcard routes)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  if (req.method !== 'GET') {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
    if (err) next(err);
  });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  if (err.code === 'INSUFFICIENT_BALANCE' || err.message === 'INSUFFICIENT_BALANCE') {
    return res.status(400).json({ error: 'Insufficient balance' });
  }
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  // AggregateError (e.g. multi-stack ECONNREFUSED) has an empty message.
  let message = err.message;
  if ((!message || message.trim() === '') && Array.isArray(err.errors) && err.errors.length) {
    message = err.errors[0].message;
  }
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (message || 'Internal server error'),
  });
});

// ---- Database initialization ----
async function initDb() {
  const schemaPath = path.join(__dirname, 'config', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schema);
  console.log('Database schema initialized');
  // 002: authorization_codes (single-use, no expiry) — idempotent
  try {
    const mig = path.join(__dirname, 'config', 'migrations', '002_authorization_codes.sql');
    if (fs.existsSync(mig)) {
      const sql = fs.readFileSync(mig, 'utf8');
      await pool.query(sql);
      console.log('Migration 002_authorization_codes ensured');
    }
    // safety: ensure constraint covers bond/pof/blocked/lc/apg/bg (in case old table existed)
    await pool.query(`ALTER TABLE authorization_codes DROP CONSTRAINT IF EXISTS authorization_codes_service_check`);
    await pool.query(`ALTER TABLE authorization_codes ADD CONSTRAINT authorization_codes_service_check CHECK (service IN ('bond','pof','blocked','lc','apg','bg'))`).catch(()=>{});
  } catch (e) { console.warn('Migration 002 ensure warning:', e.message); }
}

// ---- Seed (development) ----
async function seedIfEmpty() {
  if (process.env.SEED !== 'true') return;
  const { rows } = await pool.query('SELECT COUNT(*) FROM users');
  if (parseInt(rows[0].count, 10) > 0) return;

  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('Password123!', 12);
  await pool.query(
    `INSERT INTO users (email, password_hash, role) VALUES
       ($1, $2, 'corporate'),
       ($3, $4, 'individual')
     ON CONFLICT DO NOTHING`,
    ['admin@creditdefoncier.dev', hash, 'johndoe@examplemail.com', hash]
  );
  console.log('Seeded development users');
}

// Listen immediately so health checks pass even while the DB connects.
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

async function start() {
  try {
    await initDb();
    await seedIfEmpty();
    console.log('Database ready');
  } catch (err) {
    console.error('Database initialization failed:', err.message);
    if (process.env.NODE_ENV === 'production') {
      console.error('Exiting: production requires a database connection.');
      process.exit(1);
    }
    console.warn('Development mode: static frontend served; API routes will error until the database is reachable.');
  }
}

start();