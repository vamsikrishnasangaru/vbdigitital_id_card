#!/usr/bin/env bash
# Apply Prisma migrations on VPS (run from repo root).
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/id-app}"
API_DIR="$APP_ROOT/apps/api"

cd "$APP_ROOT"

if [[ ! -f "$API_DIR/.env" ]]; then
  echo "ERROR: Missing $API_DIR/.env"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$API_DIR/.env"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set in $API_DIR/.env"
  exit 1
fi

export DATABASE_URL
pnpm --filter @repo/db exec prisma migrate deploy
echo "Migrations applied."
