import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
/** Pilot candidate only. Real PG/socket/SQL/disk; Auth and Storage transports LOCAL, not Cloud. */
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import postgres from 'postgres';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createHandler} from '../../../../supabase/functions/data-entry/handler';
import {validateDocument} from '../../../../supabase/functions/_shared/data-entry-core';
vi.stubGlobal('fetch',()=>{throw Error('egress prohibited')});
const dir=mkdtempSync('/tmp/pilot8-pg-'),port=55457;
const pg=(cmd:string,args:string[])=>execFileSync('setpriv',['--reuid=1000','--regid=1000','--clear-groups',cmd,...args]);
const connection=()=>postgres({host:dir,port,user:'postgres',database:'postgres',max:1,onnotice:()=>{}});
let db:postgres.Sql,c1:postgres.Sql,c2:postgres.Sql;
const C='11111111-1111-4111-8111-111111111111',D=randomUUID(),U='22222222-2222-4222-8222-222222222222',V=randomUUID(),W=randomUUID();
let bytes:Uint8Array,initial:unknown;
async function as<T>(u:string,fn:(tx:postgres.TransactionSql)=>Promise<T>,sql=c1){return sql.begin(async tx=>{await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:u})},true)`;await tx`set local role authenticated`;return fn(tx)})}
async function gate(u=U,op='preparation'){return as(u,async tx=>(await tx`select data_entry_pilot8_capabilities() j`)[0].j[op==='preparation'?'preparation':'execute'])}
async function denied(p:Promise<unknown>){try{await p;return 'SUCCESS'}catch(e){return (e as {code:string}).code}}
async function snapshot(){return {acl:await db`select oid::regprocedure::text signature,proacl::text,proowner,proconfig,prosecdef from pg_proc where pronamespace='public'::regnamespace and proname not like 'data_entry_pilot8%' order by 1`,data:await db`select (select count(*) from standalone_invoices) invoices,(select count(*) from data_entry_sessions) sessions,(select count(*) from data_entry_results) results,(select count(*) from data_entry_storage_receipts) receipts`,settings:await db`select * from data_entry_settings`,attemptSettings:await db`select * from standalone_attempt_settings_333`}}
let uploads=0,revokeOnRead=false;
let hook: ((phase:string,bucket:string) => Promise<void>) | undefined;
let capabilityMissing=false;

function handler(u=U,sql=c1){return createHandler({pilotScoped:true,uploadEnabled:false,cors:{},getUser:async()=>({id:u}),userRpc:async(_t,name,args)=>{try{const data=await as(u,async tx=>{if(name==='my_effective_permissions')return (await tx`select public._effective_permissions_for(${u},public.current_company_id(),'{}'::text[]) j`)[0].j;
if(name==='data_entry_pilot8_capabilities' && capabilityMissing)return {preparation:false,execute:false};const keys=Object.keys(args);const q=`select public.${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) j`;return (await tx.unsafe(q,keys.map(k=>typeof args[k]==='object'&&args[k]!==null?tx.json(args[k] as never):args[k]) as never))[0].j},sql);return {data,error:null}}catch(e){const x=e as {code:string;message:string};return {data:null,error:{code:x.code,message:x.message}}}},scopedReceipt:async(u,c,s,b,p,h,n,m)=>{if(hook)await hook("receipt",b);try{await db.begin(async tx=>{await tx`set local role service_role`;await tx`select data_entry_pilot8_receipt(${u},${c},${s},${b},${p},${h},${n},${m})`});return {data:null,error:null}}catch(e){return {data:null,error:{code:(e as {code:string}).code}}}},recordReceipt:async(b,p,h,n,m)=>{try{await db.begin(async tx=>{await tx`set local role service_role`;await tx`select data_entry_record_receipt(${b},${p},${h},${n},${m})`});return {data:null,error:null}}catch(e){return {data:null,error:{code:(e as {code:string}).code}}}},storage:{upload:async(b,p,data)=>{uploads++;if(hook)await hook("upload",b);const path=dir+'/objects/'+b+'/'+p;mkdirSync(path.substring(0,path.lastIndexOf('/')),{recursive:true});if(existsSync(path))return {error:{conflict:true}};writeFileSync(path,data);return {error:null}},download:async(b,p)=>{if(hook)await hook('read',b);const path=dir+'/objects/'+b+'/'+p;if(revokeOnRead){revokeOnRead=false;await db`update data_entry_pilot8_allowlist set enabled=false`;}return existsSync(path)?new Uint8Array(readFileSync(path)):null}}})}
async function command(body:unknown,u=U,sql=c1){return handler(u,sql)(new Request('http://local/',{method:'POST',headers:{Authorization:'Bearer local-fixture','Content-Type':'application/json'},body:JSON.stringify(body)}))}
let sid:string,did:string,preview:{id:string;snapshot_hash:string};
beforeAll(async()=>{execFileSync('chown',['1000:1000',dir]);pg('initdb',['-D',dir+'/data','-U','postgres','--auth=trust','-E','UTF8','--no-locale']);pg('pg_ctl',['-D',dir+'/data','-w','-l',dir+'/log','-o',`-k ${dir} -p ${port} -c listen_addresses=''`,'start']);db=connection();c1=connection();c2=connection(); // Actual valid synthetic PDF, parsed BEFORE any local flow account/session effect.
 execFileSync('python3',['docs/testes/issue333/pilot8/pdf-preflight.py',dir+'/pdf']);execFileSync('pdfinfo',[dir+'/pdf/pilot8-fiction.pdf']);bytes=new Uint8Array(readFileSync(dir+'/pdf/pilot8-fiction.pdf'));validateDocument(bytes,'application/pdf');for(const f of ['docs/testes/issue333/pg/fixture.sql','drizzle/migrations/0190_issue333_core_v2_closed_structure.sql','drizzle/migrations/0191_issue333_attempts_closed_structure.sql','drizzle/migrations/0192_issue333_service_only_capability_reader.sql','supabase/manual/20261018_issue333_hash-check.PENDENTE.sql'])await db.unsafe(readFileSync(f,'utf8'));
 await db`insert into companies values (${C},'Fiction C','PT500000001','active'),(${D},'Fiction D','PT500000002','active')`;for(const [u,c] of [[U,C],[V,C],[W,D]]){await db`insert into auth.users values (${u})`;await db`insert into profiles values (${u},'Autorizador Fictício',${c},${c})`;await db`insert into user_roles(user_id,company_id,role) values (${u},${c},'manager')`}
for(const f of ['auth_uid.live.sql','current_company_id.live.sql'])await db.unsafe(readFileSync('docs/testes/issue333/pilot8/preflight56/sources/'+f,'utf8'));await db`update profiles set active_company_id=null where id=${U}`;await db`create role sandbox_fixture noinherit`;for(const signature of ['data_entry_preparation_gate()','data_entry_session(uuid,uuid)','data_entry_commit(uuid,text)','standalone_attempt_gate_333(text)','data_entry_record_receipt(text,text,text,integer,text)'])await db.unsafe('grant execute on function public.'+signature+' to sandbox_fixture');await db`alter default privileges in schema public grant execute on functions to sandbox_fixture`;await db`alter default privileges in schema public grant select,insert on tables to sandbox_fixture`;initial=await snapshot();await db.unsafe(readFileSync('docs/testes/issue333/pilot8/allowlist.INERTE.sql','utf8'));
},60000);
afterAll(async()=>{await Promise.all([db?.end(),c1?.end(),c2?.end()]);pg('pg_ctl',['-D',dir+'/data','-m','immediate','stop'])});

it('Chromium real React + reviewed pilotScoped handler: one PDF/session/preview, explicit server name, two same-preview execute, readback/reopen/revoke check',async()=>{
 await db`insert into data_entry_pilot8_allowlist select ${U},${C},op,true,clock_timestamp()+interval '10 minutes','LOCAL ONLY' from unnest(array['preparation','assistant_create']) op`;
 const {createServer:createVite}=await import('vite');
 const vite=await createVite({configFile:false,optimizeDeps:{noDiscovery:true},cacheDir:dir+'/vite',root:process.cwd(),plugins:[(await import('@vitejs/plugin-react')).default()],server:{middlewareMode:true},resolve:{alias:[...['@/integrations/supabase/client','@/contexts/AuthContext','@/hooks/useCompany','@/hooks/use-toast','@/lib/invoice-ocr-prepare'].map(find=>({find,replacement:resolve('docs/testes/issue333/head/react-boundary.tsx')})),{find:'@',replacement:resolve('src')},{find:'@shared',replacement:resolve('supabase/functions/_shared')}]},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(''),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('local-fixture')}});
 const calls:unknown[]=[];let doubleCount=0;let latestBody:Record<string,unknown>|undefined;
 const server=createServer(async(req,res)=>{try{
 if(req.url?.startsWith('/functions/')||req.url?.startsWith('/local/')){
 const chunks:Buffer[]=[];for await(const part of req)chunks.push(part);const body=Buffer.concat(chunks);
 if(req.url==='/local/rpc'){const j=JSON.parse(body.toString());if(j.name!=='my_effective_permissions')throw Error('unlisted RPC');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({role:'manager',company_id:C,permissions:[]}));return;}
 if(req.url==='/local/verify'){const [invoice]=await db`select * from standalone_invoices`;const actual=invoice?readFileSync(dir+'/objects/standalone-invoices/'+invoice.storage_path):Buffer.alloc(0);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({sha256:createHash('sha256').update(actual).digest('hex'),size:actual.length,invoice,counts:await db`select (select count(*) from standalone_invoices)::int invoices,(select count(*) from data_entry_sessions)::int sessions,(select count(*) from data_entry_previews)::int previews,(select count(*) from data_entry_results)::int results,(select count(*) from standalone_attempt_audit_333)::int audits`,doubleCount}));return;}
 if(req.url==='/local/revoke'){await db`update data_entry_pilot8_allowlist set enabled=false where owner_id=${U} and company_id=${C}`;const before=uploads;if(!latestBody)throw Error('missing executed preview');const checkBody={action:'check',session_id:latestBody.session_id,preview_id:latestBody.preview_id};const r=await command(checkBody);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:r.status,body:await r.json(),uploads_before:before,uploads_after:uploads,rows:(await db`select count(*)::int n from data_entry_pilot8_allowlist where not enabled`)[0].n}));return;}
 const request=new Request('http://local'+req.url,{method:req.method,headers:req.headers as Record<string,string>,body});
 let response:Response;
 if(request.headers.get('content-type')?.includes('application/json')){const j=JSON.parse(body.toString());calls.push(j);if(j.action==='execute'){latestBody=j;const pair=await Promise.all([command(j,U,c1),command(j,U,c2)]);doubleCount+=2;response=pair.find(r=>r.status===200)??pair[0];}else response=await handler()(request);}else response=await handler()(request);
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 if(req.url==='/entry'){res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/index.html','<html><head></head><body><div id="root"></div><script type="module" src="/docs/testes/issue333/head/react-main.tsx"></script></body></html>'));return;}
 vite.middlewares(req,res);
 }catch(e){res.statusCode=500;res.end(JSON.stringify({error:String(e)}));}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();if(!addr||typeof addr==='string')throw Error('No local server');
 const evidence=process.env.ISSUE333_EVIDENCE??dir;mkdirSync(evidence,{recursive:true});writeFileSync(evidence+'/pilot8-fiction.pdf',bytes,{mode:0o600});
 try{const output=await promisify(execFile)(process.env.ISSUE333_PYTHON??'python3',['docs/testes/issue333/pilot8/browser-flow.py',String(addr.port),evidence],{timeout:120000,maxBuffer:1000000,env:{PATH:'/bin:/usr/bin',HOME:'/tmp',PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH}});console.log(output.stdout);
 expect(doubleCount).toBe(2);for(const t of ['standalone_invoices','data_entry_results','standalone_attempt_audit_333','data_entry_sessions','data_entry_previews'])expect((await db.unsafe('select count(*)::int n from '+t))[0].n).toBe(1);
 for(const t of ['transactions','event_forecasts','financial_accounts','transaction_payments','reimbursements','payment_lists'])expect((await db.unsafe('select count(*)::int n from '+t))[0].n).toBe(0);
 }finally{writeFileSync(evidence+'/calls.json',JSON.stringify(calls,null,2));await vite.close();await new Promise<void>(r=>server.close(()=>r()));}
},150000);
