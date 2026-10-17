#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-/tmp/issue332-city-handler}"
bash scripts/newgang-person-consent/run-handler.sh "$OUT" > "$OUT-parent.log" 2>&1
python3 - "$OUT" <<'PY'
from pathlib import Path
import sys,json
p=Path(sys.argv[1])/'supabase/functions/newgang-portal';f=p/'handler-client.ts';s=f.read_text()
r=json.loads(Path('docs/testes/issue332/cities/caop2025-municipalities.json').read_text());data={'country':'PT','version':'caop-2025','cities':[{'code':x['codigo'],'name':x['nome'],'region':x['regiao']} for x in r]}
s=s.replace('confirmCalls:0','confirmCalls:0,citiesCalls:0').replace('rpc:(fn:string,args:Record<string,unknown>)=>{','rpc:(fn:string,args:Record<string,unknown>)=>{if(fn==="club_cities"){fake.citiesCalls++;return Promise.resolve({data:'+json.dumps(data,ensure_ascii=False)+',error:null});}').replace('fake.failure==="no_session"?"no_session":','fake.failure==="city_unknown"?"city_unknown":fake.failure==="no_session"?"no_session":');f.write_text(s)
(p/'cities_handler_test.ts').write_text(Path('scripts/newgang-cities/handler_test.ts').read_text())
PY
deno test --node-modules-dir=auto --no-check "$OUT/supabase/functions/newgang-portal/cities_handler_test.ts"
