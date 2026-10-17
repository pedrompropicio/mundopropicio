#!/usr/bin/env bash
set -euo pipefail
# Reuse the fully guarded #330 socket-only runner and real #327/#328 engine.
ROOT="$(pwd)"; OUT="${1:-/tmp/issue332-tests}"; mkdir -p "$OUT" /tmp/issue330
python3 - "$ROOT" "$OUT" <<'PY'
from pathlib import Path
import sys
root,out=map(Path,sys.argv[1:]);s=(root/'scripts/club-profile-it/run.sh').read_text()
s=s.replace('ROOT="$(cd "$HERE/../.." && pwd)"',f'ROOT="{root}"')
for name in ['scenario.sql','concurrency.sh','after-rollback.sql']:
 s=s.replace(f'"$HERE/{name}"',f'"$ROOT/scripts/club-profile-it/{name}"')
needle='"${PSQL[@]}" -f "$ROOT/supabase/manual/20261016_issue330.ROLLBACK.sql"'
s=s[:s.index(needle)]+f'''
"${{PSQL[@]}}" -f "$ROOT/scripts/newgang-person-consent/local-ledger.sql" >>"$LOG" 2>&1
"${{PSQL[@]}}" -f "{out}/effective.sql" >>"$LOG" 2>&1
"${{PSQL[@]}}" -f "$ROOT/scripts/newgang-person-consent/consent.sql" >>"$LOG" 2>&1
"${{PSQL[@]}}" -f "$ROOT/scripts/newgang-person-consent/scenario.sql" >>"$LOG" 2>&1
bash "$ROOT/scripts/newgang-person-consent/concurrency.sh" "${{PSQL[*]}}" "$OUT" >>"$LOG" 2>&1
"${{PSQL[@]}}" -f "{out}/egress.sql" >>"$LOG" 2>&1
"${{PSQL[@]}}" -tAc "SELECT json_agg(json_build_object('name',name,'ok',ok) ORDER BY n) FROM t.results WHERE phase='332'" > "$OUT/results.json"
say "ASSERTS332: $("${{PSQL[@]}}" -tAc "SELECT count(*) FILTER(WHERE ok)||'/'||count(*) FROM t.results WHERE phase='332'")"
say "REGRESSAO330: $("${{PSQL[@]}}" -tAc "SELECT count(*) FILTER(WHERE ok)||'/'||count(*) FROM t.results WHERE phase='330'")"
'''
(out/'runner.sh').write_text(s)
real=(root/'drizzle/migrations/0175_issue322_consent_fix_apply.sql').read_text()
a=real.index('CREATE FUNCTION public.marketing_consent_effective');b=real.index('CREATE OR REPLACE FUNCTION public.marketing_consent_receipt',a)
(out/'effective.sql').write_text(real[a:b])
egress=(root/'scripts/club-sql-it/05_egress.sql').read_text().replace("'vault','extensions','supabase_functions'","'vault','supabase_functions'")
# Our extensions schema contains SQL-only crypto boundary stubs, not installed extensions.
(out/'egress.sql').write_text(egress)
PY
bash "$OUT/runner.sh" "$OUT"