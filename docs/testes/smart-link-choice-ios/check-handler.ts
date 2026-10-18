import { readFileSync } from 'node:fs';
const file='docs/testes/smart-link-choice-ios/index.candidate.ts';
let source=readFileSync(file,'utf8').replace(/^import .*;$/gm,'');
let handler:any;let calls:any[]=[];let mode='duplicate';
const admin={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'00000000-0000-4000-8000-000000000001',active:true},error:null})})})}),rpc:async(name:string,payload:any)=>{calls.push(name);return mode==='invalid'?{error:{code:'42501'}}:{data:null,error:null}}};
const serve=(fn:any)=>handler=fn;
const ts=new Bun.Transpiler({loader:'ts'});
new Function('Deno','createClient','lookupIpGeo','validSsrKey','prefetchDetail','ssrClientIp','ssrClientGeo',ts.transformSync(source))(
{serve,env:{get:(k:string)=>({'SONG_LINK_IP_SALT':'local','SUPABASE_URL':'http://127.0.0.1:9','SUPABASE_SERVICE_ROLE_KEY':'local'} as any)[k]}},()=>admin,()=>{throw Error('network forbidden')},()=>false,()=>null,()=>null,()=>null);
const body={slug:'rs-meta',event:'choice',arrival_event_id:'00000000-0000-4000-8000-000000000002',event_id:'00000000-0000-4000-8000-000000000004',destination:'spotify',opened:'web',mode:'choose'};
let tests=0;
async function check(name:string,b:any,headers:any,status:number,rpc:boolean){calls=[];const res=await handler(new Request('http://localhost/choice',{method:'POST',headers,body:JSON.stringify(b)}));const j=await res.json();if(res.status!==status||Boolean(calls.length)!==rpc)throw Error(name+JSON.stringify({status:res.status,j,calls}));tests++;console.log('PASS',name,res.status);}
await check('headerless linked duplicate',body,{},200,true);
await check('headerless arrival rejected',{...body,event:'arrival'},{},403,false);
await check('headerless unlinked choice rejected',{...body,arrival_event_id:null},{},403,false);
await check('allowed origin also requires arrival',{...body,arrival_event_id:null},{origin:'https://www.mundopropicio.com'},400,false);
await check('untrusted Origin cannot fallback',body,{origin:'https://evil.invalid'},403,false);
await check('untrusted Referer cannot fallback',body,{referer:'https://evil.invalid/'},403,false);
await check('bad UUID rejected', {...body,event_id:'bad'},{origin:'https://www.mundopropicio.com'},400,false);
mode='invalid';await check('missing or expired arrival maps to403',body,{},403,true);
console.log(`${tests} handler tests PASS; no external calls; no Live`);
