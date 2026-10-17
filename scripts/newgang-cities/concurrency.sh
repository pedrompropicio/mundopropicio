#!/usr/bin/env bash
set -euo pipefail
PSQL="$1"; OUT="$2"; pids=()
for i in {1..8};do
 $PSQL -c "SELECT t.call(md5('profile@example.invalid'),t.payload()||'{\"city\":\"  seIXal \"}');" > "$OUT/city-race-$i.log" 2>&1 & pids+=("$!")
done
for p in "${pids[@]}";do wait "$p";done
$PSQL -c "SELECT t.cityck('eight current city confirms no extra50',(SELECT count(*)=1 FROM club_points WHERE member_id=t.m('profile@example.invalid') AND rule_key='profile_complete')); SELECT t.cityck('eight city confirms store canonical',t.state(md5('profile@example.invalid'))->>'city'='Seixal');"
