// @vitest-environment node
// #644b B1: SQL só em PGlite descartável, sem credenciais/rede/dados operacionais.
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const migration = readFileSync("drizzle/migrations/0344_issue644b_result_basis.sql", "utf8");
const manual = readFileSync("supabase/manual/0344_issue644b_result_basis.sql");
const rollbackFile = readFileSync("supabase/manual/rollback_0344_issue644b_result_basis_comentado.sql", "utf8");
const rollback = rollbackFile.split("-- BEGIN ROLLBACK SQL\n")[1].split("-- END ROLLBACK SQL")[0]
  .split("\n").map(line => line.replace(/^-- ?/, "")).join("\n");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = uuid(1), B = uuid(2), ROOT = uuid(10), CITY = uuid(11), OTHER_ROOT = uuid(12), FOREIGN = uuid(20);
const ADMIN = uuid(100), VIEWER = uuid(101), DENIED = uuid(102), PARTNER = uuid(103), ADMIN_B = uuid(104);
const MANAGER = uuid(105), PLATFORM = uuid(106), BP_READER = uuid(107), DRE_READER = uuid(108), POSITION_READER = uuid(109);
const BP = uuid(200), CITY_BP = uuid(201), FOREIGN_BP = uuid(202);
const SEAL = uuid(300), CITY_SEAL = uuid(301), FOREIGN_SEAL = uuid(302);
const CLOSURE = uuid(400), RECEIPT = uuid(500);
const HASH = "a".repeat(64);
const NOW = "2026-01-02T12:00:00Z";
const fields = ["criterion_version", "criterion_sha256", "closed_by", "budget_mode_resolved", "budget_mode_source",
  "expense_source", "expense_source_original", "cost_include_overhead", "partner_calc_basis", "result_revenue_vat_basis",
  "result_expense_vat_basis", "revenue_policy", "revenue_policy_version", "revenue_include_overhead", "result_origin"];
const tables = ["event_result_closures", "event_result_closure_seals", "event_result_closure_log", "event_result_closure_active"];
const gates = ["a_result_closure_writer", "a_result_closure_seal_writer", "a_result_closure_log_writer", "a_result_closure_active_writer"];
let db: PGlite;
let serial = 1000;

async function owner() {
  await db.exec("SET SESSION AUTHORIZATION postgres; RESET ROLE; SET ROLE migration_owner");
}
async function actor(role: "authenticated" | "anon" | "service_role", user = VIEWER, company = A) {
  await db.exec("SET SESSION AUTHORIZATION postgres; RESET ROLE; SET SESSION AUTHORIZATION fixture_authenticator");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false), set_config('request.company_id',$2,false)", [user, company]);
  await db.exec(`SET ROLE ${role}`);
}
// Apenas a fixture owner desactiva o gate B1 para testar constraints, sem instalar um escritor.
// Validators/FKs/append-only/RLS não são desactivados; este helper nunca entra no SQL entregue.
async function seedGate(enabled: boolean) {
  for (let i = 0; i < tables.length; i++) {
    await db.exec(`ALTER TABLE public.${tables[i]} ${enabled ? "ENABLE" : "DISABLE"} TRIGGER ${gates[i]}`);
  }
}
async function reject(sql: string, error: string | RegExp, code?: string) {
  await db.exec("SAVEPOINT negative_probe");
  try {
    const attempt = db.exec(sql);
    await expect(attempt).rejects.toThrow(error);
    if (code) await expect(attempt).rejects.toMatchObject({ code });
  } finally {
    await db.exec("ROLLBACK TO SAVEPOINT negative_probe; RELEASE SAVEPOINT negative_probe");
  }
}
async function insert(table: string, values: Record<string, unknown>) {
  const keys = Object.keys(values);
  return db.query(`INSERT INTO public.${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`,
    keys.map(k => values[k]));
}
function revision(overrides: Record<string, unknown> = {}) {
  return { id: CLOSURE, company_id: A, event_id: ROOT, closure_root_event_id: ROOT, root_closure_id: CLOSURE,
    revision: 1, closed_at: NOW, closed_by: ADMIN, captured_at: NOW, captured_by: ADMIN,
    capture_kind: "close_event", schema_version: 1, criterion_version: 1, criterion_sha256: HASH,
    basis_status: "recorded", budget_mode_resolved: "with_bp", budget_mode_source: "company",
    expense_source: "committed", expense_source_original: "committed", cost_include_overhead: true,
    partner_calc_basis: "net_result", result_revenue_vat_basis: "net", result_expense_vat_basis: "net",
    revenue_policy: "real_then_bp_by_bucket", revenue_policy_version: 1, revenue_include_overhead: false,
    final_bp_version_id: null, perimeter_kind: "event", result_origin: "canonical_current_inputs",
    field_evidence: Object.fromEntries(fields.map(f => [f, { source: "synthetic_server_input" }])),
    unknown_fields: [], provenance: { fixture: true }, previous_closure_id: null, confirmation_receipt_id: null, ...overrides };
}
async function receipt(closure = CLOSURE, overrides: Record<string, unknown> = {}) {
  const id = uuid(++serial);
  await insert("event_result_closure_log", { id, closure_id: closure, company_id: A, event_id: ROOT,
    action: "closed", occurred_at: NOW, performed_by: ADMIN, reason: "synthetic receipt", evidence: {}, ...overrides });
  return String(overrides.id ?? id);
}
async function active(closure = CLOSURE, receiptId = RECEIPT, overrides: Record<string, unknown> = {}) {
  await insert("event_result_closure_active", { event_id: ROOT, company_id: A, closure_id: closure,
    activation_receipt_id: receiptId, ...overrides });
}
async function seed(overrides: Record<string, unknown> = {}, activate = true) {
  const row = revision(overrides);
  await insert("event_result_closures", row);
  const rid = await receipt(String(row.id), { id: row.id === CLOSURE ? RECEIPT : uuid(++serial),
    company_id: row.company_id, event_id: row.event_id, performed_by: row.captured_by,
    action: row.capture_kind === "close_event" ? "closed" : "reconstructed" });
  if (activate) await active(String(row.id), rid, { event_id: row.event_id, company_id: row.company_id });
  return row;
}
async function seal(overrides: Record<string, unknown> = {}) {
  await insert("event_result_closure_seals", { closure_id: CLOSURE, company_id: A, event_id: ROOT,
    settlement_id: SEAL, sealed_at: NOW, seal_schema_version: 1, seal_sha256: HASH,
    bp_version_id: null, node_basis_evidence: {}, ...overrides });
}
async function flush() { await db.exec("SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED"); }
async function negativeInsert(table: string, values: Record<string, unknown>, error: RegExp, deferred = false) {
  await db.exec("SAVEPOINT invalid_row");
  try {
    await expect((async () => { await insert(table, values); if (deferred) await flush(); })()).rejects.toThrow(error);
  } finally {
    await db.exec("ROLLBACK TO SAVEPOINT invalid_row; RELEASE SAVEPOINT invalid_row");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE migration_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE fixture_authenticator NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE service_role NOLOGIN NOSUPERUSER BYPASSRLS;
    GRANT anon, authenticated, service_role TO fixture_authenticator;
    GRANT CREATE ON DATABASE postgres TO migration_owner;
    GRANT USAGE, CREATE ON SCHEMA public TO migration_owner;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO migration_owner, anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TYPE public.app_role AS ENUM ('admin','manager','platform_admin','viewer','partner');
    CREATE TABLE public.fixture_users(id uuid PRIMARY KEY, company_id uuid, role app_role, permission text);
    INSERT INTO public.fixture_users VALUES
      ('${ADMIN}','${A}','admin',null),('${VIEWER}','${A}','viewer','view_events'),
      ('${DENIED}','${A}','viewer',null),('${PARTNER}','${A}','partner','view_events'),
      ('${ADMIN_B}','${B}','admin',null),('${MANAGER}','${A}','manager',null),
      ('${PLATFORM}','${A}','platform_admin',null),('${BP_READER}','${A}','viewer','view_bp'),
      ('${DRE_READER}','${A}','viewer','view_report_dre'),('${POSITION_READER}','${A}','viewer','view_financial_position');
    GRANT SELECT ON public.fixture_users TO migration_owner, anon, authenticated, service_role;
    CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.company_id',true),'')::uuid $$;
    CREATE FUNCTION public.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS(SELECT 1 FROM fixture_users WHERE id=$1 AND role=$2 AND company_id=current_company_id()) $$;
    CREATE FUNCTION public.is_platform_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS(SELECT 1 FROM fixture_users WHERE id=$1 AND role='platform_admin') $$;
    -- Reprodução do helper legado permissivo: a 0344 não presume promoção da #591.
    CREATE FUNCTION public.row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT public.is_platform_admin(auth.uid()) OR $1 IS NULL OR $1 = current_company_id() $$;
    CREATE FUNCTION public.has_permission(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS(SELECT 1 FROM fixture_users WHERE id=$1 AND permission=$2 AND company_id=current_company_id()) $$;
    CREATE TABLE public.companies(id uuid PRIMARY KEY);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY);
    CREATE TABLE public.events(id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id),
      parent_event_id uuid REFERENCES events(id), status text DEFAULT 'completed');
    CREATE TABLE public.bp_versions(id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES events(id));
    CREATE TABLE public.event_settlements(id uuid PRIMARY KEY, company_id uuid NOT NULL, event_id uuid NOT NULL REFERENCES events(id));
    INSERT INTO companies VALUES ('${A}'),('${B}');
    INSERT INTO profiles SELECT id FROM fixture_users;
    INSERT INTO events(id,company_id,parent_event_id) VALUES
      ('${ROOT}','${A}',null),('${CITY}','${A}','${ROOT}'),('${OTHER_ROOT}','${A}',null),('${FOREIGN}','${B}',null);
    INSERT INTO bp_versions VALUES ('${BP}','${ROOT}'),('${CITY_BP}','${CITY}'),('${FOREIGN_BP}','${FOREIGN}');
    INSERT INTO event_settlements VALUES ('${SEAL}','${A}','${ROOT}'),('${CITY_SEAL}','${A}','${CITY}'),('${FOREIGN_SEAL}','${B}','${FOREIGN}');
    GRANT SELECT, REFERENCES ON ALL TABLES IN SCHEMA public TO migration_owner;
    GRANT UPDATE(id) ON public.events TO migration_owner;
    -- Defaults hostis revelam REVOKE em falta; o owner da migração não é superuser.
    ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    SET ROLE migration_owner;
  `);
  await db.exec(migration);
  await db.exec("RESET ROLE");
}, 30000);
beforeEach(async () => { await db.exec("BEGIN"); await owner(); await seedGate(false); });
afterEach(async () => { await db.exec("ROLLBACK; SET SESSION AUTHORIZATION postgres; RESET ROLE"); });
afterAll(async () => { await db?.close(); });

describe("#644b B1 — preparação e estrutura", () => {
  it("cópia byte-idêntica, cabeçalho preparado e rollback integralmente comentado", () => {
    expect(Buffer.from(migration).equals(manual)).toBe(true);
    expect(migration.startsWith("-- PREPARADA, NÃO APLICADA")).toBe(true);
    for (const algorithm of ["sha256", "md5"]) {
      expect(createHash(algorithm).update(migration).digest("hex")).toBe(createHash(algorithm).update(manual).digest("hex"));
    }
    expect(rollbackFile.split("\n").every(l => !l.trim() || l.startsWith("--"))).toBe(true);
    expect(rollback).toMatch(/^DO \$rollback\$/);
  });

  it("é aditiva e não marca eventos legados como recorded nem fornece defaults de base", async () => {
    expect((await db.query("SELECT * FROM event_result_closures")).rows).toEqual([]);
    expect((await db.query("SELECT * FROM events")).rows).toHaveLength(4);
    const columns = (await db.query<{ column_name: string; column_default: string | null }>(
      "SELECT column_name,column_default FROM information_schema.columns WHERE table_name='event_result_closures' AND table_schema='public'" )).rows;
    expect(columns.filter(c => c.column_default !== null).map(c => c.column_name).sort()).toEqual(["captured_at", "id"]);
    const functions = (await db.query<{ n: string }>("SELECT n.nspname n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proowner='migration_owner'::regrole")).rows;
    expect(functions.every(f => f.n === "issue644b_private")).toBe(true);
  });

  it("uma revisão com recibo e sem selo é válida; modo de cidade é independente do Master", async () => {
    await seed({ perimeter_kind: "family", final_bp_version_id: BP });
    await seed({ id: uuid(401), event_id: CITY, closure_root_event_id: ROOT, root_closure_id: CLOSURE,
      perimeter_kind: "city", budget_mode_resolved: "without_bp", budget_mode_source: "event",
      expense_source: "realized", revenue_policy: "real_only", final_bp_version_id: CITY_BP });
    await flush();
    expect((await db.query("SELECT * FROM event_result_closure_active")).rows).toHaveLength(2);
    expect((await db.query("SELECT * FROM event_result_closure_seals")).rows).toEqual([]);
  });

  it.each([
    ["schema_version", 2], ["criterion_version", 2], ["revenue_policy_version", 0], ["revision", 0],
    ["expense_source", "forecast"], ["expense_source_original", "forecast"], ["basis_status", "assumed"],
    ["budget_mode_resolved", "invalid"], ["budget_mode_source", "browser"], ["criterion_sha256", "bad"],
    ["revenue_policy", "committed"], ["revenue_include_overhead", true], ["partner_calc_basis", "gross"],
    ["result_revenue_vat_basis", "gross"], ["result_expense_vat_basis", "gross"],
    ["perimeter_kind", "city"], ["result_origin", "browser"], ["capture_kind", "status_update"],
    ["closed_at", "infinity"], ["field_evidence", []], ["provenance", []],
  ])("recusa enum/versão/coerência inválida: %s=%s", async (field, value) => {
    await negativeInsert("event_result_closures", revision({ [String(field)]: value }), /constraint|result_closure_/);
  });

  it("without_bp nunca aceita committed/fallback BP; IVA normalizado suporta os três contratos", async () => {
    for (const overrides of [
      { budget_mode_resolved: "without_bp" },
      { budget_mode_resolved: "without_bp", expense_source: "realized" },
      { budget_mode_resolved: "with_bp", revenue_policy: "real_only" },
    ]) await negativeInsert("event_result_closures", revision(overrides), /mode_coherence/);
    await seed({ partner_calc_basis: "net_result_gross_expenses", result_expense_vat_basis: "gross" });
    await seed({ id: uuid(401), revision: 2, root_closure_id: uuid(401), partner_calc_basis: "gross_revenue",
      result_expense_vat_basis: "excluded" }, false);
    await flush();
  });

  it("legado parcialmente desconhecido conserva NULL e prova só nos campos demonstráveis", async () => {
    const evidence = Object.fromEntries(fields.filter(f => f !== "criterion_sha256").map(f => [f, { source: "synthetic_audit" }]));
    await seed({ capture_kind: "legacy_reconstruction", basis_status: "unknown", criterion_sha256: null,
      field_evidence: evidence, unknown_fields: ["criterion_sha256"] });
    await flush();
    const row = (await db.query<{ criterion_sha256: null; basis_status: string }>("SELECT * FROM event_result_closures")).rows[0];
    expect(row.criterion_sha256).toBeNull(); expect(row.basis_status).toBe("unknown");
  });

  it("não fabrica prova nem aceita NULL conhecido, unknown não explícito ou unknown num novo fecho", async () => {
    for (const overrides of [
      { criterion_sha256: null }, { field_evidence: {} }, { unknown_fields: ["criterion_version"] },
      { capture_kind: "legacy_reconstruction", basis_status: "unknown", criterion_sha256: null, unknown_fields: [] },
      { basis_status: "unknown", criterion_sha256: null, unknown_fields: ["criterion_sha256"] },
      { capture_kind: "legacy_reconstruction", basis_status: "unknown", criterion_sha256: null,
        unknown_fields: ["criterion_sha256", "criterion_sha256"] },
    ]) await negativeInsert("event_result_closures", revision(overrides), /result_closure_/);
  });

  it("FKs e validação recusam empresa, família, BP e identidades inexistentes", async () => {
    for (const overrides of [
      { company_id: B }, { company_id: uuid(999) }, { event_id: uuid(999) }, { captured_by: uuid(999) },
      { closure_root_event_id: FOREIGN, perimeter_kind: "city" },
      { event_id: CITY, closure_root_event_id: OTHER_ROOT, root_closure_id: uuid(999), perimeter_kind: "city" },
      { final_bp_version_id: FOREIGN_BP }, { final_bp_version_id: CITY_BP }, { final_bp_version_id: uuid(999) },
    ]) await negativeInsert("event_result_closures", revision(overrides), /mismatch|foreign key|capture_status/);
    await seed();
    for (const overrides of [{ company_id: B }, { event_id: CITY }, { settlement_id: CITY_SEAL },
      { settlement_id: FOREIGN_SEAL }, { bp_version_id: FOREIGN_BP }, { seal_sha256: "bad" }, { seal_schema_version: 0 }]) {
      await negativeInsert("event_result_closure_seals", { closure_id: CLOSURE, company_id: A, event_id: ROOT,
        settlement_id: SEAL, sealed_at: NOW, seal_schema_version: 1, seal_sha256: HASH, bp_version_id: null,
        node_basis_evidence: {}, ...overrides }, /mismatch|constraint/);
    }
    await negativeInsert("event_result_closure_log", { id: uuid(900), closure_id: CLOSURE, company_id: B, event_id: ROOT,
      action: "reopened", performed_by: ADMIN, reason: "synthetic", evidence: {} }, /foreign key/);
  });

  it("a família referencia a mesma operação/data e autor", async () => {
    await seed({ perimeter_kind: "family" });
    await negativeInsert("event_result_closures", revision({ id: uuid(401), event_id: CITY, perimeter_kind: "city",
      closed_at: "2026-01-03T12:00:00Z" }), /root_fk/, true);
    await db.exec("SAVEPOINT family_author");
    await seed({ id: uuid(401), event_id: CITY, perimeter_kind: "city", captured_by: VIEWER, closed_by: VIEWER }, false);
    await reject("SET CONSTRAINTS ALL IMMEDIATE", /operation_mismatch/, "23514");
    await db.exec("ROLLBACK TO SAVEPOINT family_author");
  });

  it("exige recibo inicial e origem coerente com presença de selo", async () => {
    await insert("event_result_closures", revision());
    await reject("SET CONSTRAINTS ALL IMMEDIATE", /initial_receipt_missing/, "23514");
    await receipt(CLOSURE, { id: RECEIPT });
    await seal();
    await reject("SET CONSTRAINTS ALL IMMEDIATE", /origin_mismatch/, "23514");
  });

  it("seal_snapshot exige referência; referência válida é conservada por FK", async () => {
    await seed({ result_origin: "seal_snapshot" });
    await reject("SET CONSTRAINTS ALL IMMEDIATE", /seal_reference_missing/, "23514");
    await seal({ bp_version_id: BP });
    await flush();
    await db.exec("RESET ROLE");
    await reject(`DELETE FROM event_settlements WHERE id='${SEAL}'`, /foreign key/, "23001");
    await reject(`DELETE FROM bp_versions WHERE id='${BP}'`, /foreign key/, "23001");
    await reject(`DELETE FROM events WHERE id='${ROOT}'`, /foreign key/, "23503");
  });
});

describe("#644b B1 — unicidade e ciclo auditado", () => {
  it("revisão única por evento e ligação activa única, mesmo com duas revisões válidas", async () => {
    await seed();
    await negativeInsert("event_result_closures", revision({ id: uuid(401), root_closure_id: uuid(401) }), /revision_key/);
    await seed({ id: uuid(401), root_closure_id: uuid(401), revision: 2, previous_closure_id: CLOSURE }, false);
    await negativeInsert("event_result_closure_active", { event_id: ROOT, company_id: A, closure_id: uuid(401),
      activation_receipt_id: (await db.query<{ id: string }>(`SELECT id FROM event_result_closure_log WHERE closure_id='${uuid(401)}'`)).rows[0].id }, /duplicate key/);
    await flush();
    expect((await db.query("SELECT * FROM event_result_closures")).rows).toHaveLength(2);
    expect((await db.query("SELECT * FROM event_result_closure_active")).rows).toHaveLength(1);
  });

  it("reabrir conserva conteúdo, exige recibo e permite nova revisão activa", async () => {
    await seed();
    const before = (await db.query("SELECT * FROM event_result_closures")).rows;
    await db.exec("SAVEPOINT missing_receipt");
    await db.exec(`DELETE FROM event_result_closure_active WHERE event_id='${ROOT}'`);
    await reject("SET CONSTRAINTS ALL IMMEDIATE", /deactivation_receipt_missing/, "23514");
    await db.exec("ROLLBACK TO SAVEPOINT missing_receipt");
    await receipt(CLOSURE, { action: "reopened", reason: "synthetic authorised reopening" });
    await reject("SET CONSTRAINTS ALL IMMEDIATE", /invalidated_still_active/, "23514");
    await db.exec(`DELETE FROM event_result_closure_active WHERE event_id='${ROOT}'`);
    await flush();
    expect((await db.query("SELECT * FROM event_result_closures")).rows).toEqual(before);
    await seed({ id: uuid(401), root_closure_id: uuid(401), revision: 2, previous_closure_id: CLOSURE });
    await flush();
    expect((await db.query("SELECT closure_id FROM event_result_closure_active")).rows).toEqual([{ closure_id: uuid(401) }]);
    await negativeInsert("event_result_closure_active", { event_id: ROOT, company_id: A, closure_id: CLOSURE,
      activation_receipt_id: RECEIPT }, /active_receipt_mismatch/);
  });

  it("reabertura legada também exige recibo; recibo de reabertura não activa uma revisão", async () => {
    await seed();
    const rid = await receipt(CLOSURE, { action: "legacy_reopened" });
    await db.exec(`DELETE FROM event_result_closure_active WHERE event_id='${ROOT}'`);
    await flush();
    await negativeInsert("event_result_closure_active", { event_id: ROOT, company_id: A, closure_id: CLOSURE,
      activation_receipt_id: rid }, /active_receipt_mismatch/);
    await negativeInsert("event_result_closures", revision({ id: uuid(401), root_closure_id: uuid(401),
      revision: 2, previous_closure_id: uuid(999) }), /previous_mismatch/);
  });

  it("confirmação histórica liga nova revisão e recibo, sem apagar a desconhecida", async () => {
    await seed({ capture_kind: "legacy_reconstruction", basis_status: "unknown", criterion_sha256: null,
      unknown_fields: ["criterion_sha256"] });
    const next = uuid(401), confirmation = uuid(501);
    // O recibo referencia a nova revisão: FK diferida, para permitir gravação atómica.
    await seed({ id: next, root_closure_id: next, revision: 2, previous_closure_id: CLOSURE,
      capture_kind: "legacy_confirmation", basis_status: "reconstructed", confirmation_receipt_id: confirmation }, false);
    await receipt(CLOSURE, { id: confirmation, action: "confirmed", replacement_closure_id: next });
    await db.exec(`DELETE FROM event_result_closure_active WHERE event_id='${ROOT}'`);
    const rid = (await db.query<{ id: string }>(`SELECT id FROM event_result_closure_log WHERE closure_id='${next}'`)).rows[0].id;
    await active(next, rid);
    await flush();
    expect((await db.query("SELECT basis_status FROM event_result_closures ORDER BY revision")).rows)
      .toEqual([{ basis_status: "unknown" }, { basis_status: "reconstructed" }]);
  });

  it("recibos exigem motivo, tipo válido, autoria e referência coerente", async () => {
    await seed();
    const base = { id: uuid(900), company_id: A, event_id: ROOT, closure_id: CLOSURE,
      action: "reopened", performed_by: ADMIN, reason: "synthetic", evidence: {} };
    for (const change of [{ reason: " " }, { action: "edited" }, { performed_by: uuid(999) },
      { action: "confirmed" }, { action: "reopened", replacement_closure_id: CLOSURE }, { evidence: [] }]) {
      await negativeInsert("event_result_closure_log", { ...base, ...change }, /constraint/);
    }
    const next = uuid(401);
    await seed({ id: next, root_closure_id: next, revision: 2 }, false);
    const rid = (await db.query<{ id: string }>(`SELECT id FROM event_result_closure_log WHERE closure_id='${next}'`)).rows[0].id;
    await negativeInsert("event_result_closure_active", { event_id: CITY, company_id: A, closure_id: next,
      activation_receipt_id: rid }, /foreign key/);
  });

  it("revisões, selos e recibos são append-only, incluindo UPDATE/DELETE/TRUNCATE pelo owner", async () => {
    await seed({ result_origin: "seal_snapshot" }); await seal(); await flush();
    for (const table of tables.slice(0, 3)) {
      await reject(`UPDATE ${table} SET company_id=company_id`, /history_immutable/, "42501");
      await reject(`DELETE FROM ${table}`, /history_immutable/, "42501");
    }
    // As três tabelas são referenciadas: testar o conjunto evita a recusa antecipada por FK.
    await reject(`TRUNCATE ${tables.join(",")}`, /history_immutable/, "42501");
  });
});

describe("#644b B1 — identidades fiéis, RLS e ACL", () => {
  async function twoCompanies() {
    await seed({ result_origin: "seal_snapshot" }); await seal();
    await seed({ id: uuid(420), root_closure_id: uuid(420), company_id: B, event_id: FOREIGN,
      closure_root_event_id: FOREIGN, closed_by: ADMIN_B, captured_by: ADMIN_B, result_origin: "seal_snapshot" });
    await seal({ closure_id: uuid(420), company_id: B, event_id: FOREIGN, settlement_id: FOREIGN_SEAL });
    await flush(); await seedGate(true);
  }

  it.each([VIEWER, ADMIN, MANAGER, PLATFORM, BP_READER, DRE_READER, POSITION_READER])(
    "staff %s lê só a sua empresa em todas as tabelas, sem exigir Posição Financeira", async user => {
      await twoCompanies(); await actor("authenticated", user);
      expect((await db.query<{ session_user: string; current_user: string }>("SELECT session_user,current_user")).rows[0])
        .toEqual({ session_user: "fixture_authenticator", current_user: "authenticated" });
      for (const table of tables) {
        expect((await db.query<{ company_id: string }>(`SELECT company_id FROM ${table}`)).rows).toEqual([{ company_id: A }]);
      }
      await actor("authenticated", ADMIN_B, B);
      for (const table of tables) {
        expect((await db.query<{ company_id: string }>(`SELECT company_id FROM ${table}`)).rows).toEqual([{ company_id: B }]);
      }
    });

  it.each([DENIED, PARTNER])("%s sem gate staff não recebe revisão, log, selo ou ligação integral", async user => {
    await twoCompanies(); await actor("authenticated", user);
    for (const table of tables) expect((await db.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
  });

  it("sem empresa activa recusa leitura staff, inclusive platform_admin com helper legado permissivo", async () => {
    await twoCompanies();
    for (const user of [ADMIN, PLATFORM, VIEWER]) {
      await actor("authenticated", user, "");
      for (const table of tables) expect((await db.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
    }
  });

  it("anon não tem nenhum privilégio; RLS permanece fechada mesmo com SELECT concedido na fixture", async () => {
    await twoCompanies(); await actor("anon");
    for (const table of tables) await reject(`SELECT * FROM ${table}`, /permission denied/, "42501");
    await owner(); await db.exec(`GRANT SELECT ON ${tables.join(",")} TO anon`); await actor("anon");
    for (const table of tables) expect((await db.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
  });

  it("service_role lê duas empresas no backend; BYPASSRLS não permite escrita nem chamada aos helpers", async () => {
    await twoCompanies(); await actor("service_role");
    for (const table of tables) expect((await db.query(`SELECT * FROM ${table}`)).rows).toHaveLength(2);
    await reject(`INSERT INTO event_result_closure_active SELECT * FROM event_result_closure_active`, /permission denied/, "42501");
    await reject("SELECT issue644b_private.writer_not_installed()", /permission denied/, "42501");
  });

  it.each(["anon", "authenticated", "service_role"] as const)("%s sem DML/TRUNCATE/REFERENCES/TRIGGER ou EXECUTE privados", async role => {
    await twoCompanies(); await actor(role, ADMIN);
    for (const table of tables) {
      for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
        const r = await db.query<{ allowed: boolean }>("SELECT has_table_privilege(current_user,$1,$2) allowed", [table, privilege]);
        expect(r.rows[0].allowed, `${role}:${table}:${privilege}`).toBe(false);
      }
      for (const sql of [`INSERT INTO ${table} SELECT * FROM ${table}`, `UPDATE ${table} SET company_id=company_id`,
        `DELETE FROM ${table}`, `TRUNCATE ${table}`]) await reject(sql, /permission denied/, "42501");
    }
    const functions = await db.query<{ allowed: boolean }>(`SELECT has_function_privilege(current_user,p.oid,'EXECUTE') allowed
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='issue644b_private'`);
    expect(functions.rows).toHaveLength(7);
    expect(functions.rows.every(r => !r.allowed)).toBe(true);
  });

  it("mesmo grants DML acidentais e GUCs forjados não instalam o escritor; owner também é recusado", async () => {
    await seed({ result_origin: "seal_snapshot" }); await seal(); await flush(); await seedGate(true);
    // Apenas ACL é relaxada na fixture; os bloqueios efectivos permanecem instalados.
    await db.exec(`GRANT INSERT, UPDATE, DELETE ON ${tables.join(",")} TO service_role`);
    await actor("service_role", ADMIN);
    await db.exec("SELECT set_config('issue644b.command','close_event',true), set_config('app.close_event','true',true)");
    for (const table of tables) await reject(`INSERT INTO ${table} SELECT * FROM ${table}`, /writer_not_installed/, "42501");
    await reject("UPDATE event_result_closures SET company_id=company_id", /history_immutable/, "42501");
    await reject("DELETE FROM event_result_closure_log", /history_immutable/, "42501");
    await reject("DELETE FROM event_result_closure_active", /writer_not_installed/, "42501");
    await owner();
    await negativeInsert("event_result_closures", revision({ id: uuid(999), root_closure_id: uuid(999), revision: 2 }),
      /writer_not_installed/);
  });
});

describe("#644b B1 — rollback comentado", () => {
  it("descomentado só em PGlite vazio remove a 0344 e preserva o catálogo anterior", async () => {
    await db.exec(rollback);
    for (const table of tables) {
      expect((await db.query<{ t: string | null }>("SELECT to_regclass($1)::text t", [`public.${table}`])).rows[0].t).toBeNull();
    }
    expect((await db.query("SELECT * FROM events")).rows).toHaveLength(4);
    expect((await db.query("SELECT * FROM bp_versions")).rows).toHaveLength(3);
    expect((await db.query("SELECT * FROM event_settlements")).rows).toHaveLength(3);
    expect((await db.query("SELECT * FROM pg_namespace WHERE nspname='issue644b_private'")).rows).toEqual([]);
    // Reaplicação sintética após rollback também compila; nenhuma escrita fica activa.
    await db.exec(migration);
  });

  it("com uma revisão/recibo aborta atomicamente sem apagar histórico", async () => {
    await seed(); await flush();
    await reject(rollback, /rollback_has_history/, "55000");
    for (const table of tables.slice(0, 1).concat(tables.slice(2))) {
      expect((await db.query(`SELECT * FROM ${table}`)).rows).toHaveLength(1);
    }
  });
});
