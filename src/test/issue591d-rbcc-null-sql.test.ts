// @vitest-environment node
// #591 / 0326: apenas PGlite descartável, sem rede, credenciais ou bases externas.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migrationPath = "drizzle/migrations/0326_issue591_rbcc_sem_ramo_null.sql";
const manualPath = "supabase/manual/0326_issue591_rbcc_sem_ramo_null.sql";
const migration = read(migrationPath);
const rollback = read("supabase/manual/rollback_0326_issue591_rbcc_sem_ramo_null_comentado.sql");
const proof = read("docs/testes/issue591/prova-janela-0326-null.sql");
const scope0313 = read("drizzle/migrations/0313_issue591_row_scope_strict.sql");
const authSource = read("supabase/tests/issue335/live/phase2c-auth.sql");
const capture = (JSON.parse(read("supabase/tests/issue335/live/phase2h-catalog-ddl.json")) as {
  statements: { key: string; sql: string }[];
}).statements;
const one = (source: string, pattern: RegExp) => {
  const matches = source.match(pattern);
  if (matches?.length !== 1) throw new Error(`Esperada uma definição: ${pattern}, obtidas ${matches?.length ?? 0}`);
  return matches[0];
};
const fn = (source: string, name: string) => one(source,
  new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${name.replaceAll(".", "\\.")}\\([\\s\\S]*?\\$function\\$;`, "g"));
const rbcc0313 = fn(scope0313, "public.row_belongs_to_current_company");
const orPlatform0313 = fn(scope0313, "public.row_belongs_to_current_company_or_platform");
const rollbackBody = one(rollback, /-- >>> ROLLBACK\n[\s\S]*?-- <<< ROLLBACK/g)
  .split("\n").slice(1, -1).map((line) => line.replace(/^-- /, "")).join("\n");
const uncomment = (sql: string) => sql.replace(/--[^\n]*/g, "").trim();
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const x = id(1), y = id(2);
const profiles = [
  { name: "admin X", uid: id(11), role: "admin" },
  { name: "manager X", uid: id(12), role: "manager" },
  { name: "accountant X", uid: id(13), role: "accountant" },
  { name: "sem papel", uid: id(14), role: null },
  { name: "platform_admin X", uid: id(15), role: "platform_admin" },
] as const;
const tables = ["sync_runs", "email_send_log", "system_audit_log", "system_reminders"] as const;
type Table = typeof tables[number];
const restoredKeys = [
  "pol:public.sync_runs.sync_runs_select_authenticated",
  "pol:public.email_send_log.company_isolation_email_send_log",
  "pol:public.system_audit_log.company_isolation_system_audit_log",
  "pol:public.system_reminders.system_reminders_company_isolation",
];
const captured = (key: string) => {
  const matches = capture.filter((s) => s.key === key);
  expect(matches).toHaveLength(1);
  return matches[0].sql;
};
const capturedPolicies = capture.filter((s) => tables.some((t) => s.key.startsWith(`pol:public.${t}.`)));

// As definições mais recentes no repo prevalecem; o catálogo tem de ser equivalente.
const policyFrom = (path: string, name: string) => one(read(path),
  new RegExp(`CREATE POLICY (?:"${name}"|${name})\\s+[\\s\\S]*?;`, "g"));
const isolationSource = read("supabase/migrations/20260429023935_9cabcd96-9609-4764-8ca4-7ec57c4123e1.sql");
const isolationTemplate = one(isolationSource, /'CREATE POLICY "company_isolation_%I"[^\n]+'/g).slice(1, -1);
const latestPolicies = [
  policyFrom("drizzle/migrations/0039_0039_derp194_rls_company_predicate_3_policies.sql", "sync_runs_select_authenticated"),
  ...["email_send_log", "system_audit_log"].map((t) => isolationTemplate.replaceAll("%I", t) + ";"),
  policyFrom("drizzle/migrations/0038_0038_derp193_health_recipients_per_company.sql", "system_reminders_company_isolation"),
  policyFrom("supabase/migrations/20260916175445_1defe520-aecb-4b8d-b13b-220526d562b0.sql", "System audit log viewable by admin or manager"),
  ...["System audit log insertable by privileged roles", "System audit log insertable by service role"].map((name) =>
    policyFrom("supabase/migrations/20260410090116_c63d6b5d-0c79-48ef-a462-1d8bceb92597.sql", name)),
  ...["admins read reminders", "admins manage reminders"].map((name) =>
    policyFrom("supabase/migrations/20260429142331_9472c36e-8699-4d2b-9c70-fdf1ecd8f617.sql", name)),
  ...["Service role can insert send log", "Service role can read send log", "Service role can update send log"].map((name) =>
    policyFrom("supabase/migrations/20260321021852_email_infra.sql", name)),
];

describe("#591 / 0326 — artefactos inertes", () => {
  it("critério 1: cópias exactas, apenas a função, comentário e três ALTER necessários", () => {
    expect(readFileSync(migrationPath).equals(readFileSync(manualPath))).toBe(true);
    expect(uncomment(migration).match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(uncomment(migration).match(/ALTER POLICY [\s\S]*? ON public\.\w+/g)).toEqual([
      "ALTER POLICY sync_runs_select_authenticated ON public.sync_runs",
      "ALTER POLICY company_isolation_system_audit_log ON public.system_audit_log",
      "ALTER POLICY system_reminders_company_isolation ON public.system_reminders",
    ]);
    expect(uncomment(migration)).not.toMatch(/\b(GRANT|REVOKE|DROP|INSERT|UPDATE|DELETE|CREATE POLICY)\b/);
    expect(migration).toContain("6618640384");
    expect(migration).toContain("6631476546");
  });

  it("critérios 1 e 4: rollback todo comentado repõe bytes da função 0313 e quatro políticas capturadas", () => {
    expect(rollback.split("\n").filter((line) => line && !line.startsWith("-- "))).toEqual([]);
    expect(rollbackBody).toContain(rbcc0313);
    for (const key of restoredKeys) expect(rollbackBody).toContain(captured(key) + ";");
    expect(rollbackBody.match(/CREATE POLICY/g)).toHaveLength(4);
  });

  it("critério 1: prova §1–§5 só SELECT/contexto, três identidades e 78 contagens explícitas", () => {
    for (const section of ["§1", "§2", "§3", "§4", "§5"]) expect(proof).toContain(section);
    for (const statement of uncomment(proof).split(";").map((s) => s.trim()).filter(Boolean)) {
      expect(statement).toMatch(/^(SELECT\b|BEGIN$|SET LOCAL ROLE authenticated$|ROLLBACK$)/);
      expect(statement).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\s+(INTO|FROM|TABLE|FUNCTION|POLICY|ON)/i);
    }
    const covered = [...new Set([...read("docs/testes/issue591/prova-janela.sql")
      .matchAll(/\('public', '([^']+)'/g)].map((m) => m[1]))].sort();
    expect(covered).toHaveLength(79);
    expect([...proof.matchAll(/'([^']+)'::text AS table_name/g)].map((m) => m[1]))
      .toEqual(covered.filter((t) => t !== "meta_audience_sync_log"));
    for (const name of ["ADMIN", "MANAGER", "PEDRO"]) expect(proof).toContain(`'__${name}_UID__'`);
    expect(uncomment(proof).match(/ROLLBACK/g)).toHaveLength(3);
  });
});

describe.sequential("#591 / 0326 — RLS real antes, depois e rollback em PGlite", () => {
  let db: PGlite;
  const asUser = async <T>(uid: string, run: () => Promise<T>) => {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid]);
    await db.exec("SET LOCAL ROLE authenticated");
    try { return await run(); } finally { await db.exec("RESET ROLE"); }
  };
  const visible = (uid: string, table: string) => asUser(uid, async () =>
    (await db.query<{ label: string }>(`SELECT label FROM public.${table} ORDER BY label`)).rows.map((r) => r.label));
  const policyCatalog = async () => (await db.query(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies WHERE schemaname='public' AND tablename IN
      ('sync_runs','email_send_log','system_audit_log','system_reminders') ORDER BY 2,3`)).rows;
  const tryWrite = async (uid: string, sql: string) => {
    await db.exec("SAVEPOINT attempt");
    try {
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid]);
      await db.exec("SET LOCAL ROLE authenticated");
      await db.exec(sql);
      return "allowed";
    } catch (error) {
      expect((error as { code: string }).code).toBe("42501");
      return "rls_denied";
    } finally { await db.exec("ROLLBACK TO SAVEPOINT attempt; RELEASE SAVEPOINT attempt"); }
  };

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE SCHEMA storage;
      CREATE TYPE public.app_role AS ENUM ('platform_admin','admin','manager','accountant');
      CREATE TABLE public.companies(id uuid PRIMARY KEY, status text NOT NULL);
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, company_id uuid, active_company_id uuid);
      CREATE TABLE public.user_roles(id uuid PRIMARY KEY, user_id uuid NOT NULL, company_id uuid, role app_role NOT NULL);
      CREATE TABLE storage.objects(bucket_id text, name text);
      GRANT USAGE ON SCHEMA public, auth TO authenticated;
      INSERT INTO public.companies VALUES ('${x}', 'active'), ('${y}', 'active');
      SELECT set_config('request.jwt.claims', '{}', false);
      SELECT set_config('request.jwt.claim.role', 'authenticated', false);`);
    for (const [schema, name] of [["auth", "uid"], ["auth", "role"], ["public", "is_platform_admin"],
      ["public", "current_company_id"], ["public", "has_role"]]) await db.exec(fn(authSource, `${schema}.${name}`));
    await db.exec(rbcc0313);
    await db.exec(orPlatform0313);
    for (const t of [...tables, "backup_runs"]) {
      await db.exec(`CREATE TABLE public.${t}(id uuid PRIMARY KEY, company_id uuid, label text);
        ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.${t} TO authenticated;
        INSERT INTO public.${t} VALUES ('${id(101)}','${x}','X'),('${id(102)}','${y}','Y'),('${id(103)}',NULL,'NULL');`);
    }
    // Default real, sem trigger em system_audit_log desde 16/09; não inventar preenchimento.
    await db.exec(captured("default:public.system_audit_log.company_id"));
    for (const p of capturedPolicies) await db.exec(p.sql);
    await db.exec(captured("pol:public.backup_runs.backup_runs_select_admin"));
    await db.exec(one(scope0313, /ALTER POLICY company_isolation_backup_runs[\s\S]*?;/g)
      .replace("ALTER POLICY company_isolation_backup_runs ON public.backup_runs",
        "CREATE POLICY company_isolation_backup_runs ON public.backup_runs AS RESTRICTIVE FOR ALL TO authenticated"));
    for (const [i, profile] of profiles.entries()) {
      await db.query("INSERT INTO public.profiles VALUES ($1,$2,$2)", [profile.uid, profile.role ? x : null]);
      if (profile.role) await db.query("INSERT INTO public.user_roles VALUES ($1,$2,$3,$4)",
        [id(201 + i), profile.uid, profile.role === "platform_admin" ? null : x, profile.role]);
    }
  }, 60000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("BEGIN"); });
  afterEach(async () => { await db.exec("ROLLBACK; RESET ROLE"); });

  it("critérios 2–3: definições das migrações mais recentes coincidem com a captura PERMISSIVE/RESTRICTIVE", async () => {
    expect(capturedPolicies).toHaveLength(13);
    const baseline = await policyCatalog();
    for (const sql of latestPolicies) {
      const match = sql.match(/CREATE POLICY ("[^"]+"|\w+)\s+ON public\.(\w+)/)!;
      await db.exec(`DROP POLICY ${match[1]} ON public.${match[2]}; ${sql}`);
    }
    // Transformação transversal posterior às CREATE de Abril: também é fonte da política.
    await db.exec(read("supabase/migrations/20260914223845_856916d8-c1c9-45b8-8d42-28cb4bb820dc.sql"));
    expect(await policyCatalog()).toEqual(baseline);
  });

  // Baseline medido pela fixture fiel: NULL não é visível a todos em todas as tabelas.
  const before: Record<Table, string[][]> = {
    sync_runs: [["NULL", "X"], ["NULL", "X"], ["NULL", "X"], ["NULL"], ["NULL", "X"]],
    email_send_log: [[], [], [], [], []],
    system_audit_log: [["X"], ["X"], [], [], ["NULL", "X"]],
    system_reminders: [["NULL", "X"], [], [], [], ["NULL", "X"]],
  };
  for (const table of tables) {
    it(`critério 3: ${table} regista antes real e prova NULL restrito e X/Y invariantes por perfil`, async () => {
      const measured = [];
      for (const profile of profiles) measured.push(await visible(profile.uid, table));
      expect(measured).toEqual(before[table]);
      await db.exec(migration);
      for (const [i, profile] of profiles.entries()) {
        const after = await visible(profile.uid, table);
        expect(after).toEqual(profile.role === "platform_admin" ? measured[i] : measured[i].filter((s) => s !== "NULL"));
        expect(after.filter((s) => s !== "NULL")).toEqual(measured[i].filter((s) => s !== "NULL"));
      }
    });
  }

  it.each(profiles)("critério 4: rbcc e _or_platform com NULL/activa/outra para $name", async ({ uid, role }) => {
    await db.exec(migration);
    const measure = () => asUser(uid, async () => (await db.query(`
      SELECT public.row_belongs_to_current_company(NULL) AS null_scope,
        public.row_belongs_to_current_company('${x}') AS active_scope,
        public.row_belongs_to_current_company('${y}') AS other_scope,
        public.row_belongs_to_current_company_or_platform(NULL) AS null_platform`)).rows[0]);
    expect(await measure()).toEqual({ null_scope: false, active_scope: role !== null,
      other_scope: false, null_platform: role === "platform_admin" });
    await db.exec(rollbackBody);
    expect(await measure()).toEqual({ null_scope: true, active_scope: role ? true : null,
      other_scope: role ? false : null, null_platform: true });
  });

  it("critérios 3–4: rollback restaura toda a matriz e catálogo, preservando backup_runs", async () => {
    const original = await policyCatalog();
    for (const p of profiles) {
      const expected = p.role === "platform_admin" ? ["NULL", "X", "Y"] : p.role === "admin" ? ["X"] : [];
      expect(await visible(p.uid, "backup_runs")).toEqual(expected);
    }
    await db.exec(migration);
    for (const p of profiles) {
      const expected = p.role === "platform_admin" ? ["NULL", "X", "Y"] : p.role === "admin" ? ["X"] : [];
      expect(await visible(p.uid, "backup_runs")).toEqual(expected);
    }
    await db.exec(rollbackBody);
    expect(await policyCatalog()).toEqual(original);
    for (const table of tables) for (const [i, p] of profiles.entries())
      expect(await visible(p.uid, table)).toEqual(before[table][i]);
  });

  it.each(profiles)("critério 3 / levantamento d: INSERT NULL e com empresa para $name", async (p) => {
    for (const table of tables) {
      const sql = (company: string) => `INSERT INTO public.${table} VALUES ('${id(999)}',${company},'new')`;
      const allowed = table === "system_audit_log" ? ["admin", "manager", "platform_admin"].includes(p.role ?? "")
        : table === "system_reminders" && ["admin", "platform_admin"].includes(p.role ?? "");
      expect(await tryWrite(p.uid, sql("NULL"))).toBe(allowed ? "allowed" : "rls_denied");
      const withCompany = await tryWrite(p.uid, sql(`'${x}'`));
      await db.exec(migration);
      expect(await tryWrite(p.uid, sql("NULL"))).toBe(allowed && p.role === "platform_admin" ? "allowed" : "rls_denied");
      expect(await tryWrite(p.uid, sql(`'${x}'`))).toBe(withCompany);
      await db.exec(rollbackBody);
    }
    const auditInsert = `INSERT INTO public.system_audit_log(id,label) VALUES ('${id(999)}','audit.ts')`;
    const beforeDefault = await tryWrite(p.uid, auditInsert);
    await db.exec(migration);
    expect(await tryWrite(p.uid, auditInsert)).toBe(beforeDefault);
    expect(beforeDefault).toBe(["admin", "manager", "platform_admin"].includes(p.role ?? "") ? "allowed" : "rls_denied");
  });

  it("critério 3: UPDATE de X para NULL em reminders deixa de ser permitido ao admin", async () => {
    const update = "UPDATE public.system_reminders SET company_id=NULL WHERE label='X'";
    expect(await tryWrite(profiles[0].uid, update)).toBe("allowed");
    await db.exec(migration);
    expect(await tryWrite(profiles[0].uid, update)).toBe("rls_denied");
    expect(await tryWrite(profiles[4].uid, update)).toBe("allowed");
  });

  it("critérios 1 e 3: a prova completa executa em memória e mede antes/depois por identidade", async () => {
    const allTables = [...proof.matchAll(/'([^']+)'::text AS table_name/g)].map((m) => m[1]);
    for (const table of allTables) if (!new Set<string>([...tables, "backup_runs"]).has(table))
      await db.exec(`CREATE TABLE public.${table}(company_id uuid)`);
    await db.exec(`INSERT INTO storage.objects VALUES
      ('camarim-documents','/empty.pdf'),('camarim-documents','dossiers/example.html'),
      ('camarim-documents','${x}/ok.pdf'),('camarim-documents','${x.replaceAll("-", "")}/valid-uuid.pdf'),
      ('card-documents','dossiers/example.html')`);
    // A prova abre/fecha as suas próprias transacções; terminar a transacção do teste.
    await db.exec("COMMIT");
    const prepared = proof.replaceAll("__ADMIN_UID__", profiles[0].uid)
      .replaceAll("__MANAGER_UID__", profiles[1].uid).replaceAll("__PEDRO_UID__", profiles[4].uid);
    const measure = async () => {
      const rows = (await db.exec(prepared)).flatMap((r) => r.rows);
      expect(rows.filter((r) => "linhas_null" in r)).toHaveLength(78);
      expect(rows.filter((r) => "primeiro_segmento_vazio" in r)).toContainEqual({
        bucket_id: "camarim-documents", objectos: 4, primeiro_segmento_vazio: 1, primeiro_segmento_nao_uuid: 1, dossiers: 1,
      });
      return rows.filter((r) => "null_visiveis" in r);
    };
    try {
      const prior = await measure();
      expect(prior.map((r) => r.null_visiveis)).toEqual([0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1]);
      await db.exec(migration);
      const after = await measure();
      expect(after.map((r) => r.null_visiveis)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1]);
      expect(after.map((r) => [r.tabela, r.com_empresa, r.activa, r.outra]))
        .toEqual(prior.map((r) => [r.tabela, r.com_empresa, r.activa, r.outra]));
    } finally {
      await db.exec(rollbackBody);
      for (const table of allTables) if (!new Set<string>([...tables, "backup_runs"]).has(table)) await db.exec(`DROP TABLE public.${table}`);
      await db.exec("DELETE FROM storage.objects; BEGIN");
    }
  });
});
