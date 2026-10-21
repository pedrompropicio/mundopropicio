#!/usr/bin/env bash
# Never use Cloud, PG env credentials or a network database. Local disposable Unix socket only.
set -euo pipefail
S=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$S/../../.." && pwd)
D=$(mktemp -d /tmp/issue335pg.XXXXXX); chown 1000 "$D"
R=(setpriv --reuid=1000 --regid=1000 --clear-groups)
"${R[@]}" initdb -D "$D/data" -A trust -U postgres >/dev/null
"${R[@]}" pg_ctl -D "$D/data" -o "-k $D -p 55443 -c listen_addresses=''" -l "$D/log" -w start >/dev/null
trap '"${R[@]}" pg_ctl -D "$D/data" -m immediate stop >/dev/null; rm -rf "$D"' EXIT
P=(env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE psql -X -q -h "$D" -p 55443 -U postgres -d postgres -v ON_ERROR_STOP=1)
"${P[@]}" -f "$S/stub.sql" >/dev/null
for f in "$S"/*.LIVE-BASELINE.sql; do "${P[@]}" -f "$f" >/dev/null; done
"${P[@]}" -f "$S/triggers.sql" >/dev/null
for f in storage core invariants; do
 path=$(ls "$ROOT/supabase/manual/20261021_issue335_offset_"*"$f.INERTE.sql")
 "${P[@]}" -f "$path" >/dev/null
 done
"${P[@]}" -f "$S/scenarios.sql"

"${P[@]}" <<'SQL'
SELECT set_config('t.uid','00000000-0000-0000-0000-000000000010',false),set_config('t.company','00000000-0000-0000-0000-000000000001',false);
INSERT INTO transactions(id,type,description,amount,iva_rate,date,supplier_id) VALUES
('00000000-0000-0000-0000-000000000701','income','Race+',30996,0,'2026-10-13','00000000-0000-0000-0000-000000000020'),
('00000000-0000-0000-0000-000000000702','expense','Race-',7590,0,'2026-10-13','00000000-0000-0000-0000-000000000020');
SQL
"${P[@]}" -f "$S/concurrency.sql" >"$D/race1" 2>&1 & A=$!
"${P[@]}" -f "$S/concurrency.sql" >"$D/race2" 2>&1 & B=$!
wait "$A"; wait "$B"
"${P[@]}" <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM transaction_offset_groups WHERE request_id='00000000-0000-0000-0000-000000000777')<>1 OR
    (SELECT count(*) FROM transaction_payments WHERE transaction_id IN('00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000702'))<>3 THEN RAISE EXCEPTION 'race duplicated'; END IF;
 RAISE NOTICE 'PASS two concurrent sessions, one group and three legs';
END $$;
SQL

# Technical rollback refuses existing history, rather than silently restoring unilateral writers.
if "${P[@]}" -f "$ROOT/supabase/manual/20261021_issue335_offset_core.ROLLBACK-INERTE.sql" >"$D/rollback" 2>&1; then
 echo 'ERROR rollback accepted retained groups'; exit 1
fi
grep -q groups_exist_keep_guards "$D/rollback"
echo 'PASS rollback refuses retained groups'
