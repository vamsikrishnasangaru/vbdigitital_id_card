#!/usr/bin/env bash
# Install Chromium for Puppeteer PDF generation on Ubuntu/Debian VPS.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/id-app}"
API_DIR="$APP_ROOT/apps/api"

if command -v chromium >/dev/null 2>&1; then
  echo "OK: $(command -v chromium)"
  exit 0
fi

if command -v chromium-browser >/dev/null 2>&1; then
  echo "OK: $(command -v chromium-browser)"
  exit 0
fi

echo "Installing system Chromium..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq chromium-browser 2>/dev/null \
  || apt-get install -y -qq chromium

if command -v chromium >/dev/null 2>&1; then
  echo "OK: $(command -v chromium)"
  exit 0
fi

if command -v chromium-browser >/dev/null 2>&1; then
  echo "OK: $(command -v chromium-browser)"
  exit 0
fi

echo "System Chromium not found; downloading Puppeteer Chrome..."
cd "$API_DIR"
pnpm exec puppeteer browsers install chrome
echo "Done. Add to apps/api/.env if needed:"
echo "PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium"
