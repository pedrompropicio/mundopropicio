#!/usr/bin/env bash
# Never use Cloud, PG env credentials or a network database. Local disposable Unix socket only.
set -euo pipefail
S=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$S/../../.." && pwd)
D=$(mktemp -d /tmp/issue335pg.XXXXXX); chown 1000 "$D"
R=(setpriv --reuid=1000 --regid=1000 --clear-groups)
"${R[@]}" initdb -D "$D/data" -A trust -U supabase_admin --encoding=UTF8 --locale=C >/dev/null
"${R[@]}" pg_ctl -D "$D/data" -o "-k $D -p 55443 -c listen_addresses='' -c deadlock_timeout=200ms -c log_lock_waits=on" -l "$D/log" -w start >/dev/null
trap '"${R[@]}" pg_ctl -D "$D/data" -m immediate stop >/dev/null; rm -rf "$D"' EXIT
P=(env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE psql -X -q -h "$D" -p 55443 -U postgres -d postgres -v ON_ERROR_STOP=1)
ADMIN=(env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE psql -X -q -h "$D" -p 55443 -U supabase_admin -d postgres -v ON_ERROR_STOP=1)
C=(env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE psql -X -q -h "$D" -p 55443 -U postgres -d postgres)
SUB="SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);"
baseline() {
 "${ADMIN[@]}" -c "CREATE ROLE postgres LOGIN SUPERUSER; ALTER DATABASE postgres OWNER TO postgres;" >/dev/null
 "${P[@]}" -f "$S/stub.sql" >/dev/null
 "${P[@]}" -f "$S/live/dependencies.sql" >/dev/null
 "${P[@]}" -f "$S/live/functions.sql" >/dev/null
 "${P[@]}" -f "$S/live/triggers.sql" >/dev/null
 "${P[@]}" -f "$S/live/phase2c-auth.sql" >/dev/null
 "${P[@]}" -f "$S/live/phase2c-invariant-registry.sql" >/dev/null
 "${P[@]}" -f "$S/live/phase2d-legacy.sql" >/dev/null
 "${ADMIN[@]}" -f "$S/live/phase2d-role.sql" >/dev/null
}
catalog() { "${P[@]}" -At -c "SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_object('f',p.oid::regprocedure::text,'d',md5(pg_get_functiondef(p.oid)),'o',pg_get_userbyid(p.proowner),'a',p.proacl::text,'s',p.prosecdef,'c',p.proconfig) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','auth') AND p.prokind='f'),
 'relations',(SELECT jsonb_agg(jsonb_build_object('r',c.relname,'k',c.relkind,'o',pg_get_userbyid(c.relowner),'a',c.relacl::text,'rls',c.relrowsecurity) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','v','i')),
 'columns',(SELECT jsonb_agg(jsonb_build_object('t',c.relname,'c',a.attname,'y',format_type(a.atttypid,a.atttypmod),'n',a.attnotnull,'a',a.attacl::text) ORDER BY c.relname,a.attname) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname) FROM pg_policies p WHERE schemaname='public'),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('t',tgrelid::regclass::text,'n',tgname,'d',pg_get_triggerdef(oid),'e',tgenabled) ORDER BY tgrelid::regclass::text,tgname) FROM pg_trigger WHERE NOT tgisinternal),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('t',conrelid::regclass::text,'n',conname,'d',pg_get_constraintdef(oid)) ORDER BY conrelid::regclass::text,conname) FROM pg_constraint WHERE connamespace='public'::regnamespace),
 'schemas',(SELECT jsonb_agg(jsonb_build_object('n',nspname,'o',pg_get_userbyid(nspowner),'a',nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname IN('public','auth')),
 'default_acl',(SELECT jsonb_agg(jsonb_build_object('r',pg_get_userbyid(defaclrole),'n',defaclnamespace::regnamespace::text,'t',defaclobjtype,'a',defaclacl::text) ORDER BY defaclrole,defaclnamespace,defaclobjtype) FROM pg_default_acl),
 'role_attrs',(SELECT jsonb_agg(jsonb_build_object('r',rolname,'super',rolsuper,'create',rolcreaterole,'bypass',rolbypassrls,'inherit',rolinherit) ORDER BY rolname) FROM pg_roles WHERE rolname NOT LIKE 'pg\_%'),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('r',pg_get_userbyid(roleid),'m',pg_get_userbyid(member),'g',pg_get_userbyid(grantor),'a',admin_option,'i',inherit_option,'s',set_option) ORDER BY roleid,member) FROM pg_auth_members),
 'roles',(SELECT jsonb_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname NOT LIKE 'pg\_%'))"; }

# 1) Parity: real auth bodies/owners/ACL/policies/constraints, then differential report.
baseline
"${P[@]}" -c "$SUB" >/dev/null
python3 "$S/catalog-diff.py" "${P[@]}"
PRE=$(catalog)

# Full scenarios on top of the real installed auth model.
"${P[@]}" -c "DO \$\$ BEGIN IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'deployment_is_superuser'; END IF; END \$\$;"
for f in storage core invariants; do "${P[@]}" -f "$(ls "$ROOT/supabase/manual/20261021_issue335_offset_"*"$f.INERTE.sql")" >/dev/null; if [ "$f" = storage ]; then "${P[@]}" -f "$S/storage-only.sql"; fi; done
"${ADMIN[@]}" -f "$S/scenarios.sql"
"${ADMIN[@]}" -f "$S/phase2d.sql"
"${ADMIN[@]}" -f "$S/phase2b.sql"
"${ADMIN[@]}" -f "$S/phase2c.sql"
(cd "$ROOT" && bun "$S/matching-parity.ts") >"$D/parity.sql"
"${ADMIN[@]}" -f "$D/parity.sql"

# 3) Concurrency. Every scenario has three real sessions and bounded waits.
seed() { "${P[@]}" -c "$SUB $1" >/dev/null; }
hold() { "${C[@]}" -c "BEGIN; $SUB SET ROLE authenticated; $1; SELECT pg_sleep(2); COMMIT;" >"$D/$2" 2>&1; }
session() { "${C[@]}" -c "BEGIN; $SUB SET ROLE authenticated; $1; COMMIT;" >"$D/$2" 2>&1 || true; }
seed "INSERT INTO transactions(id,type,description,amount,iva_rate,date,supplier_id,account_id) VALUES
 ('00000000-0000-0000-0000-000000000801','income','Race A+',30996,0,'2026-10-13','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000030'),
 ('00000000-0000-0000-0000-000000000802','expense','Race A-',7590,0,'2026-10-13','00000000-0000-0000-0000-000000000020',NULL),
 ('00000000-0000-0000-0000-000000000803','expense','Race B-',1000,0,'2026-10-13','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000030');
 INSERT INTO transaction_payments(id,transaction_id,amount,payment_date,account_id,payment_method) VALUES('00000000-0000-0000-0000-000000000851','00000000-0000-0000-0000-000000000803',1000,'2026-10-13','00000000-0000-0000-0000-000000000030','transfer');"
EXEC_A="SELECT transaction_offset_execute('00000000-0000-0000-0000-000000000881','00000000-0000-0000-0000-000000000020','[{\"transaction_id\":\"00000000-0000-0000-0000-000000000801\",\"mode\":\"settle\"},{\"transaction_id\":\"00000000-0000-0000-0000-000000000802\",\"mode\":\"offset\"}]','{\"account_id\":\"00000000-0000-0000-0000-000000000030\",\"date\":\"2026-10-13\",\"amount\":23406}','2026-10-13')"
# A: encontro x estorno de outro pagamento do mesmo fornecedor x pagamento normal no documento do encontro.
hold "INSERT INTO transaction_payments(transaction_id,amount,payment_date,account_id) VALUES('00000000-0000-0000-0000-000000000801',1,'2026-10-13','00000000-0000-0000-0000-000000000030')" a_pay & H=$!
sleep 0.5
session "$EXEC_A" a_exec & E=$!
session "SELECT reverse_payment('00000000-0000-0000-0000-000000000851','cash_refund','race local')" a_rev & V=$!
wait "$H"; wait "$E"; wait "$V"
grep -q encontro_em_conflito "$D/a_exec"
"${P[@]}" -c "DO \$\$ BEGIN IF EXISTS(SELECT 1 FROM transaction_offset_groups WHERE request_id='00000000-0000-0000-0000-000000000881') OR EXISTS(SELECT 1 FROM transaction_payments WHERE transaction_id='00000000-0000-0000-0000-000000000802') THEN RAISE EXCEPTION 'partial write after conflict'; END IF; IF (SELECT status FROM transaction_payments WHERE id='00000000-0000-0000-0000-000000000851')<>'reversed' THEN RAISE EXCEPTION 'independent reversal blocked'; END IF; RAISE NOTICE 'PASS race encounter x reversal x normal payment: clear conflict, no partial writes'; END \$\$;"
# B: encontro x encontro (different requests, same entity/documents): one result, one clean refusal.
seed "UPDATE transaction_payments SET status='reversed',reversed_at=now() WHERE transaction_id='00000000-0000-0000-0000-000000000801' AND offset_group_id IS NULL;"
session "SELECT pg_advisory_lock(9335); SELECT pg_advisory_unlock(9335); $EXEC_A" b1 & B1=$!
session "SELECT pg_advisory_lock(9335); SELECT pg_advisory_unlock(9335); ${EXEC_A/000000000881/000000000882}" b2 & B2=$!
"${C[@]}" -c "SELECT pg_advisory_lock(9335); SELECT pg_sleep(0.3); SELECT pg_advisory_unlock(9335);" >/dev/null & B3=$!
wait "$B1"; wait "$B2"; wait "$B3"
"${P[@]}" -c "DO \$\$ BEGIN IF (SELECT count(*) FROM transaction_offset_groups WHERE request_id IN('00000000-0000-0000-0000-000000000881','00000000-0000-0000-0000-000000000882') AND status='applied')<>1 OR (SELECT count(*) FROM transaction_payments WHERE offset_group_id IS NOT NULL AND transaction_id IN('00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-000000000802') AND status='paid')<>3 THEN RAISE EXCEPTION 'concurrent encounters duplicated'; END IF; RAISE NOTICE 'PASS race encounter x encounter: one applied group, three legs'; END \$\$;"
cat "$D/b1" "$D/b2" | grep -Eq 'encontro_em_conflito|invalid_document|no_open_debt|paid_ledger_divergent'
# C: encontro x alteração de linha BP: BP edit holds lock; encounter refuses cleanly; then succeeds.
seed "INSERT INTO events(id,company_id,name) VALUES('00000000-0000-0000-0000-000000000860',current_company_id(),'Race BP'); INSERT INTO event_forecasts(id,company_id,event_id,type,description,amount,iva_rate,approved_at) VALUES('00000000-0000-0000-0000-000000000861',current_company_id(),'00000000-0000-0000-0000-000000000860','income','Race BP',100,0,now()); INSERT INTO transactions(id,type,description,amount,iva_rate,date,supplier_id) VALUES('00000000-0000-0000-0000-000000000862','expense','Race BP-',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020');"
EXEC_C="SELECT transaction_offset_execute('00000000-0000-0000-0000-000000000883','00000000-0000-0000-0000-000000000020','[{\"forecast_id\":\"00000000-0000-0000-0000-000000000861\",\"mode\":\"settle\"},{\"transaction_id\":\"00000000-0000-0000-0000-000000000862\",\"mode\":\"offset\"}]','{\"account_id\":\"00000000-0000-0000-0000-000000000030\",\"date\":\"2026-10-13\",\"amount\":60}','2026-10-13')"
hold "UPDATE event_forecasts SET description='Race BP edit' WHERE id='00000000-0000-0000-0000-000000000861'" c_bp & H=$!
sleep 0.5
session "$EXEC_C" c_exec & E=$!
session "SELECT count(*) FROM transactions WHERE supplier_id='00000000-0000-0000-0000-000000000020'" c_read & V=$!
wait "$H"; wait "$E"; wait "$V"
grep -q encontro_em_conflito "$D/c_exec"
"${P[@]}" -c "DO \$\$ BEGIN IF EXISTS(SELECT 1 FROM transactions WHERE forecast_id='00000000-0000-0000-0000-000000000861') THEN RAISE EXCEPTION 'BP conflict partial'; END IF; END \$\$;"
session "$EXEC_C" c_retry
"${P[@]}" -c "DO \$\$ BEGIN IF (SELECT count(*) FROM transactions WHERE forecast_id='00000000-0000-0000-0000-000000000861')<>1 THEN RAISE EXCEPTION 'BP retry failed'; END IF; IF EXISTS(SELECT 1 FROM issue335_invariant_counts() WHERE current_count<>0) THEN RAISE EXCEPTION 'race invariants'; END IF; RAISE NOTICE 'PASS race encounter x BP edit: clear conflict, retry atomic, invariants zero'; END \$\$;"
if grep -q 'deadlock detected' "$D/log"; then echo 'ERROR deadlock detected'; exit 1; fi
echo 'PASS concurrency: no deadlock in server log; waits bounded by NOWAIT/lock_timeout'

# Explicit FK KEY SHARE compatibility: three sessions; normal insert holds supplier FK.
seed "INSERT INTO transactions(id,type,description,amount,iva_rate,date,supplier_id) VALUES('00000000-0000-0000-0000-000000000891','income','FK+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020'),('00000000-0000-0000-0000-000000000892','expense','FK-',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020');"
hold "INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id,account_id) VALUES('income','FK normal insert',1,0,'2026-10-13','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000030')" fk_insert & H=$!
sleep 0.5
session "SELECT transaction_offset_execute('00000000-0000-0000-0000-000000000893','00000000-0000-0000-0000-000000000020','[{\"transaction_id\":\"00000000-0000-0000-0000-000000000891\",\"mode\":\"settle\"},{\"transaction_id\":\"00000000-0000-0000-0000-000000000892\",\"mode\":\"offset\"}]','{\"account_id\":\"00000000-0000-0000-0000-000000000030\",\"date\":\"2026-10-13\",\"amount\":60}','2026-10-13')" fk_execute & E=$!
session "SELECT count(*) FROM transactions" fk_read & V=$!
wait "$H"; wait "$E"; wait "$V"
"${P[@]}" -c "DO \$\$ BEGIN IF NOT EXISTS(SELECT 1 FROM transaction_offset_groups WHERE request_id='00000000-0000-0000-0000-000000000893' AND status='applied') THEN RAISE EXCEPTION 'FK insert blocks encounter'; END IF; RAISE NOTICE 'PASS 6: three sessions encounter x ordinary FK insert x read, NO KEY UPDATE compatible with KEY SHARE'; END \$\$;"
if grep -q 'deadlock detected' "$D/log"; then echo 'ERROR FK deadlock'; exit 1; fi

# Same-request duplicate click (phase 2b proof retained).
seed "INSERT INTO transactions(id,company_id,type,description,amount,iva_rate,date,supplier_id) VALUES
('00000000-0000-0000-0000-000000000701',current_company_id(),'income','Race+',30996,0,'2026-10-13','00000000-0000-0000-0000-000000000020'),
('00000000-0000-0000-0000-000000000702',current_company_id(),'expense','Race-',7590,0,'2026-10-13','00000000-0000-0000-0000-000000000020');"
"${C[@]}" -f "$S/concurrency.sql" >"$D/race1" 2>&1 & A=$!
"${C[@]}" -f "$S/concurrency.sql" >"$D/race2" 2>&1 & B=$!
wait "$A" || true; wait "$B" || true
"${P[@]}" -c "DO \$\$ BEGIN IF (SELECT count(*) FROM transaction_offset_groups WHERE request_id='00000000-0000-0000-0000-000000000777')<>1 OR (SELECT count(*) FROM transaction_payments WHERE transaction_id IN('00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000702'))<>3 THEN RAISE EXCEPTION 'race duplicated'; END IF; RAISE NOTICE 'PASS two concurrent sessions, one group and three legs'; END \$\$;"

# Technical rollback refuses existing history, rather than silently restoring unilateral writers.
for f in invariants core group_storage; do
 if "${P[@]}" -f "$ROOT/supabase/manual/20261021_issue335_offset_$f.ROLLBACK-INERTE.sql" >"$D/rollback" 2>&1; then echo "ERROR $f rollback accepted retained groups"; exit 1; fi
 grep -q groups_exist_keep_guards "$D/rollback"
done
echo 'PASS all rollbacks refuse retained groups'

# 5) Fresh cluster: invariant matrix before/during/after; zero-history rollback restores catalog exactly.
"${R[@]}" pg_ctl -D "$D/data" -m fast stop >/dev/null; rm -rf "$D/data" "$D/log"
"${R[@]}" initdb -D "$D/data" -A trust -U supabase_admin --encoding=UTF8 --locale=C >/dev/null
"${R[@]}" pg_ctl -D "$D/data" -o "-k $D -p 55443 -c listen_addresses=''" -l "$D/log" -w start >/dev/null
baseline
INV="SELECT jsonb_agg(jsonb_build_object('n',name,'c',current_count,'r',reference_count,'ok',conforme) ORDER BY name) FROM (SELECT * FROM _run_invariant_checks_extra() UNION ALL SELECT * FROM _run_invariant_checks_paid() UNION ALL SELECT * FROM _run_invariant_checks_paid_below_gross()) x"
BEFORE=$("${P[@]}" -At -c "$INV")
PRE=$(catalog)
"${P[@]}" -c "DO \$\$ BEGIN IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'deployment_is_superuser'; END IF; END \$\$;"
for f in storage core invariants; do "${P[@]}" -f "$(ls "$ROOT/supabase/manual/20261021_issue335_offset_"*"$f.INERTE.sql")" >/dev/null; if [ "$f" = storage ]; then "${P[@]}" -f "$S/storage-only.sql"; fi; done
"${ADMIN[@]}" -f "$S/phase2c-invariant-matrix.sql"
for f in core group_storage; do
 if "${P[@]}" -f "$ROOT/supabase/manual/20261021_issue335_offset_$f.ROLLBACK-INERTE.sql" >"$D/wrong-order" 2>&1; then echo "ERROR wrong rollback order accepted $f"; exit 1; fi
 grep -q rollback_order "$D/wrong-order"
done
echo 'PASS 11: rollback wrong order refused without groups; correct order invariants -> core -> storage follows'
for f in invariants core group_storage; do "${P[@]}" -f "$ROOT/supabase/manual/20261021_issue335_offset_$f.ROLLBACK-INERTE.sql" >/dev/null; done
POST=$(catalog)
AFTER=$("${P[@]}" -At -c "$INV")
python3 - "$PRE" "$POST" <<'PY'
import json,sys
a,b=(json.loads(x) for x in sys.argv[1:3])
diff=[k for k in a if a[k]!=b[k]]
if diff:
  for k in diff:
    x={json.dumps(i,sort_keys=True) for i in a[k] or []}; y={json.dumps(i,sort_keys=True) for i in b[k] or []}
    print(k,"only-before",sorted(json.loads(i).get("f") or json.loads(i).get("n") or i for i in x-y),"only-after",sorted(json.loads(i).get("f") or json.loads(i).get("n") or i for i in y-x))
  raise SystemExit('catalog diff not empty')
print('PASS zero-history rollback: catalog diff empty for functions/ACL/owners, relations, columns, policies, triggers, constraints and roles')
PY
[ "$BEFORE" = "$AFTER" ] || { echo "ERROR invariant baseline changed"; exit 1; }
echo 'PASS invariant matrix identical before/after apply-revert-rollback'
