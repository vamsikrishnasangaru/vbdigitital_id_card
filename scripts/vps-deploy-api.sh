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

export DATABASE_URL

if [[ -z "${GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN:-}" ]] && [[ -z "${GOOGLE_DRIVE_CREDENTIALS:-}" ]] \
  && [[ ! -f "$API_DIR/secure/google-drive-service-account.json" ]]; then
  echo "WARN: Google Drive not configured — add GOOGLE_DRIVE_OAUTH_* (Gmail) to .env"
fi

echo "Applying database migrations..."
pnpm --filter @repo/db exec prisma migrate deploy

pnpm --filter @repo/db run generate

bash "$APP_ROOT/scripts/vps-install-chrome.sh"

cd "$API_DIR"
rm -f tsconfig.tsbuildinfo
pnpm run build

if [[ ! -f "$API_DIR/dist/main.js" ]]; then
  echo "ERROR: Build did not produce $API_DIR/dist/main.js — PM2 cannot start vb-api."
  echo "Check the nest build output above for TypeScript errors."
  exit 1
fi

# Puppeteer loads render pages from the local Next server (not the public URL).
if ! grep -q '^FRONTEND_URL=' "$API_DIR/.env" 2>/dev/null; then
  echo "WARN: Add FRONTEND_URL=http://127.0.0.1:3000 to $API_DIR/.env for reliable ID card rendering."
fi

if ! grep -q '^ID_CARD_BATCH_CONCURRENCY=' "$API_DIR/.env" 2>/dev/null; then
  echo "TIP: ID_CARD_BATCH_CONCURRENCY defaults to 3. Set to 4 if batch downloads stay stable and you want more speed."
fi

pm2 startOrReload "$APP_ROOT/ecosystem.config.cjs" --only vb-api --update-env
pm2 save

if [[ -f "$APP_ROOT/scripts/vps-nginx-generate-timeout.sh" ]]; then
  echo "Applying nginx proxy timeouts for batch ID card generate (requires sudo)..."
  if sudo bash "$APP_ROOT/scripts/vps-nginx-generate-timeout.sh"; then
    echo "nginx timeouts applied."
  else
    echo "ERROR: nginx timeout update failed — batch downloads may return HTTP 504."
    echo "Run manually on the VPS: sudo bash scripts/vps-nginx-generate-timeout.sh"
  fi
fi

sleep 2
echo "API health:"
curl -sI "http://127.0.0.1:4000/api/docs" | head -n1 || true
pm2 logs vb-api --lines 5 --nostream
