#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-/tmp/issue332-immediate-handler}"
bash scripts/newgang-person-consent/run-handler.sh "$OUT"
python3 - "$OUT" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])/'supabase/functions/newgang-portal'
s=(p/'handler-client.ts').read_text()
s=s.replace('confirmCalls:0','confirmCalls:0,accessMember:true,pending:false,rateCalls:0,rateMax:0,rateWindow:0,sessions:0,enqueues:0,reserved:false,markStatus:"",preFail:false,queueFail:false')
s=s.replace('["select","order","limit","in","or"]','["select","order","limit","in","or","is","gte","upsert"]')
s=s.replace('q.maybeSingle=()=>q;', 'q.insert=()=>{if(table==="club_member_sessions"){fake.sessions++;if(fake.preFail)return Promise.resolve({data:null,error:{message:"fixture failure"}});}return Promise.resolve({data:null,error:null});};q.maybeSingle=()=>q;')
s=s.replace('table==="club_members"?member:', 'table==="club_members"?(fake.accessMember?{...member,email:"fixture@example.invalid"}:null):table==="email_unsubscribe_tokens"?{token:"fixture-token"}:')
s=s.replace('if(fn==="portal_rate_hit")return Promise.resolve({data:true,error:null});','''if(fn==="portal_rate_hit"){fake.rateCalls++;fake.rateMax=Number(args.p_max);fake.rateWindow=Number(args.p_window_seconds);return Promise.resolve({data:fake.rateCalls<=20,error:null});}
if(fn==="club_pending_capture_exists")return Promise.resolve({data:fake.pending,error:null});
if(fn==="club_welcome_reserve"){const data=!fake.reserved;fake.reserved=true;return Promise.resolve({data,error:null});}
if(fn==="club_welcome_mark"){fake.markStatus=String(args.p_status);return Promise.resolve({data:true,error:null});}
if(fn==="enqueue_email"){fake.enqueues++;return Promise.resolve({data:1,error:fake.queueFail?{message:"unknown fixture"}:null});}''')
# targeted member notification uses array query rather than maybeSingle
s=s.replace('q.maybeSingle=()=>q;', 'let single=false;q.maybeSingle=()=>{single=true;return q;};')
s=s.replace('fake.accessMember?{...member,email:"fixture@example.invalid"}:null','fake.accessMember?(single?{...member,email:"fixture@example.invalid"}:[{...member,email:"fixture@example.invalid"}]):null')
(p/'handler-client.ts').write_text(s)
(p/'immediate_test.ts').write_text(Path('scripts/newgang-immediate/handler_test.ts').read_text())
PY
deno test --no-check "$OUT/supabase/functions/newgang-portal/immediate_test.ts"