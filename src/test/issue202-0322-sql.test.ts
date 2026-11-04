// @vitest-environment node
// SQL runs only in disposable credential-free PGlite fixtures, never against a service.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationPath = "drizzle/migrations/0322_issue202_backup_global_invariants.sql";
const manualPath = "supabase/manual/0322_issue202_backup_global_invariants.sql";
const rollbackPath = "supabase/manual/rollback_0322_issue202_backup_global_invariants_comentado.sql";
const migration = readFileSync(migrationPath, "utf8");
const original = readFileSync("drizzle/migrations/0214_cache_payment_contracts.sql", "utf8");
const legacy = original.slice(original.indexOf("CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()"));
const signature = "RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)";
let db: PGlite;
let baselineDefinition: string;
const definition = async () => (await db.query<any>("SELECT pg_get_functiondef('public._run_invariant_checks_all()'::regprocedure) AS d")).rows[0].d;
const checks = async () => (await db.query<any>("SELECT * FROM public._run_invariant_checks_backup() ORDER BY name")).rows;
const check = async (name: string) => (await checks()).find((r) => r.name === name)!;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE public_probe;
    CREATE TABLE public.backup_runs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      run_date date DEFAULT current_date, scope text, status text, started_at timestamptz DEFAULT now(), finished_at timestamptz, folder_path text);
    CREATE TABLE public.system_invariants(name text PRIMARY KEY, description text, severity text, scope text, reference_count bigint, notes text);
    CREATE TABLE public.backup_excluded_tables(schema_name text, table_name text, reason text, PRIMARY KEY(schema_name,table_name));
    INSERT INTO public.system_invariants VALUES ('backup_tabelas_excluidas','exclusões','warn','global',2,'baseline');
    INSERT INTO public.backup_excluded_tables VALUES ('public','ticketline_sync_runs','legacy'),('public','portal_error_log','legacy');
  `);
  const functions = [...legacy.matchAll(/public\.(_run_invariant_checks_\w+)\(\)/g)].map((m) => m[1]).filter((n) => n !== "_run_invariant_checks_all");
  expect(functions).toHaveLength(22);
  for (const name of functions) await db.exec(`CREATE FUNCTION public.${name}() ${signature} LANGUAGE sql AS $$
    SELECT '${name}'::text,'stub'::text,'error'::text,'global'::text,0::bigint,0::bigint,true,NULL::text,NULL::jsonb $$`);
  await db.exec(legacy);
  await db.exec("REVOKE ALL ON FUNCTION public._run_invariant_checks_all() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public._run_invariant_checks_all() TO service_role");
  baselineDefinition = await definition();
  await db.exec(migration);
}, 30000);
afterAll(async () => { await db?.close(); });

describe.sequential("#202 0322 preparada — invariantes e rollback PGlite", () => {
  it("running global há 3 h vale 1 e há 1 h vale 0; company não interfere", async () => {
    await db.exec("INSERT INTO public.backup_runs(scope,status,started_at,folder_path) VALUES ('global','running',now()-interval '3 hours','global/stuck'), ('company','running',now()-interval '10 hours','company/old')");
    expect(await check("backup_global_running_2h")).toMatchObject({ current_count: 1, conforme: false, severity: "error", scope: "global", reference_count: 0, sample: [{ folder_path: "global/stuck" }] });
    expect(Object.keys((await check("backup_global_running_2h")).sample[0]).sort()).toEqual(["folder_path", "id", "run_date", "started_at"]);
    await db.exec("UPDATE public.backup_runs SET started_at=now()-interval '1 hour' WHERE scope='global'");
    expect(await check("backup_global_running_2h")).toMatchObject({ current_count: 0, conforme: true, sample: [] });
    await db.exec("UPDATE public.backup_runs SET started_at=now()-interval '2 hours' WHERE scope='global'");
    // Exactly at 2 h inside a single transaction is not greater than 2 h.
    await db.exec("BEGIN; UPDATE public.backup_runs SET started_at=now()-interval '2 hours' WHERE scope='global'");
    expect((await check("backup_global_running_2h")).current_count).toBe(0);
    await db.exec("COMMIT; DELETE FROM public.backup_runs");
  });
  it("sem ok/ok há 31 h vale 1, ok há 10 h vale 0; fronteira 30 h e scopes isolados", async () => {
    expect(await check("backup_global_sem_ok_30h")).toMatchObject({ current_count: 1, sample: { ultimo_ok: null } });
    await db.exec("INSERT INTO public.backup_runs(scope,status,finished_at,folder_path) VALUES ('global','ok',now()-interval '31 hours','global/old'),('company','ok',now(),'company/recent')");
    expect(await check("backup_global_sem_ok_30h")).toMatchObject({ current_count: 1, conforme: false, sample: { ultimo_ok: { folder_path: "global/old" } } });
    await db.exec("UPDATE public.backup_runs SET finished_at=now()-interval '10 hours' WHERE scope='global'");
    expect(await check("backup_global_sem_ok_30h")).toMatchObject({ current_count: 0, conforme: true });
    await db.exec("BEGIN; UPDATE public.backup_runs SET finished_at=now()-interval '30 hours' WHERE scope='global'");
    expect((await check("backup_global_sem_ok_30h")).current_count).toBe(1);
    await db.exec("COMMIT; DELETE FROM public.backup_runs");
  });
  it("conta todas as infratoras mas limita a amostra a 6", async () => {
    await db.exec("INSERT INTO public.backup_runs(scope,status,started_at,folder_path) SELECT 'global','running',now()-interval '3 hours','global/'||i FROM generate_series(1,8) i");
    const result = await check("backup_global_running_2h");
    expect(result.current_count).toBe(8); expect(result.sample).toHaveLength(6);
    await db.exec("DELETE FROM public.backup_runs");
  });
  it("exclusão documentada sobe referência 2→3, preservando as duas anteriores", async () => {
    expect((await db.query("SELECT reference_count FROM public.system_invariants WHERE name='backup_tabelas_excluidas'")).rows).toEqual([{ reference_count: 3 }]);
    const exclusions = (await db.query<any>("SELECT * FROM public.backup_excluded_tables ORDER BY table_name")).rows;
    expect(exclusions).toHaveLength(3);
    expect(exclusions.find((r) => r.table_name === "data_entry_gmail_pending").reason).toMatch(/nonce OAuth.*15 min.*ACL.*created_at.*42501/);
  });
  it("agregador acrescenta só a nova função e conserva os 22 stubs e a ACL anterior", async () => {
    const current = await definition();
    expect(current.match(/UNION ALL/g)).toHaveLength(22);
    expect(current.replace("  UNION ALL SELECT * FROM public._run_invariant_checks_backup()\n", "")).toBe(baselineDefinition);
    const results = (await db.query<any>("SELECT * FROM public._run_invariant_checks_all()")).rows;
    expect(results).toHaveLength(24);
    expect(results.filter((r) => r.description === "stub")).toHaveLength(22);
  });
  it("EXECUTE da função nova só para service_role; PUBLIC/anon/authenticated recusados", async () => {
    for (const name of ["_run_invariant_checks_backup", "_run_invariant_checks_all"]) {
      const permissions = (await db.query(`SELECT
        has_function_privilege('anon','public.${name}()','EXECUTE') a,
        has_function_privilege('authenticated','public.${name}()','EXECUTE') b,
        has_function_privilege('service_role','public.${name}()','EXECUTE') c,
        has_function_privilege('public_probe','public.${name}()','EXECUTE') d`)).rows;
      expect(permissions).toEqual([{ a: false, b: false, c: true, d: false }]);
    }
  });
  it("migração=manual byte a byte; rollback só comentários; prova só SELECT e limpeza comentada", () => {
    expect(readFileSync(migrationPath).equals(readFileSync(manualPath))).toBe(true);
    expect(migration).toContain("Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim");
    expect(migration).not.toMatch(/ALTER TABLE|backup_runs\s+(?:ADD|SET)|cron\.schedule/i);
    const rollback = readFileSync(rollbackPath, "utf8");
    expect(rollback.split(/\r?\n/).every((line) => !line.trim() || line.startsWith("--"))).toBe(true);
    const proof = readFileSync("docs/testes/issue202/prova-janela-202c.sql", "utf8");
    const active = proof.replace(/--[^\n]*/g, "");
    expect(active).not.toMatch(/\b(?:UPDATE|INSERT|DELETE|CREATE|ALTER|DROP|BEGIN|COMMIT|DO|CALL)\b/i);
    expect(active.split(";").filter((s) => s.trim()).every((s) => s.trim().startsWith("SELECT"))).toBe(true);
    expect(proof).toContain("-- UPDATE public.backup_runs");
  });
  it("rollback descomentado na fixture repõe corpo 0214, referências, exclusões e ACL", async () => {
    const rollback = readFileSync(rollbackPath, "utf8").split("\n").slice(2).map((line) => line.replace(/^-- ?/, "")).join("\n");
    await db.exec(rollback);
    expect(await definition()).toBe(baselineDefinition);
    expect((await db.query("SELECT to_regprocedure('public._run_invariant_checks_backup()') f")).rows).toEqual([{ f: null }]);
    expect((await db.query("SELECT name FROM public.system_invariants WHERE name LIKE 'backup_global_%'")).rows).toEqual([]);
    expect((await db.query("SELECT reference_count FROM public.system_invariants WHERE name='backup_tabelas_excluidas'")).rows).toEqual([{ reference_count: 2 }]);
    expect((await db.query("SELECT table_name FROM public.backup_excluded_tables ORDER BY table_name")).rows).toEqual([{ table_name: "portal_error_log" }, { table_name: "ticketline_sync_runs" }]);
    await db.exec(migration);
    expect((await db.query("SELECT reference_count FROM public.system_invariants WHERE name='backup_tabelas_excluidas'")).rows).toEqual([{ reference_count: 3 }]);
  });
  it("um _all divergente aborta atomicamente, incluindo troca com os mesmos 21 UNION ALL", async () => {
    for (const divergent of [legacy.replace("  UNION ALL SELECT * FROM public._run_invariant_checks_cache_contracts()", ""), legacy.replace("public._run_invariant_checks_paid()", "public._run_invariant_checks_raw()")]) {
      await db.exec(divergent);
      const before = await definition();
      await expect(db.exec(migration)).rejects.toThrow(/0322:.*divergente/);
      await db.exec("ROLLBACK");
      expect(await definition()).toBe(before);
    }
  });
});
