#!/usr/bin/env bash
set -euo pipefail
PSQL="$1"; OUT="$2"
$PSQL -c "UPDATE club_welcome_reservations SET status='error_pre_send',retry_safe=true,attempt_count=1,next_attempt_at=now()-interval '1 sec' WHERE member_id=(SELECT id FROM club_members WHERE email='t332@example.invalid');"
pids=()
for i in {1..8}; do
 $PSQL -tAc "SELECT club_welcome_reserve(m.company_id,m.site_id,m.id,'ng-welcome-'||m.id) FROM club_members m WHERE email='t332@example.invalid'" > "$OUT/reserve-$i.log" 2>&1 &
 pids+=("$!")
done
for p in "${pids[@]}"; do wait "$p"; done
n=$(grep -h '^t$' "$OUT"/reserve-*.log | wc -l)
test "$n" -eq 1
$PSQL -c "SELECT t332_assert((SELECT status='reserved' AND attempt_count=2 FROM club_welcome_reservations WHERE member_id=(SELECT id FROM club_members WHERE email='t332@example.invalid')),'8 real connections exactly one retry');"
$PSQL -c "UPDATE club_welcome_reservations SET status='unknown' WHERE member_id=(SELECT id FROM club_members WHERE email='t332@example.invalid');"
for i in {1..8}; do
 $PSQL -tAc "SELECT club_welcome_reserve(m.company_id,m.site_id,m.id,'ng-welcome-'||m.id) FROM club_members m WHERE email='t332@example.invalid'" > "$OUT/unknown-$i.log" 2>&1 &
 pids+=("$!")
done
for p in "${pids[@]:8}"; do wait "$p"; done
test "$(grep -h '^f$' "$OUT"/unknown-*.log | wc -l)" -eq 8
echo 'PASS 8 real connections unknown blocked'