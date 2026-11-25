#!/usr/bin/env bash
# Fix Prisma P1010 / login 500 when Postgres rejects host TCP without SSL.
# Run on the VPS as root: bash scripts/vps-fix-pg-hba-local.sh
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-id_card_builder_db}"
APP_ROOT="${APP_ROOT:-/var/www/id-app}"
API_ENV="$APP_ROOT/apps/api/.env"

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  echo "ERROR: docker container '$DB_CONTAINER' is not running."
  exit 1
fi

HBA="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc 'SHOW hba_file;' | tr -d '\r' | xargs)"
if [[ -z "$HBA" ]]; then
  echo "ERROR: could not resolve pg_hba.conf path."
  exit 1
fi

echo "Using hba_file=$HBA"
STAMP="$(date +%Y%m%d%H%M%S)"
docker exec "$DB_CONTAINER" bash -c "cp '$HBA' '${HBA}.bak.${STAMP}'"
echo "Backup: ${HBA}.bak.${STAMP}"

docker exec "$DB_CONTAINER" bash -c "
set -e
HBA='$HBA'
if grep -q 'VB_LOCAL_FIX' \"\$HBA\"; then
  echo 'VB_LOCAL_FIX already present — leaving existing rules.'
  exit 0
fi
TMP=\$(mktemp)
{
  echo '# VB_LOCAL_FIX: allow Nest/API on the host to reach Postgres without client SSL'
  echo 'hostnossl  all  all  127.0.0.1/32   scram-sha-256'
  echo 'hostnossl  all  all  ::1/128        scram-sha-256'
  echo 'host       all  all  127.0.0.1/32   scram-sha-256'
  echo 'host       all  all  ::1/128        scram-sha-256'
  echo 'host       all  all  172.16.0.0/12  scram-sha-256'
  echo 'host       all  all  192.168.0.0/16 scram-sha-256'
  cat \"\$HBA\"
} > \"\$TMP\"
cat \"\$TMP\" > \"\$HBA\"
rm -f \"\$TMP\"
echo 'Inserted VB_LOCAL_FIX rules at top of pg_hba.conf'
"

docker exec "$DB_CONTAINER" psql -U postgres -d postgres -c 'SELECT pg_reload_conf();' >/dev/null
echo "pg_hba reloaded"

docker exec "$DB_CONTAINER" psql -U postgres -d id_card_builder -v ON_ERROR_STOP=1 -c "
ALTER SCHEMA public OWNER TO postgres;
GRANT ALL ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO public;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
"
echo "Schema grants refreshed"

if [[ -f "$API_ENV" ]]; then
  python3 - <<PY
from pathlib import Path
p = Path("$API_ENV")
text = p.read_text()
lines = []
changed = False
for line in text.splitlines():
    if line.startswith("DATABASE_URL=") and "sslmode=" not in line:
        raw = line.split("=", 1)[1].strip().strip('"').strip("'")
        sep = "&" if "?" in raw else "?"
        raw = f"{raw}{sep}sslmode=disable"
        line = f'DATABASE_URL="{raw}"'
        changed = True
    lines.append(line)
if changed:
    p.write_text("\\n".join(lines) + ("\\n" if text.endswith("\\n") else ""))
    print("Added sslmode=disable to DATABASE_URL")
else:
    print("No DATABASE_URL sslmode change needed")
PY
fi

pm2 restart vb-api --update-env
sleep 4
pm2 status vb-api || true

echo "=== login smoke ==="
CODE="$(curl -s -o /tmp/vb-login-smoke.json -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@vbdigital.com","password":"Admin@123"}' \
  http://127.0.0.1:4000/api/v1/auth/login || true)"
echo "login_http=$CODE"
python3 - <<'PY'
import json
try:
    d = json.load(open("/tmp/vb-login-smoke.json"))
    print("ok=", bool(d.get("accessToken")), "email=", (d.get("user") or {}).get("email"))
    if not d.get("accessToken"):
        print("body=", d)
except Exception as e:
    print("parse_error", e)
    print(open("/tmp/vb-login-smoke.json").read()[:500])
PY

echo "Done. If login_http=200, refresh https://id.vbdigital.tech and sign in again."
