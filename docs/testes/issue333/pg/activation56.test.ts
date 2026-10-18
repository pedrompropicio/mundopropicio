/** LOCAL disposable PG only. Exact migrations and current Live SELECT audit body; no Cloud clients. */
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import postgres from 'postgres';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
vi.stubGlobal('fetch',()=>{throw Error('egress prohibited')});
const dir=mkdtempSync('/tmp/issue333-activation56-'),port=55456;
const pg=(cmd:string,args:string[])=>execFileSync('setpriv',['--reuid=1000','--regid=1000','--clear-groups',cmd,...args]);
let db:postgres.Sql;
const sql=readFileSync('docs/testes/issue333/pilot8/activation.INERTE.sql','utf8');
const sources='docs/testes/issue333/pilot8/preflight56/sources/';
const audit=readFileSync(sources+'log_table_change.live.sql','utf8');

const C=randomUUID();
async function make(){const u=randomUUID(),r=randomUUID(),a=randomUUID(),d=randomUUID();const [clock]=await db`select now() t`;const t=new Date(clock.t);const p={company_id:C,owner_id:u,role_id:r,email:`issue333-pilot8-${u.replaceAll('-','')}@fixture.invalid`,created_at:t.toISOString(),window_start:new Date(t.getTime()-60000).toISOString(),window_end:new Date(t.getTime()+600000).toISOString(),fixture_marker:`issue333-pilot8-${u.replaceAll('-','')}`,document_sha256:'8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f',document_size:'1517',document_mime:'application/pdf',invoice_number:`FICTICIO-issue333-pilot8-${u.replaceAll('-','')}`};await db`insert into auth.users(id,email,created_at,email_confirmed_at,raw_user_meta_data) values(${u},${p.email},${p.created_at},${p.created_at},${db.json({fixture_marker:p.fixture_marker,company_id:C})})`;await db`insert into profiles values(${u},'Synthetic',${C},null)`;await db`insert into user_roles(id,user_id,company_id,role) values(${r},${u},${C},'user')`;return p;}
function render(p:unknown){return sql.replace("'__PARAMETERS_JSON__'",`'${JSON.stringify(p).replaceAll("'","''")}'`)}
async function snap(){const o:Record<string,unknown>={};for(const t of ['data_entry_pilot8_allowlist','user_roles','profiles','standalone_attempts_333','standalone_attempt_audit_333','system_audit_log','standalone_invoices','data_entry_storage_receipts','data_entry_settings','standalone_attempt_settings_333'])o[t]=await db.unsafe(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]') j from public.${t} x`);return o;}
async function denied(p:unknown,template=sql){const before=await snap();let code='SUCCESS';try{await db.unsafe(template.replace("'__PARAMETERS_JSON__'",`'${JSON.stringify(p).replaceAll("'","''")}'`));}catch(e){code=(e as {code:string}).code;await db.unsafe('ROLLBACK');}expect(code).not.toBe('SUCCESS');expect(await snap()).toEqual(before);return code;}
beforeAll(async()=>{execFileSync('chown',['1000:1000',dir]);pg('initdb',['-D',dir+'/data','-U','postgres','--auth=trust','-E','UTF8','--no-locale']);pg('pg_ctl',['-D',dir+'/data','-w','-l',dir+'/log','-o',`-k ${dir} -p ${port} -c listen_addresses=''`,'start']);db=postgres({host:dir,port,user:'postgres',database:'postgres',max:1,onnotice:()=>{}});
let fixture=readFileSync('docs/testes/issue333/pg/fixture.sql','utf8').replace('CREATE TABLE auth.users(id uuid PRIMARY KEY);',`CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,created_at timestamptz,email_confirmed_at timestamptz,last_sign_in_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb); CREATE TABLE auth.sessions(id uuid primary key,user_id uuid);`).replace('id serial PRIMARY KEY, user_id','id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id');await db.unsafe(fixture);
for(const f of ['0190_issue333_core_v2_closed_structure.sql','0191_issue333_attempts_closed_structure.sql','0192_issue333_service_only_capability_reader.sql','0193_issue333_hash_check_validation_classification.sql'])await db.unsafe(readFileSync('drizzle/migrations/'+f,'utf8'));
for(const f of ['auth_uid.live.sql','current_company_id.live.sql','set_company_id_on_insert.live.sql','system_audit_log.local-schema.sql'])await db.unsafe(readFileSync(sources+f,'utf8'));
await db.unsafe(`ALTER TABLE user_roles ALTER COLUMN company_id SET NOT NULL, ALTER COLUMN company_id SET DEFAULT current_company_id(); CREATE TRIGGER trg_set_company_id BEFORE INSERT ON user_roles FOR EACH ROW EXECUTE FUNCTION set_company_id_on_insert(); CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid primary key,bucket_id text,name text);`);await db.unsafe(audit);await db.unsafe('CREATE TRIGGER audit_user_roles_changes AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.log_table_change()');await db`insert into companies values(${C},'Synthetic','PT000','active')`;await db.unsafe(readFileSync('drizzle/migrations/0195_issue333_pilot8_scoped_closed_structure.sql','utf8'));
},60000);
afterAll(async()=>{await db?.end();pg('pg_ctl',['-D',dir+'/data','-m','immediate','stop'])});

async function clearAllowlist(){await db`truncate data_entry_pilot8_allowlist`;}
it('exact Live sources and actual trigger definitions',async()=>{for(const [fn,h] of [['auth.uid()','cdef18c69c4f4cbbced2eaf81e628b49'],['current_company_id()','f857f027a44e858399e895d702af7ad0'],['log_table_change()','9509fe109550c9e0367fcbe4ffc661c5'],['set_company_id_on_insert()','949120b4d6c08f0c8707f63d28708d96']])expect((await db`select md5(prosrc) h from pg_proc where oid=${fn}::regprocedure`)[0].h).toBe(h)});
it('NULL active + canonical membership permits one user→manager audited update and exactly two ten-minute rows without login/profile change',async()=>{
const p=await make(),before=await db`select to_jsonb(x) j from profiles x where id=${p.owner_id}`;
await db.unsafe(render(p));expect((await db`select role from user_roles where id=${p.role_id}`)[0].role).toBe('manager');
expect(await db`select to_jsonb(x) j from profiles x where id=${p.owner_id}`).toEqual(before);
const rows=await db`select *,extract(epoch from expires_at-clock_timestamp()) remaining from data_entry_pilot8_allowlist`;
expect(rows).toHaveLength(2);expect(rows.map(x=>x.operation).sort()).toEqual(['assistant_create','preparation']);
for(const x of rows){expect(x.owner_id).toBe(p.owner_id);expect(x.company_id).toBe(C);expect(x.enabled).toBe(true);expect(Number(x.remaining)).toBeGreaterThan(595);expect(Number(x.remaining)).toBeLessThanOrEqual(600);}
expect((await db`select count(*)::int n from system_audit_log where entity_id=${p.role_id} and action='update'`)[0].n).toBe(1);
expect((await db`select count(*)::int n from auth.sessions`)[0].n).toBe(0);expect((await db`select auth.uid() u`)[0].u).toBeNull();
await denied(p);await clearAllowlist();});
it.each(['owner','company','roleid','marker','email','timestamp','expired','active-divergent','company-divergent','membership-divergent','second-membership','banned','signed-in','session','history','global','existing-allowlist'])('reject %s with complete rollback',async k=>{
await clearAllowlist();const p=await make(),wrong={...p};
if(k==='owner')wrong.owner_id=randomUUID();if(k==='company')wrong.company_id=randomUUID();if(k==='roleid')wrong.role_id=randomUUID();if(k==='marker')wrong.fixture_marker+='0';if(k==='email')wrong.email='wrong@fixture.invalid';if(k==='timestamp')wrong.created_at=new Date(0).toISOString();if(k==='expired')wrong.window_end=new Date(0).toISOString();
if(k==='active-divergent')await db`update profiles set active_company_id=${randomUUID()} where id=${p.owner_id}`;
if(k==='company-divergent')await db`update profiles set company_id=${randomUUID()} where id=${p.owner_id}`;
if(k==='membership-divergent')await db`update user_roles set company_id=${randomUUID()} where id=${p.role_id}`;
if(k==='second-membership')await db`insert into user_roles(user_id,company_id,role) values(${p.owner_id},${C},'viewer')`;
if(k==='banned')await db`update auth.users set banned_until=now()-interval '1 day' where id=${p.owner_id}`;
if(k==='signed-in')await db`update auth.users set last_sign_in_at=now() where id=${p.owner_id}`;
if(k==='session')await db`insert into auth.sessions values(${randomUUID()},${p.owner_id})`;
if(k==='history')await db`insert into data_entry_sessions(owner_id,company_id) values(${p.owner_id},${C})`;
if(k==='global')await db`insert into standalone_attempt_settings_333 values(true)`;
if(k==='existing-allowlist')await db`insert into data_entry_pilot8_allowlist values(${p.owner_id},${C},'preparation',false,now(),'past')`;
await denied(wrong);await db`truncate standalone_attempt_settings_333`;await clearAllowlist();});
it('second allowlist INSERT failure rolls role and real audit back',async()=>{const p=await make();await db.unsafe(`CREATE FUNCTION local_fail56() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='assistant_create' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$;CREATE TRIGGER local_fail56 BEFORE INSERT ON data_entry_pilot8_allowlist FOR EACH ROW EXECUTE FUNCTION local_fail56()`);try{await denied(p)}finally{await db.unsafe('DROP TRIGGER local_fail56 ON data_entry_pilot8_allowlist; DROP FUNCTION local_fail56()')}});
it('role ROW_COUNT0 refuses and audit remains untouched',async()=>{const p=await make();await db.unsafe(`CREATE FUNCTION local_skip56() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;CREATE TRIGGER local_skip56 BEFORE UPDATE ON user_roles FOR EACH ROW EXECUTE FUNCTION local_skip56()`);try{expect(await denied(p)).toBe('55000')}finally{await db.unsafe('DROP TRIGGER local_skip56 ON user_roles; DROP FUNCTION local_skip56()')}});
it('audit source drift and disabled real trigger refuse',async()=>{const p=await make();await db.unsafe(audit.replace('DECLARE','\nDECLARE'));try{expect(await denied(p)).toBe('55000')}finally{await db.unsafe(audit)}await db.unsafe('ALTER TABLE user_roles DISABLE TRIGGER audit_user_roles_changes');try{expect(await denied(p)).toBe('55000')}finally{await db.unsafe('ALTER TABLE user_roles ENABLE TRIGGER audit_user_roles_changes')}});
it('exclusive two-row revocation retains evidence and expired gate is false',async()=>{const p=await make();await db.unsafe(render(p));await db`update data_entry_pilot8_allowlist set expires_at=clock_timestamp()-interval '1 second'`;
await db`select set_config('request.jwt.claim.sub',${p.owner_id},false)`;try{expect((await db`select data_entry_pilot8_gate('preparation') b`)[0].b).toBe(false)}finally{await db`select set_config('request.jwt.claim.sub','',false)`}
const revoke=readFileSync('docs/testes/issue333/pilot8/revoke.INERTE.sql','utf8').replace("'__PARAMETERS_JSON__'",`'${JSON.stringify(p)}'`);await db.unsafe(revoke);expect((await db`select count(*)::int n from data_entry_pilot8_allowlist where not enabled`)[0].n).toBe(2);await clearAllowlist();});
