// @vitest-environment node
// SQL is executed only in this disposable, credential-free in-memory PGlite fixture.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationPath = "drizzle/migrations/0310_issue202_backup_offsite_r2.sql";
const manualPath = "supabase/manual/0310_issue202_backup_offsite_r2.sql";
const rollbackPath = "supabase/manual/rollback_0310_issue202_backup_offsite_r2_comentado.sql";
const cronPath = "supabase/manual/20261103_issue202_cron_backup_offsite_r2.PROPOSTA.sql";
const legacy = readFileSync("drizzle/migrations/0065_derp217_fix_storage_invariant_ambiguous.sql", "utf8");
const migration = readFileSync(migrationPath, "utf8");
let db: PGlite;
let before: unknown[];
const checks = async () => (await db.query<any>("SELECT * FROM public._run_invariant_checks_storage() ORDER BY name")).rows;
const offsite = async () => (await checks()).find((r) => r.name === "backup_offsite_em_falta")!;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY);
    CREATE TABLE storage.objects(id text, bucket_id text, name text);
    CREATE TABLE public.backup_runs(
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, run_date date DEFAULT current_date,
      scope text, status text, error_text text, started_at timestamptz DEFAULT now(),
      finished_at timestamptz, storage_report jsonb,
      CONSTRAINT backup_runs_scope_check CHECK (scope = ANY (ARRAY['company','global','restore','restore_test']))
    );
    CREATE TABLE public.system_invariants(
      name text PRIMARY KEY, description text, severity text, scope text, reference_count bigint, notes text
    );
    CREATE TABLE public.camarim_item_documents(id text, file_path text);
    CREATE TABLE public.payment_list_documents(id text, file_url text);
    CREATE TABLE public.card_item_documents(id text, file_path text);
    CREATE TABLE public.event_forecast_attachments(id text, storage_path text);
    CREATE TABLE public.bank_line_documents(id text, file_url text);
    CREATE TABLE public.event_ab_attachments(id text, storage_path text);
    INSERT INTO public.system_invariants VALUES
      ('documento_sem_ficheiro_por_tabela','docs','error','global',11,'legacy docs'),
      ('backup_manifesto_cobre_todos_os_buckets','manifesto','error','global',0,'legacy manifesto');
    INSERT INTO storage.buckets VALUES ('database-backups'), ('camarim-documents'), ('card-documents');
    INSERT INTO public.camarim_item_documents VALUES ('a','missing.pdf'), ('b','exists.pdf'), ('c','ref://legacy'), ('d','https://example.test/doc');
    INSERT INTO public.card_item_documents VALUES ('e','missing-card.pdf');
    INSERT INTO storage.objects VALUES ('1','camarim-documents','exists.pdf');
    INSERT INTO public.backup_runs(scope,status,finished_at,storage_report) VALUES ('global','ok',now(),'{"camarim-documents":{}}');
  `);
  await db.exec(legacy);
  before = await checks();
  await db.exec(migration);
}, 30000);
afterAll(async () => { await db?.close(); });

describe.sequential("#202 0310 preparada — PGlite sem serviços externos", () => {
  it("aplica e aceita offsite, recusa scope desconhecido e cria offsite_report jsonb", async () => {
    await db.exec("INSERT INTO public.backup_runs(scope,status,offsite_report) VALUES ('offsite','running','{\"files\":{}}')");
    await expect(db.exec("INSERT INTO public.backup_runs(scope,status) VALUES ('x','running')")).rejects.toThrow(/backup_runs_scope_check/);
    const columns = (await db.query<any>("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='backup_runs' AND column_name='offsite_report'")).rows;
    expect(columns).toEqual([{ data_type: "jsonb" }]);
    await db.exec("DELETE FROM public.backup_runs WHERE scope='offsite'");
  });
  it("preserva valores e amostras das duas invariantes antigas byte a byte na lógica de leitura", async () => {
    expect((await checks()).filter((r) => r.name !== "backup_offsite_em_falta")).toEqual(before);
    expect(before).toMatchObject([
      { name: "backup_manifesto_cobre_todos_os_buckets", current_count: 1, conforme: false, sample: ["card-documents"] },
      { name: "documento_sem_ficheiro_por_tabela", current_count: 2, conforme: false },
    ]);
    const oldReads = legacy.slice(legacy.indexOf("  WITH d("), legacy.indexOf("  RETURN QUERY"));
    expect(migration).toContain(oldReads.trimEnd());
  });
  it("invariante vale 1 sem offsite, 0 com ok de agora e 1 com ok de há 31 h", async () => {
    expect(await offsite()).toMatchObject({ current_count: 1, reference_count: 0, conforme: false, severity: "error", scope: "global", notes: "#202 RPO 24 h", sample: null });
    await db.exec("INSERT INTO public.backup_runs(scope,status,finished_at) VALUES ('offsite','ok',now())");
    expect(await offsite()).toMatchObject({ current_count: 0, conforme: true, sample: { status: "ok", error_text: null } });
    await db.exec("UPDATE public.backup_runs SET finished_at=now()-interval '31 hours' WHERE scope='offsite'");
    expect(await offsite()).toMatchObject({ current_count: 1, conforme: false });
    await db.exec("UPDATE public.backup_runs SET finished_at=now()-interval '30 hours' WHERE scope='offsite'");
    expect((await offsite()).current_count).toBe(1);
    await db.exec("UPDATE public.backup_runs SET status='error',error_text='fixture error',started_at=now() WHERE scope='offsite'");
    expect(await offsite()).toMatchObject({ current_count: 1, sample: { status: "error", error_text: "fixture error" } });
    const sample = (await offsite()).sample;
    expect(Object.keys(sample).sort()).toEqual(["error_text", "id", "run_date", "status"]);
  });
  it("não dá EXECUTE a PUBLIC, anon ou authenticated e mantém service_role", async () => {
    const privileges = (await db.query(`SELECT
      has_function_privilege('anon','public._run_invariant_checks_storage()','EXECUTE') a,
      has_function_privilege('authenticated','public._run_invariant_checks_storage()','EXECUTE') b,
      has_function_privilege('service_role','public._run_invariant_checks_storage()','EXECUTE') c`)).rows;
    expect(privileges).toEqual([{ a: false, b: false, c: true }]);
    await db.exec("CREATE ROLE issue202_public_probe");
    expect((await db.query<any>("SELECT has_function_privilege('issue202_public_probe','public._run_invariant_checks_storage()','EXECUTE') allowed")).rows[0].allowed).toBe(false);
  });
  it("reaplicação conserva a definição da invariante e é compatível com coluna existente", async () => {
    await db.exec("UPDATE public.system_invariants SET description='preservar' WHERE name='backup_offsite_em_falta'");
    await db.exec(migration);
    expect((await offsite()).description).toBe("preservar");
  });
  it("migração e manual são idênticos e o rollback só contém comentários ou linhas vazias", () => {
    expect(readFileSync(migrationPath).equals(readFileSync(manualPath))).toBe(true);
    expect(migration).toContain("Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim");
    expect(migration).toContain(rollbackPath);
    const rollback = readFileSync(rollbackPath, "utf8");
    expect(rollback.split(/\r?\n/).every((line) => !line.trim() || line.startsWith("--"))).toBe(true);
    expect(rollback).toContain("-- DELETE FROM public.backup_runs WHERE scope = 'offsite'");
    const uncommented = rollback.split("\n").map((line) => line.replace(/^-- ?/, "")).join("\n");
    expect(uncommented).toContain(legacy);
    expect(uncommented.indexOf("DELETE FROM public.backup_runs")).toBeLessThan(uncommented.indexOf("DROP CONSTRAINT"));
    expect(uncommented).toContain("DROP COLUMN IF EXISTS offsite_report");
  });
  it("PROPOSTA inerte contém só nomes de segredos e usa vault, endpoint, corpo e cadência autorizados", () => {
    const proposal = readFileSync(cronPath, "utf8");
    expect(proposal).toContain("NÃO APLICADA");
    expect(proposal).toContain("cron.schedule('backup-offsite-r2', '*/10 6-9 * * *'");
    expect(proposal).toContain("vault.decrypted_secrets");
    expect(proposal).toContain("name = 'email_queue_service_role_key'");
    expect(proposal).toContain("https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/database-backup");
    expect(proposal).toContain(`body := '{"target":"offsite"}'::jsonb`);
    for (const name of ["BACKUP_R2_ACCOUNT_ID", "BACKUP_R2_ACCESS_KEY_ID", "BACKUP_R2_SECRET_ACCESS_KEY", "BACKUP_R2_BUCKET", "BACKUP_R2_ENC_KEY"]) expect(proposal).toContain(name);
    expect(proposal).toContain("daily/ 30 dias; weekly/ 84 dias; monthly/ 365 dias");
    expect(proposal).not.toMatch(/Bearer\s+eyJ|AKIA[A-Z0-9]{16}|BACKUP_R2_\w+\s*[:=]/);
  });
  it("rollback descomentado só na fixture restaura a função 0065, ACL e check original", async () => {
    const rollback = readFileSync(rollbackPath, "utf8").split("\n").slice(2)
      .map((line) => line.replace(/^-- ?/, "")).join("\n");
    await db.exec(rollback);
    expect(await checks()).toEqual(before);
    expect((await db.query("SELECT 1 FROM public.system_invariants WHERE name='backup_offsite_em_falta'")).rows).toEqual([]);
    await expect(db.exec("INSERT INTO public.backup_runs(scope,status) VALUES ('offsite','ok')")).rejects.toThrow(/backup_runs_scope_check/);
    expect((await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='backup_runs' AND column_name='offsite_report'")).rows).toEqual([]);
  });
});
