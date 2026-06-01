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
# Same-origin /api/v1 — nginx must proxy to Nest on :4000 (do not use localhost in the browser build).
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-/api/v1}"
export API_REWRITE_TARGET="${API_REWRITE_TARGET:-http://127.0.0.1:4000/api/v1}"
{
  echo "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL"
  echo "API_REWRITE_TARGET=$API_REWRITE_TARGET"
} > .env.production

# Dev .env.local often contains localhost and breaks live auth if baked into the client bundle.
ENV_LOCAL_BACKUP=""
if [[ -f .env.local ]]; then
  ENV_LOCAL_BACKUP=".env.local.bak.$$"
  mv .env.local "$ENV_LOCAL_BACKUP"
  echo "Renamed .env.local → $ENV_LOCAL_BACKUP for production build"
fi
cleanup_env_local() {
  if [[ -n "$ENV_LOCAL_BACKUP" && -f "$ENV_LOCAL_BACKUP" ]]; then
    mv -f "$ENV_LOCAL_BACKUP" .env.local
  fi
}
trap cleanup_env_local EXIT

pnpm exec next build --webpack
cleanup_env_local
trap - EXIT

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

# One vb-web only — kill stale listeners and duplicate PM2 entries.
pm2 delete vb-web 2>/dev/null || true
fuser -k "${PORT}/tcp" 2>/dev/null || true
sleep 2

pm2 start "$APP_ROOT/ecosystem.config.cjs" --only vb-web --update-env
pm2 save

sleep 2
echo "Listen:"
ss -lntp | grep ":$PORT" || true
echo "Health:"
curl -sI "http://127.0.0.1:$PORT/" | head -n1
curl -sI "http://127.0.0.1:$PORT/students" | head -n1
