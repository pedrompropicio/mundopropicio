// @vitest-environment node
// #591: só PGlite em memória; sem credenciais, SQL remoto ou aplicação da migração.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/manual/0313_issue591_row_scope_strict.sql");
const rollbackFile = read("supabase/manual/rollback_0313_issue591_row_scope_strict_comentado.sql");
const authCapture = read("supabase/tests/issue335/live/phase2c-auth.sql");
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const platform = uuid(1), tenant = uuid(2), x = uuid(101), y = uuid(102);
const trashSource = "supabase/migrations/20260429023935_9cabcd96-9609-4764-8ca4-7ec57c4123e1.sql";
const backupSource = "supabase/migrations/20260917222206_cc918411-1854-44d9-bca2-265a9418485a.sql";

// Fail closed: exige uma única definição inteira, sem reimplementar os corpos reais.
function capturedFunction(name: string) {
  const escaped = name.replaceAll(".", "\\.");
  const matches = [...authCapture.matchAll(new RegExp(
    `CREATE OR REPLACE FUNCTION ${escaped}\\([^;]*?AS (\\$\\w*\\$)[\\s\\S]*?\\1;`, "g",
  ))];
  expect(matches).toHaveLength(1);
  return matches[0][0];
}

function rollbackSql() {
  const block = rollbackFile.match(/-- >>> ROLLBACK\n([\s\S]*?)-- <<< ROLLBACK/);
  expect(block).not.toBeNull();
  return block![1].split("\n").filter(Boolean).map((line) => {
    expect(line.startsWith("-- ")).toBe(true);
    return line.slice(3);
  }).join("\n");
}

let db: PGlite;
const query = async <T>(sql: string) => (await db.query<T>(sql)).rows;
async function asUser<T>(user: string | null, action: () => Promise<T>) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', '{}', false)", [user ?? ""]);
  await db.exec("SET ROLE authenticated");
  try { return await action(); }
  finally { await db.exec("RESET ROLE"); }
}

async function visibility() {
  const scope = await query<{ x: boolean | null; y: boolean | null; nil: boolean }>(`SELECT
    public.row_belongs_to_current_company('${x}') AS x,
    public.row_belongs_to_current_company('${y}') AS y,
    public.row_belongs_to_current_company(NULL) AS nil`);
  const rows = async (table: string) => (await query<{ label: string }>(`SELECT label FROM public.${table} ORDER BY label`)).map((r) => r.label);
  return {
    scope: scope[0], trash: await rows("trash"), backups: await rows("backup_runs"),
    overview: await rows("issue591_overview()"), settlements: await rows("ticket_office_settlements"),
  };
}

async function helperMetadata() {
  return query(`SELECT p.proowner, p.proacl::text, p.proargnames, p.prosecdef, p.provolatile, p.proconfig
    FROM pg_proc p WHERE p.oid='public.row_belongs_to_current_company(uuid)'::regprocedure`);
}

let tenantBefore: Awaited<ReturnType<typeof visibility>>;
let platformBefore: Awaited<ReturnType<typeof visibility>>;
let originalMetadata: Awaited<ReturnType<typeof helperMetadata>>;
let originalPolicies: unknown;
let noUidBefore: Awaited<ReturnType<typeof visibility>>;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    CREATE TYPE public.app_role AS ENUM ('platform_admin', 'admin', 'manager');
    CREATE TABLE public.companies(id uuid PRIMARY KEY, status text);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, active_company_id uuid, company_id uuid);
    CREATE TABLE public.user_roles(id integer PRIMARY KEY, user_id uuid, role public.app_role, company_id uuid);
    CREATE TABLE public.trash(id uuid PRIMARY KEY, company_id uuid, label text);
    CREATE TABLE public.backup_runs(id uuid PRIMARY KEY, company_id uuid, label text);
    CREATE TABLE public.ticket_office_settlements(id uuid PRIMARY KEY, company_id uuid, label text);
    INSERT INTO public.companies VALUES ('${x}', 'active'), ('${y}', 'active');
    INSERT INTO public.profiles VALUES ('${platform}', '${x}', '${x}'), ('${tenant}', '${x}', '${x}');
    INSERT INTO public.user_roles VALUES (1, '${platform}', 'platform_admin', NULL), (2, '${tenant}', 'admin', '${x}');
    INSERT INTO public.trash VALUES ('${uuid(201)}', '${x}', 'X'), ('${uuid(202)}', '${y}', 'Y'), ('${uuid(203)}', NULL, 'NULL');
    INSERT INTO public.backup_runs SELECT * FROM public.trash;
    INSERT INTO public.ticket_office_settlements SELECT * FROM public.trash WHERE company_id IS NOT NULL;
    GRANT SELECT ON public.trash, public.backup_runs, public.ticket_office_settlements TO authenticated;
    ALTER TABLE public.trash ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.ticket_office_settlements ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_select ON public.trash FOR SELECT TO authenticated USING (true);
    CREATE POLICY fixture_select ON public.backup_runs FOR SELECT TO authenticated USING (true);
    CREATE POLICY fixture_select ON public.ticket_office_settlements FOR SELECT TO authenticated USING (true);`);
  for (const name of ["auth.uid", "public.is_platform_admin", "public.current_company_id", "public.has_role", "public.row_belongs_to_current_company"])
    await db.exec(capturedFunction(name));
  // Reprodução da ACL nominal fornecida no despacho; CREATE OR REPLACE tem de a conservar.
  await db.exec(`GRANT EXECUTE ON FUNCTION public.row_belongs_to_current_company(uuid) TO PUBLIC, anon, authenticated, service_role;`);
  const trashTemplate = read(trashSource).match(/'CREATE POLICY "company_isolation_%I" ON public\.%I[^']+'/);
  expect(trashTemplate).not.toBeNull();
  await db.exec(trashTemplate![0].slice(1, -1).replaceAll("%I", "trash") + ";");
  // C2 original, incluindo a permissiva de papéis; não substituir has_role por um stub.
  const backupSql = read(backupSource);
  for (const name of ["backup_runs_select_admin", "company_isolation_backup_runs"]) {
    const policy = backupSql.match(new RegExp(`CREATE POLICY ${name}\\s[\\s\\S]*?;`));
    expect(policy).not.toBeNull();
    await db.exec(policy![0]);
  }
  // A política histórica de settlements já exige igualdade de empresa, independentemente de rbcc.
  await db.exec(`CREATE POLICY company_isolation_ticket_office_settlements
    ON public.ticket_office_settlements AS RESTRICTIVE FOR ALL TO authenticated
    USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());`);
  const overviewSource = read("drizzle/migrations/0078_derp232_direito_do_evento.sql");
  const predicate = overviewSource.match(/where public\.row_belongs_to_current_company\(s\.company_id\)/i);
  expect(predicate).not.toBeNull();
  // Prova representativa do WHERE real da 0078, não uma cópia do seu motor financeiro.
  await db.exec(`CREATE FUNCTION public.issue591_overview() RETURNS SETOF public.ticket_office_settlements
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
      SELECT s.* FROM public.ticket_office_settlements s ${predicate![0]}
    $$;
    REVOKE ALL ON FUNCTION public.issue591_overview() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.issue591_overview() TO authenticated;`);
  tenantBefore = await asUser(tenant, visibility);
  platformBefore = await asUser(platform, visibility);
  noUidBefore = await asUser(null, visibility);
  originalMetadata = await helperMetadata();
  originalPolicies = await query("SELECT * FROM pg_policies ORDER BY tablename, policyname");
  await db.exec(migration);
}, 60000);

afterAll(async () => { await db?.close(); });

describe.sequential("#591 — 0313 preparada: empresa estrita e plataforma explícita", () => {
  it("mantém cópias idênticas, rollback só comentado e corpo exato de E sem GUC", () => {
    expect(readFileSync("drizzle/migrations/0313_issue591_row_scope_strict.sql")).toEqual(readFileSync("supabase/manual/0313_issue591_row_scope_strict.sql"));
    expect(rollbackFile.split("\n").every((line) => !line.trim() || line.startsWith("-- "))).toBe(true);
    const definition = migration.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/)![0];
    expect(definition).toBe(capturedFunction("public.row_belongs_to_current_company").replace(
      "SELECT\n    public.is_platform_admin()\n    OR _row_company_id IS NULL\n    OR _row_company_id = public.current_company_id()",
      "SELECT _row_company_id IS NULL OR _row_company_id = public.current_company_id()",
    ));
    expect(migration).not.toMatch(/current_setting|set_config|CREATE POLICY|DROP POLICY/i);
    expect([...migration.matchAll(/ALTER POLICY\s+(\w+)\s+ON\s+([\w.]+)/g)].map((m) => [m[1], m[2]]))
      .toEqual([["company_isolation_backup_runs", "public.backup_runs"]]);
    expect(rollbackSql()).toContain(capturedFunction("public.row_belongs_to_current_company"));
  });

  it("inventaria 93+2 políticas e 26 funções com origem, classe e os mesmos conjuntos da prova", () => {
    const inventory = read("docs/testes/issue591/inventario.md");
    const proof = read("docs/testes/issue591/prova-janela.sql");
    const entries = [...inventory.matchAll(/^\| `([^`]+)` \| `([^`]+):(\d+)` \| ([EPXDF]) \| ([^|]+) \|$/gm)];
    expect(entries).toHaveLength(121);
    const policies = entries.filter((m) => m[1].includes(" · "));
    const functions = entries.filter((m) => m[1].includes(" / "));
    expect(policies.filter((m) => m[1].startsWith("public."))).toHaveLength(93);
    expect(policies.filter((m) => m[1].startsWith("storage.objects"))).toHaveLength(2);
    expect(new Set(policies.filter((m) => m[1].startsWith("public.")).map((m) => m[1].split(" · ")[0])).size).toBe(79);
    expect(functions).toHaveLength(26);
    expect(policies.filter((m) => m[4] === "P").map((m) => m[1])).toEqual(["public.backup_runs · company_isolation_backup_runs"]);
    expect(policies.filter((m) => m[4] === "D").map((m) => m[1])).toEqual(["public.help_questions · company_isolation_help_questions"]);
    for (const m of entries) {
      expect(read(m[2]).split("\n")[Number(m[3]) - 1]).toMatch(/CREATE\s+(?:OR REPLACE\s+)?(?:POLICY|FUNCTION)/i);
      expect(m[5]).toMatch(/§[12]/);
    }
    const expectedPolicies = policies.map((m) => {
      const [object, policy] = m[1].split(" · ");
      const [schema, table] = object.split(".");
      return `('${schema}', '${table}', '${policy}')`;
    }).sort();
    const policyValues = proof.match(/WITH esperado\(schemaname, tablename, policyname\) AS \(VALUES([\s\S]*?)\n\), real/)![1];
    expect(policyValues.trim().split(",\n").map((v) => v.trim()).sort()).toEqual(expectedPolicies);
    const expectedFunctions = functions.map((m) => {
      const [name, arity] = m[1].split(" / ");
      return `('${name.replace("public.", "")}', ${arity})`;
    }).sort();
    const functionValues = proof.match(/WITH esperado_base\(proname, pronargs\) AS \(VALUES([\s\S]*?)\n\), esperado/)![1];
    expect(functionValues.trim().split(",\n").map((v) => v.trim()).sort()).toEqual(expectedFunctions);
    expect(proof.replace(/--[^\n]*|'(?:[^']|'')*'/g, "")).not.toMatch(/\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|COMMIT)\b/i);
  });

  it("valida os SELECT de catálogo da prova §1–2 e o plano da contagem NULL de §3 em PGlite", async () => {
    const proof = read("docs/testes/issue591/prova-janela.sql");
    const catalog = await db.exec(proof.split("-- §3")[0]);
    expect(catalog).toHaveLength(7);
    // A fixture contém duas das 95 políticas inventariadas; o EXCEPT denuncia as 93 ausentes.
    expect(catalog[0].rows[0]).toMatchObject({ schemaname: "public" });
    expect(catalog[2].rows).toHaveLength(93);
    expect(catalog[2].rows.every((r) => (r as { diferenca: string }).diferenca === "repo_sem_live")).toBe(true);
    const nullCount = proof.match(/WITH cobertas AS \([\s\S]*?ORDER BY c.table_schema, c.table_name;/)![0];
    // PGlite não precisa de executar XML: EXPLAIN valida nomes/tipos e sintaxe da consulta real.
    expect((await db.exec("EXPLAIN " + nullCount)).length).toBe(1);
  });

  it("exibe a regressão anterior: platform_admin recebia Y via SECDEF com empresa ativa X", () => {
    expect(platformBefore.scope).toEqual({ x: true, y: true, nil: true });
    expect(platformBefore.trash).toEqual(["NULL", "X", "Y"]);
    expect(platformBefore.overview).toEqual(["X", "Y"]);
    expect(platformBefore.settlements).toEqual(["X"]);
  });

  it("platform_admin ativo em X só vê X+NULL em trash e X no WHERE SECDEF; backups incluem Y", async () => {
    await asUser(platform, async () => {
      expect(await query("SELECT current_user AS actor, rolbypassrls, rolsuper FROM pg_roles WHERE rolname=current_user"))
        .toEqual([{ actor: "authenticated", rolbypassrls: false, rolsuper: false }]);
      expect(await visibility()).toEqual({
        scope: { x: true, y: false, nil: true }, trash: ["NULL", "X"],
        overview: ["X"], settlements: ["X"], backups: ["NULL", "X", "Y"],
      });
    });
  });

  it("mudar a empresa ativa do platform_admin para Y produz o resultado simétrico", async () => {
    await db.exec(`UPDATE public.profiles SET active_company_id='${y}' WHERE id='${platform}'`);
    try {
      await asUser(platform, async () => {
        expect(await visibility()).toEqual({
          scope: { x: false, y: true, nil: true }, trash: ["NULL", "Y"],
          overview: ["Y"], settlements: ["Y"], backups: ["NULL", "X", "Y"],
        });
      });
    } finally { await db.exec(`UPDATE public.profiles SET active_company_id='${x}' WHERE id='${platform}'`); }
  });

  it("tenant admin de X mantém exatamente X/Y/NULL e a visibilidade anterior; backups só X", async () => {
    expect(tenantBefore).toEqual({
      scope: { x: true, y: false, nil: true }, trash: ["NULL", "X"],
      overview: ["X"], settlements: ["X"], backups: ["X"],
    });
    expect(await asUser(tenant, visibility)).toEqual(tenantBefore);
  });

  it("sem uid conserva NULL para X/Y: IS NOT TRUE recusa a linha; rbcc(NULL) IS TRUE", async () => {
    expect(noUidBefore.scope).toEqual({ x: null, y: null, nil: true });
    expect(await asUser(null, visibility)).toEqual(noUidBefore);
    await asUser(null, async () => {
      expect(await query(`SELECT public.current_company_id() AS company, public.is_platform_admin() AS platform,
        public.row_belongs_to_current_company('${x}') IS NOT TRUE AS refused,
        public.row_belongs_to_current_company(NULL) IS TRUE AS null_allowed`))
        .toEqual([{ company: null, platform: false, refused: true, null_allowed: true }]);
      expect((await visibility()).trash).toEqual(["NULL"]);
    });
  });

  it("preserva owner/ACL/assinatura do helper original e fecha anon/PUBLIC no helper novo", async () => {
    expect(await helperMetadata()).toEqual(originalMetadata);
    expect(await query(`SELECT r, has_function_privilege(r,
      'public.row_belongs_to_current_company_or_platform(uuid)', 'EXECUTE') AS allowed
      FROM (VALUES ('anon'), ('authenticated'), ('service_role')) roles(r) ORDER BY r`))
      .toEqual([{ r: "anon", allowed: false }, { r: "authenticated", allowed: true }, { r: "service_role", allowed: true }]);
    expect(await query(`SELECT count(*)::int AS public_grants FROM pg_proc p,
      LATERAL aclexplode(p.proacl) a WHERE p.oid='public.row_belongs_to_current_company_or_platform(uuid)'::regprocedure
      AND a.grantee=0`)).toEqual([{ public_grants: 0 }]);
    expect(await query(`SELECT prosecdef, provolatile, proconfig, proargnames FROM pg_proc
      WHERE oid='public.row_belongs_to_current_company_or_platform(uuid)'::regprocedure`))
      .toEqual([{ prosecdef: true, provolatile: "s", proconfig: ["search_path=public"], proargnames: ["_row_company_id"] }]);
    await db.exec("SET ROLE anon");
    try {
      await expect(db.query(`SELECT public.row_belongs_to_current_company_or_platform('${x}')`)).rejects.toThrow(/permission denied/);
    } finally { await db.exec("RESET ROLE"); }
  });

  it("muda só a expressão de backup_runs e o rollback restaura corpo, políticas e visibilidade", async () => {
    const policies = await query<{ policyname: string }>("SELECT * FROM pg_policies ORDER BY tablename, policyname");
    const before = originalPolicies as typeof policies;
    expect(policies.filter((p) => p.policyname !== "company_isolation_backup_runs"))
      .toEqual(before.filter((p) => p.policyname !== "company_isolation_backup_runs"));
    await db.exec("BEGIN");
    try {
      await db.exec(rollbackSql());
      expect(await asUser(platform, visibility)).toEqual(platformBefore);
      expect(await asUser(tenant, visibility)).toEqual(tenantBefore);
      expect(await helperMetadata()).toEqual(originalMetadata);
      expect(await query("SELECT * FROM pg_policies ORDER BY tablename, policyname")).toEqual(originalPolicies);
      expect(await query(`SELECT to_regprocedure('public.row_belongs_to_current_company_or_platform(uuid)') AS removed,
        obj_description('public.row_belongs_to_current_company(uuid)'::regprocedure, 'pg_proc') AS comment`))
        .toEqual([{ removed: null, comment: null }]);
      expect(await query(`SELECT prosrc FROM pg_proc WHERE oid='public.row_belongs_to_current_company(uuid)'::regprocedure`))
        .toEqual([{ prosrc: capturedFunction("public.row_belongs_to_current_company").split("$function$")[1] }]);
    } finally { await db.exec("ROLLBACK"); }
  });
});
