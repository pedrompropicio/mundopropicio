#!/usr/bin/env bash
# #335 correcção inerte — baseline E dedicado: catálogo fiel + refdata + fixtures, SEM candidatos #335. LOCAL ONLY.
# Uso: ISSUE335_PG_BIN=<pg17.6>/bin phase2o-baseline.sh <port>  → imprime o socket dir.
set -euo pipefail
S=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$S/../../.." && pwd); PORT=${1:-55447}
export PGSSLMODE=disable PATH="${ISSUE335_PG_BIN:?}:$PATH"
[[ "$(postgres --version)" = 'postgres (PostgreSQL) 17.6' ]] || { echo 'exact PostgreSQL 17.6 required' >&2; exit 1; }
OUT=${ISSUE335_OUT:-/tmp/issue335-baseline}; mkdir -p "$OUT"
D=$(mktemp -d /tmp/issue335base.XXXXXX); chown 1000 "$D"
R=(setpriv --reuid=1000 --regid=1000 --clear-groups)
"${R[@]}" initdb -D "$D/data" -A trust -U supabase_admin --encoding=UTF8 --locale=C.UTF-8 >/dev/null
"${R[@]}" pg_ctl -D "$D/data" -o "-k $D -p $PORT -c listen_addresses='' -c max_locks_per_transaction=1024" -l "$D/log" -w start >/dev/null
A=(env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE psql -X -q -h "$D" -p "$PORT" -U supabase_admin -d postgres -v ON_ERROR_STOP=1)
"${A[@]}" -c "CREATE ROLE postgres LOGIN NOSUPERUSER CREATEROLE BYPASSRLS; ALTER DATABASE postgres OWNER TO postgres;"
python3 "$S/phase2h-install.py" "$D" "$PORT" "$S/live/phase2h-catalog-ddl.json" "$OUT/install-report.json" >/dev/null
python3 "$S/phase2i-reference-data.py" "$ROOT/supabase/migrations" "$OUT/refdata.sql" "$OUT/refdata.json"
"${A[@]}" -v ON_ERROR_STOP=0 -f "$OUT/refdata.sql" > "$OUT/refdata.out" 2>&1
"${A[@]}" -f "$S/phase2h-fixtures.sql" >/dev/null
echo "$D"
