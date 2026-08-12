#!/usr/bin/env bash
# Install Chromium for Puppeteer PDF generation on Ubuntu/Debian VPS.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/id-app}"
API_DIR="$APP_ROOT/apps/api"

if command -v chromium >/dev/null 2>&1; then
  echo "OK: $(command -v chromium)"
elif command -v chromium-browser >/dev/null 2>&1; then
  echo "OK: $(command -v chromium-browser)"
else
  echo "Installing system Chromium..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq chromium-browser 2>/dev/null \
    || apt-get install -y -qq chromium

  if command -v chromium >/dev/null 2>&1; then
    echo "OK: $(command -v chromium)"
  elif command -v chromium-browser >/dev/null 2>&1; then
    echo "OK: $(command -v chromium-browser)"
  else
    echo "System Chromium not found; downloading Puppeteer Chrome..."
    cd "$API_DIR"
    pnpm exec puppeteer browsers install chrome
    echo "Done. Add to apps/api/.env if needed:"
    echo "PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium"
  fi
fi

if command -v zip >/dev/null 2>&1; then
  echo "OK: $(command -v zip) (fast ID card ZIP packaging)"
else
  echo "Installing zip for fast batch download packaging..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq zip
  command -v zip >/dev/null 2>&1 && echo "OK: $(command -v zip)" || echo "WARN: zip not installed — batch downloads use slower JS fallback"
fi
