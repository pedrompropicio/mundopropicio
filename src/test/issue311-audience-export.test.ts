// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accessByPermission } from "@/lib/access";
import snapshot from "./fixtures/permission-snapshot-311.json";

const filename = "0316_issue311_audience_export_marketing.sql";
const migration = readFileSync(`drizzle/migrations/${filename}`, "utf8");
const manual = readFileSync(`supabase/manual/${filename}`, "utf8");
const rollback = readFileSync("supabase/manual/rollback_0316_issue311_audience_export_marketing_comentado.sql", "utf8");
const proof = readFileSync("docs/testes/issue311/prova-janela.sql", "utf8");
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, "").trim();
// Só as linhas SQL do rollback são descomentadas; o aviso continua inerte.
const executableRollback = rollback.split("\n")
  .filter((line) => /^-- (DELETE|WHERE|  AND)\b/.test(line))
  .map((line) => line.slice(3)).join("\n");
const key = "crm.audience.export";
const grantedRoles = new Set(["marketing_manager", "content_manager"]);
const permissionsAfter = (role: string, permissions: string[]) =>
  grantedRoles.has(role) ? [...new Set([...permissions, key])] : permissions;
const canExport = (role: string, permissions: string[]) =>
  accessByPermission(role, permissions).has("crm") && permissions.includes(key);

describe("#311 E2b — artefactos preparados", () => {
  it("[1] mantém cópias byte a byte e apenas o acréscimo idempotente autorizado", () => {
    expect(Buffer.from(manual)).toEqual(Buffer.from(migration));
    expect(withoutComments(migration).replace(/\s+/g, " ")).toBe(
      "INSERT INTO public.role_permissions (role, permission) VALUES " +
      "('marketing_manager'::public.app_role, 'crm.audience.export'), " +
      "('content_manager'::public.app_role, 'crm.audience.export') " +
      "ON CONFLICT (role, permission) DO NOTHING;",
    );
    expect(migration).not.toMatch(/\b(?:DELETE|UPDATE|user_permissions)\b/i);
    expect(migration).toContain("Classe R2 — PREPARADA, NÃO APLICADA");
    expect(migration).toContain("migração primeiro, depois Publish do código");
    expect(migration).toContain("ninguém perde (snapshot 567bbef0)");
  });

  it("[1] conserva o rollback totalmente comentado e restrito aos dois defaults", () => {
    expect(rollback.split("\n").every((line) => !line.trim() || line.startsWith("-- "))).toBe(true);
    expect(rollback).toContain("só se a prova §1 mostrou que não existiam antes");
    expect(executableRollback.replace(/\s+/g, " ")).toBe(
      "DELETE FROM public.role_permissions WHERE permission = 'crm.audience.export' " +
      "AND role IN ('marketing_manager'::public.app_role, 'content_manager'::public.app_role);",
    );
  });

  it("[4] prepara as quatro secções de prova exclusivamente de leitura", () => {
    expect(proof).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER)\b/i);
    expect(proof).toContain("migração primeiro, depois Publish do código");
    for (const section of ["§1", "§2", "§3", "§4"]) expect(proof).toContain(section);
    const statements = withoutComments(proof).split(";").map((sql) => sql.trim()).filter(Boolean);
    expect(statements).toHaveLength(4);
    expect(statements[0]).toBe(statements[3]);
    expect(statements[2]).toContain("SELECT DISTINCT user_id, company_id");
    expect(statements[2]).toContain("WHERE company_id IS NOT NULL");
    expect(statements[2]).toContain("ARRAY['module.crm', 'crm.audience.export']");
  });

  it("[3] preserva o acesso à exportação nos 52 pares utilizador × empresa do snapshot", () => {
    const losses: string[] = [];
    const gains: string[] = [];
    const accessible: string[] = [];
    expect(snapshot.rows).toHaveLength(52);
    for (const row of snapshot.rows) {
      const before = accessByPermission(row.r, row.p).has("crm");
      const after = before && permissionsAfter(row.r, row.p).includes(key);
      const id = `${row.u}@${row.c}`;
      if (before) accessible.push(id);
      if (before && !after) losses.push(id);
      if (!before && after) gains.push(id);
    }
    expect(accessible.sort()).toEqual([
      "1660542f@7c858982", "567bbef0@7c858982", "d8e502f7@34b3c3d1",
      "d8e502f7@7c858982", "d8e502f7@f0f21410",
    ]);
    expect(losses).toEqual([]);
    expect(gains).toEqual([]);
  });

  it("[3] exige content_manager e respeita as chaves de um admin sintético", () => {
    const content = snapshot.rows.find((row) => row.u === "567bbef0")!;
    expect(accessByPermission(content.r, content.p).has("crm")).toBe(true);
    expect(canExport(content.r, content.p)).toBe(false);
    expect(canExport(content.r, permissionsAfter(content.r, content.p))).toBe(true);
    expect(canExport("admin", ["module.crm", key])).toBe(true);
    expect(canExport("admin", ["module.crm"])).toBe(false);
    expect(canExport("manager", [key])).toBe(false);
  });

  it.each([
    ["audiences/AudienceEditor.tsx", "Export CSV", "exportMut.mutate(s.id)"],
    ["contactos/ContactosList.tsx", "Exportar CSV", "handleExport"],
    ["clube-newgang/ClubeNewgang.tsx", "Exportar CSV (Fever)", "exportCsv"],
  ])("[4] guarda o botão de %s pela chave efetiva", (path, label, handler) => {
    const source = readFileSync(`src/pages/crm-admin/${path}`, "utf8");
    expect(source).toContain('import { useAuth } from "@/contexts/AuthContext"');
    expect(source).toContain("const { hasPermission } = useAuth();");
    const guardedButton = source.match(/\{hasPermission\("crm\.audience\.export"\) && \(\s*(<Button\b[\s\S]*?<\/Button>)\s*\)\}/)?.[1];
    expect(guardedButton).toBeDefined();
    expect(guardedButton).toContain(label);
    expect(guardedButton).toContain(handler);
  });
});

describe("#311 E2b — PGlite local, sem credenciais nem Live", () => {
  let db: PGlite;
  const exportRoles = async () => (await db.query<{ role: string }>(
    "SELECT role::text FROM public.role_permissions WHERE permission = $1 ORDER BY role::text", [key],
  )).rows.map((row) => row.role);
  const allDefaults = async () => (await db.query("SELECT * FROM public.role_permissions ORDER BY role::text, permission")).rows;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'marketing_manager', 'content_manager', 'platform_admin', 'viewer');
      CREATE TABLE public.role_permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role public.app_role NOT NULL,
        permission text NOT NULL, created_at timestamptz DEFAULT now(), UNIQUE (role, permission)
      );
      CREATE TABLE public.user_roles (user_id uuid, company_id uuid, role public.app_role);
      CREATE TABLE public.user_permissions (user_id uuid, company_id uuid, permission text, granted boolean);
      CREATE FUNCTION public.is_platform_admin(u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = u AND role = 'platform_admin')
      $$;
    `);
    const seed = readFileSync("supabase/migrations/20260510034045_crm_permissions_and_budget_limits.sql", "utf8")
      .match(/INSERT INTO public\.role_permissions[\s\S]*?;/)![0];
    await db.exec(seed);
    // A prova usa o resolvedor canónico existente, sem uma réplica da fórmula no teste.
    const resolver = readFileSync("drizzle/migrations/0115_derp254_permissions_per_company.sql", "utf8")
      .match(/CREATE OR REPLACE FUNCTION public\._effective_permissions_for\([\s\S]*?\$function\$;/)![0];
    await db.exec(resolver);
  }, 30000);
  beforeEach(async () => { await db.exec("BEGIN"); });
  afterEach(async () => { await db.exec("ROLLBACK"); });
  afterAll(async () => { await db?.close(); });

  it("[2] aplica a cópia manual duas vezes e o rollback repõe exatamente o seed", async () => {
    const before = await allDefaults();
    expect(await exportRoles()).toEqual(["admin", "manager"]);
    await db.exec(manual);
    const first = await allDefaults();
    await db.exec(manual);
    expect(await allDefaults()).toEqual(first);
    expect(await exportRoles()).toEqual(["admin", "content_manager", "manager", "marketing_manager"]);
    await db.exec(executableRollback);
    expect(await exportRoles()).toEqual(["admin", "manager"]);
    expect(await allDefaults()).toEqual(before);
  });

  it("[2] preserva defaults que já existiam antes da migração", async () => {
    await db.exec(`INSERT INTO public.role_permissions (role, permission, created_at) VALUES
      ('marketing_manager', '${key}', '2026-01-01'), ('content_manager', '${key}', '2026-01-02');`);
    const before = await allDefaults();
    await db.exec(manual);
    await db.exec(manual);
    expect(await allDefaults()).toEqual(before);
  });

  it("[4] a prova deteta perdas, deduplica memberships e respeita exceções por empresa", async () => {
    const company = "10000000-0000-0000-0000-000000000001";
    const otherCompany = "10000000-0000-0000-0000-000000000002";
    const user = (n: number) => `20000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    await db.exec(`
      INSERT INTO public.role_permissions (role, permission) VALUES
        ('marketing_manager', 'module.crm'), ('content_manager', 'module.crm');
      INSERT INTO public.user_roles (user_id, company_id, role) VALUES
        ('${user(1)}', '${company}', 'marketing_manager'),
        ('${user(1)}', '${company}', 'marketing_manager'),
        ('${user(1)}', '${otherCompany}', 'viewer'),
        ('${user(2)}', '${company}', 'content_manager'),
        ('${user(3)}', '${company}', 'admin'),
        ('${user(4)}', '${company}', 'manager'),
        ('${user(5)}', '${company}', 'platform_admin'),
        ('${user(6)}', NULL, 'marketing_manager');
    `);
    const before = await db.exec(proof);
    expect(before).toHaveLength(4);
    expect(before[2].rows).toEqual([
      { user_id: user(1), company_id: company, permissions: ["crm.attribution.view", "crm.audience.view", "crm.campaign.create", "crm.campaign.publish", "crm.campaign.set_budget", "module.crm"] },
      { user_id: user(2), company_id: company, permissions: ["module.crm"] },
    ]);
    await db.exec(manual);
    const defaults = await allDefaults();
    const after = await db.exec(proof);
    expect(after[2].rows).toEqual([]);
    expect(after[0].rows).toEqual(after[3].rows);
    expect(await allDefaults()).toEqual(defaults);
    await db.query("INSERT INTO public.user_permissions VALUES ($1, $2, $3, false)", [user(1), otherCompany, key]);
    expect((await db.exec(proof))[2].rows).toEqual([]);
    await db.query("INSERT INTO public.user_permissions VALUES ($1, $2, $3, false)", [user(1), company, key]);
    expect((await db.exec(proof))[2].rows).toEqual(before[2].rows.slice(0, 1));
  });
});
