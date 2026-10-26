// @vitest-environment node
// P1 passo 3 — guarda do congelamento (0270) sobre as RPCs reais da 0269, em PGlite.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RPCS = readFileSync("supabase/manual/0269_p1_freeze_rpcs.sql", "utf8");
const GUARD = readFileSync("supabase/manual/0270_p1_freeze_guard.sql", "utf8");
const C1 = "11111111-1111-1111-1111-111111111111";
const ADMIN = "aaaaaaaa-0000-0000-0000-000000000001";
const EV = "e0000000-0000-0000-0000-000000000001";
const S1 = "50000000-0000-0000-0000-000000000001";
let db: PGlite;
let n = 0;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE ctx(uid uuid, company uuid); INSERT INTO ctx VALUES ('${ADMIN}', '${C1}');
  CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT uid FROM public.ctx $$;
  CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT company FROM ctx $$;
  CREATE FUNCTION has_role(u uuid, r text) RETURNS boolean LANGUAGE sql AS $$ SELECT u = '${ADMIN}' AND r = 'admin' $$;
  CREATE FUNCTION has_permission(u uuid, p text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  CREATE TABLE event_settlements(id uuid PRIMARY KEY, event_id uuid, is_sealed boolean NOT NULL DEFAULT false);
  INSERT INTO event_settlements VALUES ('${S1}', '${EV}', false);
  CREATE TABLE event_settlement_participants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), settlement_id uuid, event_id uuid, company_id uuid,
    mode text, participant_kind text DEFAULT 'partner', supplier_id uuid DEFAULT gen_random_uuid(), event_partner_id uuid,
    profit_pct numeric DEFAULT 10, loss_pct numeric DEFAULT 10, expense_includes_iva boolean DEFAULT false, can_pay boolean DEFAULT false,
    can_order boolean DEFAULT false, transfer_with_vat boolean DEFAULT false, notes text, updated_at timestamptz DEFAULT now(),
    frozen_at timestamptz, frozen_by uuid, frozen_values jsonb, freeze_note text);
  CREATE TABLE event_partner_extras(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid, partner_id uuid, kind text, amount numeric, company_id uuid);
  CREATE TABLE system_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text, entity_id text, action text, changed_by text,
    old_data jsonb, new_data jsonb, metadata jsonb, created_at timestamptz DEFAULT now(), company_id uuid);
  CREATE FUNCTION touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
  CREATE TRIGGER update_esp_updated_at BEFORE UPDATE ON event_settlement_participants FOR EACH ROW EXECUTE FUNCTION touch();`);
  await db.exec(RPCS);
  await db.exec(GUARD);
}, 60000);
afterAll(async () => { await db?.close(); });

const one = async (sql: string, p: unknown[] = []) => (await db.query<any>(sql, p)).rows[0];
const err = async (sql: string, p: unknown[] = []) => { try { await db.query(sql, p); return "ok"; } catch (e) { return (e as Error).message; } };
async function part(frozen: boolean) {
  n++;
  const ep = (await one(`SELECT gen_random_uuid() id`)).id as string;
  const id = (await one(`INSERT INTO event_settlement_participants(settlement_id,event_id,company_id,mode,event_partner_id) VALUES ($1,$2,$3,'settles',$4) RETURNING id`,
    [S1, EV, C1, ep])).id as string;
  if (frozen) await db.query(`SELECT freeze_settlement_participant($1,'{"share":1}'::jsonb,'n')`, [id]);
  return { id, ep };
}

describe("P1 passo 3 — guarda do congelamento", () => {
  it("bloqueia UPDATE de cada coluna protegida num sócio congelado", async () => {
    const { id } = await part(true);
    const sets: Record<string, string> = {
      profit_pct: "50", loss_pct: "50", mode: "'nominal'", expense_includes_iva: "true", can_pay: "true", can_order: "true",
      transfer_with_vat: "true", supplier_id: "gen_random_uuid()", event_partner_id: "gen_random_uuid()", settlement_id: "gen_random_uuid()",
    };
    for (const [c, v] of Object.entries(sets))
      expect(await err(`UPDATE event_settlement_participants SET ${c}=${v} WHERE id=$1`, [id]), c).toMatch(/Sócio congelado: a negociação/);
  });
  it("sócio congelado aceita UPDATE de coluna não protegida (notes) e o updated_at do trigger", async () => {
    const { id } = await part(true);
    expect(await err(`UPDATE event_settlement_participants SET notes='x' WHERE id=$1`, [id])).toBe("ok");
  });
  it("bloqueia DELETE de sócio congelado", async () => {
    const { id } = await part(true);
    expect(await err(`DELETE FROM event_settlement_participants WHERE id=$1`, [id])).toMatch(/não pode ser removido/);
  });
  it("colunas de congelamento fora da RPC: bloqueadas em congelado e não congelado", async () => {
    const a = await part(true); const b = await part(false);
    expect(await err(`UPDATE event_settlement_participants SET frozen_at=NULL WHERE id=$1`, [a.id])).toMatch(/só se altera/);
    expect(await err(`UPDATE event_settlement_participants SET frozen_values='{}' WHERE id=$1`, [b.id])).toMatch(/só se altera/);
    expect(await err(`UPDATE event_settlement_participants SET freeze_note='x' WHERE id=$1`, [b.id])).toMatch(/só se altera/);
  });
  it("sócio não congelado edita e apaga normalmente", async () => {
    const { id } = await part(false);
    expect(await err(`UPDATE event_settlement_participants SET profit_pct=33, transfer_with_vat=true WHERE id=$1`, [id])).toBe("ok");
    expect(await err(`DELETE FROM event_settlement_participants WHERE id=$1`, [id])).toBe("ok");
  });
  it("extras: bloqueados no sócio congelado (INSERT/UPDATE/DELETE), livres noutro sócio", async () => {
    const f = await part(false); const o = await part(false);
    const x = (await one(`INSERT INTO event_partner_extras(event_id,partner_id,kind,amount) VALUES ($1,$2,'k',1) RETURNING id`, [EV, f.ep])).id;
    await db.query(`SELECT freeze_settlement_participant($1,'{}'::jsonb,NULL)`, [f.id]);
    expect(await err(`INSERT INTO event_partner_extras(event_id,partner_id,kind,amount) VALUES ($1,$2,'k',1)`, [EV, f.ep])).toMatch(/ajustes deste sócio/);
    expect(await err(`UPDATE event_partner_extras SET amount=2 WHERE id=$1`, [x])).toMatch(/ajustes deste sócio/);
    expect(await err(`DELETE FROM event_partner_extras WHERE id=$1`, [x])).toMatch(/ajustes deste sócio/);
    const y = (await one(`INSERT INTO event_partner_extras(event_id,partner_id,kind,amount) VALUES ($1,$2,'k',1) RETURNING id`, [EV, o.ep])).id;
    expect(await err(`UPDATE event_partner_extras SET partner_id=$2 WHERE id=$1`, [y, f.ep])).toMatch(/ajustes deste sócio/);
    expect(await err(`UPDATE event_partner_extras SET amount=5 WHERE id=$1`, [y])).toBe("ok");
    expect(await err(`DELETE FROM event_partner_extras WHERE id=$1`, [y])).toBe("ok");
  });
  it("congelar e descongelar pelas RPCs continua a funcionar; depois edita", async () => {
    const { id } = await part(true);
    await db.query(`SELECT unfreeze_settlement_participant($1,'motivo')`, [id]);
    expect((await one(`SELECT frozen_at FROM event_settlement_participants WHERE id=$1`, [id])).frozen_at).toBeNull();
    expect(await err(`UPDATE event_settlement_participants SET profit_pct=20 WHERE id=$1`, [id])).toBe("ok");
    await db.query(`SELECT freeze_settlement_participant($1,'{"a":1}'::jsonb,NULL)`, [id]);
    expect((await one(`SELECT frozen_values FROM event_settlement_participants WHERE id=$1`, [id])).frozen_values).toEqual({ a: 1 });
  });
});
