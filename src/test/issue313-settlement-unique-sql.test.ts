// @vitest-environment node
// PGlite apenas em memória, com dados sintéticos; sem rede, credenciais ou bases externas.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const migrationPath = "drizzle/migrations/0317_issue313_settlements_unique_active.sql";
const manualPath = "supabase/manual/0317_issue313_settlements_unique_active.sql";
const rollbackPath = "supabase/manual/rollback_0317_issue313_settlements_unique_active_comentado.sql";
const proof = readFileSync("docs/testes/issue313/prova-janela.sql", "utf8");
const activeIndex = "ux_settlements_office_event_active";
const confirmedIndex = "ux_settlements_office_event_confirmed";
const office = "11111111-1111-4111-8111-111111111111";
const otherOffice = "22222222-2222-4222-8222-222222222222";
const event = "33333333-3333-4333-8333-333333333333";
const otherEvent = "44444444-4444-4444-8444-444444444444";
const schema = `
  CREATE TABLE public.ticket_office_settlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    financial_account_id uuid NOT NULL,
    event_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    CONSTRAINT settlements_status_check CHECK (status IN ('draft', 'confirmed', 'reversed'))
  );
  CREATE UNIQUE INDEX ux_settlements_office_event_confirmed
    ON public.ticket_office_settlements (financial_account_id, event_id)
    WHERE status = 'confirmed';
`;
let db: PGlite;

const insert = (
  status = "draft", financialAccountId = office, eventId = event, target = db,
) => target.query<{ id: string }>(
  `INSERT INTO public.ticket_office_settlements (financial_account_id, event_id, status)
   VALUES ($1, $2, $3) RETURNING id`,
  [financialAccountId, eventId, status],
);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(schema);
  await db.exec(readFileSync(manualPath, "utf8"));
}, 60_000);

beforeEach(async () => { await db.exec("TRUNCATE public.ticket_office_settlements"); });
afterAll(async () => { await db?.close(); });

describe("#313 — índice único dos fechos activos", () => {
  it("mantém cópias byte a byte iguais e rollback integralmente comentado", () => {
    expect(readFileSync(migrationPath).equals(readFileSync(manualPath))).toBe(true);
    expect(readFileSync(rollbackPath, "utf8").split("\n").every(
      (line) => line === "" || line === "--" || line.startsWith("-- "),
    )).toBe(true);
  });

  it("a prova executável contém só SELECTs e encontra ambos os índices válidos", async () => {
    const statements = proof.replace(/--[^\n]*/g, "").split(";").map((sql) => sql.trim()).filter(Boolean);
    expect(statements).toHaveLength(3);
    expect(statements.every((sql) => /^SELECT\b/i.test(sql))).toBe(true);
    const results = await db.exec(proof);
    expect(results[0].rows).toEqual([]);
    expect(results[2].rows).toEqual([
      expect.objectContaining({ indexname: activeIndex, indisvalid: true }),
      expect.objectContaining({ indexname: confirmedIndex, indisvalid: true }),
    ]);
    const { rows } = await db.query<{ comment: string }>(
      "SELECT obj_description($1::regclass, 'pg_class') AS comment", [`public.${activeIndex}`],
    );
    expect(rows[0].comment).toContain("#313:");
  });

  it.each([
    ["draft", "draft"],
    ["draft", "confirmed"],
    ["confirmed", "draft"],
  ])("recusa %s seguido de %s no mesmo par com 23505", async (first, second) => {
    await insert(first);
    await expect(insert(second)).rejects.toMatchObject({ code: "23505", constraint: activeIndex });
  });

  it("mantém a recusa de dois confirmados no mesmo par", async () => {
    await insert("confirmed");
    await expect(insert("confirmed")).rejects.toMatchObject({ code: "23505" });
  });

  it.each(["draft", "confirmed"])("aceita novo rascunho após estornar o primeiro %s", async (status) => {
    const { rows } = await insert(status);
    await db.query("UPDATE public.ticket_office_settlements SET status = 'reversed' WHERE id = $1", [rows[0].id]);
    await expect(insert()).resolves.toMatchObject({ affectedRows: 1 });
  });

  it("aceita dois estornados e um rascunho no mesmo par", async () => {
    await insert("reversed");
    await insert("reversed");
    await expect(insert()).resolves.toMatchObject({ affectedRows: 1 });
  });

  it.each([
    [otherOffice, event],
    [office, otherEvent],
  ])("aceita outra bilheteira ou outro evento: %s / %s", async (financialAccountId, eventId) => {
    await insert();
    await expect(insert("draft", financialAccountId, eventId)).resolves.toMatchObject({ affectedRows: 1 });
  });

  it("também impede reactivar um estornado quando já há um rascunho", async () => {
    const { rows } = await insert("reversed");
    await insert();
    await expect(db.query(
      "UPDATE public.ticket_office_settlements SET status = 'draft' WHERE id = $1", [rows[0].id],
    )).rejects.toMatchObject({ code: "23505", constraint: activeIndex });
  });

  it("permite reexecutar a migração sem erro e mantém a unicidade", async () => {
    await insert();
    await db.exec(readFileSync(manualPath, "utf8"));
    await expect(insert()).rejects.toMatchObject({ code: "23505", constraint: activeIndex });
  });

  it.each([
    ["draft", "draft"],
    ["draft", "confirmed"],
  ])("aborta numa BD nova com duplicados %s/%s sem deixar índice criado", async (first, second) => {
    const duplicateDb = new PGlite();
    try {
      await duplicateDb.exec(schema);
      await insert(first, office, event, duplicateDb);
      await insert(second, office, event, duplicateDb);
      await expect(duplicateDb.exec(readFileSync(manualPath, "utf8"))).rejects.toThrow(
        "#313: há fechos activos duplicados por bilheteira+evento; resolver antes de criar o índice",
      );
      const { rows } = await duplicateDb.query("SELECT to_regclass('public.ux_settlements_office_event_active') AS index");
      expect(rows).toEqual([{ index: null }]);
      expect((await duplicateDb.query("SELECT count(*)::int AS count FROM public.ticket_office_settlements")).rows)
        .toEqual([{ count: 2 }]);
    } finally {
      await duplicateDb.close();
    }
  }, 60_000);

  it("o rollback descomentado volta a aceitar dois rascunhos e preserva o índice confirmado", async () => {
    try {
      await insert();
      await expect(insert()).rejects.toMatchObject({ code: "23505" });
      const rollback = readFileSync(rollbackPath, "utf8").split("\n")
        .map((line) => line.startsWith("-- ") ? line.slice(3) : line).join("\n");
      await db.exec(rollback.slice(rollback.indexOf("DROP INDEX")));
      await expect(insert()).resolves.toMatchObject({ affectedRows: 1 });
      await db.exec("TRUNCATE public.ticket_office_settlements");
      await insert("confirmed");
      await expect(insert("confirmed")).rejects.toMatchObject({ code: "23505", constraint: confirmedIndex });
    } finally {
      await db.exec("TRUNCATE public.ticket_office_settlements");
      await db.exec(readFileSync(manualPath, "utf8"));
    }
  });
});
