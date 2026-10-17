#!/usr/bin/env bash
set -euo pipefail
PSQL="$1"; OUT="$2"; pids=()
# Same decision, eight real connections; precisely one append.
for i in {1..8}; do
 $PSQL -c "SELECT t.pref('{\"channel\":\"email\",\"version\":\"email-v3\",\"granted\":false,\"idempotency_key\":\"33333333-0000-4000-8000-000000000050\"}');" > "$OUT/race-$i.log" 2>&1 &
 pids+=("$!")
done
for p in "${pids[@]}"; do wait "$p"; done
$PSQL -c "SELECT t.ck('eight concurrent retries exactly once',(SELECT count(*)=1 FROM club_member_email_consents WHERE idempotency_key='33333333-0000-4000-8000-000000000050'));"
# A revoke owns the row first; a stale grant waiting on it cannot reopen.
$PSQL -c "BEGIN; SELECT t.pref('{\"channel\":\"email\",\"version\":\"email-v3\",\"granted\":false,\"idempotency_key\":\"33333333-0000-4000-8000-000000000051\"}'); SELECT pg_sleep(0.4); COMMIT;" > "$OUT/revoke-race.log" 2>&1 &
p=$!
for i in {1..30}; do
 n=$($PSQL -tAc "SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep'")
 [ "$n" -ge 1 ] && break
done
$PSQL -c "SELECT t.reject332('{\"channel\":\"email\",\"version\":\"email-v3\",\"granted\":true,\"expected_dates\":{\"email\":null},\"idempotency_key\":\"33333333-0000-4000-8000-000000000052\"}','consent_revision_conflict');" > "$OUT/stale-race.log" 2>&1
wait "$p"
$PSQL -c "SELECT t.ck('revoke beats concurrent stale grant',t.consent()#>>'{email,state}'='revoked');"