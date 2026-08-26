# Deployment Guide — Render + Supabase

## Architecture

- **API + static frontend:** Render Web Service (free tier)
- **Database:** Supabase PostgreSQL (session pooler, eu-central-1)
- **Keep-alive:** external pinger prevents Render sleep + Supabase pause
- **Anti-pause DB cron:** pg_cron nightly heartbeat inside Supabase

---

## 1. Database setup (Supabase)

1. Apply schema: SQL Editor → paste contents of `backend/config/schema.sql` → Run
2. Seed demo data (from local machine):
   ```bash
   cd backend
   # .env must contain real DATABASE_URL first
   npm run seed
   ```
3. Install pg_cron heartbeat (SQL Editor):
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;

   SELECT cron.schedule(
     'cdf-nightly-heartbeat',
     '0 3 * * *',
     'SELECT 1'
   );

   -- verify scheduled
   SELECT jobname, schedule, active FROM cron.job;
   ```

## 2. Render web service

| Setting | Value |
|---|---|
| Repo | `VannieJay/CreditDeFoncier` |
| Branch | `main` |
| Root Directory | `backend` |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

### Environment variables (Render dashboard)

```
DATABASE_URL=postgresql://postgres.lbxylzmqjvlgplkpqufz:<REAL-PASSWORD>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
DB_SSL=true
JWT_SECRET=<48+ random hex chars>
JWT_EXPIRES_IN=1h
NODE_ENV=production
SEED=false
CORS_ORIGINS=https://<render-app-name>.onrender.com
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

Generate JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 3. External keep-alive pinger

Use [cron-job.org](https://cron-job.org) (free):
- URL: `https://<render-app-name>.onrender.com/health`
- Interval: every 10 minutes
- This keeps Render's 15-min idle timer reset AND counts as activity for Supabase

## 4. Verify deployment

```bash
curl https://<render-app-name>.onrender.com/health
# -> {"status":"ok","db":"connected"}

curl -I https://<render-app-name>.onrender.com/
# -> 200, helmet headers present
```

Then login at the app root with the seeded demo user
(`stratos@maritime.dev` / `Password123!`) and run one transfer end-to-end.

> Rotate/remove the seeded demo credentials before real users onboard.

## 5. Custom domain (later)

1. Render dashboard → Settings → Custom Domains → add domain → set CNAME
2. Update `CORS_ORIGINS` env var to include the new origin
3. Done — no code changes required (frontend uses relative `/api/...` paths)

## Local development

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL
npm install
npm start              # http://localhost:4000
```
