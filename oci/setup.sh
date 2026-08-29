#!/usr/bin/env bash
# Co-host mode: adds creditdefoncier.com alongside the existing wa-transfer
# VM (140.238.79.76). Preserves the Ollama gateway on :8080
# (ollama-gateway.conf) and wa-transfer on :3001. Safe to re-run.
set -euo pipefail

echo "[1/6] system packages"
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git certbot python3-certbot-nginx
sudo npm i -g pm2
node -v; npm -v; nginx -v

echo "[2/6] app checkout"
sudo mkdir -p /opt/creditdefoncier
sudo chown "$USER":"$USER" /opt/creditdefoncier
if [ ! -d /opt/creditdefoncier/.git ]; then
  git clone https://github.com/VannieJay/CreditDeFoncier.git /opt/creditdefoncier
else
  git -C /opt/creditdefoncier pull
fi
cd /opt/creditdefoncier/backend
npm ci --omit=dev

echo "[3/6] env — copy template and edit before starting pm2"
if [ ! -f /opt/creditdefoncier/backend/.env ]; then
  cp /opt/creditdefoncier/oci/.env.example /opt/creditdefoncier/backend/.env
  echo ">> EDIT /opt/creditdefoncier/backend/.env now (DATABASE_URL, JWT_SECRET)"
  echo ">> nano /opt/creditdefoncier/backend/.env"
  exit 0  # user edits .env then re-runs from [4/6]
fi

echo "[4/6] pm2"
pm2 start /opt/creditdefoncier/oci/ecosystem.config.js || pm2 restart creditdefoncier
pm2 save
pm2 startup systemd 2>&1 | tail -n +2

echo "[5/6] nginx — add creditdefoncier vhost alongside existing ollama-gateway.conf (:8080) and wa-transfer (:3001)"
sudo cp /opt/creditdefoncier/oci/nginx.conf /etc/nginx/sites-available/creditdefoncier
sudo ln -sf /etc/nginx/sites-available/creditdefoncier /etc/nginx/sites-enabled/creditdefoncier
sudo rm -f /etc/nginx/sites-enabled/default  # already gone per OLLAMA_GATEWAY.md:12
echo "Active sites:"; ls -1 /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl enable nginx

echo "[6/6] on-VM keep-alive cron (Layer B — Layer A is the external cron-job.org pinger)"
(crontab -l 2>/dev/null; echo "0 */12 * * * curl -fsS http://127.0.0.1:4000/health >/dev/null 2>&1") | crontab -
echo "crontab: 0 */12 * * * -> /health added"

echo
echo "DONE. Now: 1) point Cloudflare A (grey-cloud) -> $(curl -s ifconfig.me) 2) sudo certbot --nginx -d creditdefoncier.com -d www.creditdefoncier.com --non-interactive --agree-tos -m you@example.com --redirect"
echo "     sudo systemctl enable certbot.timer"
echo "     curl https://creditdefoncier.com/health  -> {status:ok,db:connected}"
