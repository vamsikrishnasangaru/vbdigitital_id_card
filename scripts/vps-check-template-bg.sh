#!/usr/bin/env bash
# Check template background path vs files on disk (run on VPS).
# Usage: bash scripts/vps-check-template-bg.sh <template-id>
set -euo pipefail

TEMPLATE_ID="${1:-}"
API_DIR="${API_DIR:-/var/www/id-app/apps/api}"
UPLOADS_DIR="$API_DIR/uploads"

if [[ -z "$TEMPLATE_ID" ]]; then
  echo "Usage: bash scripts/vps-check-template-bg.sh <template-id>"
  exit 1
fi

if [[ ! -f "$API_DIR/.env" ]]; then
  echo "Missing $API_DIR/.env"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$API_DIR/.env"
set +a

DB_URL="${DATABASE_URL:-}"
if [[ -z "$DB_URL" ]]; then
  echo "DATABASE_URL not set in .env"
  exit 1
fi

echo "=== Template $TEMPLATE_ID ==="
psql "$DB_URL" -t -A -c "SELECT \"frontBgUrl\" FROM \"Template\" WHERE id = '$TEMPLATE_ID';" | sed 's/^/frontBgUrl: /'

echo ""
echo "=== Template PNG/JPG files on disk ==="
ls -la "$UPLOADS_DIR/templates/"*.{png,jpg,jpeg} 2>/dev/null || echo "(none in templates/)"

echo ""
echo "Test background URL in browser (replace filename from frontBgUrl):"
echo "  https://id.vbdigital.tech/api/v1/uploads/templates/YOUR-FILE.png"
