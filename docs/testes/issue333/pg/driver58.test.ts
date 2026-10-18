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
const nativeFetch=globalThis.fetch;
vi.stubGlobal('fetch',()=>{throw Error('egress prohibited')});
const dir=mkdtempSync('/tmp/driver58-pg-'),port=55458;
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


it('connected AuthHTTP + official SELECT spool + same Chromium probe/preflight/execute worker, sole orchestration and finally against disposable PG',async()=>{
 await db.unsafe(readFileSync('docs/testes/issue333/pilot8/financial-schema58.LOCAL.sql','utf8'));
 await db`alter table auth.users add column email text, add column raw_user_meta_data jsonb, add column last_sign_in_at timestamptz, add column banned_until timestamptz, add column created_at timestamptz, add column email_confirmed_at timestamptz`;
 await db`create table auth.sessions(user_id uuid)`;
 for(const f of ['log_table_change.live.sql','set_company_id_on_insert.live.sql'])await db.unsafe(readFileSync('docs/testes/issue333/pilot8/preflight56/sources/'+f,'utf8'));
 await db`delete from user_roles where user_id<>${U}`;
 await db`alter table user_roles alter column id drop default`;
 await db`alter table user_roles alter column id type uuid using md5(id::text)::uuid`;
 const {AuthAdmin57,OfficialSelectBridge,exactPdf57,chromiumDriver57}=await import('../pilot8/private-cloud57');
 const {connectedDriver58}=await import('../pilot8/run-cloud57');
 const {checkpoint66,PrivateStore66,artifactHash66}=await import('../pilot8/checkpoint66');
 const {metadataSQL,baselineSQL}=await import('../pilot8/baseline58');
 const {readdir,writeFile:writeAsync,mkdtemp}=await import('node:fs/promises');
 const out=process.env.ISSUE333_EVIDENCE??dir;mkdirSync(out,{recursive:true});
 writeFileSync(out+'/pilot8-fiction.pdf',readFileSync('docs/testes/issue333/pilot8/preflight56/evidence/pilot8-fiction.pdf'),{mode:0o600});
 const artifact=await exactPdf57(out+'/pilot8-fiction.pdf');artifact.company=C;
 const sources=await db`select oid::regprocedure::text signature,md5(prosrc) hash from pg_proc where oid in ('current_company_id()'::regprocedure,'log_table_change()'::regprocedure,'set_company_id_on_insert()'::regprocedure,'auth.uid()'::regprocedure,'data_entry_pilot8_gate(text)'::regprocedure)`;
 const expectedSources=Object.fromEntries(sources.map(x=>[x.signature,x.hash]));
 const spool=await mkdtemp('/tmp/issue333-select-local58-');const bridge=new OfficialSelectBridge(spool,20000);let stopped=false;const served=new Set<string>();
 const relay=(async()=>{while(!stopped){for(const name of await readdir(spool)){if(!name.endsWith('.request.json')||served.has(name))continue;served.add(name);const r=JSON.parse(readFileSync(spool+'/'+name,'utf8'));try{const data=await db.unsafe(r.query);await writeAsync(spool+'/'+name.replace('.request.','.response.'),JSON.stringify({id:r.id,fingerprint:r.fingerprint,data}),{mode:0o600})}catch{await writeAsync(spool+'/'+name.replace('.request.','.response.'),JSON.stringify({id:r.id,error:'local SELECT refused'}))}}await new Promise(r=>setTimeout(r,20));}})();
 const {createServer:createVite}=await import('vite');
 const vite=await createVite({configFile:false,optimizeDeps:{entries:['docs/testes/issue333/head/react-main.tsx']},cacheDir:dir+'/vite',root:process.cwd(),plugins:[(await import('@vitejs/plugin-react')).default()],server:{middlewareMode:true},resolve:{alias:[...['@/integrations/supabase/client','@/contexts/AuthContext','@/hooks/useCompany','@/hooks/use-toast','@/lib/invoice-ocr-prepare'].map(find=>({find,replacement:resolve('docs/testes/issue333/head/react-boundary.tsx')})),{find:'@',replacement:resolve('src')},{find:'@shared',replacement:resolve('supabase/functions/_shared')}]}});
 const authCalls:string[]=[];let base='';
 const server=createServer(async(req,res)=>{try{
 if(req.url==='/entry'){res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/index.html','<html><head></head><body><div id="root"></div><script type="module" src="/docs/testes/issue333/head/react-main.tsx"></script></body></html>'));return;}
 if(req.url?.startsWith('/auth/')||req.url?.startsWith('/functions/')||req.url?.startsWith('/local/')||req.url?.startsWith('/storage/')){
 const chunks:Buffer[]=[];for await(const part of req)chunks.push(part);const body=Buffer.concat(chunks);res.setHeader('Content-Type','application/json');
 if(req.url.startsWith('/auth/')){authCalls.push(req.method+' '+req.url);const j=body.length?JSON.parse(body.toString()):{};
 if(req.method==='GET'){res.end(JSON.stringify({users:[]}));return;}
 if(req.url==='/auth/v1/admin/users'){await db`update auth.users set email=${j.email},raw_user_meta_data=${db.json(j.user_metadata)},created_at=clock_timestamp() where id=${U}`;res.end(JSON.stringify({id:U,created_at:new Date().toISOString()}));return;}
 if(req.url.startsWith('/auth/v1/token')){await db`insert into auth.sessions values (${U})`;res.end(JSON.stringify({user:{id:U},access_token:'local-owner',token_type:'bearer',expires_in:3600}));return;}
 if(req.url.startsWith('/auth/v1/logout')){await db`delete from auth.sessions where user_id=${U}`;res.end('{}');return;}
 if(req.method==='PUT'&&req.url.endsWith(U)){await db`update auth.users set banned_until=clock_timestamp()+interval '100 years' where id=${U}`;res.end('{}');return;}throw Error('Unlisted local Auth');}
 if(req.url==='/local/rpc'){res.end(JSON.stringify({role:'manager',company_id:C,permissions:[]}));return;}
 if(req.url.startsWith('/storage/v1/object/authenticated/standalone-invoices/')){const path=req.url.slice('/storage/v1/object/authenticated/standalone-invoices/'.length);res.setHeader('Content-Type','application/pdf');res.end(readFileSync(dir+'/objects/standalone-invoices/'+path));return;}
 const response=await handler()(new Request(base+req.url,{method:req.method,headers:req.headers as Record<string,string>,body}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 vite.middlewares(req,res);
 }catch{res.statusCode=500;res.end(JSON.stringify({error:'isolated transport failed'}));}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();if(!addr||typeof addr==='string')throw Error('No local server');base='http://127.0.0.1:'+addr.port;
 // Vite may only target the local handler, never the configured Cloud URL.
 vite.config.define={...vite.config.define,'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(base),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('local-public')};
 const originalFetch=globalThis.fetch;
 // vi stub forbids external egress. Node's native fetch is explicitly restored only for loopback.
 const transport:typeof fetch=async(url,options)=>{if(!String(url).startsWith(base+'/'))throw Error('nonlocal egress');return nativeFetch(url,options)};
 const httpAuth=new AuthAdmin57(base,'local-service','local-public',transport);
 vi.stubGlobal('fetch',transport);
 let controllerWrites=0;
 const notify=async(message:any)=>{if(message.controller_prepare){controllerWrites++;await db`insert into data_entry_pilot8_allowlist select ${U},${C},op,true,clock_timestamp()+interval '10 minutes',${'FICTITIOUS one PDF; '+artifact.marker+'; SHA256='+artifact.sha256} from unnest(array['preparation','assistant_create']) op`}if(message.controller_revoke_exact_two){controllerWrites++;await db`update data_entry_pilot8_allowlist set enabled=false where owner_id=${U} and company_id=${C}`}};
 const driver=connectedDriver58({artifact,auth:httpAuth,select:(q,keys)=>bridge.select(q,keys),url:base,service:'local-service',pub:'local-public',directory:out,expectedSources,browserOptions:{isolated:true,app_url:base,start_path:'/entry',entry_path:'/entry',dialog_open:true},notify});
 try{
 expect((await bridge.select(metadataSQL())).incompatibilities).toEqual([]);
 const first=(await bridge.select(baselineSQL())).baseline;expect((await bridge.select(baselineSQL())).baseline).toEqual(first);
 await httpAuth.readProbe();
 for(const mode of ['probe','preflight']){const result=await chromiumDriver57('docs/testes/issue333/pilot8/cloud-browser57.py',{mode,isolated:true,app_url:base,cloud_url:base,start_path:'/entry',output:out});expect(result.page_loaded).toBe(true);expect(result.errors).toEqual([]);expect(authCalls.filter(x=>x.startsWith('POST'))).toHaveLength(0);}
 const fullName='Autorizador Fictício';const createdAt='2026-10-18T17:00:00.000Z';const roleId=(await db`select id from user_roles where user_id=${U}`)[0].id;
 await db`update user_roles set role='user' where user_id=${U}`;
 await db`update auth.users set email=${artifact.marker+'@fixture.invalid'},created_at=${createdAt},email_confirmed_at=${createdAt},raw_user_meta_data=${db.json({fixture_marker:artifact.marker,company_id:C,full_name:fullName,pilot_pdf_sha256:artifact.sha256,pilot_pdf_size:artifact.size,pilot_pdf_mime:artifact.mime})} where id=${U}`;
 const store=new PrivateStore66(out+'/checkpoint66');await store.save({version:1,phase:'identity_reviewed',identity:{id:U,createdAt,roleId,fullName},artifactHash:artifactHash66(artifact),pending:[],actions:{}});writeFileSync(store.directory+'/password','local-password-only-12345',{mode:0o600});
 expect((await checkpoint66('prepare',driver,artifact,store)).checkpoint).toBe('await_activation');
 // Local controller writes BETWEEN completed invocations, never while a SELECT is waiting.
 await db`update user_roles set role='manager' where id=${roleId}`;await notify({controller_prepare:true});
 expect((await checkpoint66('execute',driver,artifact,new PrivateStore66(store.directory))).checkpoint).toBe('await_revocation');
 await notify({controller_revoke_exact_two:true});
 expect((await checkpoint66('finish',driver,artifact,new PrivateStore66(store.directory))).checkpoint).toBe('complete');
 expect(authCalls.filter(x=>x==='POST /auth/v1/admin/users')).toHaveLength(0);expect(controllerWrites).toBe(2);
 expect((await db`select count(*)::int n from auth.sessions`)[0].n).toBe(0);
 for(const t of ['reimbursement_notes','reimbursement_note_items','transactions','event_forecasts','financial_accounts','transaction_payments','payment_lists'])expect((await db.unsafe('select count(*)::int n from '+t))[0].n).toBe(0);
 writeFileSync(out+'/connected58.json',JSON.stringify({local_only:true,modes:['probe','preflight','execute'],authCalls,controllerWrites,cloud_executed:false}));
 }finally{vi.stubGlobal('fetch',originalFetch);stopped=true;await relay;await vite.close();await new Promise<void>(r=>server.close(()=>r()));}
},180000);
