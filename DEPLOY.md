# Deployment Guide — Render + Supabase

## Architecture

- **App URL:** `https://portal.cdfoncier.online` (apex redirects there)
- **API + static frontend:** Render Web Service (free tier)
- **Database:** Supabase PostgreSQL (session pooler, eu-central-1)
- **Keep-alive:** external pinger prevents Render sleep + Supabase pause
- **Anti-pause DB cron:** pg_cron nightly heartbeat inside Supabase
- **Prices:** CoinGecko live rates cached 3 min (see `services/priceService.js`)

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
CORS_ORIGINS=https://portal.cdfoncier.online,https://creditdefoncier.onrender.com
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
curl https://portal.cdfoncier.online/health
# -> {"status":"ok","db":"connected"}

curl -I https://portal.cdfoncier.online/
# -> 200, helmet headers present
```

Login at the app root with an admin account and create client accounts
from the Admin Console (public registration is disabled).

## 5. Domains — current layout

| Hostname | Role | Served by |
|---|---|---|
| `portal.cdfoncier.online` | **The app** (client portal + admin console) | Render custom domain (CNAME → `creditdefoncier.onrender.com`) |
| `cdfoncier.online` / `www.` | 301 redirect → `https://portal.cdfoncier.online` | Hostinger URL Forwarding |

### Reproducing the setup

1. **Render:** service → Settings → Custom Domains → add `portal.cdfoncier.online`
   only. Do NOT attach the apex — the main domain must never serve content.
2. **Hostinger:** hPanel → Domains → `cdfoncier.online`:
   - DNS: delete any apex A-record pointing at Render (`216.24.57.1`) or
     Hostinger parking
   - Redirect/URL Forwarding: `cdfoncier.online` → `https://portal.cdfoncier.online`,
     type Permanent (301), include `www`
3. TLS on the portal subdomain is auto-issued by Render once DNS verifies.
4. No code changes needed for any domain move — the frontend uses relative
   `/api/...` paths, so it works from any origin untouched.

## 6. Rotating the database password

When the Supabase DB password is reset, production breaks until Render's
`DATABASE_URL` is updated (the old password is embedded in that URI):

1. Supabase dashboard → **Connect** → **Session pooler** (port 5432) → copy
   the full URI — it already embeds the *new* password
2. Render dashboard → CreditDeFoncier service → **Environment** tab → edit
   `DATABASE_URL` → paste the copied URI over the whole value
3. **Save Changes** — Render redeploys automatically (~2–3 min)
4. Verify: `/health` returns `"db":"connected"`

> Do not hand-type a password into the URI unless it is URL-encoded
> (`@`→`%40`, `!`→`%21`, `:`→`%3A`). Copying from Supabase avoids this.

## 7. Local development

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL
npm install
npm start              # http://localhost:4000
```
