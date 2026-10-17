#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-/tmp/issue332-handler}"; mkdir -p "$OUT"
cp -r supabase "$OUT/"
python3 - "$OUT" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])/'supabase/functions/newgang-portal'
s=(p/'index.ts').read_text().replace('from "npm:@supabase/supabase-js@2"','from "./handler-client.ts"').replace('Deno.serve(async (req) => {','export const handler = async (req: Request) => {')
s=s.rstrip();assert s.endswith('});');s=s[:-3]+'};\nexport const testPublicCache = () => siteCache;\n'
s=s.replace('Deno.env.get("SUPABASE_URL")!', '"https://example.invalid"').replace('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!', '"fixture-no-secret"')
(p/'handler-under-test.ts').write_text(s)
s=Path('patches/issue330/handler-client.ts').read_text().replace('confirmCalls:0','confirmCalls:0,consentFailure:"ok",consentCalls:0,lastArgs:{} as Record<string,unknown>')
s=s.replace('rpc:(fn:string)=>{','''rpc:(fn:string,args:Record<string,unknown>)=>{if(fn==="club_consent_state"||fn==="club_profile_preferences"){
 if(fn==="club_profile_preferences"){fake.consentCalls++;fake.lastArgs=args;}
 if(fake.consentFailure==="timeout")return new Promise<any>(()=>{});
 if(fake.consentFailure==="rejected")return Promise.reject(new Error("PRIVATE_SENTINEL"));
 if(fake.consentFailure==="empty")return Promise.resolve({data:null,error:null});
 if(fake.consentFailure!=="ok")return Promise.resolve({data:null,error:{message:fake.consentFailure}});
 const consents={email:{state:"revoked",version:"email-v3",date:"2026-10-17"},ads:{meta_ads:{state:"unknown",version:null,date:null}}};
 return Promise.resolve({data:fn==="club_consent_state"?consents:{ok:true,consents},error:null});
 }''')
(p/'handler-client.ts').write_text(s)
(p/'handler_test.ts').write_text(Path('scripts/newgang-person-consent/handler_test.ts').read_text())
PY
deno test --node-modules-dir=auto --no-check "$OUT/supabase/functions/newgang-portal/handler_test.ts"