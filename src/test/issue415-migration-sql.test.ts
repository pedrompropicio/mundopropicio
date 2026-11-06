// @vitest-environment node
/** Synthetic catalog only. This does not certify the installed catalog or cross-session lock races. */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const manual = "supabase/manual/0307_issue415_settlement_contract.sql";
const sql = readFileSync(manual, "utf8");
const uid = (n: number) => `41500000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const company = uid(1), other = uid(2), actor = uid(3), event = uid(4);
let db: PGlite;
const one = async (statement: string) => (await db.query<Record<string, any>>(statement)).rows[0];
const init = (n: number, key = `init-${n}`, source = "'committed'", overhead = "true") =>
  one(`SELECT initialize_settlement_contract('${uid(n)}',${source},${overhead},'manifesto fictício','${key}') r`).then((r) => r.r);
const set = (n: number, rev: number, key: string, source = "'realized'", overhead = "true") =>
  one(`SELECT set_settlement_contract('${uid(n)}',${source},${overhead},${rev},'edição fictícia','${key}') r`).then((r) => r.r);
const participant = (n: number, supports: boolean, rev: number, key: string) =>
  one(`SELECT set_settlement_participant_overhead('${uid(n)}',${supports},${rev},'dispensa fictícia','${key}') r`).then((r) => r.r);
async function node(n: number, parent: number | null = null, tenant = company) {
  await db.exec(`INSERT INTO event_settlements(id,company_id,event_id,parent_id) VALUES('${uid(n)}','${tenant}','${event}',${parent === null ? "NULL" : `'${uid(parent)}'`})`);
}
async function member(n: number, settlement: number, kind = "partner", mode = "settles") {
  await db.exec(`INSERT INTO event_settlement_participants(id,company_id,event_id,settlement_id,participant_kind,mode) VALUES('${uid(n)}','${company}','${event}','${uid(settlement)}','${kind}','${mode}')`);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('test.company',true),'')::uuid $$;
    CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $2 = current_setting('test.role',true) $$;
    CREATE FUNCTION has_permission(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.bp',true) = 'yes' $$;
    CREATE TABLE event_settlements(id uuid PRIMARY KEY,company_id uuid,event_id uuid,parent_id uuid REFERENCES event_settlements(id),is_sealed boolean NOT NULL DEFAULT false);
    CREATE TABLE event_settlement_participants(id uuid PRIMARY KEY,company_id uuid,event_id uuid,settlement_id uuid REFERENCES event_settlements(id),participant_kind text NOT NULL,mode text NOT NULL,frozen_at timestamptz);
    CREATE TABLE partner_payment_contracts(id uuid PRIMARY KEY,participant_id uuid,cancelled_at timestamptz);
    CREATE TABLE system_audit_log(id bigserial PRIMARY KEY,entity_type text,entity_id text,action text,changed_by text,old_data jsonb,new_data jsonb,company_id uuid);
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON event_settlements,event_settlement_participants TO authenticated;
    SELECT set_config('test.uid','${actor}',false),set_config('test.company','${company}',false),set_config('test.role','admin',false);`);
  // Existing row proves additive DDL does not decide any historical agreement.
  await node(10);
  await member(110, 10);
  await db.exec(sql);
});
afterAll(async () => { await db?.close(); });

describe.sequential("#415 migration 0307 in local PGlite", () => {
  it("C1: identical bytes, commented rollback and no top-level data statements/transaction", () => {
    expect(readFileSync("drizzle/migrations/0307_issue415_settlement_contract.sql")).toEqual(readFileSync(manual));
    const rollback = readFileSync("supabase/manual/rollback_0307_issue415_settlement_contract_comentado.sql", "utf8");
    expect(rollback.split("\n").every((line) => !line.trim() || line.startsWith("--"))).toBe(true);
    const ddl = sql.replace(/\$function\$[\s\S]*?\$function\$/g, "").replace(/--[^\n]*/g, "").replace(/CREATE TRIGGER[\s\S]*?;/g, "");
    expect(ddl).not.toMatch(/\b(INSERT|UPDATE|DELETE|BEGIN|COMMIT)\b(?!\s+OR)/i); // trigger declarations checked separately below
  });
  it("C2: columns exist; historical row stays uninitialized; participant supports by default", async () => {
    const row = await one(`SELECT * FROM event_settlements WHERE id='${uid(10)}'`);
    expect(row).toMatchObject({ contract_expense_source: null, contract_include_overhead: null, contract_revision: 0, contract_initialized_at: null, contract_initialized_by: null });
    expect((await one(`SELECT supports_overhead FROM event_settlement_participants WHERE id='${uid(110)}'`)).supports_overhead).toBe(true);
    expect((await one("SELECT count(*)::int n FROM system_audit_log")).n).toBe(0);
  });
  it("C2: initialization once, root decisions explicit and CAS rejects stale revision", async () => {
    await expect(init(10, "missing-source", "NULL")).rejects.toThrow(/Raiz exige/);
    const receipt = await init(10);
    expect(receipt).toMatchObject({ ok: true, revision: 1, changed_by: actor, expense_source: "committed", include_overhead: true });
    await expect(init(10, "twice")).rejects.toThrow(/já inicializado/);
    await expect(set(10, 0, "stale")).rejects.toThrow(/Revisão desfasada/);
    expect((await set(10, 1, "set-10")).revision).toBe(2);
  });
  it("C2: request key replays the same receipt and rejects changed payload/cross-command reuse", async () => {
    expect(await init(10)).toEqual(expect.objectContaining({ revision: 1 })); // replay after subsequent revisions
    await expect(init(10, "init-10", "'realized'")).rejects.toThrow(/payload diferente/);
    await expect(set(10, 2, "init-10")).rejects.toThrow(/payload diferente/);
    expect((await one(`SELECT count(*)::int n FROM system_audit_log WHERE new_data->>'request_key'='init-10'`)).n).toBe(1);
  });
  it("C2: direct UPDATE/INSERT/UPSERT of configuration refused and failed command rolls back", async () => {
    await expect(db.exec(`UPDATE event_settlements SET contract_include_overhead=false WHERE id='${uid(10)}'`)).rejects.toThrow(/pela RPC/);
    await expect(db.exec(`UPDATE event_settlements SET contract_revision=3 WHERE id='${uid(10)}'`)).rejects.toThrow(/pela RPC/);
    await expect(db.exec(`UPDATE event_settlement_participants SET supports_overhead=false WHERE id='${uid(110)}'`)).rejects.toThrow(/pela RPC/);
    await expect(db.exec(`INSERT INTO event_settlements(id,company_id,event_id,contract_expense_source) VALUES('${uid(11)}','${company}','${event}','realized')`)).rejects.toThrow(/pela RPC/);
    await expect(db.exec(`INSERT INTO event_settlements(id,company_id,event_id) VALUES('${uid(10)}','${company}','${event}') ON CONFLICT(id) DO UPDATE SET contract_expense_source='committed'`)).rejects.toThrow(/pela RPC/);
    await expect(participant(110, false, 2, "too-few")).rejects.toThrow(/2 settles/);
    expect((await one(`SELECT contract_revision FROM event_settlements WHERE id='${uid(10)}'`)).contract_revision).toBe(2);
    expect((await one(`SELECT supports_overhead FROM event_settlement_participants WHERE id='${uid(110)}'`)).supports_overhead).toBe(true);
    expect((await one(`SELECT count(*)::int n FROM system_audit_log WHERE new_data->>'request_key'='too-few'`)).n).toBe(0);
  });
  it("C2: house counts in two settles; nominal/house cannot receive exemption; modes/deletion preserve rule", async () => {
    await member(111, 10, "house");
    await member(112, 10, "partner", "nominal");
    const receipt = await participant(110, false, 2, "exempt");
    expect(receipt).toMatchObject({ participant_id: uid(110), supports_overhead: false, revision: 3 });
    expect(await participant(110, false, 2, "exempt")).toEqual(receipt);
    await expect(participant(111, false, 3, "house-exempt")).rejects.toThrow(/externo settles/);
    await expect(participant(112, false, 3, "nominal-exempt")).rejects.toThrow(/externo settles/);
    await expect(db.exec(`DELETE FROM event_settlement_participants WHERE id='${uid(111)}'`)).rejects.toThrow(/2 settles/);
    await expect(db.exec(`UPDATE event_settlement_participants SET mode='nominal' WHERE id='${uid(111)}'`)).rejects.toThrow(/2 settles/);
    await expect(db.exec(`UPDATE event_settlement_participants SET mode='nominal' WHERE id='${uid(110)}'`)).rejects.toThrow(/externo settles/);
    await expect(participant(110, true, 2, "stale-participant")).rejects.toThrow(/Revisão desfasada/);
  });
  it("C2: Q3-A independent inheritance/override/removal and sealed descendants/ancestors refuse edits", async () => {
    await node(20); await node(21, 20); await node(22, 21);
    await init(20);
    expect(await init(21, "child-source", "'realized'", "NULL")).toMatchObject({ expense_source: "realized", include_overhead: true });
    expect(await init(22, "grandchild-inherit", "NULL", "NULL")).toMatchObject({ expense_source: "realized", include_overhead: true });
    expect(await set(21, 1, "remove-override", "NULL", "NULL")).toMatchObject({ expense_source: "committed", revision: 2 });
    await db.exec(`UPDATE event_settlements SET is_sealed=true WHERE id='${uid(22)}'`);
    await expect(set(20, 1, "sealed-descendant")).rejects.toThrow(/selado/);
    await expect(set(22, 1, "sealed-node")).rejects.toThrow(/selado/);
    await db.exec(`UPDATE event_settlements SET is_sealed=false WHERE id='${uid(22)}'; UPDATE event_settlements SET is_sealed=true WHERE id='${uid(20)}'`);
    await expect(set(21, 2, "sealed-ancestor")).rejects.toThrow(/selado/);
  });
  it("C2: direct graph/participant edits cannot bypass configured or inherited seal", async () => {
    await expect(node(23, 21)).rejects.toThrow(/Ancestral selado/);
    await expect(member(123, 21)).rejects.toThrow(/Ancestral selado/);
    await expect(db.exec(`UPDATE event_settlements SET parent_id=NULL WHERE id='${uid(21)}'`)).rejects.toThrow(/regularização/);
    await expect(db.exec(`DELETE FROM event_settlements WHERE id='${uid(22)}'`)).rejects.toThrow(/regularização/);
    await node(24); await node(25,24);
    await expect(db.exec(`UPDATE event_settlements SET parent_id='${uid(25)}' WHERE id='${uid(24)}'`)).rejects.toThrow(/ancestral/);
  });
  it("C2: inactive exemption retained; enabling inherited overhead revalidates dependents atomically", async () => {
    await node(30); await init(30, "off-root", "'realized'", "false");
    await member(130, 30);
    await participant(130, false, 1, "inactive-exempt");
    await expect(set(30, 2, "reactivate")).rejects.toThrow(/2 settles/);
    expect((await one(`SELECT contract_include_overhead,contract_revision FROM event_settlements WHERE id='${uid(30)}'`))).toEqual({ contract_include_overhead: false, contract_revision: 2 });
  });
  it("C2: tenant, role, null identity, reason, revision and freeze/payment-contract gates", async () => {
    await node(40, null, other);
    await expect(init(40)).rejects.toThrow(/outra empresa/);
    await db.exec("SELECT set_config('test.role','editor',false),set_config('test.bp','yes',false)");
    await expect(set(10, 3, "bp-alone")).rejects.toThrow(/Sem permissão/);
    await db.exec("SELECT set_config('test.role','manager',false)");
    await node(41); await init(41); await member(141, 41);
    await db.exec(`UPDATE event_settlement_participants SET frozen_at=now() WHERE id='${uid(141)}'`);
    await expect(set(41, 1, "frozen")).rejects.toThrow(/congelado/);
    await db.exec(`UPDATE event_settlement_participants SET frozen_at=NULL WHERE id='${uid(141)}'; INSERT INTO partner_payment_contracts VALUES('${uid(241)}','${uid(141)}',NULL)`);
    await expect(set(41, 1, "payment-contract")).rejects.toThrow(/contratos ativos/);
    await expect(one(`SELECT set_settlement_contract('${uid(10)}','realized',true,3,' ','no-reason')`)).rejects.toThrow(/Motivo/);
    await expect(one(`SELECT set_settlement_contract('${uid(10)}','realized',true,NULL,'reason','no-rev')`)).rejects.toThrow(/Revisão/);
    await db.exec("SELECT set_config('test.uid','',false)");
    await expect(set(10, 3, "no-identity")).rejects.toThrow(/Sem permissão/);
    await db.exec(`SELECT set_config('test.uid','${actor}',false)`);
  });
  it("C2: audit stores exact payload, before/after, family provenance, actor and same receipt", async () => {
    const log = await one(`SELECT * FROM system_audit_log WHERE new_data->>'request_key'='exempt'`);
    expect(log).toMatchObject({ entity_type: "event_settlement_participants", entity_id: uid(110), company_id: company, changed_by: actor });
    expect(log.old_data.values.supports_overhead).toBe(true);
    expect(log.new_data.values.supports_overhead).toBe(false);
    expect(log.new_data.payload).toMatchObject({ expected_revision: 2, operation: "participant", reason: "dispensa fictícia", actor });
    expect(log.old_data.family[0].revision).toBe(2);
    expect(log.new_data.family[0].revision).toBe(3);
    expect(log.new_data.receipt).toEqual(await participant(110, false, 2, "exempt"));
    await expect(db.exec(`INSERT INTO system_audit_log(entity_type,entity_id,action,changed_by,old_data,new_data,company_id)
      SELECT entity_type,entity_id,action,changed_by,old_data,new_data,company_id FROM system_audit_log WHERE new_data->>'request_key'='exempt'`)).rejects.toThrow(/unique constraint/);
  });
  it("C2: public RPC ACL; private helper closed; caller GUC alone cannot bypass trigger", async () => {
    for (const signature of ["initialize_settlement_contract(uuid,text,boolean,text,text)", "set_settlement_contract(uuid,text,boolean,integer,text,text)", "set_settlement_participant_overhead(uuid,boolean,integer,text,text)"]) {
      const acl = await one(`SELECT has_function_privilege('anon','${signature}','execute') anon,has_function_privilege('authenticated','${signature}','execute') authenticated,has_function_privilege('service_role','${signature}','execute') service`);
      expect(acl).toEqual({ anon: false, authenticated: true, service: true });
    }
    expect((await one("SELECT has_function_privilege('authenticated','_issue415_contract_command(text,uuid,text,boolean,boolean,integer,text,text)','execute') allowed")).allowed).toBe(false);
    await db.exec("SET ROLE authenticated; SELECT set_config('app.settlement_contract_op','on',false)");
    try {
      await expect(db.exec(`UPDATE event_settlements SET contract_include_overhead=false WHERE id='${uid(10)}'`)).rejects.toThrow(/pela RPC/);
      await expect(participant(110, true, 3, "authenticated-rpc")).resolves.toMatchObject({ revision: 4 });
    } finally { await db.exec("RESET ROLE; SELECT set_config('app.settlement_contract_op','',false)"); }
  });
});
