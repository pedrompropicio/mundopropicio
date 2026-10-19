/** Opt-in disposable PostgreSQL only; no Cloud, provider or ERP fixtures. */
import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";

let dir: string, db: postgres.Sql, started = false;
const pg = (cmd: string, args: string[]) => process.getuid?.() === 0
  ? execFileSync("setpriv", ["--reuid=1000", "--regid=1000", "--clear-groups", cmd, ...args], { stdio: "pipe" })
  : execFileSync(cmd, args, { stdio: "pipe" });
const tables = ["data_entry_analysis_control_333", "data_entry_analysis_audit_333"];
const writes = ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
const schema = () => readFileSync("supabase/manual/issue333_tarefa87_provider_control.INERTE.sql", "utf8");
const asRole = (role: string, sql: string) => db.begin(async tx => {
  await tx.unsafe(`set local role ${role}`); return tx.unsafe(sql);
});
const cleanup = () => db.unsafe("DROP FUNCTION IF EXISTS public.data_entry_analysis_transition_333(text,uuid,bigint,text,integer); DROP TABLE IF EXISTS public.data_entry_analysis_control_333; DROP TABLE IF EXISTS public.data_entry_analysis_audit_333;");
async function catalog() {
  return db`select c.relname,pg_get_userbyid(c.relowner) owner,c.relrowsecurity,
    (select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantee,a.privilege_type) from aclexplode(c.relacl) a) acl
    from pg_class c where c.oid in ('public.data_entry_analysis_control_333'::regclass,'public.data_entry_analysis_audit_333'::regclass) order by c.relname`;
}
beforeAll(async () => {
  if (process.env.ISSUE333_LOCAL_PROOF !== "1") throw Error("Requires ISSUE333_LOCAL_PROOF=1, no silent skip");
  dir=mkdtempSync(path.join(tmpdir(),"acl88-"));
  if(process.getuid?.()===0)execFileSync("chown",["1000:1000",dir]);
  pg("initdb",["-D",path.join(dir,"data"),"-U","postgres","--auth=trust","-E","UTF8","--no-locale"]);
  pg("pg_ctl",["-D",path.join(dir,"data"),"-w","-l",path.join(dir,"log"),"-o",`-k ${dir} -p 55488 -c listen_addresses=''`,"start"]); started=true;
  db=postgres({host:dir,port:55488,user:"postgres",database:"postgres",max:1,onnotice:()=>{}});
  await db.unsafe("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE public_probe; CREATE ROLE service_role BYPASSRLS INHERIT; CREATE ROLE inherited_writer; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role,public_probe; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;");
});
afterAll(async()=>{await db?.end();if(dir){try{if(started)pg("pg_ctl",["-D",path.join(dir,"data"),"-m","immediate","stop"]);}finally{rmSync(dir,{recursive:true,force:true});}}});
beforeEach(async()=>{await cleanup();await db.unsafe(schema());});

it("88 catalog rejects service_role writes inherited from creator default ALL",async()=>{
  console.log("CATALOG88",JSON.stringify(await catalog()));
  const [role]=await db`select rolsuper,rolbypassrls from pg_roles where rolname='service_role'`;
  expect(role.rolsuper).toBe(false);expect(role.rolbypassrls).toBe(true);
  for(const table of tables){
    const [r]=await db`select has_table_privilege('service_role',${'public.'+table},'SELECT') rd`;
    expect(r.rd).toBe(true);
    for(const privilege of writes){const [r]=await db`select has_table_privilege('service_role',${'public.'+table},${privilege}) allowed`;expect(r.allowed,table+':'+privilege).toBe(false);}
  }
});
it("88 actual DML/TRUNCATE/reopen/audit delete denied; legitimate SELECT/RPC works",async()=>{
  for(const table of tables){
    for(const sql of [`INSERT INTO public.${table} SELECT * FROM public.${table} WHERE false`,`UPDATE public.${table} SET revision=revision`,`DELETE FROM public.${table}`,`TRUNCATE public.${table}`])
      await expect(asRole("service_role",sql)).rejects.toMatchObject({code:"42501"});
  }
  await expect(asRole("service_role","UPDATE public.data_entry_analysis_control_333 SET state='ready',enabled=true,reviewed=true")).rejects.toMatchObject({code:"42501"});
  expect((await asRole("service_role","SELECT * FROM public.data_entry_analysis_audit_333"))).toHaveLength(1);
  const [read]=await asRole("service_role","SELECT public.data_entry_analysis_transition_333('read') j");expect(read.j.state).toBe("closed");
  await asRole("service_role","SELECT public.data_entry_analysis_transition_333('pause',NULL,1,'provider_denied',403)");
  const [paused]=await asRole("service_role","SELECT public.data_entry_analysis_transition_333('read') j");expect(paused.j.state).toBe("denied_provider");expect(paused.j.revision).toBe("2");
  expect((await asRole("service_role","SELECT * FROM public.data_entry_analysis_audit_333"))).toHaveLength(2);
});
it("88 anon/authenticated/PUBLIC have no table or function rights; catalog owner/searchpath",async()=>{
  for(const role of ["anon","authenticated","public_probe"]){
    for(const table of tables){for(const privilege of ["SELECT",...writes]){const [r]=await db`select has_table_privilege(${role},${'public.'+table},${privilege}) allowed`;expect(r.allowed).toBe(false);}
      await expect(asRole(role,`SELECT * FROM public.${table}`)).rejects.toMatchObject({code:"42501"});}
    await expect(asRole(role,"SELECT public.data_entry_analysis_transition_333('read')")).rejects.toMatchObject({code:"42501"});
  }
  const [p]=await db`select p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,p.proacl::text acl from pg_proc p where p.oid='public.data_entry_analysis_transition_333(text,uuid,bigint,text,integer)'::regprocedure`;
  console.log("FUNCTION88",JSON.stringify(p));expect(p.owner).toBe("postgres");expect(p.prosecdef).toBe(true);expect(p.proconfig).toEqual(["search_path=pg_catalog, public"]);
  expect((await catalog()).every(r=>r.owner==="postgres"&&r.relrowsecurity)).toBe(true);
  const [members]=await db`select count(*)::int n from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname='service_role'`;expect(members.n).toBe(0);
});
it("88 inherited write grants remain effective: guard must reject rather than claim REVOKE removes inheritance",async()=>{
  await cleanup();await db.unsafe("GRANT inherited_writer TO service_role; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT UPDATE ON TABLES TO inherited_writer;");
  try {await expect(db.unsafe(schema())).rejects.toThrow("analysis_control_acl");await db`rollback`;
    const [r]=await db`select to_regclass('public.data_entry_analysis_control_333') obj`;expect(r.obj).toBeNull();
  }finally{await db.unsafe("REVOKE inherited_writer FROM service_role; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE UPDATE ON TABLES FROM inherited_writer;");}
});
it("88 rollback retains audit bytes and appends closed revision; RPC/control removed",async()=>{
  const before=await db`select * from public.data_entry_analysis_audit_333 order by revision`;
  await db.unsafe(readFileSync("supabase/manual/issue333_tarefa87_provider_control.ROLLBACK-INERTE.sql","utf8"));
  const rows=await db`select * from public.data_entry_analysis_audit_333 order by revision`;
  expect(rows.slice(0,before.length)).toEqual(before);expect(rows).toHaveLength(before.length+1);expect(rows.at(-1)?.reason_code).toBe("closed");
  const [r]=await db`select to_regclass('public.data_entry_analysis_control_333') control,to_regprocedure('public.data_entry_analysis_transition_333(text,uuid,bigint,text,integer)') fn`;
  expect(r.control).toBeNull();expect(r.fn).toBeNull();
  await expect(asRole("service_role","DELETE FROM public.data_entry_analysis_audit_333")).rejects.toMatchObject({code:"42501"});
});