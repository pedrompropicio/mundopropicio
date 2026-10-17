import { handler, testPublicCache } from './handler-under-test.ts';
import { fake } from './handler-client.ts';
function eq(a:unknown,b:unknown){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(JSON.stringify({a,b}));}
const token='fixture-access-token-000000000000';
async function call(action:string,extra:Record<string,unknown>={}){const r=await handler(new Request('https://example.invalid',{method:'POST',headers:{origin:'https://newgangfestival.pt','content-type':'application/json'},body:JSON.stringify({action,...extra})}));return {status:r.status,body:await r.json()};}
for(const failure of ['missing','timeout','denied','sql','empty','rejected'])Deno.test(`real handler optional consent ${failure} preserves core`,async()=>{
 fake.failure='ok';fake.member=true;fake.consentFailure=failure;
 const r=await call('me',{token});eq(r.status,200);eq(r.body.points,1500);eq(r.body.level,'Goat');eq(r.body.history.length,1);eq(r.body.pending_crew.status,'crew_full');eq(r.body.consents,null);eq(r.body.consents_status,'temporarily_unavailable');
 const pub=await call('bundle',{token});eq(JSON.stringify(pub.body).includes('consents'),false);eq(JSON.stringify(testPublicCache()).includes('consents'),false);
});
Deno.test('real handler consent session rejection no fallback',async()=>{fake.consentFailure='no_session';eq(await call('me',{token}),{status:401,body:{error:'no_session'}});});
Deno.test('real handler preferences passes only session+payload',async()=>{fake.consentFailure='ok';fake.consentCalls=0;const payload={channel:'email',version:'email-v3',granted:false,idempotency_key:'fixture'};
 const r=await call('profile_preferences',{token,preferences_payload:payload});eq(r.status,200);eq(r.body.ok,true);eq(fake.consentCalls,1);eq(fake.lastArgs.p_payload,payload);eq(Object.keys(fake.lastArgs).sort(),['p_payload','p_session_hash','p_site']);
 const me=await call('me',{token});eq(me.body.consents.email.version,'email-v3');eq(JSON.stringify(me.body.consents).includes('token'),false);
});
Deno.test('real handler no-session preferences never writes',async()=>{fake.member=false;fake.consentCalls=0;eq((await call('profile_preferences',{token,preferences_payload:{}})).status,401);eq(fake.consentCalls,0);fake.member=true;});
Deno.test('real handler confirmation failures never false success or retry',async()=>{for(const failure of ['missing','denied','empty','rejected','no_session','parental_flow_required','idempotency_conflict','consent_revision_conflict']){
 fake.consentFailure=failure;fake.consentCalls=0;const r=await call('profile_preferences',{token,preferences_payload:{channel:'email'}});eq(r.status,failure==='no_session'?401:['parental_flow_required','idempotency_conflict','consent_revision_conflict'].includes(failure)?409:503);eq(r.body.ok,undefined);eq(fake.consentCalls,1);
}});
Deno.test('WhatsApp adapter unchanged',async()=>{fake.consentFailure='ok';eq(await call('profile_preferences',{token}),{status:409,body:{error:'whatsapp_adapter_pending'}});});