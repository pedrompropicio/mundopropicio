#!/usr/bin/env bash
# #335 fase 2h — suite sobre o harness fiel. Uso: phase2h-suite.sh <socket-dir> <port>. LOCAL ONLY.
set -uo pipefail
S=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$S/../../.." && pwd); D=$1; PORT=$2
OUT=${ISSUE335_OUT:-/tmp/issue335-phase2h}; T=$OUT/adapted; mkdir -p "$T"
A=(env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE psql -X -q -h "$D" -p "$PORT" -U supabase_admin -d postgres -v ON_ERROR_STOP=1)
P=(env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE psql -X -q -h "$D" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1)
"${A[@]}" -f "$S/phase2h-fixtures.sql" >/dev/null || { echo 'FIXTURES FAIL'; exit 1; }
"${P[@]}" -c "DO \$\$ BEGIN IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'superuser deploy'; END IF; END \$\$;"
for f in group_storage core invariants balance; do "${P[@]}" -f "$ROOT/supabase/manual/20261021_issue335_offset_$f.INERTE.sql" >/dev/null 2>"$OUT/install-$f.err" || { echo "INSTALL FAIL $f"; cat "$OUT/install-$f.err"; exit 1; }; done
echo 'INSTALL OK (postgres NOSUPERUSER): group_storage core invariants balance'
"${A[@]}" -f "$S/live/phase2e-balance-baseline.sql" >/dev/null   # cópias legadas só para comparação (schema issue335_test)
res=$OUT/suite-results.txt; : > "$res"
# Sequencial numa só base, como no runner original (cada fase usa o estado da anterior).
for f in scenarios phase2b phase2c phase2d phase2e phase2f-negative; do
  python3 "$S/phase2h-adapt.py" "$S/$f.sql" "$T/$f.sql" >> "$OUT/adapt.log"
  if "${A[@]}" -v root="$ROOT" -f "$T/$f.sql" > "$OUT/$f.out" 2>&1
  then echo "PASS $f ($(grep -c 'PASS' "$OUT/$f.out") marcadores PASS)" | tee -a "$res"
  else echo "FAIL $f: $(grep -m1 ERROR "$OUT/$f.out")" | tee -a "$res"; fi
done
