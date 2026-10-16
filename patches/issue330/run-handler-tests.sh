#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"
OUT="${1:-/tmp/issue330-handler}"
mkdir -p "$OUT"
cp -r supabase "$OUT/"
patch -d "$OUT" -p1 < patches/issue330/newgang-portal.patch
cp patches/issue330/handler{_test,-client}.ts "$OUT/supabase/functions/newgang-portal/"
python3 - "$OUT" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])/"supabase/functions/newgang-portal"
s=(p/'index.ts').read_text().replace('from "npm:@supabase/supabase-js@2"','from "./handler-client.ts"').replace('Deno.serve(async (req) => {','export const handler = async (req: Request) => {')
s=s.rstrip(); assert s.endswith('});');s=s[:-3]+'};\nexport const testPublicCache = () => siteCache;\n'
s=s.replace('Deno.env.get("SUPABASE_URL")!', '"https://example.invalid"').replace('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!', '"fixture-no-secret"')
(p/'handler-under-test.ts').write_text(s)
PY
deno test --no-check "$OUT/supabase/functions/newgang-portal/handler_test.ts"
