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
