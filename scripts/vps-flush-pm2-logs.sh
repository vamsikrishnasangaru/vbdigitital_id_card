#!/usr/bin/env bash
# Clear PM2 log files (error/out) for vb-api and vb-web.
# Run on VPS: bash scripts/vps-flush-pm2-logs.sh
set -euo pipefail

for app in vb-api vb-web; do
  if pm2 describe "$app" &>/dev/null; then
    pm2 flush "$app"
    echo "Flushed logs for $app"
  else
    echo "Skip $app (not running in PM2)"
  fi
done

echo "Done. Tail with: pm2 logs vb-api --lines 50"
