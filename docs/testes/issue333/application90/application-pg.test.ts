/** Opt-in disposable PostgreSQL: task90 actual hosted-default compatibility defect only. */
import {beforeAll,afterAll,it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
let dir:string,db:postgres.Sql,started=false;
const pg=(cmd:string,args:string[])=>process.getuid?.()===0?execFileSync('setpriv',['--reuid=1000','--regid=1000','--clear-groups',cmd,...args],{stdio:'pipe'}):execFileSync(cmd,args,{stdio:'pipe'});
const schema=readFileSync('supabase/manual/issue333_tarefa90_application.INERTE.sql','utf8');
const hash='a'.repeat(64),claim='11111111-1111-4111-8111-111111111111';
const role=(name:string,sql:string)=>db.begin(async tx=>{await tx.unsafe(`SET LOCAL ROLE ${name}`);return tx.unsafe(sql);});
const responsible=(action:string,revision:string,id:string|null)=>db`SELECT public.data_entry_analysis_responsible_333(${action},${revision}::bigint,${id}::uuid,${hash}) j`;
beforeAll(async()=>{
 if(process.env.ISSUE333_LOCAL_PROOF!=='1')throw Error('Requires ISSUE333_LOCAL_PROOF=1');
 dir=mkdtempSync(path.join(tmpdir(),'application90-'));
 if(process.getuid?.()===0)execFileSync('chown',['1000:1000',dir]);
 pg('initdb',['-D',path.join(dir,'data'),'-U','local_admin','--auth=trust','-E','UTF8','--no-locale']);
 pg('pg_ctl',['-D',path.join(dir,'data'),'-w','-l',path.join(dir,'log'),'-o',`-k ${dir} -p 55490 -c listen_addresses=''`,'start']);started=true;
 const setup=postgres({host:dir,port:55490,user:'local_admin',database:'postgres',max:1,onnotice:()=>{}});
 await setup.unsafe(`CREATE ROLE postgres LOGIN CREATEROLE BYPASSRLS INHERIT; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE sandbox_exec; CREATE ROLE sandbox_project; GRANT sandbox_exec,sandbox_project,anon,authenticated,service_role,pg_read_all_data TO postgres; GRANT CREATE,USAGE ON SCHEMA public TO postgres; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role,sandbox_exec,sandbox_project; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO sandbox_exec,sandbox_project; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated,service_role,sandbox_project;`);
 await setup.end();db=postgres({host:dir,port:55490,user:'postgres',database:'postgres',max:2,onnotice:()=>{}});
});
afterAll(async()=>{await db?.end();if(dir){try{if(started)pg('pg_ctl',['-D',path.join(dir,'data'),'-m','immediate','stop']);}finally{rmSync(dir,{recursive:true,force:true});}}});
it('90 reproduces reviewed88 abort under actual technical defaults, then90 applies without global changes',async()=>{
 const defaults=await db`SELECT defaclobjtype,defaclacl::text acl FROM pg_default_acl WHERE defaclrole='postgres'::regrole ORDER BY defaclobjtype`;
 await expect(db.unsafe(readFileSync('supabase/manual/issue333_tarefa87_provider_control.INERTE.sql','utf8'))).rejects.toThrow('analysis_control_acl_catalog');await db`ROLLBACK`;
 await db.unsafe(schema);
 expect(await db`SELECT defaclobjtype,defaclacl::text acl FROM pg_default_acl WHERE defaclrole='postgres'::regrole ORDER BY defaclobjtype`).toEqual(defaults);
 const [r]=await db`SELECT rolsuper FROM pg_roles WHERE rolname='postgres'`;expect(r.rolsuper).toBe(false);
 console.log('90_HOSTED_DEFAULTS_COMPATIBLE_NON_SUPER_OWNER',JSON.stringify(defaults));
});
it('90 minimal ACLs: technical/anon/user no rights, service SELECT/transition only; owner-only responsible',async()=>{
 for(const name of ['anon','authenticated','sandbox_exec','sandbox_project','service_role']){
  for(const table of ['data_entry_analysis_control_333','data_entry_analysis_audit_333']){
   for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']){
    const [r]=await db`SELECT has_table_privilege(${name},${'public.'+table},${privilege}) ok`;expect(r.ok).toBe(name==='service_role'&&privilege==='SELECT');
   }
  }
  await expect(role(name,`SELECT public.data_entry_analysis_responsible_333('reopen',1,NULL,'${hash}')`)).rejects.toMatchObject({code:'42501'});
 }
 const [read]=await role('service_role',"SELECT public.data_entry_analysis_transition_333('read') j");expect(read.j.state).toBe('closed');expect(read.j.reviewed).toBe(false);
 console.log('90_CATALOG',JSON.stringify(await db`SELECT relname,relacl::text acl,relrowsecurity FROM pg_class WHERE relname IN ('data_entry_analysis_control_333','data_entry_analysis_audit_333')`));
});
it('90 owner explicit review/hash/revision; close preserves claim and late finish is fenced',async()=>{
 await expect(db`SELECT public.data_entry_analysis_responsible_333('reopen',1,NULL,'prompt or document')`).rejects.toMatchObject({code:'22023'});
 const [opened]=await responsible('reopen','1',null);expect(opened.j.state).toBe('ready');expect(opened.j.revision).toBe('2');
 await role('service_role',`SELECT public.data_entry_analysis_transition_333('claim','${claim}',2)`);
 await role('service_role',`SELECT public.data_entry_analysis_transition_333('post','${claim}',3)`);
 const [closed]=await responsible('close','4',claim);expect(closed.j.claim).toBe(claim);expect(closed.j.state).toBe('closed');
 await expect(role('service_role',`SELECT public.data_entry_analysis_transition_333('finish','${claim}',4,'success',200)`)).rejects.toMatchObject({code:'40001'});
 await expect(responsible('reopen','5',claim)).rejects.toMatchObject({code:'42501'});
 await expect(responsible('confer','5',null)).rejects.toMatchObject({code:'42501'});
 const [conferred]=await responsible('confer','5',claim);expect(conferred.j.state).toBe('closed');expect(conferred.j.claim).toBeNull();
 const [audit]=await db`SELECT admin_action,review_sha256,claim FROM public.data_entry_analysis_audit_333 WHERE revision=6`;expect(audit.admin_action).toBe('confer');expect(audit.claim).toBe(claim);expect(audit.review_sha256).toBe(hash);
 await expect(responsible('reopen','5',null)).rejects.toMatchObject({code:'40001'});
 const [again]=await responsible('reopen','6',null);expect(again.j.state).toBe('ready');
});
it('90 responsible concurrent revisions permit one action, preserve audit on rollback',async()=>{
 const results=await Promise.allSettled([responsible('close','7',null),responsible('close','7',null)]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
 const before=await db`SELECT * FROM public.data_entry_analysis_audit_333 ORDER BY revision`;
 await db.unsafe(readFileSync('supabase/manual/issue333_tarefa90_application.ROLLBACK-INERTE.sql','utf8'));
 const after=await db`SELECT * FROM public.data_entry_analysis_audit_333 ORDER BY revision`;
 expect(after.slice(0,before.length)).toEqual(before);expect(after).toHaveLength(before.length+1);
 const [r]=await db`SELECT to_regprocedure('public.data_entry_analysis_responsible_333(text,bigint,uuid,text)') f`;expect(r.f).toBeNull();
 await expect(role('service_role','DELETE FROM public.data_entry_analysis_audit_333')).rejects.toMatchObject({code:'42501'});
});
