# Deployment Guide — OCI Always Free + Supabase + Cloudflare Registrar

## Architecture (current)

- **App URL:** `https://creditdefoncier.com` (no VPN block — non-Cloudflare, international `.com`)
- **Domain:** `creditdefoncier.com` at **Cloudflare Registrar** (US, $10.44/yr at-cost, free WHOIS privacy; renewal = same price; WHOIS shows Cloudflare, not Nigeria)
- **DNS:** Cloudflare, **A record grey-cloud (DNS-only, proxy OFF)** → OCI public IP. **Never orange-cloud** — proxying would reintroduce the Cloudflare/VPN block.
- **API + static frontend:** OCI VM **co-hosted on the existing `wa-transfer` box `140.238.79.76`** (x86_64, 2 CPU / 11 GB; Ollama gateway on `:8080`, `wa-transfer` on `:3001`) running the Express app on `:4000` via `pm2` + a new `nginx` vhost (`backend/server.js` serves `../frontend/index.html` + `/api/*` on one origin). The original plan for a dedicated Frankfurt VM (`eu-frankfurt-1`) is deferred — co-hosting keeps cost at $0.
- **Database:** Supabase PostgreSQL (session pooler, `eu-central-1`)
- **Prices:** CoinGecko live rates cached 3 min (`services/priceService.js`)
- **Keep-alive:** **required on OCI Always Free** — external pinger + DB heartbeat prevent Oracle idle reclaim *and* Supabase pause
- **Previous host:** `portal.cdfoncier.online` / `creditdefoncier.onrender.com` on Render remains as **fallback** until cutover is verified. DNS records for `cdfoncier.online` should stay on Cloudflare or be decommissioned after cutover.

> **Why not `cdfoncier.online`?** That domain's nameservers were pointed at Afternic parking (`ns1.afternic.com`), causing the `NXDOMAIN` you saw. A brand-new `.com` at Cloudflare Registrar avoids it entirely.

---

## 0. Prerequisites — prepare before VM creation

Have these ready so the VM build isn't blocked:

1. **OCI tenancy** — re-use the existing **wa-transfer tenancy** (VM `140.238.79.76`). No new account/region needed. If you later need a dedicated box, choose **home region `eu-frankfurt-1` (Frankfurt)** at signup — it cannot be changed.
2. **Cloudflare account + domain:** buy `creditdefoncier.com` at Cloudflare Registrar ($10.44, free privacy). WHOIS privacy is redacted by default — confirm it's on.
3. **Supabase `DATABASE_URL`:** Supabase dashboard → **Connect** → **Session pooler** (port 5432) → copy the full URI (it embeds the current password, e.g. `postgresql://postgres.lbxyl...@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`). Do **not** hand-type the password — copy.
4. **JWT secret:** generate via `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` (rotating invalidates all existing sessions).

---

## 1. Database setup (Supabase) — unchanged

1. Apply schema: SQL Editor → paste contents of `backend/config/schema.sql` → Run (re-run safe; migrations are idempotent).
2. Seed demo data from a local machine (requires real `DATABASE_URL` in `.env`):
   ```bash
   cd backend
   npm run seed   # first run only — see seed.js
   ```
3. Install pg_cron heartbeat (SQL Editor) — counts as DB activity for Supabase *and* satisfies OCI's network-activity side:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;

   SELECT cron.schedule(
     'cdf-nightly-heartbeat',
     '0 3 * * *',
     'SELECT 1'
   );

   -- verify
   SELECT jobname, schedule, active FROM cron.job;
   ```

---

## 2. OCI Always Free VM (core)

### 2.1 VM — co-host on the existing wa-transfer box

No new VM. Re-use `ubuntu@140.238.79.76` (x86_64, 2 CPU / 11 GB). It already hosts the Ollama gateway (`:8080`, `OLLAMA_GATEWAY.md:2`) and `wa-transfer` (Docker `:3001`, `docker-compose.yml:86`). Current live use is ~6 GB (Ollama `qwen2.5:7b`) — adding Credit De Foncier (+450 MB, `oci/ecosystem.config.js:7`) brings the box to ~6.5–8.5 GB, leaving headroom. Monitor with `free -h` / `docker stats`.

| Setting | Value |
|---|---|
| Host | `140.238.79.76` (existing) |
| Existing services | Ollama gateway `:8080`, `wa-transfer` `:3001` (Docker), Redis `:6379` |
| New service | Credit De Foncier `:4000` (pm2) + nginx vhost `:80` → `:443` after certbot |
| Public IP | already reserved on the VCN; confirm it hasn't changed |
| Boot volume | existing 47 GB |

**Network:** Security List on the VCN already allows `8080` for Ollama (see `OLLAMA_GATEWAY.md:41`). Add `0.0.0.0/0` TCP **80** and **443** if not present (OCI Console → VCN → Security Lists → Ingress). Keep `22` restricted to your IP.

> Dedicated Frankfurt VM (`eu-frankfurt-1`, Ampere A1) remains the fallback if this box ever needs isolation — provision a second Always Free VM only if `free -h` shows sustained pressure.

### 2.2 First-login provisioning (run on the VM)

A copy is at `oci/setup.sh` in the repo. Condensed:

```bash
# 1) system
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git certbot python3-certbot-nginx
sudo npm i -g pm2

# 2) app
sudo mkdir -p /opt/creditdefoncier
sudo chown ubuntu:ubuntu /opt/creditdefoncier
git clone https://github.com/VannieJay/CreditDeFoncier.git /opt/creditdefoncier
cd /opt/creditdefoncier/backend
npm ci --omit=dev

# 3) env — paste values (see oci/.env.example)
cp /opt/creditdefoncier/oci/.env.example /opt/creditdefoncier/backend/.env
nano /opt/creditdefoncier/backend/.env   # fill DATABASE_URL, JWT_SECRET, etc.

# 4) start
pm2 start /opt/creditdefoncier/oci/ecosystem.config.js
pm2 save
pm2 startup systemd   # follow its printed command, re-run as root

# 5) reverse proxy
sudo cp /opt/creditdefoncier/oci/nginx.conf /etc/nginx/sites-available/creditdefoncier
sudo ln -sf /etc/nginx/sites-available/creditdefoncier /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 6) TLS — run AFTER the Cloudflare A record points here (see §3)
sudo certbot --nginx -d creditdefoncier.com -d www.creditdefoncier.com --non-interactive --agree-tos -m you@example.com --redirect
# auto-renew
sudo systemctl enable certbot.timer
```

`backend/.env` on the VM (fill before `pm2 start`):

```
PORT=4000
NODE_ENV=production
DATABASE_URL=postgresql://postgres.lbxylzmqjvlgplkpqufz:<PASSWORD>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
DB_SSL=true
JWT_SECRET=<48 hex chars>
JWT_EXPIRES_IN=1h
SEED=false
CORS_ORIGINS=https://creditdefoncier.com,https://www.creditdefoncier.com
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

> Frontend uses **relative `/api/...`**, so no origin config change is needed beyond CORS. The single VM serves both, so same-origin → no CORS preflight.

### 2.3 Anti-idle keep-alive (REQUIRED — Oracle reclaims idle Always Free)

Oracle may reclaim Always Free compute that is **idle for 7 consecutive days** (roughly: < 10 % CPU *and* < low network). A portal that sits unused on weekends can hit this. Two layers:

**Layer A — external pinger (mandatory):** counts as network ingress + DB activity + CPU per hit. Re-using the same free service that kept Render awake:

- Provider: <https://cron-job.org> (free)
- URL: `https://creditdefoncier.com/health`
- Interval: **every 10 minutes**, 24×7
- This also satisfies Oracle's "network" signal and keeps Supabase from pausing.

**Layer B — on-VM cron (optional second line of defence):** ensures minimal CPU/network even if the external pinger hiccups.

```cron
# crontab -e (user ubuntu) — hits localhost every 12 hours
0 */12 * * * curl -fsS http://127.0.0.1:4000/health >/dev/null 2>&1
```

Layer A alone is sufficient; Layer B is a cheap failsafe. Together they satisfy both Oracle's CPU and network conditions for "active." The existing `pg_cron` heartbeat in Supabase satisfies Supabase's inactivity check, not Oracle's — the pinger is what covers Oracle.

> Related note: Oracle may also reclaim Always Free resources when a tenancy is **upgraded past Always Free limits** (e.g., provisioning 4 OCPU/24 GB after the June 2026 cap). Stay ≤ 2 OCPU / 12 GB to avoid it.

---

## 3. Domain & DNS (Cloudflare Registrar → OCI)

1. **Cloudflare Registrar:** `creditdefoncier.com` registered there — **keep WHOIS privacy on** (default).
2. **Cloudflare DNS:** add **A** record `creditdefoncier.com` → **OCI reserved public IP**, **grey-cloud (DNS-only, proxy OFF)**. Add `CNAME www → creditdefoncier.com` (also grey-cloud). **Do not orange-cloud** — proxied traffic goes through Cloudflare's edge and the VPN block returns.
3. Wait for DNS propagation (seconds to minutes on Cloudflare DNS).
4. Then issue TLS on the VM (certbot step above). Let's Encrypt validates over the public IP.

### DNS pitfalls that caused the last outage (don't repeat)

- Never point this domain's nameservers at Afternic/GoDaddy parking. They *must* be Cloudflare's (`*.ns.cloudflare.com` as assigned).
- Never orange-cloud the apex if your users' VPNs filter Cloudflare CDN. Grey-cloud keeps the response as the OCI IP.

---

## 4. Verify deployment

```bash
curl https://creditdefoncier.com/health
# -> {"status":"ok","db":"connected"}

curl -I https://creditdefoncier.com/
# -> 200, helmet headers present

# WHOIS shows Cloudflare Registrar, not Nigeria (privacy redacted):
whois creditdefoncier.com | sed -n '1,40p'
```

Login at `https://creditdefoncier.com` with `info@cdfoncier.online` (or your admin) and create client accounts from the Admin Console (public registration remains disabled by design).

---

## 5. Multi-site hosting on the same VM (optional)

The Ampere VM can host several portals (e.g. `app2.creditdefoncier.com`, `clientX.creditdefoncier.com`) behind the same `nginx` via vhosts, sharing the 2 OCPU / 12 GB. Options:

- Multiple Express instances on different `PORT`s → `nginx` `server { server_name siteX; proxy_pass :4001; }`, or
- One multi-tenant Express app that routes by `req.hostname`.

Add a grey-cloud A/CNAME per subdomain → same OCI IP; `certbot --nginx -d siteX.creditdefoncier.com` expands the cert. Outbound mail from OCI is blocked on port 25 — use an email **API** (Resend/Brevo) if registration/email flows are later added.

---

## 6. Rotating the database password

When the Supabase DB password is reset:

1. Supabase → **Connect** → **Session pooler** (port 5432) → copy the full URI (new password embedded).
2. SSH to the VM → edit `/opt/creditdefoncier/backend/.env` → replace `DATABASE_URL` wholesale → `pm2 restart creditdefoncier`.
3. Verify `/health` → `"db":"connected"`.

---

## 7. Local development

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL
npm install
npm start              # http://localhost:4000
```
