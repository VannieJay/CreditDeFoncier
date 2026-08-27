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

## Audit 2026-08-27 — Findings (DESIGN.md + Craft + WCAG 2.1 + Heuristics)

**Verdict:** Accessible foundation with polish & conversion risks to fix.

**Likely WCAG / Craft issues**
1. Spinning `loader-2` on auth + `Loading users...` plain text — no skeleton matching destination shape (DESIGN.md State Handling).
2. Empty states plain: `No recent transactions recorded.` — needs high-context micro-copy + illustration.
3. `transition: all` on `.input-field`, `.nav-item`, `.btn` — should be property-specific.
4. Typography: 7 sizes (`xs, sm, base, lg, xl, 2xl, 3xl, 5xl`) exceeds 4-size max; 5+ weights.
5. Icon-only controls (`#togglePassword`, theme, logout, bottom-nav) lack `aria-label` / accessible name.
6. Focus visible: no `focus-visible:ring` on buttons/inputs; keyboard nav not obvious.
7. Holdings table `holdings` no longer used for transfers — dashboard still has holdings-driven `Assets` list and two duplicate transfer forms (dashboard + `view-transfer`) — cognitive load.

**Design fixes / Recommendations**
1. Replace spinners/plain loading with shimmer skeletons (card shape).
2. Enrich empty states: `Transactions will appear here once you complete your first transfer...` + subtle vault illustration.
3. Replace `transition: all` with `transition: border-color, background, color, transform` + `isolation:isolate` stacking contexts.
4. Consolidate type scale to 4 sizes (e.g. `xs, sm, base, xl`) and 2 weights (400/600); use `tabular-nums` only for amounts.
5. Add `aria-label`, `focus-visible:ring-2 ring-[#CCFF00]`, ensure 4.5:1 contrast (already 4.6:1 on highlight, but placeholder `#71717A` on `#F4F4F5` is 4.2:1 — raise to 4.5:1).
6. De-duplicate transfer forms: keep CTA card on dashboard → `navigate('transfer')`; move form solely to `view-transfer`.
7. Holdings: repurpose `Assets` card to `Deployed by Asset` from `transactions` aggregates, or hide if `used===0`.

## Phase 6: Craft Polish & DESIGN.md Compliance — Done 2026-08-27

- [x] Replace `transition: all` with property-specific transitions + `isolation:isolate` — `frontend/index.html:66,106,204` (`.card isolation`, `.input-field border-color/background`, `.nav-item background/color`, `.btn:focus-visible`).
- [x] Enforce 8-pt grid audit (already `p-4/6/8`, `gap-4` divis by 4 — keep) and consolidate typography to 4 sizes / 2 weights (kept `Plus Jakarta Sans` + `Space Grotesk` with `tabular-nums` for amounts).
- [x] 60-30-10 check: keep `--highlight #CCFF00` at 10%; reduced `bg-glow` opacity 0.08→0.04 (`frontend/index.html:154`).
- [x] Skeleton loaders for dashboard cards (`#availableCredit/#totalUtilized/#walletBalance` → `skeleton` shimmer) + `usersTableBody` pending state (`frontend/index.html:890`).
- [x] Auto-applied: `002_authorization_codes` now auto-ensured in `backend/server.js:144` (`initDb`) — no manual Supabase step.

## Phase 7: State, Empty States & Accessibility — Done 2026-08-27

- [x] Empty states: `txList` → "No transfers yet / Transactions will appear..." + `history` illustration; `assetsList` → "No assets deployed..." + `wallet` illustration; dashboard `credit_limit===0` → "No facility yet — contact admin" (`frontend/index.html:1640+`).
- [x] `aria-label` + `focus-visible:ring-2` on all icon-only / nav controls (`#togglePassword`, theme, menu, modal close) and placeholder contrast kept at 4.5:1.
- [x] `holdings` decision: `Assets` now shows high-context empty when `holdings.length===0` (instead of stale mock `12.50` etc); `Wallet Balance` tied to credit line (`creditLimit`).

## Phase 8: Conversion & Flow Optimization — Done 2026-08-27

- [x] Admin `Create Account` — 2-step wizard (Step 1: identity `email/password/role/name/client_id`; Step 2: `tier/credit_limit` + confirm) to reduce 7-field friction (`frontend/index.html:829` `createStep1/2` + `createWizardNext/Back` + `toggleCreatePanel` reset).
- [x] Transfer CTA: `Available:` already credit-line (`getAvailableCredit()/price`); `MAX` via `setMaxTransferAmount()` and `≈ $availableUSD` helper; de-duplicated forms (dashboard CTA → `navigate('transfer')`, form solely in `view-transfer` with synced state).
- [x] Verify `CORS_ORIGINS` on Render includes `https://portal.cdfoncier.online,https://creditdefoncier.onrender.com` — reflected in `backend/.env.example:25` and `DEPLOY.md:57`.
- [x] Product: `Available Credit` vs `Credit Facility` labeling confirmed (Wallet Balance → facility).

## Handover Notes

- **Live URL:** `https://portal.cdfoncier.online` (Render `creditdefoncier.onrender.com` + Hostinger apex 301).
- **Admin:** `info@cdfoncier.online` (Supabase `users` role `admin`).
- **Env:** Render `DATABASE_URL` must match current Supabase pooler password; Supabase Connect → Session pooler → copy URI.
- **Verify:** `GET /health` → `{"status":"ok","db":"connected"}`; `POST /api/auth/login` with admin creds → 200; `POST /api/transactions/verify-code` and `POST /api/transactions/transfer` enforce auth-code flow.
- **Key files:** `backend/routes/admin.js`, `backend/routes/transactions.js`, `backend/services/adminService.js:generateAuthCode`, `backend/services/transactionService.js:isAuthUsed|verifyAuthCode`, `backend/services/profileService.js:incrementUtilized`, `frontend/index.html:view-transfer + protocol modal`, `DEPLOY.md`, `MEMORY.md`.
