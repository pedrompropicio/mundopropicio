import {handler} from './handler-under-test.ts';
import {fake} from './handler-client.ts';
function eq(a:unknown,b:unknown){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);}
const token='fixture-token';
async function call(action:string,extra:Record<string,unknown>={}){const r=await handler(new Request('https://example.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,token,...extra})}));return {status:r.status,body:await r.json()};}
Deno.test('whatsapp grant sem telefone devolve 400 whatsapp_no_phone',async()=>{
 fake.member=true;fake.consentFailure='whatsapp_no_phone';
 const r=await call('profile_preferences',{preferences_payload:{channel:'whatsapp',version:'whatsapp-v1',granted:true,idempotency_key:'f1'}});
 eq(r.status,400);eq(r.body.error,'whatsapp_no_phone');
});
Deno.test('whatsapp payload passa só sessão+payload à RPC',async()=>{
 fake.member=true;fake.consentFailure='ok';fake.consentCalls=0;
 const payload={channel:'whatsapp',version:'whatsapp-v1',granted:true,expected_dates:{whatsapp:null},idempotency_key:'f2'};
 const r=await call('profile_preferences',{preferences_payload:payload});
 eq(r.status,200);eq(r.body.ok,true);eq(fake.consentCalls,1);eq(fake.lastArgs.p_payload,payload);
 eq(Object.keys(fake.lastArgs).sort(),['p_payload','p_session_hash','p_site']);
});
Deno.test('whatsapp texto aprovado e versão expostos no contrato',async()=>{
 const mod=await import('./person-consent.ts');
 eq(mod.CONSENT_TEXTS.whatsapp.version,'whatsapp-v1');
 eq(mod.CONSENT_TEXTS.whatsapp.text,'Aceito receber novidades da Mundo Propício no WhatsApp. Posso retirar a qualquer momento.');
});
Deno.test('whatsapp erro desconhecido da RPC é 503 sem detalhe',async()=>{
 fake.member=true;fake.consentFailure='sql';
 const r=await call('profile_preferences',{preferences_payload:{channel:'whatsapp',version:'whatsapp-v1',granted:false,idempotency_key:'f3'}});
 eq(r.status,503);eq(r.body.error,'consent_unavailable');
});
