#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"; OUT="${1:-/tmp/issue332-city}"; mkdir -p "$OUT" /tmp/issue330
python3 - "$ROOT" "$OUT" <<'PY'
from pathlib import Path
import sys
root,out=map(Path,sys.argv[1:]);s=(root/'scripts/club-profile-it/run.sh').read_text()
s=s.replace('ROOT="$(cd "$HERE/../.." && pwd)"',f'ROOT="{root}"')
s=s.replace('CREATE DATABASE clubit','CREATE DATABASE clubit ENCODING \'UTF8\' LOCALE_PROVIDER builtin BUILTIN_LOCALE \'C.UTF-8\' TEMPLATE template0')
for name in ['scenario.sql','concurrency.sh','after-rollback.sql']:s=s.replace(f'"$HERE/{name}"',f'"$ROOT/scripts/club-profile-it/{name}"')
needle='"${PSQL[@]}" -f "$ROOT/supabase/manual/20261016_issue330.ROLLBACK.sql"'
s=s[:s.index(needle)]+'''
"${PSQL[@]}" -c "ALTER TABLE lead_capture ADD COLUMN IF NOT EXISTS raw jsonb; ALTER TABLE lead_capture ADD COLUMN IF NOT EXISTS consent_email boolean; ALTER TABLE lead_capture ADD COLUMN IF NOT EXISTS name text; ALTER TABLE lead_capture ADD COLUMN IF NOT EXISTS utm_source text; ALTER TABLE lead_capture ADD COLUMN IF NOT EXISTS utm_medium text; ALTER TABLE lead_capture ADD COLUMN IF NOT EXISTS utm_campaign text; ALTER TABLE lead_capture ADD COLUMN IF NOT EXISTS consent_whatsapp boolean;" >>"$LOG" 2>&1
"${PSQL[@]}" -f "$ROOT/supabase/manual/20261017_issue332_city.PENDENTE.sql" >>"$LOG" 2>&1
"${PSQL[@]}" -c "CREATE FUNCTION _clube_newgang_assert_access() RETURNS void LANGUAGE sql AS \$$ SELECT \$$; CREATE FUNCTION _clube_newgang_birth(j jsonb) RETURNS date LANGUAGE sql AS \$$ SELECT (j->>'birth_date')::date \$$;" >>"$LOG" 2>&1
"${PSQL[@]}" -f "$ROOT/scripts/newgang-cities/scenario.sql" >>"$LOG" 2>&1
bash "$ROOT/scripts/newgang-cities/concurrency.sh" "${PSQL[*]}" "$OUT" >>"$LOG" 2>&1
"${PSQL[@]}" -f "$CANON/05_egress.sql" >>"$LOG" 2>&1
"${PSQL[@]}" -tAc "SELECT json_agg(json_build_object('name',name,'ok',ok) ORDER BY n) FROM t.results WHERE phase='332city'" > "$OUT/results-city.json"
say "CITY: $("${PSQL[@]}" -tAc "SELECT count(*) FILTER(WHERE ok)||'/'||count(*) FROM t.results WHERE phase='332city'")"
say "REGRESSION330: $("${PSQL[@]}" -tAc "SELECT count(*) FILTER(WHERE ok)||'/'||count(*) FROM t.results WHERE phase='330'")"
'''
(out/'runner.sh').write_text(s)
PY
bash "$OUT/runner.sh" "$OUT"
