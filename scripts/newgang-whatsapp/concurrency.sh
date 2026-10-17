#!/usr/bin/env bash
# Concorrência real: 8 ligações tentam o MESMO grant whatsapp com o MESMO idempotency_key.
set -euo pipefail
PSQL_CMD="$1"; OUT="$2"
read -r -a PSQL <<< "$PSQL_CMD"
"${PSQL[@]}" -c "UPDATE club_members SET phone='+351911111111' WHERE id='33333333-0000-4000-8000-000000000002'" >/dev/null
for i in $(seq 1 8); do
  "${PSQL[@]}" -c "SELECT club_profile_preferences('33333333-0000-4000-8000-000000000001','fixture-session','{\"channel\":\"whatsapp\",\"version\":\"whatsapp-v1\",\"granted\":true,\"idempotency_key\":\"33333333-0000-4000-8000-000000000030\"}')" >/dev/null 2>&1 &
done
wait
N=$("${PSQL[@]}" -tAc "SELECT count(*) FROM club_member_whatsapp_consents WHERE idempotency_key='33333333-0000-4000-8000-000000000030'")
"${PSQL[@]}" -c "SELECT t.ok('332w','concurrent same key single row','$N'::int=1)"
