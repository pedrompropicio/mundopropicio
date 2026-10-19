/** Real local PostgreSQL, independent connections; no Cloud, auth accounts, files in ERP or network egress. */
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { durableProviderControl, rpcControlStore } from "../../../../supabase/functions/_shared/issue333-ai/control";

let dir: string, db: postgres.Sql, c1: postgres.Sql, c2: postgres.Sql;
const pg = (cmd: string, args: string[]) => process.getuid?.() === 0 ? execFileSync("setpriv", ["--reuid=65534", "--regid=65534", "--clear-groups", cmd, ...args], { stdio: "pipe" }) : execFileSync(cmd, args, { stdio: "pipe" });
const connect = () => postgres({ host: dir, port: 55487, user: "postgres", database: "postgres", max: 1, onnotice: () => {} });
const call = (conn: postgres.Sql, operation: string, claim: string | null = null, revision: string | null = null, outcome: string | null = null, status: number | null = null) => conn.begin(async (tx) => {
  await tx`set local role service_role`;
  const [r] = await tx`select public.data_entry_analysis_transition_333(${operation},${claim}::uuid,${revision}::bigint,${outcome},${status}) j`;
  if (!r) throw Error("missing result"); return r.j;
});
const adapter = (conn: postgres.Sql) => durableProviderControl(rpcControlStore(async (_name, a) => ({ data: await call(conn, String(a.p_operation), a.p_claim as string | null, a.p_revision as string | null, a.p_outcome as string | null, a.p_status as number | null), error: null })));
beforeAll(async () => {
  if (process.env.ISSUE333_LOCAL_PROOF !== "1") throw Error("Requires explicit ISSUE333_LOCAL_PROOF=1; never silently skip PostgreSQL proof");
  dir = mkdtempSync(path.join(tmpdir(), "provider87-"));
  if (process.getuid?.() === 0) execFileSync("chown", ["65534:65534", dir]);
  pg("initdb", ["-D", path.join(dir, "data"), "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-locale"]);
  pg("pg_ctl", ["-D", path.join(dir, "data"), "-w", "-l", path.join(dir, "log"), "-o", `-k ${dir} -p 55487 -c listen_addresses=''`, "start"]);
  db = connect(); c1 = connect(); c2 = connect();
  await db.unsafe("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;");
  await db.unsafe(readFileSync("supabase/manual/issue333_tarefa87_provider_control.INERTE.sql", "utf8"));
});
afterAll(async () => {
  await Promise.all([db?.end(), c1?.end(), c2?.end()]);
  if (dir) { try { pg("pg_ctl", ["-D", path.join(dir, "data"), "-m", "immediate", "stop"]); } finally { rmSync(dir, { recursive: true, force: true }); } }
});
beforeEach(async () => {
  // Disposable test setup only. No production reopening operation is provided.
  await db`delete from public.data_entry_analysis_audit_333`;
  await db`update public.data_entry_analysis_control_333 set revision=1,state='ready',enabled=true,reviewed=true,active_claim=null,stage='idle',reason_code='none',upstream_status=null`;
});
describe("task87 PostgreSQL disposable two-connection authority", () => {
  it("independent backend PIDs and one atomic global claim winner", async () => {
    const [p1] = await c1`select pg_backend_pid() pid`; const [p2] = await c2`select pg_backend_pid() pid`; expect(p1.pid).not.toBe(p2.pid);
    const results = await Promise.allSettled([call(c1,"claim",randomUUID(),"1"),call(c2,"claim",randomUUID(),"1")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await call(db,"read")).revision).toBe("2");
  });
  it("closed defaults deny; absent singleton also denies", async () => {
    await db`update public.data_entry_analysis_control_333 set state='closed',enabled=false,reviewed=false`;
    const execute = async () => { throw Error("must not execute"); };
    await expect(adapter(c1).run(new AbortController().signal, async () => {}, execute)).rejects.toMatchObject({ status:503 });
    await db`delete from public.data_entry_analysis_control_333`;
    await expect(call(c1,"read")).rejects.toMatchObject({ code:"42501" });
    await db`insert into public.data_entry_analysis_control_333(singleton) values(true)`;
    const row = await call(c1,"read"); expect(row.enabled).toBe(false); expect(row.reviewed).toBe(false); expect(row.state).toBe("closed");
  });
  it("pause fences late finish and preserves active claim", async () => {
    const id=randomUUID(); await call(c1,"claim",id,"1"); await call(c1,"post",id,"2");
    await call(c2,"pause",id,"3","provider_denied",403);
    await expect(call(c1,"finish",id,"3","success",200)).rejects.toMatchObject({code:"40001"});
    const row=await call(c2,"read"); expect(row.state).toBe("denied_provider"); expect(row.claim).toBe(id); expect(row.revision).toBe("4");
  });
  it.each([[402,"paused_credit","credit_denied"],[403,"denied_provider","provider_denied"],[404,"unavailable","provider_unavailable"]])("HTTP%s global pause survives a different connection",async (status,state,outcome)=>{
    const id=randomUUID();await call(c1,"claim",id,"1");await call(c1,"post",id,"2");await call(c1,"finish",id,"3",String(outcome),Number(status));
    expect((await call(c2,"read")).state).toBe(state);await expect(call(c2,"claim",randomUUID(),"4")).rejects.toMatchObject({code:"42501"});
  });
  it("HTTP200 refusal affects only request and next claim is allowed",async()=>{
    const id=randomUUID();await call(c1,"claim",id,"1");await call(c1,"post",id,"2");await call(c1,"finish",id,"3","request_refused",200);
    const row=await call(c2,"claim",randomUUID(),"4");expect(row.state).toBe("ready");expect(row.stage).toBe("claimed");
  });
  it.each(["cancelled_after_post","transport_uncertain"])("%s preserves uncertain claim indefinitely",async(outcome)=>{
    const id=randomUUID();await call(c1,"claim",id,"1");await call(c1,"post",id,"2");await call(c1,"finish",id,"3",outcome);
    await db`update public.data_entry_analysis_control_333 set changed_at='2000-01-01'`;
    const row=await call(c2,"read");expect(row.stage).toBe("uncertain");expect(row.claim).toBe(id);await expect(call(c2,"claim",randomUUID(),"4")).rejects.toMatchObject({code:"42501"});
  });
  it("crash after claimed or POST never lease-releases",async()=>{
    const id=randomUUID();await call(c1,"claim",id,"1");await c1.end();c1=connect();
    await expect(call(c2,"claim",randomUUID(),"2")).rejects.toMatchObject({code:"42501"});
    await call(c1,"post",id,"2");await c1.end();c1=connect();expect((await call(c1,"read")).claim).toBe(id);
  });
  it("before POST cancellation releases exact claim, late/wrong finalization denied",async()=>{
    const id=randomUUID();await call(c1,"claim",id,"1");await expect(call(c2,"finish",randomUUID(),"2","cancelled_before_post")).rejects.toMatchObject({code:"42501"});
    await call(c1,"finish",id,"2","cancelled_before_post");await call(c2,"claim",randomUUID(),"3");await expect(call(c1,"finish",id,"2","success",200)).rejects.toMatchObject({code:"40001"});
  });
  it("invalid public codes cannot store arbitrary error body",async()=>{
    const id=randomUUID();await call(c1,"claim",id,"1");await expect(call(c1,"finish",id,"2","private-body-token",403)).rejects.toMatchObject({code:"22023"});
    await expect(call(c1,"finish",id,"2","credit_denied",403)).rejects.toMatchObject({code:"22023"});
    expect((await call(c2,"read")).revision).toBe("2");
  });
  it("service only RPC, no table writes, RLS/search_path/owner verified",async()=>{
    for(const role of ["anon","authenticated"]){
      const [r]=await db`select has_function_privilege(${role},'public.data_entry_analysis_transition_333(text,uuid,bigint,text,integer)','EXECUTE') fn,has_table_privilege(${role},'public.data_entry_analysis_control_333','SELECT') rd`;expect(r.fn).toBe(false);expect(r.rd).toBe(false);
      await expect(c2.begin(async(tx)=>{await tx.unsafe(`set local role ${role}`);await tx`select public.data_entry_analysis_transition_333('read')`;})).rejects.toMatchObject({code:"42501"});
    }
    const [r]=await db`select has_function_privilege('service_role','public.data_entry_analysis_transition_333(text,uuid,bigint,text,integer)','EXECUTE') fn,has_table_privilege('service_role','public.data_entry_analysis_control_333','UPDATE') wr`;expect(r.fn).toBe(true);expect(r.wr).toBe(false);
    const [p]=await db`select p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner from pg_proc p where p.oid='public.data_entry_analysis_transition_333(text,uuid,bigint,text,integer)'::regprocedure`;expect(p.prosecdef).toBe(true);expect(p.owner).toBe("postgres");expect(p.proconfig).toEqual(["search_path=pg_catalog, public"]);
    const rows=await db`select relrowsecurity,pg_get_userbyid(relowner) owner from pg_class where oid in ('public.data_entry_analysis_control_333'::regclass,'public.data_entry_analysis_audit_333'::regclass)`;expect(rows.every(r=>r.relrowsecurity&&r.owner==="postgres")).toBe(true);
  });
  it("real adapter revalidates tenant context and discards output",async()=>{
    let tenant="A";
    await expect(adapter(c1).run(new AbortController().signal,async()=>{if(tenant!=="A")throw Error("context_changed");},async(t)=>{await t.beforePost();t.received(200);tenant="B";return "stale";})).rejects.toThrow("context_changed");
    expect((await call(c2,"read")).state).toBe("ready");expect((await call(c2,"read")).claim).toBeNull();
  });
  it("rollback refuses outstanding claim and removes only new objects after known completion",async()=>{
    const rollback=readFileSync("supabase/manual/issue333_tarefa87_provider_control.ROLLBACK-INERTE.sql","utf8");
    const id=randomUUID();await call(c1,"claim",id,"1");await expect(db.unsafe(rollback)).rejects.toThrow("confer_claim_before_rollback");await db`rollback`;
    await call(c1,"finish",id,"2","before_post_failure");await db.unsafe(rollback);
    const [r]=await db`select to_regclass('public.data_entry_analysis_control_333') obj`;expect(r.obj).toBeNull();
    await db.unsafe(readFileSync("supabase/manual/issue333_tarefa87_provider_control.INERTE.sql","utf8"));
  });
});