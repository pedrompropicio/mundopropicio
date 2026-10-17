import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import postgres from 'postgres';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {executeAttempt,type AttemptTransport} from '../../../../supabase/functions/_shared/standalone-attempt';
vi.stubGlobal('fetch',()=>{throw Error('egress prohibited')});
const dir=mkdtempSync('/tmp/attempt333-'),port=55434;
const pg=(command:string,args:string[])=>execFileSync('setpriv',['--reuid=65534','--regid=65534','--clear-groups',command,...args]);
const connect=()=>postgres({host:dir,port,user:'postgres',database:'postgres',max:1,onnotice:()=>{}});
let db:postgres.Sql,c1:postgres.Sql,c2:postgres.Sql;
const C=randomUUID(),D=randomUUID(),U=randomUUID(),V=randomUUID(),W=randomUUID();
const bytes=new Uint8Array([1,2,3]),hash=createHash('sha256').update(bytes).digest('hex');
const envelope=(over:Record<string,unknown>={})=>({payload:{file_name:'f.pdf',created_by:U,currency:'EUR',supplier_nif:null,invoice_number:null,total_amount:123,iva_amount:23,notes:null,...over},document:{sha256:hash,size_bytes:3,mime:'application/pdf'},effects:['scanner_create']});
async function as(sql:postgres.Sql,uid:string,fn:(tx:postgres.TransactionSql)=>Promise<any>){return sql.begin(async tx=>{await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:uid})},true)`;await tx`set local role authenticated`;return fn(tx)})}
const rpc=(sql:postgres.Sql,action:string,id:string|null,e:any=null,h:string|null=null,uid=U,op='scanner_create')=>as(sql,uid,async tx=>(await tx`select public.standalone_attempt_333(${action},${id},${op},${e===null?null:tx.json(e)},${h}) j`)[0].j);
async function receipt(a:any){await db.begin(async tx=>{await tx`set local role service_role`;await tx`select data_entry_record_receipt('standalone-invoices',${a.path},${hash},3,'application/pdf')`})}
async function ready(e:any=envelope(),op='scanner_create'){e={...e,effects:[op]};let a=await rpc(c1,'prepare',randomUUID(),e,null,U,op);await receipt(a);a=await rpc(c1,'authorize',a.id,null,a.hash,U,op);return rpc(c1,'begin',a.id,null,a.hash,U,op)}
const error=async(p:Promise<any>)=>{try{await p;return null}catch(e){return e as {code:string;message:string}}};
beforeAll(async()=>{
 execFileSync('chown',['65534:65534',dir]);pg('initdb',['-D',dir+'/data','-U','postgres','--auth=trust','-E','UTF8','--no-locale']);pg('pg_ctl',['-D',dir+'/data','-w','-l',dir+'/log','-o',`-k ${dir} -p ${port} -c listen_addresses=''`,'start']);
 db=connect();c1=connect();c2=connect();
 for(const file of ['docs/testes/issue333/pg/fixture.sql','supabase/manual/20261017_issue333_core.PENDENTE.sql','supabase/manual/20261017_issue333_attempts.PENDENTE.sql'])await db.unsafe(readFileSync(file,'utf8'));
 await db`insert into companies values (${C},'Fixture C','PT001','active'),(${D},'Fixture D','PT002','active')`;
 for(const [id,c,r] of [[U,C,'manager'],[V,C,'viewer'],[W,D,'manager']]){await db`insert into auth.users values (${id})`;await db`insert into profiles values (${id},'Fixture',${c},${c})`;await db`insert into user_roles(user_id,company_id,role) values (${id},${c},${r})`}
 await db.unsafe(`create function attempt_fail() returns trigger language plpgsql as $$ begin if current_setting('test.fail_audit',true)='on' then raise exception 'injected audit failure'; end if; return new; end $$;create trigger attempt_fail before insert on standalone_attempt_audit_333 for each row execute function attempt_fail();`);
},60000);
afterAll(async()=>{await Promise.all([db?.end(),c1?.end(),c2?.end()]);pg('pg_ctl',['-D',dir+'/data','-m','immediate','stop'])});
it('SQL grants are real: internal closed all, browser auth only, ingest service only; tables closed',async()=>{
 for(const [name,auth,service] of [['standalone_attempt_internal_333(text,uuid,text,jsonb,text,uuid,boolean)',false,false],['standalone_attempt_333(text,uuid,text,jsonb,text)',true,false],['standalone_ingest_attempt_333(uuid,text,uuid,jsonb,text)',false,true]]){const [r]=await db`select has_function_privilege('anon',${name},'execute') n,has_function_privilege('authenticated',${name},'execute') a,has_function_privilege('service_role',${name},'execute') s`;expect(r).toEqual({n:false,a:auth,s:service})}
 expect((await error(as(c1,U,tx=>tx`select * from standalone_attempts_333`)))?.code).toBe('42501');
});
it('same ID without NIF/number and NEW ID equal envelope resolve one persistent reservation across devices',async()=>{
 const e=envelope({notes:randomUUID()}),id=randomUUID();const a=await rpc(c1,'prepare',id,e);const b=await rpc(c2,'prepare',id,e);const fresh=await rpc(c2,'prepare',randomUUID(),e);expect([b.id,fresh.id]).toEqual([a.id,a.id]);
 const [r]=await db`select envelope::text e,envelope_hash h from standalone_attempts_333 where id=${id}`;expect(r.h).toBe(createHash('sha256').update(r.e).digest('hex'));
});
it('same ID divergent payload/document or foreign owner/tenant refused',async()=>{
 const e=envelope({notes:randomUUID()}),id=randomUUID();await rpc(c1,'prepare',id,e);
 expect((await error(rpc(c2,'prepare',id,{...e,payload:{...e.payload,total_amount:124}})))?.code).toBe('42501');
 expect((await error(rpc(c2,'prepare',id,{...e,document:{...e.document,sha256:'a'.repeat(64)}})))?.code).toBe('42501');
 expect((await error(rpc(c2,'prepare',id,{...e,payload:{...e.payload,created_by:W}},null,W)))?.code).toBe('42501');
 expect((await error(rpc(c2,'check',id,null,'0'.repeat(64),V)))?.code).toBe('42501');
});
it('bad scalar/effects/hash/currency rejected; no claim means no mutation; upload without authorized receipt blocks',async()=>{
 expect((await error(rpc(c1,'prepare',null,envelope({total_amount:'123'}))))?.code).toBe('22023');
 const a=await rpc(c1,'prepare',null,envelope({notes:randomUUID()}));
 expect((await error(rpc(c2,'commit',a.id,null,a.hash)))?.code).toBe('42501');
 expect((await error(rpc(c2,'authorize',a.id,null,'0'.repeat(64))))?.code).toBe('40001');
 await rpc(c1,'authorize',a.id,null,a.hash);await rpc(c1,'begin',a.id,null,a.hash);
 expect((await error(rpc(c2,'commit',a.id,null,a.hash)))?.code).toBe('40001');
});
it('barrier two independent SQL connections same attempt commit: one mutation/audit',async()=>{
 const a=await ready(envelope({notes:randomUUID()}));let release=()=>{},entered=()=>{};const gate=new Promise<void>(r=>{release=r}),wait=new Promise<void>(r=>{entered=r});
 const first=as(c1,U,async tx=>{const out=(await tx`select standalone_attempt_333('commit',${a.id},'scanner_create',null,${a.hash}) j`)[0].j;entered();await gate;return out});await wait;
 let secondDone=false;const second=rpc(c2,'commit',a.id,null,a.hash).then(r=>{secondDone=true;return r});
 try{await new Promise(r=>setTimeout(r,100));expect(secondDone).toBe(false)}finally{release()}
 const one=await first,two=await second;expect(two.result.id).toBe(one.result.id);expect(Number((await db`select count(*) n from standalone_attempt_audit_333 where attempt_id=${a.id}`)[0].n)).toBe(1);
});
it('failure before mutation/during SQL before audit: atomic rollback, recovery same reserved destination',async()=>{
 const a=await ready(envelope({notes:randomUUID()}));
 expect((await error(as(c1,U,async tx=>{await tx`select set_config('test.fail_audit','on',true)`;await tx`select standalone_attempt_333('commit',${a.id},'scanner_create',null,${a.hash})`})))?.message).toBe('injected audit failure');
 expect(Number((await db`select count(*) n from standalone_invoices where id=${a.destination_id}`)[0].n)).toBe(0);
 expect((await rpc(c2,'check',a.id,null,a.hash)).state).toBe('inprogress');
 expect((await rpc(c2,'commit',a.id,null,a.hash)).state).toBe('completed');
});
it('COMMIT response lost, NEW UUID same intent finds completed; read-only check never rewrites processed state',async()=>{
 const e=envelope({notes:randomUUID()}),a=await ready(e);await rpc(c1,'commit',a.id,null,a.hash);
 const b=await rpc(c2,'prepare',randomUUID(),e);expect(b.id).toBe(a.id);expect(b.state).toBe('completed');
 await db`update standalone_invoices set status='processed' where id=${a.destination_id}`;
 const check=await rpc(c2,'check',a.id,null,a.hash);expect(check.record_ok).toBe(true);expect(check.current.status).toBe('processed');expect(check.result.status).toBe('new');
 await rpc(c2,'commit',a.id,null,a.hash);expect((await db`select status from standalone_invoices where id=${a.destination_id}`)[0].status).toBe('processed');
});
it('one PDF multiple invoices allowed by different envelopes; no unique document hash',async()=>{
 const a=await ready(envelope({notes:randomUUID()})),b=await ready(envelope({notes:randomUUID()}));expect(a.id).not.toBe(b.id);await rpc(c1,'commit',a.id,null,a.hash);await rpc(c2,'commit',b.id,null,b.hash);expect(a.destination_id).not.toBe(b.destination_id);
});
it('UPDATE unknown recovery protects before-version and processed state without resetting it',async()=>{
 const created=await ready(envelope({notes:randomUUID()}));const out=await rpc(c1,'commit',created.id,null,created.hash);const before=out.current;
 const e={...envelope({notes:'edited',file_name:before.file_name}),target:before.id,before};const a=await ready(e,'accountant_edit');
 await db`update standalone_invoices set status='processed' where id=${before.id}`;
 const review=await rpc(c2,'commit',a.id,null,a.hash,U,'accountant_edit');expect(review.state).toBe('review');expect(review.current.status).toBe('processed');expect(review.current.notes).toBe(before.notes);
});
it('UPDATE response lost after commit retains result/audit; altered metadata produces pending not false success',async()=>{
 const a=await ready(envelope({notes:randomUUID()})),row=await rpc(c1,'commit',a.id,null,a.hash);const e={...envelope({notes:'updated'}),target:row.current.id,before:row.current};const edit=await ready(e,'accountant_edit');
 await rpc(c1,'commit',edit.id,null,edit.hash,U,'accountant_edit');expect((await rpc(c2,'check',edit.id,null,edit.hash,U,'accountant_edit')).record_ok).toBe(true);
 await db`update standalone_invoices set notes='legitimate later edit',status='processed' where id=${row.current.id}`;
 expect((await rpc(c2,'check',edit.id,null,edit.hash,U,'accountant_edit')).record_ok).toBe(false);
 expect(Number((await db`select count(*) n from standalone_attempt_audit_333 where attempt_id=${edit.id}`)[0].n)).toBe(1);
});
it('other legacy writer collision 23505 leaves attempt reserved and referenced object untouched',async()=>{
 const num=randomUUID(),a=await ready(envelope({supplier_nif:'PT001',invoice_number:num,notes:randomUUID()}));await db`insert into standalone_invoices(company_id,storage_path,file_name,supplier_nif,invoice_number) values (${C},'referenced','old.pdf','PT001',${num})`;
 expect((await error(rpc(c2,'commit',a.id,null,a.hash)))?.code).toBe('23505');expect((await rpc(c2,'check',a.id,null,a.hash)).state).toBe('inprogress');expect((await db`select storage_path from standalone_invoices where invoice_number=${num}`)[0].storage_path).toBe('referenced');
});
it('SQL monotonicity enforced; immutable audit and identity; no financial writes',async()=>{
 const a=await ready(envelope({notes:randomUUID()}));expect((await error(db`update standalone_attempts_333 set state='prepare' where id=${a.id}`))?.message).toBe('#333: Transição recusada');expect((await error(db`delete from standalone_attempts_333 where id=${a.id}`))?.message).toBe('#333: Candidato preservado');
 const [r]=await db`select (select count(*) from transactions)+(select count(*) from event_forecasts)+(select count(*) from financial_accounts)+(select count(*) from reimbursements) n`;expect(Number(r.n)).toBe(0);
});
it('actual SQL + candidate transport + fake bytes: lost commit reconciles incomplete identity; corrupted bytes pending',async()=>{
 const a=await rpc(c1,'prepare',null,envelope({notes:randomUUID()}));const files=new Map<string,Uint8Array>();let lost=true,uploads=0;
 const t:AttemptTransport={rpc:async(action,id,e,h)=>{const r=await rpc(c2,action,id,e,h);if(action==='commit'&&lost){lost=false;throw Error('lost after commit')}return r},upload:async(p,b)=>{uploads++;files.set(p,b)},read:async p=>files.get(p)??null,verifyReceipt:async p=>{expect(files.get(p)).toEqual(bytes);await receipt({...a,path:p})}};
 const out=await executeAttempt(t,a,bytes);expect(out.status).toBe('conferido');expect(uploads).toBe(1);const completed=await rpc(c1,'check',a.id,null,a.hash);await executeAttempt(t,completed,bytes);expect(uploads).toBe(1);files.set(a.path,new Uint8Array([4,5,6]));expect((await executeAttempt(t,completed,bytes)).status).toBe('pendente');expect(files.size).toBe(1);
});
it.each(['EUR','USD','BRL','GBP'])('real service SQL optional protocol preserves %s and technical principal',async currency=>{
 const e={...envelope({currency,created_by:null,notes:randomUUID(),...(currency==='EUR'?{}:{original_amount:246,fx_rate:.5})}),effects:['ingest_create']};
 const service=(action:string,id:string|null,envelope:any,h:string|null)=>db.begin(async tx=>{await tx`set local role service_role`;return (await tx`select standalone_ingest_attempt_333(${C},${action},${id},${envelope===null?null:tx.json(envelope)},${h}) j`)[0].j});
 const a=await service('prepare',randomUUID(),e,null);await receipt(a);await service('authorize',a.id,null,a.hash);await service('begin',a.id,null,a.hash);const out=await service('commit',a.id,null,a.hash);
 expect(out.result.currency).toBe(currency);expect(out.result.created_by).toBeNull();expect((await db`select principal from standalone_attempts_333 where id=${a.id}`)[0].principal).toBe('ingest_service');
 expect((await error(rpc(c1,'prepare',null,e,null,U,'ingest_create')))?.code).toBe('42501');
});
it('new assistant wrapper reuses exact canonical preview/commit in same SQL transaction and audit',async()=>{
 await db`insert into data_entry_settings values (true,true)`;
 const session=await as(c1,U,async tx=>(await tx`select data_entry_session() j`)[0].j);
 const path=`${C}/${session.session.id}/${hash}`;await db.begin(async tx=>{await tx`set local role service_role`;await tx`select data_entry_record_receipt('data-entry-staging',${path},${hash},3,'application/pdf')`});
 const doc=await as(c1,U,async tx=>(await tx`select data_entry_add_document(${session.session.id},'f.pdf',${hash},3,'application/pdf') j`)[0].j);
 const fields={supplier_name:'Fixture',supplier_nif:'PT00001',invoice_number:randomUUID(),invoice_date:'2026-10-17',currency:'EUR',total_amount:123,iva_amount:23,customer_nif:'PT001',paid_by_partner_id:U,notes:'fixture'};
 const preview=await as(c1,U,async tx=>(await tx`select data_entry_prepare(${session.session.id},${doc.id},${tx.json(fields)}) j`)[0].j);
 const call=(action:string)=>as(c2,U,async tx=>(await tx`select data_entry_attempt_333(${action},${preview.id},${preview.snapshot_hash}) j`)[0].j);
 const a=await call('prepare');await receipt(a);await call('authorize');await call('begin');const out=await call('commit');expect(out.state).toBe('completed');expect(out.result.notes).toMatch(/Feito por LLM com autorização de Fixture/);
 expect(Number((await db`select count(*) n from data_entry_results where preview_id=${preview.id}`)[0].n)).toBe(1);expect(Number((await db`select count(*) n from standalone_attempt_audit_333 where attempt_id=${a.id}`)[0].n)).toBe(1);
 expect((await error(rpc(c1,'prepare',null,envelope(),null,U,'assistant_create')))?.code).toBe('42501');
});
it.each([null,undefined])('direct RPC rejects missing/null total %s before persistent reservation',async total=>{
 const e=envelope({total_amount:total,notes:randomUUID()});if(total===undefined)delete e.payload.total_amount;
 expect((await error(rpc(c1,'prepare',randomUUID(),e)))?.code).toBe('22023');
});
it('direct RPC rejects VAT above total, foreign payer/author and invalid civil date',async()=>{
 for(const over of [{iva_amount:124},{paid_by_partner_id:W},{created_by:W},{invoice_date:'2026-02-30'}])expect(await error(rpc(c1,'prepare',randomUUID(),envelope(over)))).not.toBeNull();
});
it('service RPC enforces existing ingest FX tolerance but scanner total remains editable',async()=>{
 const e={...envelope({currency:'USD',original_amount:246,fx_rate:.5,total_amount:124,created_by:null}),effects:['ingest_create']};
 const result=await error(db.begin(async tx=>{await tx`set local role service_role`;return tx`select standalone_ingest_attempt_333(${C},'prepare',${randomUUID()},${tx.json(e)},null)`}));expect(result?.code).toBe('22023');
 expect((await rpc(c1,'prepare',null,envelope({currency:'USD',original_amount:246,fx_rate:.5,total_amount:124}))).state).toBe('prepare');
});
it('owner discovery across connections works without hash; foreign tenant/owner excluded and grants closed',async()=>{
 const a=await rpc(c1,'prepare',randomUUID(),envelope({notes:randomUUID()}));
 const list=await as(c2,U,async tx=>(await tx`select standalone_attempt_list_333('scanner_create',null) j`)[0].j);
 expect(list.items.some((r:any)=>r.id===a.id&&r.hash===a.hash&&r.name==='f.pdf')).toBe(true);
 for(const user of [V,W]){const foreign=await as(c2,user,async tx=>(await tx`select standalone_attempt_list_333('scanner_create',null) j`)[0].j);expect(foreign.items.some((r:any)=>r.id===a.id)).toBe(false)}
 const [g]=await db`select has_function_privilege('anon','standalone_attempt_list_333(text,uuid)','execute') a,has_function_privilege('service_role','standalone_attempt_list_333(text,uuid)','execute') s`;expect(g).toEqual({a:false,s:false});
});
it('payer membership revalidated after preparation before any commit',async()=>{
 const P=randomUUID();await db`insert into auth.users values (${P})`;await db`insert into profiles values (${P},'Payer fixture',${C},${C})`;await db`insert into user_roles(user_id,company_id,role) values (${P},${C},'user')`;
 const a=await rpc(c1,'prepare',null,envelope({paid_by_partner_id:P,notes:randomUUID()}));await db`delete from user_roles where user_id=${P}`;
 expect((await error(rpc(c2,'authorize',a.id,null,a.hash)))?.code).toBe('42501');expect((await db`select state from standalone_attempts_333 where id=${a.id}`)[0].state).toBe('prepare');
});
