- [Webapp Conversion Tasks](tasks.md) — Tasks for converting the HTML portal into a full webapp (all 4 phases complete)

## Project Structure

**Credit De Foncier** — institutional crypto finance portal (Express + PostgreSQL backend, single-file HTML frontend).

```
backend/
  server.js              Entry point (port 4000). CORS, rate-limit, morgan logs,
                         static serving of ../frontend, SPA fallback, error handler.
                         Dev mode boots without DB; production exits if DB unreachable.
  config/
    index.js             Env validation (dotenv, required vars).
    db.js                pg Pool (10s connection timeout).
    schema.sql           Tables: users, profiles, assets, holdings, transactions.
    seed.js              Seeds demo user stratos@maritime.dev / Password123!
  middleware/
    auth.js              JWT Bearer guard + requireRole.
    validate.js          express-validator schemas.
  routes/                auth.js, assets.js, transactions.js, profile.js
  services/              authService, assetService, transactionService, profileService
frontend/
  index.html             Single-file app. API client with localStorage JWT (`cdf_token`).
```

## Key Facts

- **Run**: `cd backend; npm start` → http://localhost:4000 (port 3000 is taken by another local Vite app)
- **Demo login**: `stratos@maritime.dev` / `Password123!` (corporate, seeded via `npm run seed`)
- **API**: `/api/auth/{register,login,me}`, `/api/assets`, `/api/assets/holdings`, `/api/transactions/{transfer,history}`, `/api/profile`
- **DB not installed locally** — no Postgres/Docker on this machine; SQL paths untested live. Server verified: static serving, health, validation, auth guard, 404s.
- Express 5 gotcha hit: bare `'*'` wildcard routes throw PathError — use terminal middleware instead.
- Write/Edit tools resolve relative paths against project root but are inconsistent — prefer verifying file locations after writes.