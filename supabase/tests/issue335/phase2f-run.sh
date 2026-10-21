#!/usr/bin/env bash
# Local-only separate runner; does not replace the unfinished legacy scheduler.
set -euo pipefail
S=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$S/../../.." && pwd)
export PGSSLMODE=disable
export PATH="${ISSUE335_PG_BIN:?Set an exact local PostgreSQL 17.6 bin directory}:$PATH"
[[ "$(postgres --version)" = 'postgres (PostgreSQL) 17.6' ]] || { echo 'exact PostgreSQL 17.6 required'; exit 1; }
D=$(mktemp -d /tmp/issue335phase2f.XXXXXX); chown 1000 "$D"
R=(setpriv --reuid=1000 --regid=1000 --clear-groups)
"${R[@]}" initdb -D "$D/data" -A trust -U supabase_admin --encoding=UTF8 --locale=C >/dev/null
"${R[@]}" pg_ctl -D "$D/data" -o "-k $D -p 55445 -c listen_addresses=''" -l "$D/log" -w start >/dev/null
trap '"${R[@]}" pg_ctl -D "$D/data" -m immediate stop >/dev/null; rm -rf "$D"' EXIT
A=(env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE psql -X -q -h "$D" -p 55445 -U supabase_admin -d postgres -v ON_ERROR_STOP=1)
P=(env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE psql -X -q -h "$D" -p 55445 -U postgres -d postgres -v ON_ERROR_STOP=1)
"${A[@]}" -c "CREATE ROLE postgres LOGIN SUPERUSER; ALTER DATABASE postgres OWNER TO postgres;"
for f in stub.sql live/dependencies.sql live/functions.sql live/triggers.sql live/phase2c-auth.sql live/phase2d-constraints.sql live/phase2c-invariant-registry.sql live/phase2d-legacy.sql live/phase2e-replay.sql; do "${P[@]}" -f "$S/$f" >/dev/null; done
"${A[@]}" -f "$S/live/phase2d-role.sql"
python3 "$S/phase2f-diff.py" "${P[@]}"
"${P[@]}" -c "DO \$\$ BEGIN IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'superuser deploy'; END IF; END \$\$;"
for f in group_storage core invariants balance; do "${P[@]}" -f "$ROOT/supabase/manual/20261021_issue335_offset_$f.INERTE.sql" >/dev/null; done
"${A[@]}" -f "$S/phase2f-negative.sql"
python3 "$S/phase2f-concurrency.py" "$D" 55445 "$ROOT"
echo 'PASS 2f separate runner PostgreSQL 17.6; complete phase2f acceptance NOT claimed'