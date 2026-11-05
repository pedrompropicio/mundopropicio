// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const migration = readFileSync("drizzle/migrations/0339_issue666_business_lines.sql", "utf8");
const manual = readFileSync("supabase/manual/0339_issue666_business_lines.sql", "utf8");
const rollback = readFileSync("supabase/manual/rollback_0339_issue666_business_lines_comentado.sql", "utf8");
const proof = readFileSync("docs/testes/issue666/prova-janela-0339.sql", "utf8");
const a = "10000000-0000-0000-0000-000000000001";
const b = "10000000-0000-0000-0000-000000000002";
const lineA = "20000000-0000-0000-0000-000000000001";
const lineA2 = "20000000-0000-0000-0000-000000000002";
const lineB = "20000000-0000-0000-0000-000000000003";
const master = "30000000-0000-0000-0000-000000000001";
const child = "30000000-0000-0000-0000-000000000002";
const grandchild = "30000000-0000-0000-0000-000000000003";
const sibling = "30000000-0000-0000-0000-000000000004";
let db: PGlite;

async function actor(role = "admin", company = a) {
  await db.exec(`SET LOCAL ROLE authenticated;
    SELECT set_config('fixture.company', '${company}', true), set_config('fixture.role', '${role}', true);`);
}
async function refuses(sql: string, message: string) {
  await db.exec("SAVEPOINT refused");
  await expect(db.exec(sql)).rejects.toThrow(message);
  await db.exec("ROLLBACK TO SAVEPOINT refused");
}
async function family() {
  await db.exec(`INSERT INTO events(id, business_line_id) VALUES ('${master}', '${lineA}');
    INSERT INTO events(id, parent_event_id) VALUES ('${child}', '${master}'), ('${sibling}', '${master}');
    INSERT INTO events(id, parent_event_id) VALUES ('${grandchild}', '${child}');`);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${a}'::uuid$$;
    CREATE TYPE app_role AS ENUM ('admin', 'manager', 'platform_admin', 'editor', 'viewer');
    CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql STABLE
      AS $$SELECT nullif(current_setting('fixture.company', true), '')::uuid$$;
    CREATE FUNCTION public.row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql STABLE
      AS $$SELECT $1 = public.current_company_id()$$;
    CREATE FUNCTION public.has_role(uuid, app_role) RETURNS boolean LANGUAGE sql STABLE
      AS $$SELECT $2::text = current_setting('fixture.role', true)$$;
    CREATE TABLE public.companies(id uuid PRIMARY KEY);
    INSERT INTO public.companies VALUES ('${a}'), ('${b}');
    CREATE TABLE public.events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id), parent_event_id uuid REFERENCES events(id));
    CREATE FUNCTION public.set_company_id_on_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.company_id IS NULL THEN NEW.company_id := current_company_id(); END IF; RETURN NEW; END $$;
    CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.events
      FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
    ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_event_tenant ON public.events FOR ALL TO authenticated
      USING (row_belongs_to_current_company(company_id)) WITH CHECK (row_belongs_to_current_company(company_id));
    INSERT INTO public.events(id, company_id) VALUES ('40000000-0000-0000-0000-000000000001', '${a}');
  `);
  // A mesma prova não depende da existência da coluna, nem instala objectos.
  await db.exec(proof);
  await db.exec(migration);
  await db.exec(proof);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`BEGIN;
    INSERT INTO business_lines(id, company_id, name, sort_order) VALUES
      ('${lineA}', '${a}', 'Social Eventos', 0), ('${lineA2}', '${a}', 'Social Esporte', 1),
      ('${lineB}', '${b}', 'Social Eventos', 0);`);
});
afterEach(async () => { await db.exec("ROLLBACK"); });

describe("#666 — 0339 preparada e provas locais descartáveis", () => {
  it("critério 1: cópia byte a byte, instalação sem DML e rollback integral comentado", async () => {
    expect(Buffer.from(manual)).toEqual(Buffer.from(migration));
    const topLevel = migration.replace(/\$function\$[\s\S]*?\$function\$/g, "").replace(/--[^\n]*/g, "");
    expect(topLevel).not.toMatch(/\b(?:INSERT INTO|UPDATE public|DELETE FROM|BEGIN|COMMIT)\b/i);
    expect(proof.replace(/--[^\n]*/g, "").split(";").filter((s) => s.trim()).every((s) => /^\s*SELECT\b/i.test(s))).toBe(true);
    expect(rollback.split("\n").every((line) => !line.trim() || line.startsWith("--"))).toBe(true);
    const rollbackSql = rollback.split("\n").filter((line) => /^-- (DROP|ALTER) /.test(line)).map((line) => line.slice(3)).join("\n");
    await db.exec(rollbackSql);
    expect((await db.query("SELECT to_regclass('public.business_lines') AS name")).rows).toEqual([{ name: null }]);
    expect((await db.query("SELECT proname FROM pg_proc WHERE proname IN ('inherit_event_business_line', 'propagate_event_business_line')")).rows).toEqual([]);
    expect((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'business_line_id'")).rows).toEqual([]);
    expect((await db.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.events'::regclass AND NOT tgisinternal")).rows).toEqual([{ tgname: "trg_set_company_id" }]);
  });

  it("critério 2: eventos anteriores ficam com NULL", async () => {
    expect((await db.query("SELECT business_line_id FROM events")).rows).toEqual([{ business_line_id: null }]);
  });

  it("critério 2: RLS isola A/B e viewer só lê", async () => {
    await actor("viewer");
    expect((await db.query("SELECT id FROM business_lines ORDER BY id")).rows).toEqual([{ id: lineA }, { id: lineA2 }]);
    await refuses("INSERT INTO business_lines(name) VALUES ('Proibida')", "row-level security");
    expect((await db.query("UPDATE business_lines SET name = 'Proibida' RETURNING id")).rows).toEqual([]);
    expect((await db.query("DELETE FROM business_lines RETURNING id")).rows).toEqual([]);
    await actor("admin", b);
    expect((await db.query("SELECT id FROM business_lines")).rows).toEqual([{ id: lineB }]);
    await refuses(`INSERT INTO business_lines(company_id, name) VALUES ('${a}', 'Outra empresa')`, "row-level security");
    expect((await db.query(`UPDATE business_lines SET name = 'Invasão' WHERE id = '${lineA}' RETURNING id`)).rows).toEqual([]);
  });

  it.each(["admin", "manager", "platform_admin"])("critério 2: %s gere o catálogo da sua empresa", async (role) => {
    await actor(role);
    expect((await db.query<{ company_id: string }>("INSERT INTO business_lines(name) VALUES ('Nova') RETURNING company_id")).rows[0].company_id).toBe(a);
    expect((await db.query(`UPDATE business_lines SET name = 'Renomeada', is_active = false, sort_order = 3 WHERE id = '${lineA}' RETURNING name, is_active, sort_order`)).rows).toEqual([{ name: "Renomeada", is_active: false, sort_order: 3 }]);
  });

  it("critério 2: índice recusa duplicados com espaços/maiúsculas e CHECK recusa vazio", async () => {
    await actor();
    await refuses("INSERT INTO business_lines(name) VALUES ('  SOCIAL EVENTOS  ')", "business_lines_company_name_unique");
    await refuses(`UPDATE business_lines SET name = ' social eventos ' WHERE id = '${lineA2}'`, "business_lines_company_name_unique");
    await refuses("INSERT INTO business_lines(name) VALUES ('   ')", "check constraint");
  });

  it("critério 2: evento recusa linha de outra empresa em INSERT, UPDATE e mudança de empresa", async () => {
    await actor();
    await refuses(`INSERT INTO events(business_line_id) VALUES ('${lineB}')`, "business_line_other_company");
    await family();
    await refuses(`UPDATE events SET business_line_id = '${lineB}' WHERE id = '${master}'`, "business_line_other_company");
    await refuses(`INSERT INTO events(parent_event_id, business_line_id) VALUES ('${master}', '${lineB}')`, "business_line_other_company");
    await db.exec("RESET ROLE");
    await refuses(`UPDATE events SET company_id = '${b}' WHERE id = '${master}'`, "business_line_other_company");
  });

  it("critério 2: INSERT sem empresa herda após trg_set_company_id; edição do filho é recusada mesmo com GUC forjado", async () => {
    await actor();
    await family();
    expect((await db.query(`SELECT company_id, business_line_id FROM events WHERE id = '${grandchild}'`)).rows).toEqual([{ company_id: a, business_line_id: lineA }]);
    await refuses(`UPDATE events SET business_line_id = '${lineA2}' WHERE id = '${child}'`, "business_line_inherited_from_master");
    await db.exec(`SELECT set_config('app.business_line_propagating', '${master}', true)`);
    await refuses(`UPDATE events SET business_line_id = NULL WHERE id = '${child}'`, "business_line_inherited_from_master");
    const order = (await db.query<{ tgname: string }>("SELECT tgname FROM pg_trigger WHERE tgrelid = 'events'::regclass AND (tgtype & 2) <> 0 ORDER BY tgname")).rows.map((r) => r.tgname);
    expect(order.indexOf("trg_zz_business_line")).toBeGreaterThan(order.indexOf("trg_set_company_id"));
  });

  it("critério 2: Master propaga a todos os filhos em dois níveis, restaura GUC e limpa para NULL", async () => {
    await actor();
    await family();
    await db.exec("SELECT set_config('app.business_line_propagating', 'previous', true)");
    await db.exec(`UPDATE events SET business_line_id = '${lineA2}' WHERE id = '${master}'`);
    expect((await db.query(`SELECT business_line_id FROM events WHERE id IN ('${master}', '${child}', '${sibling}', '${grandchild}')`)).rows).toEqual(Array(4).fill({ business_line_id: lineA2 }));
    expect((await db.query("SELECT current_setting('app.business_line_propagating') AS v")).rows).toEqual([{ v: "previous" }]);
    await db.exec(`UPDATE events SET business_line_id = NULL WHERE id = '${master}'`);
    expect((await db.query("SELECT business_line_id FROM events WHERE business_line_id IS NOT NULL")).rows).toEqual([]);
  });

  it("critério 2: filho herda NULL e a FK impede apagar uma linha em uso", async () => {
    await actor();
    await family();
    await refuses(`DELETE FROM business_lines WHERE id = '${lineA}'`, "foreign key constraint");
    await db.exec(`UPDATE business_lines SET is_active = false WHERE id = '${lineA}'`);
    await db.exec(`UPDATE events SET business_line_id = NULL WHERE id = '${master}';
      INSERT INTO events(parent_event_id, business_line_id) VALUES ('${master}', '${lineA2}');`);
    expect((await db.query("SELECT business_line_id FROM events WHERE business_line_id IS NOT NULL")).rows).toEqual([]);
  });

  it("critério 2: funções de trigger não ficam expostas por RPC", async () => {
    const rows = (await db.query(`SELECT has_function_privilege('anon', oid, 'EXECUTE') anon,
      has_function_privilege('authenticated', oid, 'EXECUTE') authenticated,
      has_function_privilege('service_role', oid, 'EXECUTE') service
      FROM pg_proc WHERE proname IN ('inherit_event_business_line', 'propagate_event_business_line')`)).rows;
    expect(rows).toEqual(Array(2).fill({ anon: false, authenticated: false, service: true }));
  });
});
