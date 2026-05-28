#!/usr/bin/env bash
# Rebuild web + sync standalone assets + restart PM2 (run on VPS from repo root).
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/id-app}"
WEB_DIR="$APP_ROOT/apps/web"
STANDALONE="$WEB_DIR/.next/standalone/apps/web"

cd "$APP_ROOT"
git pull
pnpm install

cd "$WEB_DIR"
export RELEASE_REVISION="${RELEASE_REVISION:-$(git -C "$APP_ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d)}"
export PORT="${PORT:-3000}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"

pnpm exec next build --webpack

if [[ ! -f "$STANDALONE/server.js" ]]; then
  echo "ERROR: missing $STANDALONE/server.js — build did not produce standalone output."
  exit 1
fi

# Do NOT delete standalone/.next — it contains BUILD_ID + server manifests.
# Only sync public + static into the standalone runtime tree.
mkdir -p "$STANDALONE/.next"
rm -rf "$STANDALONE/public"
cp -r public "$STANDALONE/public"
rm -rf "$STANDALONE/.next/static"
cp -r .next/static "$STANDALONE/.next/static"

pm2 delete vb-web 2>/dev/null || true
PORT="$PORT" HOSTNAME="$HOSTNAME" pm2 start server.js --name vb-web --cwd "$STANDALONE"
pm2 save

sleep 2
echo "Listen:"
ss -lntp | grep ":$PORT" || true
echo "Health:"
curl -sI "http://127.0.0.1:$PORT/" | head -n1
curl -sI "http://127.0.0.1:$PORT/students" | head -n1
