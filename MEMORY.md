## 2026-09-16 UPDATE (Workers model cutover)
- Cloudflare front door is a **Workers (Static Assets)** project `credit-de-foncier` (temp URL `https://credit-de-foncier.info-vanniejay.workers.dev`), deployed by the dashboard's Git build via `npx wrangler deploy`.
- API proxy moved from Pages `functions/` → **`worker.js`** + **`wrangler.jsonc`** (`run_worker_first: ["/api/*","/health"]`); Pages-only `frontend/_routes.json` and `frontend/_headers` deleted. Reason: the non-interactive build ignored `functions/` (wizards answered "no"), leaving /api & /health 404.
- Pending user steps: attach `creditdefoncier.com` + `www` to the **Worker** (Settings → Domains & Routes); keep-alive Worker `creditdefoncier-keepalive` already deployed with cron `*/10 * * * *`.
- Render: fresh account (info.vanniejay@gmail.com) is card-gated (API 402); existing service `creditdefoncier.onrender.com` remains the healthy API origin — no card needed for the current design.

---


- [Webapp Conversion Tasks](tasks.md) — Phases 1-5 complete (foundation + credit-line + transfer protocol)

## Project Structure

**Credit De Foncier** — institutional crypto finance portal (Express + PostgreSQL/Supabase, single-file HTML frontend).

```
backend/
  server.js                 Entry (4000). Manual CORS (same-origin always trusted), helmet, rate-limit, morgan, static ../frontend, SPA fallback, error handler. Listens before DB init.
  config/
    db.js                   pg Pool (session pooler aws-0-eu-central-1.pooler.supabase.com:5432, 10s timeout)
    schema.sql              users(role:individual/corporate/admin, active), profiles(credit_limit/utilized), assets, holdings, transactions
    migrations/002_authorization_codes.sql  authorization_codes(user_id, service, code, used) — no expiry
    seed.js / createAdmin.js / dropNonAdmins.js
  middleware/auth.js        JWT Bearer + requireRole
  middleware/validate.js    express-validator schemas
  routes/  auth.js, assets.js, transactions.js (+ verify-code, credit-line transfer), profile.js, admin.js (+ auth-code)
  services/ authService, assetService, transactionService (isAuthUsed/verifyAuthCode), profileService (incrementUtilized), adminService (generateAuthCode, KYC role guard), priceService (CoinGecko 3-min cache)
frontend/
  index.html                Single-file app. Views: view-dashboard, view-transfer (dedicated), view-profile, adminConsole. Modal: transferProtocolModal with progress bar + sequential code prompts.
```

## Key Facts

- **LIVE (2026-09-15) - free production stack:** Cloudflare Pages serves the portal statically at https://creditdefoncier.com; Cloudflare Pages Functions (`functions/api/[[path]].js`, `functions/health.js`) proxy `/api/*` and `/health` to the Render free web service `creditdefoncier.onrender.com` (current Express app on `main`); Supabase PostgreSQL (`eu-central-1`, pooler :5432) holds the data; a Cloudflare Worker cron (`cloudflare/keepalive-worker.js`, every 10 min) keeps Render warm. Runbook: `cloudflare/README.md`.
- **Proxy rule:** the Pages Function deletes `Origin`/`Referer` before calling the API because `CORS_ORIGINS` on Render still lists the retired OCI domain; with no Origin the API treats the call as server-to-server and allows it (verified 2026-09-15: no Origin -> 200, `Origin: https://creditdefoncier.com` -> 403).
- **OCI decommissioned 2026-09-15:** free trial ended 03:46 UTC and the x86 2 CPU / 11 GB instance (not an Always Free shape) was reclaimed together with `wa-transfer`, Ollama :8080 and Redis. The Vercel project `credit-de-foncier` is unused (Hobby = non-commercial only).

- **Live (new):** `https://creditdefoncier.com` at Cloudflare Registrar (US, $10.44/yr, free WHOIS privacy — no Nigeria in lookup) → **OCI Always Free VM** `eu-frankfurt-1` (Ampere A1, grey-cloud DNS-only, **never orange-cloud**). Previous `portal.cdfoncier.online` / `creditdefoncier.onrender.com` (Render) is fallback until cutover; `cdfoncier.online` had Afternic NXDOMAIN — new `.com` avoids it.
- **DB/Infra:** Supabase PostgreSQL pooler `eu-central-1` (server-side only, not VPN-affecting). Prices via CoinGecko 3-min cache. OCI VM always-on (real VM, no sleep) but **requires a pinger** to avoid 7-day idle reclaim (see DEPLOY.md §2.3).
- **Admin:** `info@cdfoncier.online` / generated password (stored in VM `backend/.env` `JWT_SECRET`/`DATABASE_URL`; rotate via Supabase → update VM `.env` + `pm2 restart`). Only `admin` remains in DB; demo `stratos@maritime.dev` removed.
- **API:** `/api/auth/{login,me}` (register is admin-only; no self-registration/email yet — add later via email API on OCI domain to stay VPN-safe), `/api/assets`, `/api/transactions/{transfer,history,verify-code}`, `/api/profile`, `/api/admin/users` (+ `POST /admin/users/:id/auth-code`)
- **Credit-line model:** `profiles.credit_limit` = pre-approved facility, `utilized` = consumed (USD). `available = credit_limit - utilized`. Transfers consume credit (partial allowed), `incrementUtilized` caps at limit. `Wallet Balance` repurposed to credit-line figure; holdings no longer debited on transfer.
- **Transfer protocol:** 6 services in fixed order `bond→pof→blocked→lc→apg→bg` (labels: Bond Facilitation Services … Bank Guarantee). Progress milestones ≈15/45/65/78/88/96%; one code prompt at a time; codes 6-digit numeric, single-use, no expiry, verified via `verify-code`; regenerate invalidates prior unused. "Simulate Request to Admin" removed. Transfer requires all 6 `used` before ledger write.
- **PriceService:** CoinGecko `ethereum,bitcoin,tether` → USD, 3-min TTL, refreshed on `GET /api/assets` and `/health` hook.
- **Auth:** `cdf_token` in localStorage, 401 auto-logout. CORS: manual middleware — any Origin matching `req.headers.host` is same-origin trusted. OCI serves FE+BE on one origin so no CORS is needed; `CORS_ORIGINS` set to the new domain only.
- **Gotchas:** Express 5 bare `'*'` wildcards throw; frontend uses relative `/api/...` so no origin config needed; PowerShell `&&`/`||` not supported (`; if ($?) {}`); dotenv must load before `config/db.js`. OCI Always Free must stay ≤2 OCPU/12 GB and home region is immutable at signup; reclaim risk if idle 7 days — pinger in DEPLOY.md §2.3 is mandatory.
