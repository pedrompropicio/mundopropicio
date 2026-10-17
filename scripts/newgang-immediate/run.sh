#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"; OUT="${1:-/tmp/issue332-immediate}"; mkdir -p "$OUT"
python3 - "$ROOT" "$OUT" <<'PY'
from pathlib import Path
import sys
root,out=map(Path,sys.argv[1:])
s=(root/'scripts/club-profile-it/run.sh').read_text()
s=s[:s.index('# Simulate hosted PG17')]
s=s.replace('HERE="$(cd "$(dirname "$0")" && pwd)"',f'HERE="{root}/scripts/club-profile-it"')
s=s.replace('ROOT="$(cd "$HERE/../.." && pwd)"',f'ROOT="{root}"')
s+='''
"${PSQL[@]}" -f "$ROOT/scripts/newgang-immediate/scenario.sql" >>"$LOG" 2>&1
bash "$ROOT/scripts/newgang-immediate/concurrency.sh" "${PSQL[*]}" "$OUT" >>"$LOG" 2>&1
say "RESULTADO #332 imediato: OK (SQL local, sem rede)"
'''
(out/'runner.sh').write_text(s)
PY
bash "$OUT/runner.sh" "$OUT"