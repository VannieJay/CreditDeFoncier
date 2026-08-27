---
name: webapp-conversion-tasks
description: Tasks for converting the HTML portal into a full webapp
metadata:
  type: project
---

# Webapp Conversion Tasks

This document outlines tasks for the Credit De Foncier institutional portal. Keep this file current — it is the handover source of truth.

## Completed — Phases 1-4 (Foundation)

- [x] Create `tasks.md` in the project root.
- [x] Review `frontend/index.html` portal structure.
- [x] **Phase 1: Project Setup and Backend Foundation**
    - [x] Project structure (`frontend/` + `backend/`).
    - [x] Express 5 backend, PostgreSQL (Supabase pooler), dotenv.
- [x] **Phase 2: Auth**
    - [x] `users` table, `bcryptjs` (12 rounds), JWT.
    - [x] Routes `POST /api/auth/login`, `GET /api/auth/me`, admin-gated `POST /api/auth/register`.
    - [x] Frontend token persistence (`cdf_token` in localStorage), `authenticate` + `requireRole` middleware.
- [x] **Phase 3: Data & API**
    - [x] `profiles` / `assets` / `holdings` / `transactions` in `backend/config/schema.sql`.
    - [x] `GET /api/assets`, `GET /api/assets/holdings`, `POST /api/transactions/transfer`, `GET /api/transactions/history`, `GET|PUT /api/profile`.
    - [x] Frontend wired to real APIs (no hardcoded data paths remain after Phase 5).
- [x] **Phase 4: Hardening**
    - [x] `express-validator`, central error middleware, `morgan`, `helmet`, `express-rate-limit`, env config.

## Completed — Phase 5: UI/UX + Credit-Line + Transfer Protocol (2026-08-27)

- [x] **KYC bug** — `backend/services/adminService.js:completeKyc` now checks `users.role`; only `corporate` gets `business_registered=true`.
- [x] **CORS (portal.cdfoncier.online)** — replaced `cors` package with manual same-origin middleware in `backend/server.js:44-66` (serving host is always trusted; `CORS_ORIGINS` covers external clients only). Verified: `evil.example.com` → 403.
- [x] **Dashboard mock data** — removed `|| 5000000` / `|| 1850000` fallbacks (previously in `renderApp`). Dashboard now renders live `GET /api/profile` (`credit_limit`, `utilized`) + `GET /api/assets`.
- [x] **Credit-line model** — transfers draw from pre-approved `profiles.credit_limit` (`available = credit_limit - utilized`, partial transfers allowed up to available). `Wallet Balance` repurposed to credit-line figure. Transfer form `Available:` now shows `availableCredit / assetPrice` and MAX sets that.
- [x] **Authorization-code system** — `backend/config/migrations/002_authorization_codes.sql` (`authorization_codes(user_id, service, code, used)` — no `expires_at`; codes valid until used, regenerate invalidates prior). Order fixed: `bond → pof → blocked → lc → apg → bg`.
- [x] **Backend auth-code endpoints** — `POST /api/admin/users/:id/auth-code` (admin, body `{service}`) and `POST /api/transactions/verify-code` (user, body `{service, code}`) in `backend/routes/admin.js` + `backend/routes/transactions.js`; helpers `generateAuthCode`, `isAuthUsed`, `verifyAuthCode`, `incrementUtilized`.
- [x] **Transfer hardening** — `POST /api/transactions/transfer` now requires all 6 codes `used` + `usdValue <= availableCredit`; increments `utilized`; no longer debits `holdings`.
- [x] **Transfer view** — added `#view-transfer` so `navigate('transfer')` no longer blanks (transfer form moved out of dashboard; dashboard keeps CTA).
- [x] **Protocol modal redesign** — progress bar + sequential one-at-a-time code prompts at milestones (≈15% Bond, 45% PoF, 65% Blocked, 78% LC, 88% APG, 96% BG); removed `protocolSteps` checklist rendering and **removed `Simulate Request to Admin`** button from production; codes verified via `verify-code`.
- [x] **Admin per-user code generation** — row action in `adminConsole` users table: service dropdown + Generate → shows 6-digit code for relay.
- [x] **DEPLOY.md** — updated to `portal.cdfoncier.online` + apex 301 + DB password rotation runbook.
- [x] **Sign-in fix** — restored missing `<form id="authForm">` tag.

## Pending / Next Steps

- [ ] Apply `002_authorization_codes.sql` to Supabase (SQL Editor → Run).
- [ ] Verify `CORS_ORIGINS` on Render includes `https://portal.cdfoncier.online` (Environment tab) — same-origin fix makes this optional but recommended.
- [ ] Decide holdings usage: `holdings` table remains but is no longer the transfer source; keep for display or deprecate.
- [ ] Optional: seed demo holdings/holdings display from `transactions` aggregates instead of `holdings`.
- [ ] Product decision: confirm `availableCredit` vs `availableBalance` labeling if both are shown (credit-line vs wallet).

## Handover Notes

- **Live URL:** `https://portal.cdfoncier.online` (Render `creditdefoncier.onrender.com` + Hostinger apex 301).
- **Admin:** `info@cdfoncier.online` (Supabase `users` role `admin`).
- **Env:** Render `DATABASE_URL` must match current Supabase pooler password; Supabase Connect → Session pooler → copy URI.
- **Verify:** `GET /health` → `{"status":"ok","db":"connected"}`; `POST /api/auth/login` with admin creds → 200; `POST /api/transactions/verify-code` and `POST /api/transactions/transfer` enforce auth-code flow.
- **Key files:** `backend/routes/admin.js`, `backend/routes/transactions.js`, `backend/services/adminService.js:generateAuthCode`, `backend/services/transactionService.js:isAuthUsed|verifyAuthCode`, `backend/services/profileService.js:incrementUtilized`, `frontend/index.html:view-transfer + protocol modal`, `DEPLOY.md`, `MEMORY.md`.
