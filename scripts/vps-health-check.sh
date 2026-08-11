#!/usr/bin/env bash
# Quick health check for id.vbdigital.tech VPS — web (:3000), API (:4000), nginx.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/id-app}"
WEB_PORT="${PORT:-3000}"

echo "=== PM2 ==="
pm2 status || true

echo ""
echo "=== Ports ==="
ss -lntp | grep -E ":(${WEB_PORT}|4000|80|443)\s" || true

echo ""
echo "=== Local HTTP ==="
curl -sI --max-time 5 "http://127.0.0.1:${WEB_PORT}/" | head -n1 || echo "WEB: unreachable"
curl -sI --max-time 5 "http://127.0.0.1:${WEB_PORT}/sw.js" | head -n1 || echo "SW: unreachable"
curl -sI --max-time 5 "http://127.0.0.1:4000/api/docs" | head -n1 || echo "API: unreachable"

echo ""
echo "=== PM2 logs (last 15 lines) ==="
pm2 logs vb-api --lines 15 --nostream 2>/dev/null || true
pm2 logs vb-web --lines 15 --nostream 2>/dev/null || true

echo ""
echo "=== Disk / memory ==="
df -h / | tail -n1
free -h | head -n2

echo ""
echo "If API is down: cd $APP_ROOT && bash scripts/vps-deploy-api.sh"
echo "If web is down:  cd $APP_ROOT && bash scripts/vps-deploy-web.sh"
echo "If nginx 504:    sudo bash $APP_ROOT/scripts/vps-nginx-generate-timeout.sh"
