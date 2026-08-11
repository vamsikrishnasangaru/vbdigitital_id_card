#!/usr/bin/env bash
# Raise nginx proxy timeouts so batch ID card generate does not return HTTP 504.
# Run on VPS: sudo bash scripts/vps-nginx-generate-timeout.sh
set -euo pipefail

TIMEOUTS=(
  'proxy_connect_timeout 600s;'
  'proxy_send_timeout 600s;'
  'proxy_read_timeout 600s;'
  'send_timeout 600s;'
)

declare -a SITES=()

add_site() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  local i
  for i in "${SITES[@]:-}"; do
    [[ "$i" == "$f" ]] && return 0
  done
  SITES+=("$f")
}

for f in \
  /etc/nginx/sites-available/id.vbdigital.tech \
  /etc/nginx/sites-enabled/id.vbdigital.tech \
  /etc/nginx/sites-available/default \
  /etc/nginx/sites-enabled/default \
  /etc/nginx/conf.d/id.vbdigital.tech.conf; do
  add_site "$f"
done

while IFS= read -r f; do
  add_site "$f"
done < <(grep -rlE 'proxy_pass.*(127\.0\.0\.1:4000|localhost:4000)|id\.vbdigital' \
  /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d 2>/dev/null || true)

upsert_timeout() {
  local file="$1"
  local line="$2"
  local key="${line%% *}"
  if grep -q "$key" "$file"; then
    sed -i "s/^[[:space:]]*${key}.*/    ${line}/" "$file"
  else
    if grep -q 'location /api/' "$file"; then
      sed -i "/location \\/api\\//,/^[[:space:]]*}/ {
        /proxy_pass/i\\        ${line}
      }" "$file"
    elif grep -q 'location /' "$file"; then
      sed -i "/location \\/ {/,/^[[:space:]]*}/ {
        /proxy_pass/i\\        ${line}
      }" "$file"
    elif grep -q 'proxy_pass' "$file"; then
      sed -i "/proxy_pass/i\\    ${line}" "$file"
    else
      sed -i "/server {/a\\    ${line}" "$file"
    fi
  fi
}

found=0
for f in "${SITES[@]:-}"; do
  [[ -f "$f" ]] || continue
  found=1
  echo "Updating timeouts in $f"
  for line in "${TIMEOUTS[@]}"; do
    upsert_timeout "$f" "$line"
  done
done

if [[ "$found" -eq 0 ]]; then
  echo "ERROR: No nginx site file found for the API proxy."
  echo "Add the directives from scripts/nginx-generate-timeout.snippet inside your /api/ location block,"
  echo "then run: sudo nginx -t && sudo systemctl reload nginx"
  exit 1
fi

nginx -t
systemctl reload nginx
echo "nginx reloaded — proxy timeouts set to 600s for batch ID card generate."
