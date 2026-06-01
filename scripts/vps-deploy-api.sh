#!/usr/bin/env bash
# Rebuild API + regenerate Prisma client + restart PM2 (run on VPS from repo root).
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/id-app}"
API_DIR="$APP_ROOT/apps/api"

cd "$APP_ROOT"
git pull
pnpm install

if [[ ! -f "$API_DIR/.env" ]]; then
  echo "ERROR: Missing $API_DIR/.env (copy from your machine; never commit secrets)."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$API_DIR/.env"
set +a

if [[ -z "${DATABASE_URL:-}" ]] || [[ "$DATABASE_URL" == *'USER'* ]] || [[ "$DATABASE_URL" == *'PASSWORD'* ]]; then
  echo "ERROR: DATABASE_URL in $API_DIR/.env looks like a placeholder — set the real Postgres URL."
  exit 1
fi

if [[ -z "${GOOGLE_DRIVE_CREDENTIALS:-}" ]] && [[ -z "${GOOGLE_DRIVE_CREDENTIALS_PATH:-}" ]] \
  && [[ ! -f "$API_DIR/secure/google-drive-service-account.json" ]]; then
  echo "WARN: Google Drive not configured — add GOOGLE_DRIVE_CREDENTIALS or secure/*.json to .env"
fi

pnpm --filter @repo/db run generate

bash "$APP_ROOT/scripts/vps-install-chrome.sh"

cd "$API_DIR"
pnpm run build

pm2 restart vb-api
pm2 save

sleep 2
echo "API health:"
curl -sI "http://127.0.0.1:4000/api/docs" | head -n1 || true
pm2 logs vb-api --lines 5 --nostream
