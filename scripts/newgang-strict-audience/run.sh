#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"; OUT="${1:-/tmp/issue332-list}"; mkdir -p "$OUT"
python3 - "$ROOT" "$OUT" <<'PY'
from pathlib import Path
import sys
root,out=map(Path,sys.argv[1:]);s=(root/'scripts/newgang-person-consent/run.sh').read_text()
# Patch generated base runner before its truncation.
s=s.replace("for name in ['scenario.sql'", "s=s.replace('CREATE DATABASE clubit',\"CREATE DATABASE clubit ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8' TEMPLATE template0\")\nfor name in ['scenario.sql'")
s=s.replace('$ROOT/scripts/newgang-person-consent/consent.sql','$ROOT/drizzle/migrations/0182_issue332_member_consent.sql')
needle='bash "$ROOT/scripts/newgang-person-consent/concurrency.sh" "${{PSQL[*]}}" "$OUT" >>"$LOG" 2>&1'
extra='''
"${{PSQL[@]}}" -f "$ROOT/scripts/newgang-whatsapp/local-vault-stub.sql" >>"$LOG" 2>&1
"${{PSQL[@]}}" -f "$ROOT/drizzle/migrations/0185_issue332_whatsapp_consent.sql" >>"$LOG" 2>&1
"${{PSQL[@]}}" -f "$ROOT/scripts/newgang-strict-audience/setup.sql" >>"$LOG" 2>&1
"${{PSQL[@]}}" -f "$ROOT/supabase/manual/20261017_issue332_list.PENDENTE.sql" >>"$LOG" 2>&1
"${{PSQL[@]}}" -f "$ROOT/scripts/newgang-strict-audience/scenario.sql" >>"$LOG" 2>&1
bash "$ROOT/scripts/newgang-strict-audience/concurrency.sh" "${{PSQL[*]}}" "$OUT" >>"$LOG" 2>&1
"${{PSQL[@]}}" -f "$ROOT/scripts/newgang-strict-audience/legacy.sql" >>"$LOG" 2>&1
"${{PSQL[@]}}" -tAc "SELECT json_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY n) FROM t.results WHERE phase='332list'" > "$OUT/results-list.json"
say "LIST: $("${{PSQL[@]}}" -tAc "SELECT count(*) FILTER(WHERE ok)||'/'||count(*) FROM t.results WHERE phase='332list'")"
'''
assert needle in s;s=s.replace(needle,needle+extra);(out/'runner-list.sh').write_text(s)
PY
bash "$OUT/runner-list.sh" "$OUT"
