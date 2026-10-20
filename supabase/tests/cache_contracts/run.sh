#!/usr/bin/env bash
# Corre os cenários num PostgreSQL local descartável. Nunca toca no Cloud.
set -euo pipefail
D=/tmp/cachepg; S=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$S/../../.." && pwd)
rm -rf $D; mkdir -p $D; chown 1000 $D
R="setpriv --reuid=1000 --regid=1000 --clear-groups"
$R initdb -D $D/data -A trust -U postgres >/dev/null
$R pg_ctl -D $D/data -o "-k $D -p 55441 -c listen_addresses=''" -l $D/log -w start >/dev/null
trap '$R pg_ctl -D $D/data -m immediate stop >/dev/null' EXIT
P="env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE psql -X -q -h $D -p 55441 -U postgres -d postgres -v ON_ERROR_STOP=1"
$P -f $S/stub.sql >/dev/null
$P -1 -f $ROOT/drizzle/migrations/0214_cache_payment_contracts.sql >/dev/null
$P -1 -f $ROOT/drizzle/migrations/0215_cache_payment_contracts_acl.sql >/dev/null
$P -1 -f ${M0216:-$(ls $ROOT/drizzle/migrations/0216_*.sql)} >/dev/null
$P -f $S/scenarios.sql 2>&1
