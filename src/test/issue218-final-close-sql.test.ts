// @vitest-environment node
// #218 E2b: só PGlite em memória; sem credenciais, SQL remoto ou backfill.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pickFinalCloseVersions, type FinalCloseBpVersion } from "@/lib/bp-final-close";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const migrationPath = "drizzle/migrations/0314_issue218_bp_final_close_flag.sql";
const manualPath = "supabase/manual/0314_issue218_bp_final_close_flag.sql";
const rollbackPath = "supabase/manual/rollback_0314_issue218_bp_final_close_flag_comentado.sql";
const migration = readFileSync(manualPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const proof = readFileSync("docs/testes/issue218/prova-janela.sql", "utf8");
const uncommented = (sql: string) => sql.replace(/--[^\n]*/g, "");
const executableRollback = rollback.split("\n")
  .filter((line) => /^-- (DROP FUNCTION|DROP INDEX|ALTER TABLE)\b/.test(line))
  .map((line) => line.slice(3)).join("\n");
const id = (n: number) => `21800000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const master = id(1), split = id(2), other = id(3), denied = id(4);
let db: PGlite;
let historicalDefaults: { is_final_close: boolean }[];
const originalRows = `INSERT INTO public.bp_versions(id, event_id, version_number, state, description) VALUES
  ('${id(11)}', '${master}', 1, 'active', 'Versão final do fecho — antiga'),
  ('${id(12)}', '${split}', 1, 'active', 'Snapshot antigo do Split'),
  ('${id(13)}', '${other}', 13, 'active', 'BP v13 CONGELADO — estado anterior ao Fechamento Final'),
  ('${id(14)}', '${denied}', 1, 'active', 'Evento sem acesso');`;

async function snapshot(eventId = master, label: string | null = "Utilizador teste") {
  // authenticated não recebe UPDATE directo: a operação tem de ser atómica na RPC.
  await db.exec("SET ROLE authenticated");
  try {
    return (await db.query<{ id: string }>(
      "SELECT public.create_final_close_bp_snapshot($1, $2, $3) AS id",
      [eventId, "Versão final do fecho — 04/11/2026", label],
    )).rows[0].id;
  } finally {
    await db.exec("RESET ROLE");
  }
}
const versions = async () => (await db.query<Record<string, unknown>>("SELECT * FROM public.bp_versions ORDER BY event_id, version_number")).rows;
const finals = async () => (await db.query<{ id: string; event_id: string; cascaded_from_version_id: string | null }>(
  "SELECT id, event_id, cascaded_from_version_id FROM public.bp_versions WHERE is_final_close ORDER BY event_id",
)).rows;

describe("#218 — artefactos preparados (critério 1)", () => {
  it("a migração e a cópia manual são byte a byte iguais, sem redefinir a RPC original nem inferir marcas", () => {
    expect(readFileSync(migrationPath).equals(readFileSync(manualPath))).toBe(true);
    expect(migration).toContain("Classe R2 — PREPARADA, NÃO APLICADA");
    expect(migration).toContain("Aplicar só pelo PROC-promocao com Sim");
    expect(migration).toContain(rollbackPath);
    expect(migration).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_bp_snapshot\b/i);
    expect(migration).not.toMatch(/DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?public\.create_bp_snapshot\b/i);
    const updates = uncommented(migration).match(/UPDATE\s+public\.bp_versions\b[^;]+;/gi);
    expect(updates).toHaveLength(2);
    for (const update of updates!) expect(update).not.toMatch(/\bdescription\b/i);
    // Nenhuma marca fora do corpo da RPC: o histórico mantém o DEFAULT false.
    const ddl = uncommented(migration).split(/AS\s+\$function\$/i)[0];
    expect(ddl).not.toMatch(/\b(?:UPDATE|INSERT|DELETE)\b/i);
  });

  it("o rollback contém só comentários e a prova executável contém só SELECT", () => {
    expect(rollback.split("\n").every((line) => line === "" || line.startsWith("-- "))).toBe(true);
    expect(executableRollback.split("\n")).toHaveLength(3);
    const statements = uncommented(proof).split(";").map((sql) => sql.trim()).filter(Boolean);
    expect(statements.every((sql) => /^SELECT\b/i.test(sql))).toBe(true);
    expect(uncommented(proof).replace(/'(?:[^']|'')*'/g, "''"))
      .not.toMatch(/\b(?:UPDATE|INSERT|DELETE|CREATE|ALTER|DROP|DO|CALL)\b/i);
    expect(proof).toContain("SELECT DISTINCT ON (b.event_id)");
    expect(proof).toContain("ORDER BY b.event_id, b.version_number DESC");
    expect(proof).toContain("-- UPDATE public.bp_versions SET is_final_close = true WHERE id IN ('__ID__');");
  });

  it("a implementação original verifica permissão e empresa antes de criar o snapshot delegado", () => {
    const source = readFileSync("supabase/migrations/20260920202855_62cedbbe-e0ab-46e1-b652-261a8cf30d9c.sql", "utf8");
    const gate = source.slice(source.indexOf("v_uid uuid := auth.uid()"), source.indexOf("INSERT INTO public.bp_versions"));
    expect(gate).toContain("IF v_uid IS NOT NULL THEN");
    expect(gate).toContain("public.is_platform_admin(v_uid)");
    expect(gate).toContain("public.has_permission(v_uid, 'manage_bp')");
    expect(gate).toContain("FROM public.events e WHERE e.id = _event_id");
    expect(gate).toContain("v_company IS NULL OR v_company IS DISTINCT FROM public.current_company_id()");
    expect(gate.match(/ERRCODE = '42501'/g)).toHaveLength(2);
  });
});

describe("#218 — seleção pela marca explícita (critério 3)", () => {
  it("ignora a menção a Final sem marca e aceita descrição qualquer com marca", () => {
    const marked: FinalCloseBpVersion = {
      id: "marked", event_id: master, version_number: 2, state: "superseded", is_final_close: true,
      description: "Descrição qualquer", snapshot_payload: {},
    };
    const versions = [
      marked,
      { ...marked, id: "previous-state", version_number: 13, is_final_close: false,
        description: "BP v13 CONGELADO — estado anterior ao Fechamento Final" },
      { ...marked, id: "prefix-only", version_number: 14, is_final_close: false, description: "Versão final do fecho — 04/11/2026" },
      { ...marked, id: "draft", version_number: 15, state: "draft" },
      { ...marked, id: "archived", version_number: 16, state: "archived" },
      { ...marked, id: "older", version_number: 1, state: "active" },
      { ...marked, id: "other", event_id: other, version_number: 1, state: "active", description: null },
    ];
    const selected = pickFinalCloseVersions(versions);
    expect(selected.size).toBe(2);
    expect(selected.get(master)).toBe(marked);
    expect(selected.get(other)).toBe(versions[6]);
    expect(pickFinalCloseVersions([...versions].reverse())).toEqual(selected);
    expect(pickFinalCloseVersions()).toEqual(new Map());
  });
});

describe.sequential("#218 — 0314 em PGlite (critério 2)", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN;
      CREATE TABLE public.events (
        id uuid PRIMARY KEY, parent_event_id uuid REFERENCES public.events(id)
      );
      CREATE TABLE public.bp_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id uuid NOT NULL REFERENCES public.events(id),
        version_number integer NOT NULL,
        state text NOT NULL,
        description text,
        snapshot_payload jsonb NOT NULL DEFAULT '{}',
        cascaded_from_version_id uuid REFERENCES public.bp_versions(id),
        created_by uuid, created_by_label text,
        UNIQUE(event_id, version_number)
      );
      CREATE UNIQUE INDEX idx_bp_versions_one_active_per_event ON public.bp_versions(event_id) WHERE state = 'active';
      INSERT INTO public.events VALUES ('${master}', NULL), ('${split}', '${master}'), ('${other}', NULL), ('${denied}', NULL);
      ${originalRows}

      -- Stub da assinatura real (o corpo real e o seu portão são conferidos acima).
      CREATE FUNCTION public.create_bp_snapshot(
        _event_id uuid, _description text DEFAULT NULL, _approve_immediately boolean DEFAULT false,
        _scenario_label text DEFAULT NULL, _scenario_assumptions jsonb DEFAULT NULL,
        _is_pinned_scenario boolean DEFAULT false, _created_by uuid DEFAULT NULL,
        _created_by_label text DEFAULT NULL
      ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $stub$
      DECLARE
        v_id uuid;
        v_number integer;
        v_split record;
      BEGIN
        IF _event_id = '${denied}'::uuid THEN
          RAISE EXCEPTION 'Sem acesso à empresa/evento' USING ERRCODE = '42501';
        END IF;
        IF EXISTS (SELECT 1 FROM public.events WHERE id = _event_id AND parent_event_id IS NOT NULL) THEN
          RAISE EXCEPTION 'Snapshot directo no Split proibido';
        END IF;
        SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_number FROM public.bp_versions WHERE event_id = _event_id;
        IF _approve_immediately THEN
          UPDATE public.bp_versions SET state = 'superseded' WHERE event_id = _event_id AND state = 'active';
        END IF;
        INSERT INTO public.bp_versions(event_id, version_number, state, description, snapshot_payload, created_by, created_by_label)
        VALUES (_event_id, v_number, CASE WHEN _approve_immediately THEN 'active' ELSE 'draft' END,
          _description, jsonb_build_object('scenario_label', _scenario_label, 'scenario_assumptions', _scenario_assumptions,
          'is_pinned_scenario', _is_pinned_scenario), _created_by, _created_by_label)
        RETURNING id INTO v_id;
        FOR v_split IN SELECT id FROM public.events WHERE parent_event_id = _event_id LOOP
          SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_number FROM public.bp_versions WHERE event_id = v_split.id;
          IF _approve_immediately THEN
            UPDATE public.bp_versions SET state = 'superseded' WHERE event_id = v_split.id AND state = 'active';
          END IF;
          INSERT INTO public.bp_versions(event_id, version_number, state, description, cascaded_from_version_id)
          VALUES (v_split.id, v_number, CASE WHEN _approve_immediately THEN 'active' ELSE 'draft' END, _description, v_id);
        END LOOP;
        RETURN v_id;
      END;
      $stub$;
    `);
    await db.exec(migration);
    await db.exec(migration);
    historicalDefaults = (await db.query<{ is_final_close: boolean }>("SELECT is_final_close FROM public.bp_versions")).rows;
  }, 30000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec(`TRUNCATE public.bp_versions; ${originalRows}`);
  });

  it("duas aplicações mantêm o histórico false, coluna NOT NULL/DEFAULT false e uma única assinatura original", async () => {
    expect(historicalDefaults).toEqual(Array.from({ length: 4 }, () => ({ is_final_close: false })));
    expect((await db.query(`SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bp_versions' AND column_name = 'is_final_close'`)).rows)
      .toEqual([{ is_nullable: "NO", column_default: "false" }]);
    expect((await db.query("SELECT pronargs FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'create_bp_snapshot'")).rows)
      .toEqual([{ pronargs: 8 }]);
    await expect(db.query("UPDATE public.bp_versions SET is_final_close = NULL WHERE id = $1", [id(11)]))
      .rejects.toMatchObject({ code: "23502" });
  });

  it("authenticated cria Master e Split finais com a assinatura delegada e sem UPDATE directo", async () => {
    expect((await db.query("SELECT has_table_privilege('authenticated', 'public.bp_versions', 'UPDATE') AS allowed")).rows)
      .toEqual([{ allowed: false }]);
    const newId = await snapshot();
    expect(await finals()).toEqual([
      { id: newId, event_id: master, cascaded_from_version_id: null },
      { id: expect.any(String), event_id: split, cascaded_from_version_id: newId },
    ]);
    expect((await db.query("SELECT state, description, created_by, created_by_label, snapshot_payload FROM public.bp_versions WHERE id = $1", [newId])).rows)
      .toEqual([{
        state: "active", description: "Versão final do fecho — 04/11/2026", created_by: null, created_by_label: "Utilizador teste",
        snapshot_payload: { scenario_label: null, scenario_assumptions: null, is_pinned_scenario: false },
      }]);
    expect((await db.query<{ is_final_close: boolean }>("SELECT is_final_close FROM public.bp_versions WHERE version_number = 1")).rows.every((row) => row.is_final_close === false)).toBe(true);
  });

  it("reconcluir move ambas as marcas para as novas versões e preserva outro evento", async () => {
    await db.exec(`UPDATE public.bp_versions SET is_final_close = true WHERE event_id = '${other}'`);
    const first = await snapshot();
    const second = await snapshot(master, null);
    const selected = await finals();
    expect(selected).toEqual([
      { id: second, event_id: master, cascaded_from_version_id: null },
      { id: expect.any(String), event_id: split, cascaded_from_version_id: second },
      { id: id(13), event_id: other, cascaded_from_version_id: null },
    ]);
    expect((await db.query("SELECT is_final_close, state FROM public.bp_versions WHERE id = $1 OR cascaded_from_version_id = $1", [first])).rows)
      .toEqual([{ is_final_close: false, state: "superseded" }, { is_final_close: false, state: "superseded" }]);
    await db.exec(migration);
    expect(await finals()).toEqual(selected);
  });

  it("42501 do chamador sem acesso não cria versões nem muda qualquer marca", async () => {
    await snapshot();
    await db.exec(`UPDATE public.bp_versions SET is_final_close = true WHERE event_id = '${denied}'`);
    const before = await versions();
    await expect(snapshot(denied)).rejects.toMatchObject({ code: "42501" });
    expect(await versions()).toEqual(before);
  });

  it("uma falha na marca do Split reverte criação, superseded e limpeza das finais anteriores", async () => {
    await snapshot();
    const before = await versions();
    await db.exec(`CREATE FUNCTION public.reject_test_final_mark() RETURNS trigger LANGUAGE plpgsql AS $trigger$
      BEGIN IF NEW.event_id = '${split}'::uuid AND NEW.is_final_close THEN RAISE EXCEPTION 'Marca recusada'; END IF; RETURN NEW; END;
      $trigger$;
      CREATE TRIGGER reject_test_final_mark BEFORE UPDATE OF is_final_close ON public.bp_versions
      FOR EACH ROW EXECUTE FUNCTION public.reject_test_final_mark();`);
    try {
      await expect(snapshot()).rejects.toMatchObject({ code: "P0001" });
      expect(await versions()).toEqual(before);
    } finally {
      await db.exec("DROP TRIGGER reject_test_final_mark ON public.bp_versions; DROP FUNCTION public.reject_test_final_mark()");
    }
  });

  it("o índice parcial recusa uma segunda final do mesmo evento com 23505", async () => {
    await snapshot();
    const before = await versions();
    await expect(db.query(`INSERT INTO public.bp_versions(event_id, version_number, state, is_final_close)
      VALUES ($1, 99, 'superseded', true)`, [master])).rejects.toMatchObject({ code: "23505" });
    expect(await versions()).toEqual(before);
  });

  it("a RPC é SECURITY DEFINER, search_path público, authenticated/service_role permitidos e anon recusado", async () => {
    expect((await db.query(`SELECT p.prosecdef, p.proconfig, p.pronargs,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'create_final_close_bp_snapshot'`)).rows)
      .toEqual([{ prosecdef: true, proconfig: ["search_path=public"], pronargs: 3, authenticated: true, anon: false, service_role: true }]);
    await db.exec("SET ROLE anon");
    try {
      await expect(db.query("SELECT public.create_final_close_bp_snapshot($1, 'forjado')", [master]))
        .rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.exec("RESET ROLE");
    }
    expect(await finals()).toEqual([]);
  });

  it("o rollback descomentado remove só RPC, índice e coluna, preservando os snapshots e a função original", async () => {
    await snapshot();
    const before = await versions();
    await db.exec(executableRollback);
    expect((await db.query(`SELECT to_regprocedure('public.create_final_close_bp_snapshot(uuid,text,text)') AS rpc,
      to_regclass('public.idx_bp_versions_one_final_close_per_event') AS idx`)).rows).toEqual([{ rpc: null, idx: null }]);
    expect((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'bp_versions' AND column_name = 'is_final_close'")).rows).toEqual([]);
    expect(await versions()).toEqual(before.map(({ is_final_close: _flag, ...row }) => row));
    expect((await db.query("SELECT pronargs FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'create_bp_snapshot'")).rows)
      .toEqual([{ pronargs: 8 }]);
    await db.exec(migration);
  });
});
