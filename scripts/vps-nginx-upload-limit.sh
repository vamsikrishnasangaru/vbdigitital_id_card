#!/usr/bin/env bash
# Raise nginx body limit so student photos are not rejected with HTTP 413.
# Run on VPS: sudo bash scripts/vps-nginx-upload-limit.sh
set -euo pipefail

SNIPPET='client_max_body_size 15M;'
SITES=(
  /etc/nginx/sites-available/id.vbdigital.tech
  /etc/nginx/sites-available/default
  /etc/nginx/conf.d/id.vbdigital.tech.conf
)

found=0
for f in "${SITES[@]}"; do
  [[ -f "$f" ]] || continue
  found=1
  if grep -q 'client_max_body_size' "$f"; then
    echo "Already set in $f:"
    grep 'client_max_body_size' "$f" || true
  else
    echo "Adding $SNIPPET to $f (inside server block — adjust manually if wrong place)"
    sed -i "/server {/a\\    $SNIPPET" "$f"
  fi
done

if [[ "$found" -eq 0 ]]; then
  echo "No known nginx site file found. Add this inside your server { } block:"
  echo "  $SNIPPET"
  exit 1
fi

nginx -t
systemctl reload nginx
echo "nginx reloaded — client_max_body_size should now allow uploads up to 15MB."
