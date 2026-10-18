/** LOCAL disposable PG only. Exact migrations and current Live SELECT audit body; no Cloud clients. */
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import postgres from 'postgres';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,copyFileSync,chmodSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {stageBundles73} from '../pilot8-preparation73/bundle73';
import {validate71} from '../pilot8/controller-checkpoint71';
vi.stubGlobal('fetch',()=>{throw Error('egress prohibited')});
const dir=mkdtempSync('/tmp/issue333-activation73-'),port=55473;
const pg=(cmd:string,args:string[])=>execFileSync('setpriv',['--reuid=1000','--regid=1000','--clear-groups',cmd,...args]);
let db:postgres.Sql;
const sql=readFileSync('docs/testes/issue333/pilot8-preparation73/activation.INERTE.sql','utf8');
// Credential-free reproducible CI fixture: NEW marker, same approved fictitious PDF.
const artifactDir=mkdtempSync('/tmp/issue333-manifest73-local-');
copyFileSync('docs/testes/issue333/pilot8/preflight56/evidence/pilot8-fiction.pdf',artifactDir+'/pilot8-fiction.pdf');chmodSync(artifactDir+'/pilot8-fiction.pdf',0o600);
const marker='issue333-pilot8-'+randomUUID().replaceAll('-','');
const manifest={marker,email:marker+'@fixture.invalid',reference:'FICTICIO-'+marker,company:'7c858982-6ccd-47ca-bd65-e0dd3eebf01c',full_name:'Membro Fictício Piloto8',sha256:'8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f',size:1517,mime:'application/pdf',pdf:artifactDir+'/pilot8-fiction.pdf'};
const sources='docs/testes/issue333/pilot8/preflight56/sources/';
const audit=readFileSync(sources+'log_table_change.live.sql','utf8');

const C=manifest.company;
async function make(){const u=randomUUID(),r=randomUUID(),a=randomUUID(),d=randomUUID();const [clock]=await db`select now() t`;const now=new Date(clock.t);const t=new Date(now.getTime()-30*60000);const p={company_id:C,owner_id:u,role_id:r,email:manifest.email,created_at:t.toISOString(),window_start:new Date(now.getTime()-60000).toISOString(),window_end:new Date(now.getTime()+540000).toISOString(),fixture_marker:manifest.marker,document_sha256:'8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f',document_size:'1517',document_mime:'application/pdf',invoice_number:manifest.reference,full_name:manifest.full_name};await db`insert into auth.users(id,email,created_at,email_confirmed_at,raw_user_meta_data) values(${u},${p.email},${p.created_at},${p.created_at},${db.json({fixture_marker:p.fixture_marker,company_id:C,full_name:p.full_name,pilot_pdf_sha256:p.document_sha256,pilot_pdf_size:1517,pilot_pdf_mime:p.document_mime})})`;await db`insert into profiles values(${u},${manifest.full_name},${C},null)`;await db`insert into user_roles(id,user_id,company_id,role) values(${r},${u},${C},'user')`;return p;}
function render(p:unknown){return sql.replace('__MANIFEST73_PARAMETERS__',JSON.stringify(p).replaceAll("'","''"))}
async function snap(){const o:Record<string,unknown>={};for(const t of ['data_entry_pilot8_allowlist','user_roles','profiles','standalone_attempts_333','standalone_attempt_audit_333','system_audit_log','standalone_invoices','data_entry_storage_receipts','data_entry_settings','standalone_attempt_settings_333','transactions','event_forecasts','financial_accounts','transaction_payments','reimbursement_notes','reimbursement_note_items','payment_lists'])o[t]=await db.unsafe(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]') j from public.${t} x`);return o;}
async function denied(p:unknown,template=sql){const before=await snap();let code='SUCCESS';try{await db.unsafe(render(p));}catch(e){code=(e as {code:string}).code;await db.unsafe('ROLLBACK');}expect(code).not.toBe('SUCCESS');expect(await snap()).toEqual(before);return code;}
beforeAll(async()=>{execFileSync('chown',['1000:1000',dir]);pg('initdb',['-D',dir+'/data','-U','postgres','--auth=trust','-E','UTF8','--no-locale']);pg('pg_ctl',['-D',dir+'/data','-w','-l',dir+'/log','-o',`-k ${dir} -p ${port} -c listen_addresses=''`,'start']);db=postgres({host:dir,port,user:'postgres',database:'postgres',max:1,onnotice:()=>{}});
let fixture=readFileSync('docs/testes/issue333/pg/fixture.sql','utf8').replace('CREATE TABLE auth.users(id uuid PRIMARY KEY);',`CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,created_at timestamptz,email_confirmed_at timestamptz,last_sign_in_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb); CREATE TABLE auth.sessions(id uuid primary key,user_id uuid); CREATE TABLE auth.refresh_tokens(user_id text);`).replace('id serial PRIMARY KEY, user_id','id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id');await db.unsafe(fixture);
for(const f of ['0190_issue333_core_v2_closed_structure.sql','0191_issue333_attempts_closed_structure.sql','0192_issue333_service_only_capability_reader.sql','0193_issue333_hash_check_validation_classification.sql'])await db.unsafe(readFileSync('drizzle/migrations/'+f,'utf8'));
await db.unsafe(readFileSync('docs/testes/issue333/pilot8/financial-schema58.LOCAL.sql','utf8'));
for(const f of ['auth_uid.live.sql','current_company_id.live.sql','set_company_id_on_insert.live.sql','system_audit_log.local-schema.sql'])await db.unsafe(readFileSync(sources+f,'utf8'));
await db.unsafe(`ALTER TABLE user_roles ALTER COLUMN company_id SET NOT NULL, ALTER COLUMN company_id SET DEFAULT current_company_id(); CREATE TRIGGER trg_set_company_id BEFORE INSERT ON user_roles FOR EACH ROW EXECUTE FUNCTION set_company_id_on_insert(); CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid primary key,bucket_id text,name text);`);await db.unsafe(audit);await db.unsafe('CREATE TRIGGER audit_user_roles_changes AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.log_table_change()');await db`insert into companies values(${C},'Synthetic','PT000','active')`;await db.unsafe(readFileSync('drizzle/migrations/0195_issue333_pilot8_scoped_closed_structure.sql','utf8'));
},60000);
afterAll(async()=>{await db?.end();pg('pg_ctl',['-D',dir+'/data','-m','immediate','stop'])});


async function clear(){await db`truncate data_entry_pilot8_allowlist`;await db`truncate standalone_attempt_settings_333`;}
it('prova73: identidade criada 30 min antes, revista, ativa na janela atual; 2 permissões 10 min; revogadas preservadas não bloqueiam',async()=>{
await clear();const old=await make();await db`insert into data_entry_pilot8_allowlist values(${old.owner_id},${C},'preparation',false,now(),'piloto59 revogada')`;
const p=await make();await db.unsafe(render(p));
expect((await db`select role from user_roles where id=${p.role_id}`)[0].role).toBe('manager');
const rows=await db`select *,extract(epoch from expires_at-clock_timestamp()) rem from data_entry_pilot8_allowlist where enabled`;
expect(rows).toHaveLength(2);for(const x of rows){expect(x.owner_id).toBe(p.owner_id);expect(Number(x.rem)).toBeGreaterThan(595);expect(Number(x.rem)).toBeLessThanOrEqual(600);}
expect((await db`select count(*)::int n from data_entry_pilot8_allowlist where not enabled`)[0].n).toBe(1);
expect((await db`select count(*)::int n from auth.sessions`)[0].n).toBe(0);await clear();});
it.each(['future-identity','created-swapped','owner-swapped','role-swapped','email-swapped','meta-swapped','company-swapped','signed-in','session','banned','invoice-exists','global-open','settings-open','active-allowlist','window-expired','window-future','window-over-10min','window-inverted'])('prova73 rejeita %s com rollback total',async k=>{
await clear();const p=await make(),w:Record<string,string>={...p};const [{t}]=await db`select clock_timestamp() t`;const now=new Date(t).getTime();
if(k==='future-identity'){await db`update auth.users set created_at=${new Date(now+5*60000)} where id=${p.owner_id}`;w.created_at=new Date(now+5*60000).toISOString();w.window_start=new Date(now-60000).toISOString();}
if(k==='created-swapped')w.created_at=new Date(new Date(p.created_at).getTime()-1).toISOString();
if(k==='owner-swapped')w.owner_id=randomUUID();if(k==='role-swapped')w.role_id=randomUUID();if(k==='email-swapped')w.email='issue333-pilot8-'+'0'.repeat(32)+'@fixture.invalid';
if(k==='meta-swapped')await db`update auth.users set raw_user_meta_data=raw_user_meta_data||'{"fixture_marker":"issue333-pilot8-00000000000000000000000000000000"}' where id=${p.owner_id}`;
if(k==='company-swapped')w.company_id=randomUUID();
if(k==='signed-in')await db`update auth.users set last_sign_in_at=now() where id=${p.owner_id}`;
if(k==='session')await db`insert into auth.sessions values(${randomUUID()},${p.owner_id})`;
if(k==='banned')await db`update auth.users set banned_until=now()+interval '1 day' where id=${p.owner_id}`;
if(k==='invoice-exists')await db.unsafe(`insert into standalone_invoices(company_id,invoice_number) values('${C}','${p.invoice_number}')`).catch(async()=>{await db.unsafe(`insert into data_entry_sessions(owner_id,company_id) values('${p.owner_id}','${C}')`)});
if(k==='global-open')await db`insert into standalone_attempt_settings_333(operation,enabled) values('assistant_create',true)`;
if(k==='settings-open')await db`update data_entry_settings set execute_validated=true`.then(async r=>{if(r.count===0)await db`insert into standalone_attempt_settings_333(operation,enabled) values('scanner_create',true)`});
if(k==='active-allowlist')await db`insert into data_entry_pilot8_allowlist values(${(await make()).owner_id},${C},'preparation',true,now()+interval '5 min','outra ativa')`;
if(k==='window-expired'){w.window_start=new Date(now-11*60000).toISOString();w.window_end=new Date(now-60000).toISOString();}
if(k==='window-future'){w.window_start=new Date(now+60000).toISOString();w.window_end=new Date(now+300000).toISOString();}
if(k==='window-over-10min'){w.window_start=new Date(now-60000).toISOString();w.window_end=new Date(now+600000).toISOString();}
if(k==='window-inverted'){w.window_start=new Date(now+60000).toISOString();w.window_end=new Date(now-60000).toISOString();}
await denied(w);await db`update data_entry_settings set execute_validated=false`;await clear();});
it('prova73 renderer real deriva manifesto novo e recusa retirada/drift/placeholder de template',()=>{
const run=(m:unknown)=>execFileSync('python3',['-c',`import importlib.util,json,sys; s=importlib.util.spec_from_file_location('r','docs/testes/issue333/pilot8-preparation73/render73.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r);print(r.render('activation',json.loads(sys.stdin.read())))`],{input:JSON.stringify(m),stdio:['pipe','pipe','pipe']}).toString();
const rendered=run(manifest);expect(rendered).toContain(manifest.marker);expect(rendered).toContain('PLACEHOLDER-UUID-OWNER');
for(const marker of ['issue333-pilot8-916bd3976502472ab18f39ea0adf7589','issue333-pilot8-11af044ae28127538fe8cc06be67541a','issue333-pilot8-'+'a'.repeat(64)])expect(()=>run({...manifest,marker,email:marker+'@fixture.invalid',reference:'FICTICIO-'+marker})).toThrow();
expect(()=>run({...manifest,sha256:'0'.repeat(64)})).toThrow();
});
it('source drift and disabled audit trigger roll back',async()=>{await clear();const p=await make();await db.unsafe(audit.replace('DECLARE','\nDECLARE'));try{expect(await denied(p)).toBe('55000')}finally{await db.unsafe(audit)}await db.unsafe('ALTER TABLE user_roles DISABLE TRIGGER audit_user_roles_changes');try{expect(await denied(p)).toBe('55000')}finally{await db.unsafe('ALTER TABLE user_roles ENABLE TRIGGER audit_user_roles_changes')}});
it('second insertion failure rolls back role/audit/both permissions',async()=>{await clear();const p=await make();await db.unsafe(`CREATE FUNCTION local_fail73() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='assistant_create' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$;CREATE TRIGGER local_fail73 BEFORE INSERT ON data_entry_pilot8_allowlist FOR EACH ROW EXECUTE FUNCTION local_fail73()`);try{await denied(p)}finally{await db.unsafe('DROP TRIGGER local_fail73 ON data_entry_pilot8_allowlist; DROP FUNCTION local_fail73()')}});
it('exclusive revoke after expiry retains two rows and rejects swapped identity with rollback',async()=>{await clear();const p=await make();await db.unsafe(render(p));await db`update data_entry_pilot8_allowlist set expires_at=clock_timestamp()-interval '1 second'`;const tpl=readFileSync('docs/testes/issue333/pilot8-preparation73/revoke.INERTE.sql','utf8');const rr=(v:unknown)=>tpl.replace('__MANIFEST73_PARAMETERS__',JSON.stringify(v).replaceAll("'","''"));const before=await snap();try{await db.unsafe(rr({...p,owner_id:randomUUID()}));throw Error('accepted')}catch(e){await db.unsafe('ROLLBACK');expect((e as {code:string}).code).toBe('42501')}expect(await snap()).toEqual(before);await db.unsafe(rr(p));expect((await db`select count(*)::int n from data_entry_pilot8_allowlist where not enabled`)[0].n).toBe(2);await clear();});
it.each(['full-name','pdf-sha','pdf-size','pdf-mime','refresh-token'])('reject metadata %s with rollback',async k=>{await clear();const p=await make();if(k==='refresh-token')await db`insert into auth.refresh_tokens values(${p.owner_id})`;else {const key={'full-name':'full_name','pdf-sha':'pilot_pdf_sha256','pdf-size':'pilot_pdf_size','pdf-mime':'pilot_pdf_mime'}[k];await db`update auth.users set raw_user_meta_data=raw_user_meta_data||${db.json({[String(key)]:'wrong'})} where id=${p.owner_id}`;}await denied(p);await db`truncate auth.refresh_tokens`;await clear();});
it('real manifest renderer executes in PG with reviewed OLD identity and CURRENT window',async()=>{await clear();const p=await make();const input={m:manifest,identity:{owner_id:p.owner_id,role_id:p.role_id,created_at:p.created_at},window:[p.window_start,p.window_end]};const rendered=execFileSync('python3',['-c',`import importlib.util,json,sys; s=importlib.util.spec_from_file_location('r','docs/testes/issue333/pilot8-preparation73/render73.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r);v=json.loads(sys.stdin.read());print(r.render('activation',v['m'],v['identity'],v['window']))`],{input:JSON.stringify(input)}).toString();expect(rendered).not.toContain('PLACEHOLDER');await db.unsafe(rendered);expect((await db`select count(*)::int n from data_entry_pilot8_allowlist where enabled`)[0].n).toBe(2);await clear();});
it('nine stage SELECTs parse/execute in local PG, strict schema accepts aggregate rows and no state changes',async()=>{await clear();const p=await make();const before=await snap();for(const c of stageBundles73(manifest,{owner_id:p.owner_id,role_id:p.role_id,created_at:p.created_at})){const rows=await db.unsafe(c.query);expect(rows).toHaveLength(1);validate71(rows[0],c.schema);}expect(await snap()).toEqual(before);});
