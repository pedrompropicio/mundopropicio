// @vitest-environment node
// P1 passo 2 — freeze/unfreeze_settlement_participant com a SQL real da 0269 em PGlite (stubs mínimos).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIG = readFileSync("supabase/manual/0269_p1_freeze_rpcs.sql", "utf8");
const C1 = "11111111-1111-1111-1111-111111111111";
const C2 = "22222222-2222-2222-2222-222222222222";
const ADMIN = "aaaaaaaa-0000-0000-0000-000000000001";
const VIEWER = "aaaaaaaa-0000-0000-0000-000000000002";
const S_OPEN = "50000000-0000-0000-0000-000000000001";
const S_SEALED = "50000000-0000-0000-0000-000000000002";
let db: PGlite;
let n = 0;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE ctx(uid uuid, company uuid); INSERT INTO ctx VALUES (NULL, '${C1}');
  CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT uid FROM public.ctx $$;
  CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT company FROM ctx $$;
  CREATE FUNCTION has_role(u uuid, r text) RETURNS boolean LANGUAGE sql AS $$ SELECT u = '${ADMIN}' AND r = 'admin' $$;
  CREATE FUNCTION has_permission(u uuid, p text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  CREATE TABLE event_settlements(id uuid PRIMARY KEY, is_sealed boolean NOT NULL DEFAULT false);
  INSERT INTO event_settlements VALUES ('${S_OPEN}', false), ('${S_SEALED}', true);
  CREATE TABLE event_settlement_participants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), settlement_id uuid, company_id uuid, mode text,
    frozen_at timestamptz, frozen_by uuid, frozen_values jsonb, freeze_note text);
  CREATE TABLE system_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text, entity_id text, action text, changed_by text,
    old_data jsonb, new_data jsonb, metadata jsonb, created_at timestamptz DEFAULT now(), company_id uuid);`);
  await db.exec(MIG);
}, 60000);
afterAll(async () => { await db?.close(); });

const one = async (sql: string, p: unknown[] = []) => (await db.query<any>(sql, p)).rows[0];
const as = (uid: string | null, company = C1) => db.query(`UPDATE ctx SET uid=$1, company=$2`, [uid, company]);
async function part(opts: { mode?: string; settlement?: string; company?: string } = {}) {
  n++;
  return (await one(`INSERT INTO event_settlement_participants(settlement_id,company_id,mode) VALUES ($1,$2,$3) RETURNING id`,
    [opts.settlement ?? S_OPEN, opts.company ?? C1, opts.mode ?? "settles"])).id as string;
}
const freeze = (id: string, v: unknown = { share: 1 }, note: string | null = "ok") =>
  one(`SELECT freeze_settlement_participant($1,$2::jsonb,$3) r`, [id, v === null ? null : JSON.stringify(v), note]);
const unfreeze = (id: string, reason: string | null) => one(`SELECT unfreeze_settlement_participant($1,$2) r`, [id, reason]);
const err = async (f: () => Promise<unknown>) => { try { await f(); return "ok"; } catch (e) { return (e as Error).message; } };

describe("P1 passo 2 — congelar sócio", () => {
  it("1 permissões: sem admin/manager/manage_bp recusa", async () => {
    const id = await part(); await as(VIEWER);
    expect(await err(() => freeze(id))).toMatch(/Sem permissão/);
    expect(await err(() => unfreeze(id, "x"))).toMatch(/Sem permissão/);
  });
  it("2 outra empresa recusa", async () => {
    const id = await part({ company: C2 }); await as(ADMIN);
    expect(await err(() => freeze(id))).toMatch(/outra empresa/);
  });
  it("3 nominal recusado", async () => {
    const id = await part({ mode: "nominal" }); await as(ADMIN);
    expect(await err(() => freeze(id))).toMatch(/acerta/);
  });
  it("4 fechamento selado recusado (congelar e descongelar)", async () => {
    const id = await part({ settlement: S_SEALED }); await as(ADMIN);
    expect(await err(() => freeze(id))).toMatch(/selado/);
    await db.query(`UPDATE event_settlement_participants SET frozen_at=now() WHERE id=$1`, [id]);
    expect(await err(() => unfreeze(id, "x"))).toMatch(/selado/);
  });
  it("5 duplo congelar recusado", async () => {
    const id = await part(); await as(ADMIN);
    await freeze(id);
    expect(await err(() => freeze(id))).toMatch(/já está congelado/);
  });
  it("6 valores inválidos: null, array, número", async () => {
    const id = await part(); await as(ADMIN);
    for (const v of [null, [1, 2], 5]) expect(await err(() => freeze(id, v))).toMatch(/tem de ser um objeto/);
    expect((await one(`SELECT frozen_at FROM event_settlement_participants WHERE id=$1`, [id])).frozen_at).toBeNull();
  });
  it("7 motivo vazio recusado", async () => {
    const id = await part(); await as(ADMIN); await freeze(id);
    for (const r of [null, "", "   "]) expect(await err(() => unfreeze(id, r))).toMatch(/Motivo obrigatório/);
  });
  it("8 congelar grava colunas e auditoria", async () => {
    const id = await part(); await as(ADMIN);
    await freeze(id, { share: 418598.65 }, "fecho");
    const p = await one(`SELECT * FROM event_settlement_participants WHERE id=$1`, [id]);
    expect(p.frozen_by).toBe(ADMIN);
    expect(p.frozen_values).toEqual({ share: 418598.65 });
    expect(p.freeze_note).toBe("fecho");
    const a = await one(`SELECT * FROM system_audit_log WHERE entity_id=$1 AND action='settlement_participant_frozen'`, [id]);
    expect(a.new_data.values).toEqual({ share: 418598.65 });
    expect(a.company_id).toBe(C1);
  });
  it("9 descongelar limpa e audita valores antigos + motivo", async () => {
    const id = await part(); await as(ADMIN);
    await freeze(id, { share: 7 }, "n");
    await unfreeze(id, " erro de quota ");
    const p = await one(`SELECT * FROM event_settlement_participants WHERE id=$1`, [id]);
    expect([p.frozen_at, p.frozen_by, p.frozen_values, p.freeze_note]).toEqual([null, null, null, null]);
    const a = await one(`SELECT * FROM system_audit_log WHERE entity_id=$1 AND action='settlement_participant_unfrozen'`, [id]);
    expect(a.old_data.values).toEqual({ share: 7 });
    expect(a.new_data.reason).toBe("erro de quota");
  });
  it("10 sócio não congelado não descongela", async () => {
    const id = await part(); await as(ADMIN);
    expect(await err(() => unfreeze(id, "x"))).toMatch(/não está congelado/);
  });
  it("11 ACL: anon sem EXECUTE; authenticated e service_role com", async () => {
    const r = await one(`SELECT
      has_function_privilege('anon','freeze_settlement_participant(uuid,jsonb,text)','EXECUTE') fa,
      has_function_privilege('anon','unfreeze_settlement_participant(uuid,text)','EXECUTE') ua,
      has_function_privilege('authenticated','freeze_settlement_participant(uuid,jsonb,text)','EXECUTE') fu,
      has_function_privilege('service_role','unfreeze_settlement_participant(uuid,text)','EXECUTE') us`);
    expect(r).toEqual({ fa: false, ua: false, fu: true, us: true });
  });
});
