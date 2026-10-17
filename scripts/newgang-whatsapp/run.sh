#!/usr/bin/env bash
set -euo pipefail
# Reutiliza o runner person-consent (#332) e acrescenta a migração whatsapp + cenário + concorrência.
ROOT="$(pwd)"; OUT="${1:-/tmp/issue332-whatsapp}"; mkdir -p "$OUT"
python3 - "$ROOT" "$OUT" <<'PY'
from pathlib import Path
import sys
root,out=map(Path,sys.argv[1:])
s=(root/'scripts/newgang-person-consent/run.sh').read_text()
s=s.replace('OUT="${1:-/tmp/issue332-tests}"','OUT="'+out+'"')
s=s.replace('HERE="$(cd "$(dirname "$0")" && pwd)"','HERE="'+root+'/scripts/club-profile-it"')
needle='bash "$ROOT/scripts/newgang-person-consent/concurrency.sh" "${PSQL[*]}" "$OUT" >>"$LOG" 2>&1'
assert needle in s, 'needle nao encontrado'
extra='\n'.join([
 '"${PSQL[@]}" -f "$ROOT/supabase/manual/20261017_issue332_whatsapp.PENDENTE.sql" >>"$LOG" 2>&1',
 '"${PSQL[@]}" -f "$ROOT/scripts/newgang-whatsapp/scenario.sql" >>"$LOG" 2>&1',
 'bash "$ROOT/scripts/newgang-whatsapp/concurrency.sh" "${PSQL[*]}" "$OUT" >>"$LOG" 2>&1',
 'say "ASSERTS332W: $("${PSQL[@]}" -tAc "SELECT count(*) FILTER(WHERE ok)||\'/\'||count(*) FROM t.results WHERE phase=\'332w\'")"',
])
# o ficheiro person-consent/run.sh tem o needle com chavetas duplas (f-string); normalizar
s=s.replace('${{PSQL[*]}}','${PSQL[*]}')
s=s.replace(needle,needle+'\n'+extra)
(out/'runner.sh').write_text(s)
PY
bash "$OUT/runner.sh" "$OUT"
