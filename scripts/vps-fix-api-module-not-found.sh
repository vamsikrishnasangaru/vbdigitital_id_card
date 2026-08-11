#!/usr/bin/env bash
# Fix vb-api MODULE_NOT_FOUND (dist/main.js missing) — run on VPS from repo root.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/id-app}"
API_DIR="$APP_ROOT/apps/api"

echo "=== Rebuilding API ==="
cd "$APP_ROOT"
pnpm install
pnpm --filter @repo/db run generate
cd "$API_DIR"
pnpm run build

if [[ ! -f "$API_DIR/dist/main.js" ]]; then
  echo "ERROR: Still no dist/main.js after build. Paste the build errors above."
  exit 1
fi

echo "=== dist/main.js OK — restarting PM2 ==="
pm2 startOrReload "$APP_ROOT/ecosystem.config.cjs" --only vb-api --update-env
pm2 save
sleep 2
curl -sI "http://127.0.0.1:4000/api/docs" | head -n1 || true
pm2 logs vb-api --lines 8 --nostream
