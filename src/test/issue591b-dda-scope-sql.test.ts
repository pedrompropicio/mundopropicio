// @vitest-environment node
// #591 E2b: SQL preparado; execução apenas em PGlite em memória, sem credenciais/Live.
import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const migrationPath = "drizzle/migrations/0324_issue591_dda_scope.sql";
const manualPath = "supabase/manual/0324_issue591_dda_scope.sql";
const rollbackPath = "supabase/manual/rollback_0324_issue591_dda_scope_comentado.sql";
const proofPath = "docs/testes/issue591/prova-janela-0324-dda.sql";
const strictPath = "supabase/manual/0313_issue591_row_scope_strict.sql";
const capturedAuth = readFileSync("supabase/tests/issue335/live/phase2c-auth.sql", "utf8");
const originalMigration = readFileSync(
  "supabase/migrations/20260608202509_536eef28-1923-4ac0-828b-54eebf0f5edf.sql", "utf8",
);
const migration = readFileSync(manualPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const proof = readFileSync(proofPath, "utf8");
const uncommented = (sql: string) => sql.replace(/--[^\n]*/g, "").trim();
const normalized = (sql: string) => uncommented(sql).replace(/\s+/g, " ");
const extractOne = (source: string, pattern: RegExp) => {
  const matches = source.match(pattern);
  if (matches?.length !== 1) throw new Error(`Esperada uma definição para ${pattern}; encontradas ${matches?.length ?? 0}`);
  return matches[0];
};
const capturedFunction = (schema: string, name: string) => extractOne(
  capturedAuth,
  new RegExp(`CREATE OR REPLACE FUNCTION ${schema}\\.${name}\\([\\s\\S]*?\\$function\\$;`, "g"),
);
const originalPolicy = extractOne(
  originalMigration,
  /CREATE POLICY "dda_select_admin_manager"\s+ON public\.document_download_audit\b[\s\S]*?;/g,
);
const rollbackBody = extractOne(rollback, /-- >>> ROLLBACK\n[\s\S]*?-- <<< ROLLBACK/g)
  .split("\n").slice(1, -1).map((line) => line.replace(/^-- /, "")).join("\n");
const strictScope = existsSync(strictPath) ? readFileSync(strictPath, "utf8") : `
  CREATE OR REPLACE FUNCTION public.row_belongs_to_current_company(_row_company_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
    SELECT _row_company_id IS NULL OR _row_company_id = public.current_company_id()
  $function$;`;

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const x = id(1);
const y = id(2);
const adminX = id(11);
const adminY = id(12);
const managerX = id(13);
const dualAdmin = id(14);
const accountant = id(15);
const pedro = id(16);
const noRole = id(17);
const xLabels = ["X-1", "X-2"];
const yLabels = ["Y-1"];
const allLabels = [...xLabels, ...yLabels];

describe("#591 E2b — contrato dos artefactos preparados", () => {
  it("critério 1: mantém as cópias byte a byte e uma única instrução ALTER POLICY", () => {
    expect(readFileSync(migrationPath).equals(readFileSync(manualPath))).toBe(true);
    expect(normalized(migration)).toBe(normalized(`
      ALTER POLICY "dda_select_admin_manager" ON public.document_download_audit
        USING (
          (public.has_role((SELECT auth.uid()), 'admin'::app_role)
            OR public.has_role((SELECT auth.uid()), 'manager'::app_role))
          AND public.row_belongs_to_current_company(company_id)
        );`));
  });

  it("critério 1: deixa todo o rollback comentado e repõe o USING na forma Live", () => {
    expect(rollback.split("\n").filter((line) => line.trim() && !line.startsWith("-- "))).toEqual([]);
    const livePolicy = originalPolicy
      .replace(/^CREATE POLICY/, "ALTER POLICY")
      .replace(/\s+FOR SELECT\s+TO authenticated/, "")
      .replaceAll("auth.uid()", "( SELECT auth.uid() AS uid)");
    expect(normalized(rollbackBody)).toBe(normalized(livePolicy));
  });

  it("critério 4: prepara §1–§4, três identidades e apenas consultas/contexto com ROLLBACK", () => {
    for (const section of ["§1", "§2", "§3", "§4"]) expect(proof).toContain(section);
    const statements = uncommented(proof).split(";").map((sql) => sql.trim()).filter(Boolean);
    for (const statement of statements) {
      expect(statement).toMatch(/^(SELECT\b|BEGIN$|SET LOCAL ROLE authenticated$|ROLLBACK$)/);
    }
    expect(uncommented(proof)).toMatch(/FROM pg_policies\s+WHERE schemaname = 'public' AND tablename = 'document_download_audit'/);
    expect(uncommented(proof)).toContain("count(DISTINCT company_id)");
    expect(uncommented(proof)).toContain("GROUP BY company_id, role");
    for (const name of ["ADMIN", "MANAGER", "PEDRO"]) {
      expect(uncommented(proof)).toContain(`BEGIN;\nSELECT set_config('request.jwt.claim.sub', '__${name}_UID__', true);\nSET LOCAL ROLE authenticated;`);
    }
    expect(statements.filter((sql) => sql === "ROLLBACK")).toHaveLength(3);
    expect(uncommented(proof).match(/count\(\*\) FILTER \(WHERE company_id <> public\.current_company_id\(\)\)/g)).toHaveLength(3);
  });
});

describe.sequential("#591 E2b — RLS com helpers capturados em PGlite", () => {
  let db: PGlite;
  const applyScope = () => db.exec(readFileSync(manualPath, "utf8"));
  const activate = (uid: string, company: string | null) => db.query(
    "UPDATE public.profiles SET active_company_id = $1 WHERE id = $2", [company, uid],
  );
  const visibleAs = async (uid: string | null) => {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    await db.exec("SET ROLE authenticated");
    try {
      const { rows } = await db.query<{ actor: string; company: string | null; labels: string[] }>(`
        SELECT current_user::text AS actor, public.current_company_id() AS company,
          ARRAY(SELECT label FROM public.document_download_audit ORDER BY id) AS labels`);
      expect(rows[0].actor).toBe("authenticated");
      return { company: rows[0].company, labels: rows[0].labels };
    } finally {
      await db.exec("RESET ROLE");
    }
  };

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth;
      CREATE TYPE public.app_role AS ENUM ('platform_admin', 'admin', 'manager', 'accountant');
      CREATE TABLE public.companies(id uuid PRIMARY KEY, status text NOT NULL);
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, company_id uuid, active_company_id uuid);
      CREATE TABLE public.user_roles(id uuid PRIMARY KEY, user_id uuid NOT NULL, company_id uuid, role public.app_role NOT NULL);
      CREATE TABLE public.document_download_audit(id uuid PRIMARY KEY, company_id uuid NOT NULL, label text NOT NULL);
      GRANT USAGE ON SCHEMA public, auth TO authenticated;
      GRANT SELECT ON public.document_download_audit TO authenticated;
      ALTER TABLE public.document_download_audit ENABLE ROW LEVEL SECURITY;
      INSERT INTO public.companies VALUES ('${x}', 'active'), ('${y}', 'active');
      INSERT INTO public.profiles VALUES
        ('${adminX}', '${x}', '${x}'), ('${adminY}', '${y}', '${y}'),
        ('${managerX}', '${x}', '${x}'), ('${dualAdmin}', '${x}', '${x}'),
        ('${accountant}', '${x}', '${x}'), ('${pedro}', NULL, '${x}'), ('${noRole}', NULL, NULL);
      INSERT INTO public.user_roles VALUES
        ('${id(101)}', '${adminX}', '${x}', 'admin'), ('${id(102)}', '${adminY}', '${y}', 'admin'),
        ('${id(103)}', '${managerX}', '${x}', 'manager'), ('${id(104)}', '${dualAdmin}', '${x}', 'admin'),
        ('${id(105)}', '${dualAdmin}', '${y}', 'admin'), ('${id(106)}', '${accountant}', '${x}', 'accountant'),
        ('${id(107)}', '${pedro}', NULL, 'platform_admin');
      INSERT INTO public.document_download_audit VALUES
        ('${id(201)}', '${x}', 'X-1'), ('${id(202)}', '${x}', 'X-2'), ('${id(203)}', '${y}', 'Y-1');
      SELECT set_config('request.jwt.claims', '', false);`);
    // Os cinco corpos reais são extraídos, sem substituir os helpers de autorização por mocks.
    for (const [schema, name] of [
      ["auth", "uid"], ["public", "is_platform_admin"], ["public", "current_company_id"],
      ["public", "has_role"], ["public", "row_belongs_to_current_company"],
    ]) await db.exec(capturedFunction(schema, name));
    await db.exec(originalPolicy);
  }, 60000);
  afterAll(async () => { await db?.close(); });
  // Cada caso parte da política e dos perfis originais; nem os testes dependem da ordem.
  beforeEach(async () => { await db.exec("BEGIN"); });
  afterEach(async () => { await db.exec("RESET ROLE; ROLLBACK"); });

  it("critério 3: antes, admin X vê X+Y (fuga) e manager X só X", async () => {
    expect(await visibleAs(adminX)).toEqual({ company: x, labels: allLabels });
    expect(await visibleAs(managerX)).toEqual({ company: x, labels: xLabels });
  });

  it.each([
    ["admin X", adminX, x, xLabels],
    ["admin Y", adminY, y, yLabels],
    ["manager X", managerX, x, xLabels],
  ] as const)("critério 3: depois, %s só vê a empresa activa", async (_name, uid, company, labels) => {
    await applyScope();
    expect(await visibleAs(uid)).toEqual({ company, labels });
  });

  it("critério 3: admin com membership em X e Y segue a activa em ambas as direcções", async () => {
    await applyScope();
    expect(await visibleAs(dualAdmin)).toEqual({ company: x, labels: xLabels });
    await activate(dualAdmin, y);
    expect(await visibleAs(dualAdmin)).toEqual({ company: y, labels: yLabels });
    await activate(dualAdmin, x);
    expect(await visibleAs(dualAdmin)).toEqual({ company: x, labels: xLabels });
  });

  it.each([
    ["accountant", accountant, x], ["sem papel", noRole, null], ["sem uid", null, null],
  ])("critério 3: %s não vê downloads antes nem depois", async (_name, uid, company) => {
    expect(await visibleAs(uid)).toEqual({ company, labels: [] });
    await applyScope();
    expect(await visibleAs(uid)).toEqual({ company, labels: [] });
  });

  it("critério 3: 0324 isolada mantém X+Y para platform_admin com o rbcc capturado", async () => {
    expect(await visibleAs(pedro)).toEqual({ company: x, labels: allLabels });
    await applyScope();
    expect(await visibleAs(pedro)).toEqual({ company: x, labels: allLabels });
    await activate(pedro, y);
    expect(await visibleAs(pedro)).toEqual({ company: y, labels: allLabels });
  });

  it("critério 3: 0324 → 0313 limita platform_admin a X e depois a Y", async () => {
    await applyScope();
    await db.exec(strictScope);
    expect(await visibleAs(pedro)).toEqual({ company: x, labels: xLabels });
    await activate(pedro, y);
    expect(await visibleAs(pedro)).toEqual({ company: y, labels: yLabels });
    expect(await visibleAs(adminX)).toEqual({ company: x, labels: xLabels });
    expect(await visibleAs(managerX)).toEqual({ company: x, labels: xLabels });
  });

  it("critério 3: ordem recomendada 0313 → 0324 produz o mesmo isolamento", async () => {
    await db.exec(strictScope);
    expect(await visibleAs(adminX)).toEqual({ company: x, labels: allLabels });
    expect(await visibleAs(pedro)).toEqual({ company: x, labels: allLabels });
    await applyScope();
    expect(await visibleAs(adminX)).toEqual({ company: x, labels: xLabels });
    expect(await visibleAs(pedro)).toEqual({ company: x, labels: xLabels });
    await activate(pedro, y);
    expect(await visibleAs(pedro)).toEqual({ company: y, labels: yLabels });
  });

  it("critério 3: rollback descomentado reabre X+Y para admin X mesmo com 0313", async () => {
    await applyScope();
    await db.exec(strictScope);
    expect(await visibleAs(adminX)).toEqual({ company: x, labels: xLabels });
    await db.exec(rollbackBody);
    expect(await visibleAs(adminX)).toEqual({ company: x, labels: allLabels });
    expect(await visibleAs(managerX)).toEqual({ company: x, labels: xLabels });
    expect(await visibleAs(pedro)).toEqual({ company: x, labels: allLabels });
  });

  it("critérios 1–2: conserva a identidade, os destinatários e a referência a rbcc da única política", async () => {
    const catalog = async () => (await db.query<{
      oid: number; policyname: string; permissive: string; roles: string[]; cmd: string; with_check: null; qual: string;
    }>(`SELECT p.oid::int, v.policyname, v.permissive, v.roles, v.cmd, v.with_check, v.qual
        FROM pg_policies v JOIN pg_policy p ON p.polname = v.policyname
          AND p.polrelid = 'public.document_download_audit'::regclass
        WHERE v.schemaname = 'public' AND v.tablename = 'document_download_audit'`)).rows;
    const before = await catalog();
    expect(before).toHaveLength(1);
    await applyScope();
    const after = await catalog();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      oid: before[0].oid, policyname: "dda_select_admin_manager", permissive: "PERMISSIVE",
      roles: ["authenticated"], cmd: "SELECT", with_check: null,
    });
    expect(after[0].qual).toContain("row_belongs_to_current_company(company_id)");
    expect(after[0].qual).not.toContain("platform_admin");
  });

  it("critério 4: prova-janela executa em memória e mede fora da activa antes/depois", async () => {
    // ROLLBACKs do roteiro terminam as suas próprias transacções; fechar a do caso primeiro.
    await db.exec("ROLLBACK");
    const fixtureProof = proof.replaceAll("__ADMIN_UID__", adminX)
      .replaceAll("__MANAGER_UID__", managerX).replaceAll("__PEDRO_UID__", pedro);
    const measure = async () => (await db.exec(fixtureProof))
      .flatMap((result) => result.rows)
      .filter((row) => "downloads_fora_da_activa" in row);
    try {
      expect(await measure()).toEqual([
        { empresa_activa: x, downloads: 3, downloads_fora_da_activa: 1 },
        { empresa_activa: x, downloads: 2, downloads_fora_da_activa: 0 },
        { empresa_activa: x, downloads: 3, downloads_fora_da_activa: 1 },
      ]);
      await applyScope();
      expect(await measure()).toEqual([
        { empresa_activa: x, downloads: 2, downloads_fora_da_activa: 0 },
        { empresa_activa: x, downloads: 2, downloads_fora_da_activa: 0 },
        { empresa_activa: x, downloads: 3, downloads_fora_da_activa: 1 },
      ]);
      await db.exec(strictScope);
      expect(await measure()).toEqual([
        { empresa_activa: x, downloads: 2, downloads_fora_da_activa: 0 },
        { empresa_activa: x, downloads: 2, downloads_fora_da_activa: 0 },
        { empresa_activa: x, downloads: 2, downloads_fora_da_activa: 0 },
      ]);
    } finally {
      // Restaurar apenas o banco descartável: o roteiro não escreve perfis nem dados.
      await db.exec(capturedFunction("public", "row_belongs_to_current_company"));
      await db.exec(rollbackBody);
      await db.exec("BEGIN");
    }
  });
});
