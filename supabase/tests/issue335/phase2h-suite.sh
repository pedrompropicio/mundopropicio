#!/usr/bin/env bash
# #335 fase 2h — suite sobre o harness fiel. Uso: phase2h-suite.sh <socket-dir> <port>. LOCAL ONLY.
set -uo pipefail
S=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$S/../../.." && pwd); D=$1; PORT=$2
OUT=${ISSUE335_OUT:-/tmp/issue335-phase2h}; T=$OUT/adapted; mkdir -p "$T"
A=(env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE psql -X -q -h "$D" -p "$PORT" -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -v VERBOSITY=verbose)
P=(env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE psql -X -q -h "$D" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1)
python3 "$S/phase2i-reference-data.py" "$ROOT/supabase/migrations" "$OUT/refdata.sql" "$OUT/refdata.json"
"${A[@]}" -v ON_ERROR_STOP=0 -f "$OUT/refdata.sql" > "$OUT/refdata.out" 2>&1; echo "refdata errors: $(grep -c ERROR "$OUT/refdata.out")"
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
# 2i: restantes conjuntos, mesma base e ordem do runner original.
run_sql() { local n=$1 f=$2; python3 "$S/phase2h-adapt.py" "$f" "$T/$n.sql" >> "$OUT/adapt.log"
  if "${A[@]}" -v root="$ROOT" -f "$T/$n.sql" > "$OUT/$n.out" 2>&1; then echo "PASS $n ($(grep -c 'PASS' "$OUT/$n.out") marcadores PASS)" | tee -a "$res"
  else echo "FAIL $n: $(grep -m1 ERROR "$OUT/$n.out")" | tee -a "$res"; fi; }
if "${P[@]}" -f "$ROOT/supabase/manual/20261021_issue335_offset_kill_switch.INERTE.sql" >"$OUT/ks.out" 2>&1 && \
   "${A[@]}" -c "DO \$\$ BEGIN IF (SELECT enabled FROM transaction_offset_control) OR NOT (SELECT reverse_enabled FROM transaction_offset_control) OR NOT has_function_privilege('authenticated','transaction_offset_reverse(uuid,uuid,text)','EXECUTE') OR NOT has_table_privilege('authenticated','issue335_commands','INSERT') THEN RAISE EXCEPTION 'kill_switch_failed'; END IF; END \$\$;" >>"$OUT/ks.out" 2>&1 && \
   "${P[@]}" -f "$ROOT/supabase/manual/20261021_issue335_offset_kill_switch.ROLLBACK-INERTE.sql" >>"$OUT/ks.out" 2>&1
then echo "PASS kill-switch (level 1, reverse available, ACL unchanged + rollback)" | tee -a "$res"; else echo "FAIL kill-switch: $(grep -m1 ERROR "$OUT/ks.out")" | tee -a "$res"; fi
run_sql phase2c-invariant-matrix "$S/phase2c-invariant-matrix.sql"
if python3 "$S/phase2f-concurrency.py" "$D" "$PORT" "$ROOT" > "$OUT/concurrency.out" 2>&1; then echo "PASS phase2f-concurrency ($(grep -c PASS "$OUT/concurrency.out") marcadores)" | tee -a "$res"; else echo "FAIL phase2f-concurrency: $(tail -1 "$OUT/concurrency.out")" | tee -a "$res"; fi
run_sql phase2g-approval "$S/phase2g-approval.sql"
# 2j: paridade do matching (gerado pelo helper JS canónico) e matrizes E/A/camarim/selo/janela/restauro.
if (cd "$ROOT" && bun "$S/matching-parity.ts") > "$OUT/parity.raw.sql" 2>"$OUT/parity.gen.err"; then run_sql matching-parity "$OUT/parity.raw.sql"; else echo "FAIL matching-parity: gerador $(tail -1 "$OUT/parity.gen.err")" | tee -a "$res"; fi
run_sql phase2j "$S/phase2j.sql"
if python3 "$S/phase2j-concurrency.py" "$D" "$PORT" "$ROOT" > "$OUT/concurrency2j.out" 2>&1; then echo "PASS phase2j-concurrency ($(grep -c PASS "$OUT/concurrency2j.out") marcadores)" | tee -a "$res"; else echo "FAIL phase2j-concurrency (rc=$?): $(grep -E 'ACHADO|Error|assert' "$OUT/concurrency2j.out" | tail -1)" | tee -a "$res"; fi
if "${P[@]}" -v root="$ROOT" -f "$S/phase2l.sql" > "$OUT/phase2l.out" 2>&1; then echo "PASS phase2l ($(grep -c 'NOTICE:.*PASS' "$OUT/phase2l.out") marcadores)" | tee -a "$res"; else echo "FAIL phase2l: $(grep -m1 ERROR "$OUT/phase2l.out")" | tee -a "$res"; fi
if grep -q '^FAIL' "$res"; then exit 1; fi
