#!/usr/bin/env bash
# Rebuild API + regenerate Prisma client + restart PM2 (run on VPS from repo root).
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/id-app}"
API_DIR="$APP_ROOT/apps/api"

cd "$APP_ROOT"
git pull
pnpm install

if [[ -f "$API_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$API_DIR/.env"
  set +a
fi

pnpm --filter @repo/db run generate

cd "$API_DIR"
pnpm run build

pm2 restart vb-api
pm2 save

sleep 2
echo "API health:"
curl -sI "http://127.0.0.1:4000/api/docs" | head -n1 || true
pm2 logs vb-api --lines 5 --nostream
