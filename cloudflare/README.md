# Free production stack - Cloudflare Pages front door + Render API + keep-alive

## Architecture (current)

```
Browser
  |  https://creditdefoncier.com     Cloudflare Pages (global CDN, always on, free, commercial use allowed)
  |-- /                 -> frontend/index.html      static portal (build output dir = frontend, no build step)
  |-- /api/*            -> Pages Function           -> https://creditdefoncier.onrender.com/api/*   (Express)
  |-- /health           -> Pages Function           -> https://creditdefoncier.onrender.com/health
  |                                 |
  |                                 +-- Supabase PostgreSQL (eu-central-1, session pooler :5432)
  |
Keep-alive: Cloudflare Worker cron (*/10 min) -> https://creditdefoncier.com/health
            (defeats the 15-minute Render free spin-down)
```

Why this stack: Cloudflare Pages permits commercial use (Vercel Hobby does not), static
assets come from Cloudflare edge with no cold start, and the API stays on the Render free
service that already runs the current `main` code and holds the Supabase connection.

Files added for this stack:

| Path | Purpose |
|---|---|
| `functions/api/[[path]].js` | Pages Function: proxies `/api/*` to Render |
| `functions/health.js` | Pages Function: proxies `/health` to Render |
| `functions/_shared/proxy.js` | shared proxy helper (strips Origin so the API CORS allow-list is not involved) |
| `frontend/_routes.json` | only `/api/*` and `/health` invoke Functions (protects the 100k/day free limit) |
| `frontend/_headers` | security headers for the static portal |
| `cloudflare/keepalive-worker.js` | cron Worker that keeps the Render API warm |
| `cloudflare/wrangler.toml` | CLI config for that Worker |
---

## 0. FIRST: get creditdefoncier.com back up today (Render, ~10 min, your clicks)

The live site ran on an Oracle Cloud VM whose free trial ended **2026-09-15 03:46 UTC**. That
instance was reclaimed - it was a 2 CPU / 11 GB **x86** shape, and Always Free only covers
`A1.Flex` (ARM, <=4 OCPU/24 GB) or 2x `E2.1.Micro`. `wa-transfer`, the Ollama gateway `:8080`
and Redis died with it. The Render service still runs current `main`, so point the domain
there first - that alone restores the site before Pages is set up.

1. Render Dashboard -> the service behind `creditdefoncier.onrender.com` (it also serves
   `cdfoncier.online`) -> **Settings -> Custom Domains** -> add `creditdefoncier.com` and
   `www.creditdefoncier.com`.
2. Cloudflare -> DNS -> Records: **delete the stale `A 140.238.79.76`** (dead OCI VM). Use the
   records Render shows - apex `A 216.24.57.7` and `A 216.24.57.15` (Render anycast, exactly
   what `cdfoncier.online` uses today) plus `www CNAME -> creditdefoncier.onrender.com`. Keep
   these **DNS-only (grey cloud)** while the origin is Render.
3. Render -> Environment ->
   `CORS_ORIGINS=https://creditdefoncier.com,https://www.creditdefoncier.com,https://cdfoncier.online`
   The stored value still lists the retired `portal.cdfoncier.online`, which is why a browser
   call with `Origin: https://creditdefoncier.com` returns `403 Origin not allowed`. (The Pages
   proxy strips `Origin`, so this is belt-and-braces.)
4. Verify: `curl https://creditdefoncier.com/health` -> `{"status":"ok","db":"connected"}`.

---

## 1. Cloudflare Pages project (production front door)

1. Cloudflare Dashboard -> **Workers & Pages -> Create -> Pages -> Connect to Git**.
2. Select the repo **`VannieJay/CreditDeFoncier`** -> *Begin setup*.
3. Settings:
   - Project name: `credit-de-foncier`
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: **leave empty** (no root package.json, no build step)
   - Build output directory: **`frontend`**
4. **Save and Deploy**. Pages auto-detects `/functions` at the repo root and reads
   `frontend/_routes.json` + `frontend/_headers` from the output directory.
5. Confirm the build published `index.html` and lists both Functions (`api/[[path]]`, `health`).

## 2. Point the domain at Pages (final state)

1. Pages project -> **Custom domains -> Set up a custom domain** -> `creditdefoncier.com`,
   then `www.creditdefoncier.com`.
2. The domain DNS already lives in this Cloudflare account, so Pages creates the record itself -
   accept it. Confirm in **DNS -> Records** that the apex is now the Pages `CNAME`
   (`credit-de-foncier.pages.dev`) and that **no `A 140.238.79.76` remains**.
3. The old DEPLOY.md rule "never orange-cloud" applied to the **OCI origin** (Cloudflare in
   front of a VM). With Pages, Cloudflare *is* the origin, so the proxied (orange) record Pages
   creates is correct. Render keeps serving the API on its `onrender.com` hostname.
---

## 3. Keep-alive Worker (removes Render cold starts)

1. Workers & Pages -> **Create -> Worker** -> name `creditdefoncier-keepalive` -> Deploy.
2. **Edit code** -> paste `cloudflare/keepalive-worker.js` -> Deploy.
3. **Settings -> Triggers -> Cron Triggers** -> add `*/10 * * * *`.
4. Optional: **Settings -> Variables** -> `HEALTH_URL` (defaults to
   `https://creditdefoncier.com/health`).
5. Open the Worker URL: it returns the latest ping result as JSON.
   Cost: 144 requests/day of the 100k/day Workers free allowance.

## 4. Monitoring and alerts (free) - this outage went unnoticed for hours

1. UptimeRobot (free) -> HTTP(s) monitor -> `https://creditdefoncier.com/health` with the
   keyword `"db":"connected"`, interval 5 min, alert to email/SMS.
2. Optional second monitor on `https://creditdefoncier.com/` (expect 200 + the portal title).
3. Supabase -> SQL Editor -> `pg_cron` nightly `SELECT 1` heartbeat (DEPLOY.md) so the free DB
   never pauses after 7 idle days.

## 5. Verification checklist

```bash
curl -s  https://creditdefoncier.com/health      # {"status":"ok","db":"connected"}
curl -s  https://creditdefoncier.com/api/assets  # live price JSON via the Pages Function proxy
curl -sI https://creditdefoncier.com | head -5   # 200 + HSTS / nosniff from _headers
curl -sI https://creditdefoncier.com/api/assets | head -8   # 200 + Helmet headers (from Express)
```

Then log in at `https://creditdefoncier.com` with the admin account and run one transfer with
its authorization codes end to end.

## 6. Free-tier limits, backups, and what to watch

| Item | Free allowance | Watch-out |
|---|---|---|
| Cloudflare Pages / Functions | static unlimited; 100k function req/day; 10 ms CPU per call | keep Functions thin (proxy only) - a full Express port is not possible on free |
| Cloudflare Worker cron | 100k req/day | 144/day used by the keep-alive |
| Render free web | 750 instance-hours/month; spins down after 15 min idle | 24/7 is ~730 h, so keeping it warm fits with little headroom |
| Supabase free | 500 MB; pauses after 7 days idle | pg_cron heartbeat + `/health` pinger |
| Vercel Hobby | - | **non-commercial only** - do not use for this client portal |

Backups (free plans give limited guarantees) - weekly, kept off-platform:

```bash
pg_dump "$DATABASE_URL" -f "backup-$(date +%F).sql"
```

Graduation path when free stops being enough: Render Starter ~$7/mo (no sleep) or an Oracle
PAYG always-on VM (~$10-15/mo). Everything above is $0 until then.

---

## Still-open / background notes

- **Vercel project `credit-de-foncier`** (team `vanniejay-business-services-projects`) was
  re-created 2026-09-15 15:55 but imported with Framework `Other`, root `.`, no `index.html`
  at the root and no `vercel.json`, so it builds nothing and serves `404 NOT_FOUND`; deployment
  protection (`all_except_custom_domains`) also SSO-walls every URL. It is unused by this stack -
  remove it, or fix it later as a preview environment.
- **OCI** is decommissioned: the trial ended and the non-Always-Free x86 instance was reclaimed.
  If you rebuild, use an Always Free shape, reuse the Reserved Public IP (it survives
  termination) and restore the boot volume if it still exists, then configure the pinger that
  DEPLOY.md section 2.3 always required.
- **Optional perf/independence win:** the portal loads Tailwind from `cdn.tailwindcss.com`,
  which is a dev-only CDN build. Compiling the CSS to a local file removes that third-party
  runtime dependency and improves first paint (not required for correctness).