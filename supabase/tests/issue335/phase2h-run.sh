#!/usr/bin/env bash
# #335 fase 2h — harness FIEL gerado do catálogo de Live, PostgreSQL 17.6 local. LOCAL ONLY.
# 1) instala live/phase2h-catalog-ddl.json (gerado por live/phase2h-extract.py, só SELECT a pg_catalog)
# 2) captura live/phase2h-capture.sql no harness e compara com a captura de Live
# 3) corre os testes do #335 por cima (ver phase2h-suite.sh)
set -euo pipefail
S=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$S/../../.." && pwd)
export PGSSLMODE=disable
export PATH="${ISSUE335_PG_BIN:?Set an exact local PostgreSQL 17.6 bin directory}:$PATH"
[[ "$(postgres --version)" = 'postgres (PostgreSQL) 17.6' ]] || { echo 'exact PostgreSQL 17.6 required'; exit 1; }
OUT=${ISSUE335_OUT:-/tmp/issue335-phase2h}; mkdir -p "$OUT"
D=$(mktemp -d /tmp/issue335phase2h.XXXXXX); chown 1000 "$D"
R=(setpriv --reuid=1000 --regid=1000 --clear-groups)
"${R[@]}" initdb -D "$D/data" -A trust -U supabase_admin --encoding=UTF8 --locale=C.UTF-8 >/dev/null
"${R[@]}" pg_ctl -D "$D/data" -o "-k $D -p 55446 -c listen_addresses='' -c max_locks_per_transaction=1024" -l "$D/log" -w start >/dev/null
[[ -n "${ISSUE335_KEEP:-}" ]] && echo "$D" > "$OUT/socket" || trap '"${R[@]}" pg_ctl -D "$D/data" -m immediate stop >/dev/null; rm -rf "$D"' EXIT
A=(env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE psql -X -q -h "$D" -p 55446 -U supabase_admin -d postgres -v ON_ERROR_STOP=1)
# Bootstrap de administrador (documentado): papel postgres e dono da base; o resto vem do catálogo.
"${A[@]}" -c "CREATE ROLE postgres LOGIN NOSUPERUSER CREATEROLE BYPASSRLS; ALTER DATABASE postgres OWNER TO postgres;"
python3 "$S/phase2h-install.py" "$D" 55446 "$S/live/phase2h-catalog-ddl.json" "$OUT/install-report.json"
"${A[@]}" -At -f "$S/live/phase2h-capture.sql" > "$OUT/local-capture.json"
python3 "$S/phase2h-diff.py" "$S/live/phase2h-live-capture.json" "$OUT/local-capture.json" "$OUT/differential.json"
if [[ -n "${ISSUE335_SUITE:-}" ]]; then bash "$S/phase2h-suite.sh" "$D" 55446; fi
