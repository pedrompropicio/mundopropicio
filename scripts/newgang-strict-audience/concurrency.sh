#!/usr/bin/env bash
set -euo pipefail
PSQL="$1"; OUT="$2"; pids=()
for i in {1..8}; do
 $PSQL -c "SELECT t.pref('{\"channel\":\"ads\",\"version\":\"anuncios-v1\",\"granted\":false,\"platforms\":[\"meta_ads\"],\"idempotency_key\":\"33200000-0000-4000-8000-000000000050\"}');" > "$OUT/list-race-$i.log" 2>&1 & pids+=("$!")
done
for p in "${pids[@]}"; do wait "$p"; done
$PSQL -c "SELECT t.listck('eight concurrent revokes append once',(SELECT count(*)=1 FROM club_member_marketing_consents WHERE request_key='33200000-0000-4000-8000-000000000050'));SELECT t.listck('concurrent revokes remove',(SELECT count(*)=0 FROM t.collect()));"
$PSQL -c "BEGIN; SELECT t.pref('{\"channel\":\"ads\",\"version\":\"anuncios-v1\",\"granted\":false,\"platforms\":[\"meta_ads\"],\"idempotency_key\":\"33200000-0000-4000-8000-000000000051\"}');SELECT pg_sleep(0.4);COMMIT;" > "$OUT/list-revoke-lock.log" 2>&1 & p=$!
for i in {1..30}; do
 n=$($PSQL -tAc "SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep'"); [ "$n" -ge 1 ] && break
done
$PSQL -c "SELECT t.reject332('{\"channel\":\"ads\",\"version\":\"anuncios-v1\",\"granted\":true,\"platforms\":[\"meta_ads\"],\"expected_dates\":{\"meta_ads\":null},\"idempotency_key\":\"33200000-0000-4000-8000-000000000052\"}','consent_revision_conflict');" > "$OUT/list-stale-lock.log" 2>&1
wait "$p"
$PSQL -c "SELECT t.listck('revoke beats stale waiting grant',NOT EXISTS(SELECT 1 FROM t.collect()));"
