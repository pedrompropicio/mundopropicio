#!/usr/bin/env bash
set -euo pipefail
read -r -a Q <<< "$1"
"${Q[@]}" -c "BEGIN; SELECT _club_site_lock('00000000-0000-4000-8000-0000000000a2',true); SELECT pg_sleep(3); COMMIT" >/dev/null & gate=$!
for n in $(seq 1 60); do locked=$("${Q[@]}" -tAc "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=327 AND mode='ExclusiveLock' AND granted"); [ "$locked" -gt 0 ] && break; sleep 0.05; done
[ "$locked" -gt 0 ] || exit 3
pids=()
for n in $(seq 1 8); do "${Q[@]}" -c "SELECT t.call(md5('race@example.invalid'),t.payload())" >/tmp/issue330/race-$n.log 2>&1 & pids+=("$!"); done
for pid in "${pids[@]}"; do wait "$pid"; done
wait "$gate"
"${Q[@]}" -c "SELECT t.ok('330','8 concurrent clicks one 50',(SELECT count(*)=1 AND sum(points)=50 FROM club_points WHERE rule_key='profile_complete' AND member_id=t.m('race@example.invalid')));"
"${Q[@]}" -c "SELECT t.ok('330','completion count exactly1',(SELECT completed_at IS NOT NULL AND award_id IS NOT NULL FROM club_member_profiles WHERE member_id=t.m('race@example.invalid')));"
