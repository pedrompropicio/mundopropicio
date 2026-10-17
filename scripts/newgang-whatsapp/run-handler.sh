#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-/tmp/issue332-whatsapp-handler}"
bash scripts/newgang-person-consent/run-handler.sh "$OUT" >/dev/null
cp scripts/newgang-whatsapp/handler_test.ts "$OUT/supabase/functions/newgang-portal/whatsapp_test.ts"
deno test --node-modules-dir=auto --no-check "$OUT/supabase/functions/newgang-portal/whatsapp_test.ts"
