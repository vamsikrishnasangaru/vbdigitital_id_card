#!/usr/bin/env bash
# Quick VPS check for apps/api/.env (no secret values printed).
set -euo pipefail

API_DIR="${APP_ROOT:-/var/www/id-app}/apps/api"
ENV_FILE="$API_DIR/.env"

echo "=== API env check: $ENV_FILE ==="

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: .env file missing"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

ok=true

if [[ -n "${DATABASE_URL:-}" ]] && [[ "$DATABASE_URL" != *'USER'* ]] && [[ "$DATABASE_URL" != *'PASSWORD'* ]]; then
  echo "OK   DATABASE_URL is set"
else
  echo "FAIL DATABASE_URL missing or still a placeholder (USER/PASSWORD)"
  ok=false
fi

if [[ -n "${GOOGLE_DRIVE_CREDENTIALS:-}" ]]; then
  echo "OK   GOOGLE_DRIVE_CREDENTIALS is set ($(wc -c < <(printf '%s' "$GOOGLE_DRIVE_CREDENTIALS")) bytes)"
elif [[ -n "${GOOGLE_DRIVE_CREDENTIALS_PATH:-}" ]] && [[ -f "$API_DIR/$GOOGLE_DRIVE_CREDENTIALS_PATH" ]]; then
  echo "OK   GOOGLE_DRIVE_CREDENTIALS_PATH file exists"
elif [[ -f "$API_DIR/secure/google-drive-service-account.json" ]]; then
  echo "OK   secure/google-drive-service-account.json exists"
else
  echo "FAIL Google Drive credentials not configured"
  ok=false
fi

if [[ -n "${GOOGLE_DRIVE_ROOT_FOLDER_ID:-}" ]] || [[ -n "${GOOGLE_DRIVE_SHARED_DRIVE_ID:-}" ]]; then
  echo "OK   Drive upload target configured (root folder or shared drive)"
else
  echo "FAIL Set GOOGLE_DRIVE_ROOT_FOLDER_ID (folder shared with service account) or GOOGLE_DRIVE_SHARED_DRIVE_ID"
  ok=false
fi

if [[ "$ok" == true ]]; then
  echo "=== All checks passed ==="
  exit 0
fi

echo "=== Fix .env on the VPS, then: pm2 restart vb-api ==="
exit 1
