#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"
OUT="${1:-/tmp/issue332}"
mkdir -p "$OUT"
unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE DATABASE_URL SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
TMP=$(mktemp -d /tmp/coala-audience-pg.XXXXXX)
mkdir -p "$TMP/socket"
AS=(); if [ "$(id -u)" = 0 ]; then AS=(setpriv --reuid=1000 --regid=1000 --clear-groups); chown -R 1000:1000 "$TMP"; fi
trap '"${AS[@]}" pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
"${AS[@]}" initdb -D "$TMP/data" -U postgres -A trust --no-sync >/dev/null
"${AS[@]}" pg_ctl -D "$TMP/data" -l "$TMP/pg.log" -w -o "-c listen_addresses='' -c unix_socket_directories='$TMP/socket' -p 54329" start >/dev/null
P=(psql -X -v ON_ERROR_STOP=1 -h "$TMP/socket" -p 54329 -U postgres -d postgres)
"${P[@]}" -f "$ROOT/scripts/coala-meta-audience/schema-test.sql" > "$OUT/sql-test.log" 2>&1
"${P[@]}" -f "$ROOT/docs/testes/coala-meta-eb27/legacy-collector.sql" >> "$OUT/sql-test.log" 2>&1
"${P[@]}" -f "$ROOT/scripts/coala-meta-audience/legacy-snapshot.sql" >> "$OUT/sql-test.log" 2>&1
"${P[@]}" -f "$ROOT/supabase/manual/20261017_coala_meta_eb27.sql" >> "$OUT/sql-test.log" 2>&1
"${P[@]}" -f "$ROOT/scripts/coala-meta-audience/assertions.sql" >> "$OUT/sql-test.log" 2>&1
"${P[@]}" -f "$ROOT/scripts/newgang-meta-audience/collector.sql" >> "$OUT/sql-test.log" 2>&1
"${P[@]}" -f "$ROOT/scripts/coala-meta-audience/assertions.sql" >> "$OUT/sql-test.log" 2>&1
"${P[@]}" -f "$ROOT/scripts/newgang-meta-audience/assertions.sql" >> "$OUT/sql-test.log" 2>&1
tail -6 "$OUT/sql-test.log"
echo 'SQL assertions passed; PostgreSQL local socket only, no external delivery'
