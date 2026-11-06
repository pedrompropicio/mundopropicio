// @vitest-environment node
// SQL exclusivamente em PGlite sintético, sem URL, credenciais, storage ou deploy.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const migration = readFileSync("drizzle/migrations/0345_issue303_apuramento_contract.sql", "utf8");
const rollback = readFileSync("supabase/manual/rollback_0345_issue303_apuramento_contract_comentado.sql", "utf8");
const read = (path: string) => readFileSync(path, "utf8");
const C = "30300000-0000-4000-8000-000000000001";
const B = "30300000-0000-4000-8000-000000000002";
const U = "30300000-0000-4000-8000-000000000003";
const A = "30300000-0000-4000-8000-000000000004";
const OFF = "30300000-0000-4000-8000-000000000005";
const FOREIGN = "30300000-0000-4000-8000-000000000006";
const BANK = "30300000-0000-4000-8000-000000000007";
const EVENT = "30300000-0000-4000-8000-000000000008";
const TX = "30300000-0000-4000-8000-000000000009";
let seq = 100;
const id = () => `30300000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const q = (v: unknown) => v === null ? "NULL" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replaceAll("'", "''")}'`;
const json = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;
const insert = (table: string, row: Record<string, unknown>) => `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.values(row).map(q).join(",")})`;
const account = (financial_account_id = A, enabled = true) => ({ financial_account_id, enabled, contract_version: 2 });
const config = (accounts = [account()]) => ({ accounts });

async function fixture(apply = true) {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TYPE app_role AS ENUM ('admin','manager','platform_admin','viewer');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.company',true),'')::uuid $$;
    CREATE TABLE user_roles(user_id uuid, company_id uuid, role app_role);
    INSERT INTO user_roles VALUES ('${U}','${C}','admin');
    CREATE FUNCTION is_platform_admin(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role='platform_admin') $$;
    CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT is_platform_admin($1) OR EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2 AND company_id=current_company_id()) $$;
    CREATE FUNCTION has_staff_role(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL $$;
    CREATE FUNCTION row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT is_platform_admin(auth.uid()) OR $1 IS NULL OR $1 = current_company_id() $$;
    CREATE FUNCTION update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
    CREATE FUNCTION set_company_id_on_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.company_id := current_company_id(); RETURN NEW; END $$;
    CREATE TABLE companies(id uuid PRIMARY KEY, slug text);
    CREATE TABLE financial_accounts(id uuid PRIMARY KEY, company_id uuid REFERENCES companies, type text NOT NULL);
    CREATE TABLE events(id uuid PRIMARY KEY, company_id uuid REFERENCES companies);
    CREATE TABLE transactions(id uuid PRIMARY KEY, company_id uuid REFERENCES companies);
    CREATE TABLE ticket_office_settlements(id uuid PRIMARY KEY);
    CREATE TABLE event_ticket_office_advances(id uuid PRIMARY KEY);
    INSERT INTO companies VALUES ('${C}','synthetic-a'),('${B}','synthetic-b');
    INSERT INTO auth.users VALUES ('${U}');
    INSERT INTO financial_accounts VALUES ('${A}','${C}','ticket_office'),('${OFF}','${C}','ticket_office'),
      ('${FOREIGN}','${B}','ticket_office'),('${BANK}','${C}','bank');
    INSERT INTO events VALUES ('${EVENT}','${C}');
    INSERT INTO transactions VALUES ('${TX}','${C}');
    SELECT set_config('test.uid','${U}',false),set_config('test.company','${C}',false),set_config('test.role','admin',false);
  `);
  await pg.exec(read("supabase/migrations/20260516044247_d211f8c9-7cc0-4917-b04e-eb8d4a66796d.sql").split("-- Seed")[0]);
  await pg.exec(read("drizzle/migrations/0077_derp231_ticket_office_statements.sql"));
  await pg.exec(read("drizzle/migrations/0090_ticket_office_statement_documents.sql"));
  await pg.exec(`GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
    GRANT SELECT ON companies,financial_accounts,events,transactions TO authenticated;
    GRANT ALL ON company_features TO authenticated,service_role;`);
  if (apply) await pg.exec(migration);
  return pg;
}

let db: PGlite;
async function scalar<T = unknown>(sql: string, pg = db): Promise<T> {
  return Object.values((await pg.query<Record<string, T>>(sql)).rows[0])[0];
}
// A identidade da sessão é o actor NOLOGIN, não SET ROLE a partir do administrador.
async function as(actor = "authenticated", role = "admin", company = C) {
  await db.exec(`SET SESSION AUTHORIZATION postgres; RESET ROLE;
    UPDATE user_roles SET role=${q(role)}::app_role,company_id=${q(company)};
    SELECT set_config('test.role',${q(role)},true),set_config('test.company',${q(company)},true);
    SET SESSION AUTHORIZATION ${actor};`);
}
async function fails(sql: string, code: string) {
  await db.exec("SAVEPOINT expected_failure");
  try { await expect(db.exec(sql)).rejects.toMatchObject({ code }); }
  finally { await db.exec("ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure"); }
}
async function statement(overrides: Record<string, unknown> = {}) {
  const row = { id: id(), company_id: C, financial_account_id: A, number: `synthetic-${seq}`, statement_date: "2026-10-01", ...overrides };
  await db.exec(insert("ticket_office_statements", row));
  return row.id as string;
}
async function line(parent: string, overrides: Record<string, unknown> = {}) {
  const row = { id: id(), statement_id: parent, company_id: C, position: seq, line_type: "carry_over", description: "Sintética", amount: -10, ...overrides };
  await db.exec(insert("ticket_office_statement_lines", row));
  return row.id as string;
}
async function feature(accounts = [account()], enabled = true) {
  await db.exec(`INSERT INTO company_features(company_id,feature_key,enabled,config)
    VALUES ('${C}','ticket-office-statements-v2',true,${json(config(accounts))});
    UPDATE company_features SET enabled=${enabled} WHERE feature_key='ticket-office-statements-v2';`);
}
// Só o dono do catálogo sintético desliga a guarda R2 para testar constraints isoladas.
// Não há bypass operacional: todos os testes de acesso mantêm os triggers ligados.
async function structural() {
  await db.exec(`ALTER TABLE ticket_office_statements DISABLE TRIGGER issue303_write_guard;
    ALTER TABLE ticket_office_statement_lines DISABLE TRIGGER issue303_write_guard;
    ALTER TABLE ticket_office_statement_documents DISABLE TRIGGER issue303_write_guard;
    ALTER TABLE ticket_office_statement_events DISABLE TRIGGER issue303_write_guard;`);
}
async function confirmed(overrides: Record<string, unknown> = {}, draftId?: string) {
  const s = draftId ?? await statement({ contract_version: 2 });
  const doc = id();
  await db.exec(insert("ticket_office_statement_documents", { id: doc, statement_id: s, company_id: C,
    file_path: "synthetic.pdf", file_name: "synthetic.pdf", mime_type: "application/pdf", document_source: "apuramento" }));
  const receipt = { contract_version: 2, revision: 1, calculated_total: -10, independent_position: -10,
    sources: [], confirmed_by: U, confirmed_at: "2026-10-02T00:00:00Z" };
  const values = { status: "confirmed", document_total: -10, primary_document_id: doc, primary_document_sha256: "a".repeat(64),
    position_cutoff_at: "2026-10-02T00:00:00Z", position_timezone: "Europe/Lisbon", position_cutoff_source: "company_day_end",
    confirmed_by: U, confirmed_at: receipt.confirmed_at, ...overrides };
  await db.exec(`UPDATE ticket_office_statements SET ${Object.entries(values).map(([k,v]) => `${k}=${q(v)}`).join(",")},confirmation_receipt=${json(receipt)} WHERE id='${s}'`);
  return s;
}

beforeAll(async () => { db = await fixture(); }, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("SET SESSION AUTHORIZATION postgres; RESET ROLE; BEGIN"); });
afterEach(async () => { await db.exec("ROLLBACK"); await db.exec("SET SESSION AUTHORIZATION postgres; RESET ROLE"); });

describe("#303 / 0345 — estrutura e ACL preparadas", () => {
  it("espelha bytes, conserva o CHECK antigo e não contém seed, DML operacional ou DROP", () => {
    expect(read("supabase/manual/0345_issue303_apuramento_contract.sql")).toBe(migration);
    expect(migration).toContain("PREPARADA, NÃO APLICADA");
    expect(migration.replace(/--[^\n]*/g, "")).not.toMatch(/\b(?:DROP|TRUNCATE)\b/i);
    expect(migration).not.toMatch(/INSERT INTO public.company_features/i);
    expect(rollback.split("\n").filter(l => l.trim()).every(l => l.startsWith("--"))).toBe(true);
  });

  it("não cria configuração e conserva CRUD, confirmação e anexos v1 na conta desligada", async () => {
    expect(await scalar("SELECT count(*)::int FROM company_features")).toBe(0);
    await as();
    expect(await scalar("SELECT session_user")).toBe("authenticated");
    const s = await statement({ financial_account_id: OFF, document_total: -10 });
    await line(s);
    const doc = id();
    await db.exec(insert("ticket_office_statement_documents", { id: doc, statement_id: s, company_id: C,
      file_path: "draft.pdf", file_name: "draft.pdf", mime_type: "application/pdf", document_source: "apuramento" }));
    await db.exec(`UPDATE ticket_office_statement_documents SET file_name='edited.pdf' WHERE id='${doc}';
      DELETE FROM ticket_office_statement_documents WHERE id='${doc}';
      SELECT confirm_ticket_office_statement('${s}');`);
    expect(await scalar(`SELECT contract_version||':'||status FROM ticket_office_statements WHERE id='${s}'`)).toBe("1:confirmed");
    const draft = await statement({ financial_account_id: OFF });
    const l = await line(draft);
    await db.exec(`UPDATE ticket_office_statement_lines SET amount=-20 WHERE id='${l}';
      DELETE FROM ticket_office_statement_lines WHERE id='${l}'; DELETE FROM ticket_office_statements WHERE id='${draft}';`);
  });

  it("mantém manager legado e recusa tenant cruzado mesmo com política permissiva larga", async () => {
    const foreign = await statement({ company_id: B, financial_account_id: FOREIGN });
    await as("authenticated", "manager");
    expect(await scalar(`SELECT count(*)::int FROM ticket_office_statements WHERE id='${foreign}'`)).toBe(0);
    await fails(insert("ticket_office_statements", { company_id: B, financial_account_id: FOREIGN, number: "cross", statement_date: "2026-10-01" }), "42501");
    await fails(insert("ticket_office_statements", { company_id: C, financial_account_id: FOREIGN, number: "cross-account", statement_date: "2026-10-01" }), "42501");
    await fails(insert("ticket_office_statement_lines", { statement_id: foreign, company_id: B, line_type: "carry_over", description: "cross", amount: -1 }), "42501");
    const s = await statement({ financial_account_id: OFF, document_total: -10 });
    await fails(`UPDATE ticket_office_statements SET financial_account_id='${FOREIGN}' WHERE id='${s}'`, "42501");
    await line(s); await db.exec(`SELECT confirm_ticket_office_statement('${s}')`);
  });

  it("valida configuração por conta, nasce desligada apesar do default true e audita alterações/remoção", async () => {
    await as();
    await db.exec(`INSERT INTO company_features(company_id,feature_key,config,enabled_by)
      VALUES ('${C}','ticket-office-statements-v2',${json(config())},NULL)`);
    expect(await scalar("SELECT enabled FROM company_features")).toBe(false);
    expect(await scalar("SELECT enabled_by FROM company_features")).toBe(U);
    expect(await scalar("SELECT new_feature_enabled FROM ticket_office_statement_config_log")).toBe(false);
    await db.exec("UPDATE company_features SET enabled=true");
    await db.exec("SET SESSION AUTHORIZATION postgres; RESET ROLE");
    expect(await scalar(`SELECT public._issue303_account_enabled('${C}','${A}')`)).toBe(true);
    expect(await scalar(`SELECT public._issue303_account_enabled('${C}','${OFF}')`)).toBe(false);
    await db.exec(`UPDATE company_features SET config=${json(config([account(OFF,false)]))}; DELETE FROM company_features`);
    expect(await scalar("SELECT count(*)::int FROM ticket_office_statement_config_log")).toBe(5);
    expect(await scalar(`SELECT bool_and(changed_by='${U}') FROM ticket_office_statement_config_log`)).toBe(true);
  });

  it("recusa configuração inválida, duplicada, conta bancária/estrangeira e autoria sem admin da empresa", async () => {
    for (const invalid of [{}, { accounts: null }, { accounts: [{}] }, config([account(),account()]),
      config([account(BANK)]), config([account(FOREIGN)]), config([{ ...account(), contract_version: 1 }]),
      config([{ ...account(), enabled: null }]), config([{ ...account(), financial_account_id: "invalid" }])]) {
      await fails(`INSERT INTO company_features(company_id,feature_key,config) VALUES ('${C}','ticket-office-statements-v2',${json(invalid)})`, "23514");
    }
    for (const role of ["manager","platform_admin"]) {
      await db.exec(`UPDATE user_roles SET role='${role}'; SELECT set_config('test.role','${role}',true)`);
      await fails(`INSERT INTO company_features(company_id,feature_key,config) VALUES ('${C}','ticket-office-statements-v2',${json(config())})`, "42501");
    }
    await db.exec("UPDATE user_roles SET role='admin'; SELECT set_config('test.role','admin',true)");
    await fails(`INSERT INTO company_features(company_id,feature_key,config) VALUES ('${B}','ticket-office-statements-v2',${json(config([]))})`, "42501");
    await feature();
    await fails("UPDATE company_features SET feature_key='renamed'", "42501");
    await fails("UPDATE ticket_office_statement_config_log SET operation='DELETE'", "42501");
    // Outras chaves conservam os seus defaults e política histórica.
    await as("authenticated","platform_admin");
    await db.exec(`INSERT INTO company_features(company_id,feature_key) VALUES ('${C}','unrelated')`);
    expect(await scalar("SELECT enabled FROM company_features WHERE feature_key='unrelated'")).toBe(true);
  });

  it("recusa escrita v2 directa e RPC legada em conta activa; conta omitida/desligada conserva v1", async () => {
    const s = await statement({ document_total: -10 }); await line(s);
    await feature([account(), account(OFF,false)]);
    await as();
    await fails(insert("ticket_office_statements", { company_id: C, financial_account_id: OFF, number: "v2", statement_date: "2026-10-01", contract_version: 2 }), "42501");
    await fails(insert("ticket_office_statements", { company_id: C, financial_account_id: OFF, number: "v1-revision-bypass", statement_date: "2026-10-01", revision: 2 }), "42501");
    await fails(`UPDATE ticket_office_statements SET notes='bypass' WHERE id='${s}'`, "42501");
    await fails(`SELECT confirm_ticket_office_statement('${s}')`, "42501");
    await fails(`DELETE FROM ticket_office_statements WHERE id='${s}'`, "42501");
    await fails(insert("ticket_office_statement_lines", { statement_id: s, company_id: C, line_type: "carry_over", description: "bypass", amount: -1 }), "42501");
    await statement({ financial_account_id: OFF });
    await as("service_role");
    await fails(`UPDATE ticket_office_statements SET status='confirmed' WHERE id='${s}'`, "42501");
    expect(await scalar(`SELECT status FROM ticket_office_statements WHERE id='${s}'`)).toBe("draft");
  });

  it("fecha INSERT/UPDATE/DELETE, movimento OLD/NEW e anexos de v2 mesmo após desligar a flag", async () => {
    await structural();
    const protectedDraft = await statement({ contract_version: 2 });
    const l = await line(protectedDraft);
    const legacy = await statement({ financial_account_id: OFF });
    await db.exec(`ALTER TABLE ticket_office_statements ENABLE TRIGGER issue303_write_guard;
      ALTER TABLE ticket_office_statement_lines ENABLE TRIGGER issue303_write_guard;
      ALTER TABLE ticket_office_statement_documents ENABLE TRIGGER issue303_write_guard;`);
    await as();
    await fails(`UPDATE ticket_office_statements SET contract_version=1 WHERE id='${protectedDraft}'`, "42501");
    await fails(`UPDATE ticket_office_statement_lines SET statement_id='${legacy}' WHERE id='${l}'`, "42501");
    await fails(`DELETE FROM ticket_office_statement_lines WHERE id='${l}'`, "42501");
    await fails(`DELETE FROM ticket_office_statements WHERE id='${protectedDraft}'`, "42501");
    await fails(insert("ticket_office_statement_documents", { statement_id: protectedDraft, company_id: C,
      file_path: "x.pdf", file_name: "x.pdf", mime_type: "application/pdf", document_source: "apuramento" }), "42501");
    await fails(insert("ticket_office_statement_lines", { statement_id: legacy, company_id: C, line_type: "carry_over", document_line_type: "opening_balance", description: "bypass", amount: 0 }), "42501");
  });

  it("revoga helpers e acessos anon/PUBLIC; novas tabelas só permitem leitura da empresa", async () => {
    const functions = (await db.query<{ sig: string }>(`SELECT oid::regprocedure::text sig FROM pg_proc WHERE proname LIKE '_issue303_%'`)).rows;
    expect(functions.length).toBe(6);
    for (const f of functions) for (const role of ["anon","authenticated"]) {
      expect(await scalar(`SELECT has_function_privilege('${role}',${q(f.sig)},'EXECUTE')`)).toBe(false);
    }
    for (const table of ["ticket_office_statements","ticket_office_statement_lines","ticket_office_statement_documents","ticket_office_statement_events","ticket_office_statement_config_log"]) {
      expect(await scalar(`SELECT has_table_privilege('anon','${table}','SELECT,INSERT,UPDATE,DELETE')`)).toBe(false);
      expect(await scalar(`SELECT count(*)::int FROM pg_policy WHERE polrelid='${table}'::regclass AND polname='issue303_company' AND NOT polpermissive`)).toBe(1);
    }
    expect(await scalar("SELECT has_table_privilege('anon','company_features','SELECT,INSERT,UPDATE,DELETE')")).toBe(false);
    await feature();
    await as();
    expect(await scalar("SELECT count(*)::int FROM ticket_office_statement_config_log")).toBe(2);
    await fails("DELETE FROM ticket_office_statement_config_log", "42501");
    await fails(insert("ticket_office_statement_events", { event_id: EVENT, statement_id: id(), company_id: C, financial_account_id: A, quota_line_id: id(), created_by: U }), "42501");
    await as("authenticated","admin",B);
    expect(await scalar("SELECT count(*)::int FROM ticket_office_statement_config_log")).toBe(0);
    expect(await scalar("SELECT count(*)::int FROM company_features")).toBe(0);
    await as("anon"); await fails("SELECT * FROM ticket_office_statements", "42501");
  });

  it("CHECKs do cabeçalho: versão, período, corte/fuso, PDF/hash, revisão e recibo", async () => {
    await structural();
    for (const bad of [{contract_version:3},{revision:0},{period_from:"2026-10-01"},
      {period_from:"2026-10-03",period_to:"2026-10-01"}, {position_cutoff_at:"2026-10-02T00:00:00Z"},
      {position_cutoff_at:"2026-10-02T00:00:00Z",position_timezone:"Invented/Zone",position_cutoff_source:"company_day_end"},
      {position_cutoff_at:"2026-10-02T00:00:00Z",position_timezone:"UTC",position_cutoff_source:"browser"},
      {primary_document_sha256:"a".repeat(64)},{document_total:"NaN"}]) {
      await fails(insert("ticket_office_statements", {company_id:C,financial_account_id:A,number:`bad-${seq++}`,statement_date:"2026-10-01",...bad}), "23514");
    }
    const s = await statement({contract_version:2,period_from:"2026-10-01",period_to:"2026-10-02"});
    await fails(`UPDATE ticket_office_statements SET predecessor_statement_id=id WHERE id='${s}'`, "23514");
    await fails(`UPDATE ticket_office_statements SET confirmation_receipt='{}' WHERE id='${s}'`, "23514");
    await fails(`UPDATE ticket_office_statements SET status='confirmed' WHERE id='${s}'`, "23514");
    const c = await confirmed();
    await fails(`UPDATE ticket_office_statements SET revision=2 WHERE id='${c}'`, "23514");
    await fails(`UPDATE ticket_office_statements SET confirmed_at='2026-10-03T00:00:00Z' WHERE id='${c}'`, "23514");
    await fails(`UPDATE ticket_office_statements SET primary_document_sha256='bad' WHERE id='${c}'`, "23514");
  });

  it("CHECKs das linhas: envelope Q5, página, posição, sinais, campos proibidos e pendência", async () => {
    await structural(); const s = await statement({contract_version:2});
    const base = {statement_id:s,company_id:C,description:"bad",line_type:"advance",document_line_type:"advance",amount:-1,transaction_id:TX};
    for (const bad of [{document_line_type:"unknown"},{line_type:"event_right"},{position:-1}, {document_page:0},
      {amount:0},{amount:1},{event_id:EVENT},{invoice_group_id:id()},{previous_statement_id:s},
      {transaction_id:null},{source_sha256:"bad"},{amount:"NaN"},{opening_note:"no"},{declared_event_net:1}]) {
      await fails(insert("ticket_office_statement_lines",{id:id(),position:seq,...base,...bad}),"23514");
    }
    await line(s,{line_type:"advance",document_line_type:"advance",amount:null,pending_document:true,transaction_id:TX});
    await fails(insert("ticket_office_statement_lines",{...base,id:id(),position:seq,amount:null}),"23514");
    await fails(insert("ticket_office_statement_lines",{...base,id:id(),position:seq,line_type:"opening_balance"}),"23514");
  });

  it("vendas e faturas conservam quota declarada separada e validam apenas CHECKs de uma linha", async () => {
    await structural(); const s=await statement({contract_version:2});
    const sale={line_type:"event_right",document_line_type:"event_sales",event_id:EVENT,event_gross_amount:110,event_retained_amount:10,amount:100,declared_event_net:80};
    const l=await line(s,sale);
    await fails(`UPDATE ticket_office_statement_lines SET event_retained_amount=-1 WHERE id='${l}'`,"23514");
    await fails(`UPDATE ticket_office_statement_lines SET amount=99 WHERE id='${l}'`,"23514");
    await fails(`UPDATE ticket_office_statement_lines SET declared_event_net='NaN' WHERE id='${l}'`,"23514");
    const invoice=await line(s,{line_type:"ticketline_invoice",document_line_type:"ticketline_invoice",transaction_id:TX,event_id:EVENT,quota_line_id:l,amount:-20});
    await fails(`UPDATE ticket_office_statement_lines SET invoice_group_id='${id()}' WHERE id='${invoice}'`,"23514");
    await fails(`UPDATE ticket_office_statement_lines SET amount=20 WHERE id='${invoice}'`,"23514");
    await db.exec(`UPDATE ticket_office_statement_lines SET amount=20,positive_sign_evidence='Nota de crédito sintética' WHERE id='${invoice}'`);
    await fails(`UPDATE ticket_office_statement_lines SET quota_line_id=id WHERE id='${invoice}'`,"23514");
    await line(s,{line_type:"venue_settlement",document_line_type:"venue_settlement",source_sha256:"b".repeat(64),notes:"Retenção documental sem fatura"});
    await fails(insert("ticket_office_statement_lines",{id:id(),statement_id:s,company_id:C,position:seq,line_type:"venue_settlement",document_line_type:"venue_settlement",amount:-1,description:"sem prova"}),"23514");
  });

  it("unicidades de posições, referências, propostas, fontes, sucessor e consumo do predecessor", async () => {
    await structural(); const p=await statement(), s=await statement({predecessor_statement_id:p});
    await fails(insert("ticket_office_statements",{company_id:C,financial_account_id:A,number:"second-successor",statement_date:"2026-10-02",predecessor_statement_id:p}),"23505");
    const l=await line(s,{position:1,document_line_ref:"PDF-L1",previous_statement_id:p});
    await fails(insert("ticket_office_statement_lines",{statement_id:s,company_id:C,line_type:"carry_over",description:"dup",amount:-1,position:1}),"23505");
    await fails(insert("ticket_office_statement_lines",{statement_id:s,company_id:C,line_type:"carry_over",description:"dup",amount:-1,position:2,document_line_ref:"PDF-L1"}),"23505");
    const other=await statement();
    await fails(insert("ticket_office_statement_lines",{statement_id:other,company_id:C,line_type:"carry_over",description:"dup",amount:-1,previous_statement_id:p}),"23505");
    await db.exec(`UPDATE ticket_office_statement_lines SET transaction_id='${TX}' WHERE id='${l}'`);
    await fails(insert("ticket_office_statement_lines",{statement_id:other,company_id:C,line_type:"advance",description:"dup",amount:-1,transaction_id:TX}),"23505");
    const sales={line_type:"event_right",document_line_type:"event_sales",event_id:EVENT,event_gross_amount:10,event_retained_amount:0,amount:10,declared_event_net:10};
    await line(s,sales);
    await fails(insert("ticket_office_statement_lines",{id:id(),statement_id:s,company_id:C,position:seq,description:"dup",...sales}),"23505");
    await line(other,sales); // rascunhos concorrentes permitidos
  });

  it("abertura exige nota/autoria e tem claim confirmado único por conta, persistente sem configuração", async () => {
    await structural(); const s=await statement({contract_version:2});
    const opening={line_type:"carry_over",document_line_type:"opening_balance",opening_note:"Base manual sintética",opening_created_by:U,opening_created_at:"2026-10-01T12:00:00Z"};
    const l=await line(s,opening);
    await fails(`UPDATE ticket_office_statement_lines SET opening_note=' ' WHERE id='${l}'`,"23514");
    await fails(insert("ticket_office_statement_lines",{id:id(),statement_id:s,company_id:C,position:seq,description:"dup",amount:-1,...opening}),"23505");
    const c=await confirmed({opening_balance_line_id:l},s);
    const s2=await statement({contract_version:2,financial_account_id:OFF});
    const l2=await line(s2,opening);
    const c2=await confirmed({opening_balance_line_id:l2,financial_account_id:OFF},s2);
    await fails(`UPDATE ticket_office_statements SET opening_balance_line_id='${l2}',financial_account_id='${A}' WHERE id='${c2}'`,"23505");
    expect(await scalar(`SELECT opening_balance_line_id FROM ticket_office_statements WHERE id='${c}'`)).toBe(l);
  });

  it("um evento só pode pertencer a um apuramento, independentemente da conta ou fonte de vendas", async () => {
    await structural(); const a=await statement({contract_version:2}), b=await statement({contract_version:2,financial_account_id:OFF});
    const sales={line_type:"event_right",document_line_type:"event_sales",event_id:EVENT,event_gross_amount:10,event_retained_amount:0,amount:10,declared_event_net:10};
    const la=await line(a,sales), lb=await line(b,sales);
    await confirmed({},a); await confirmed({financial_account_id:OFF},b);
    await db.exec(insert("ticket_office_statement_events",{event_id:EVENT,statement_id:a,company_id:C,financial_account_id:A,quota_line_id:la,created_by:U}));
    await fails(insert("ticket_office_statement_events",{event_id:EVENT,statement_id:b,company_id:C,financial_account_id:OFF,quota_line_id:lb,created_by:U}),"23505");
    await as(); expect(await scalar("SELECT count(*)::int FROM ticket_office_statement_events")).toBe(1);
    await as("authenticated","admin",B); expect(await scalar("SELECT count(*)::int FROM ticket_office_statement_events")).toBe(0);
  });

  it("rollback comentado é aplicável, auditado e conserva documentos/recibos e o legado desligado", async () => {
    await structural(); const c=await confirmed(); await feature();
    await db.exec("ALTER TABLE ticket_office_statements ENABLE TRIGGER issue303_write_guard");
    const before=await scalar(`SELECT to_jsonb(s) FROM ticket_office_statements s WHERE id='${c}'`);
    const sql=rollback.split("\n").map(l=>l.replace(/^-- ?/,"")).join("\n");
    await db.exec("COMMIT");
    await db.exec(sql.slice(sql.indexOf("BEGIN;")));
    expect(await scalar(`SELECT _issue303_account_enabled('${C}','${A}')`)).toBe(false);
    expect(await scalar(`SELECT to_jsonb(s) FROM ticket_office_statements s WHERE id='${c}'`)).toEqual(before);
    await db.exec("BEGIN");
    await as(); await statement();
    await fails(`DELETE FROM ticket_office_statements WHERE id='${c}'`,"42501");
  });
});

describe("#303 / pré-condição atómica sem saneamento", () => {
  for (const conflict of ["position","confirmed-event","carry"]) {
    it(`aborta em conflito histórico ${conflict}, sem colunas nem alterações nos dados`, async () => {
      const pg=await fixture(false);
      try {
        const p=id(), s=id(), t=id();
        await pg.exec(`INSERT INTO ticket_office_statements(id,company_id,financial_account_id,number,statement_date)
          VALUES ('${p}','${C}','${A}','p','2026-10-01'),('${s}','${C}','${A}','s','2026-10-02'),('${t}','${C}','${A}','t','2026-10-03');
          INSERT INTO ticket_office_statement_lines(statement_id,company_id,position,line_type,description,amount,event_id,previous_statement_id)
          VALUES ('${s}','${C}',0,'event_right','first',10,'${EVENT}',${conflict==='carry'?q(p):'NULL'}),
            ('${conflict==='position'?s:t}','${C}',0,'event_right','second',20,'${EVENT}',${conflict==='carry'?q(p):'NULL'});`);
        if(conflict==='confirmed-event') await pg.exec(`UPDATE ticket_office_statements SET status='confirmed'`);
        const before=await scalar("SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM ticket_office_statement_lines l",pg);
        await expect(pg.exec(migration)).rejects.toMatchObject({code:"23505"});
        await pg.exec("ROLLBACK");
        expect(await scalar("SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM ticket_office_statement_lines l",pg)).toEqual(before);
        expect(await scalar("SELECT count(*)::int FROM information_schema.columns WHERE table_name='ticket_office_statements' AND column_name='contract_version'",pg)).toBe(0);
      } finally {await pg.close();}
    },30000);
  }
});
