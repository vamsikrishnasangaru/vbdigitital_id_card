#!/usr/bin/env bash
# Rebuild web + sync standalone assets + restart PM2 (run on VPS as root).
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/id-app}"
WEB_DIR="$APP_ROOT/apps/web"
STANDALONE="$WEB_DIR/.next/standalone/apps/web"

cd "$APP_ROOT"
git pull
pnpm install

cd "$WEB_DIR"
export RELEASE_REVISION="${RELEASE_REVISION:-$(git -C "$APP_ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d)}"
pnpm exec next build --webpack

rm -rf "$STANDALONE/public" "$STANDALONE/.next"
mkdir -p "$STANDALONE/.next"
cp -r public "$STANDALONE/public"
cp -r .next/static "$STANDALONE/.next/static"

pm2 delete vb-web 2>/dev/null || true
pm2 start /usr/bin/node --name vb-web --cwd "$WEB_DIR" -- .next/standalone/apps/web/server.js
pm2 save

echo "OK: $(curl -sI http://127.0.0.1:3000/ | head -n1)"
