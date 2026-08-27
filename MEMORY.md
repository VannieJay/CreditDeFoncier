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

- **Live:** `https://portal.cdfoncier.online` (Render `creditdefoncier.onrender.com`; apex `cdfoncier.online` → 301 to portal). Health: `GET /health` → `{"status":"ok","db":"connected"}`.
- **Admin:** `info@cdfoncier.online` / generated password (stored in Render env; rotate via Supabase → update Render DATABASE_URL). Only `admin` remains in DB; demo `stratos@maritime.dev` removed.
- **API:** `/api/auth/{login,me}` (register is admin-only), `/api/assets`, `/api/transactions/{transfer,history,verify-code}`, `/api/profile`, `/api/admin/users` (+ `POST /admin/users/:id/auth-code`)
- **Credit-line model:** `profiles.credit_limit` = pre-approved facility, `utilized` = consumed (USD). `available = credit_limit - utilized`. Transfers consume credit (partial allowed), `incrementUtilized` caps at limit. `Wallet Balance` repurposed to credit-line figure; holdings no longer debited on transfer.
- **Transfer protocol:** 6 services in fixed order `bond→pof→blocked→lc→apg→bg` (labels: Bond Facilitation Services … Bank Guarantee). Progress milestones ≈15/45/65/78/88/96%; one code prompt at a time; codes 6-digit numeric, single-use, no expiry, verified via `verify-code`; regenerate invalidates prior unused. "Simulate Request to Admin" removed. Transfer requires all 6 `used` before ledger write.
- **PriceService:** CoinGecko `ethereum,bitcoin,tether` → USD, 3-min TTL, refreshed on `GET /api/assets` and `/health` hook.
- **Auth:** `cdf_token` in localStorage, 401 auto-logout. CORS: manual middleware — any Origin matching `req.headers.host` is same-origin trusted.
- **Gotchas:** Express 5 bare `'*'` wildcards throw; frontend uses relative `/api/...` so no origin config needed; PowerShell `&&`/`||` not supported (`; if ($?) {}`); dotenv must load before `config/db.js`.
