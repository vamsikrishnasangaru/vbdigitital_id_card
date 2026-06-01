#!/usr/bin/env bash
# Copy local upload files to the VPS (images 404 when DB paths exist but files were never synced).
# Run from your PC (PowerShell / Git Bash), not on the VPS.
set -euo pipefail

LOCAL_UPLOADS="${LOCAL_UPLOADS:-$(cd "$(dirname "$0")/.." && pwd)/apps/api/uploads}"
VPS_HOST="${VPS_HOST:-root@187.127.149.7}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/id-app/apps/api/uploads}"

if [[ ! -d "$LOCAL_UPLOADS" ]]; then
  echo "No local uploads folder at $LOCAL_UPLOADS — nothing to sync."
  exit 0
fi

echo "Syncing $LOCAL_UPLOADS → $VPS_HOST:$REMOTE_DIR"
rsync -avz --progress "$LOCAL_UPLOADS/" "$VPS_HOST:$REMOTE_DIR/"
echo "Done. Restart API if needed: ssh $VPS_HOST 'pm2 restart vb-api'"
