// @vitest-environment node
// SQL apenas no PGlite em memória; sem credenciais, rede, instalação ou activação real.
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("drizzle/migrations/0346_issue303_commands.sql");
const rollback = read("supabase/manual/rollback_0346_issue303_commands_comentado.sql");
const uid = (n: number) => `30303460-0000-4000-8000-${String(n).padStart(12,"0")}`;
const C = uid(1), B = uid(2), U = uid(3), MANAGER = uid(4), PLATFORM = uid(5), A = uid(6), OFF = uid(7), FOREIGN = uid(8), EVENT = uid(9), FOREIGN_EVENT = uid(10);
let sequence = 100;
const id = () => uid(++sequence);
const q = (value: unknown): string => value === null ? "NULL" : typeof value === "number" || typeof value === "boolean" ? String(value) : `'${String(value).replaceAll("'","''")}'`;
const json = (value: unknown) => `${q(JSON.stringify(value))}::jsonb`;
const insert = (table: string, row: Record<string, unknown>) => `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.values(row).map(q).join(",")})`;
type Line = Record<string, unknown>;
type Payload = { financial_account_id: string; number: string; statement_date: string; document_total_cents: number | null; notes?: string; lines: Line[]; documents: Line[]; primary_document_id?: string; predecessor_statement_id?: string };
type Saved = { statement_id: string; revision: number; status: string };
type Receipt = { contract_version: number; revision: number; calculated_total: number; independent_position: number; confirmed_by: string; confirmed_at: string; opening_approved: boolean; opening: { prepared_by: string; prepared_at: string; approved_by: string; approved_at: string; note: string } | null; documents: Array<{ sha256: string }>; sources: unknown[] };
let db: PGlite;

async function value<T = unknown>(sql: string): Promise<T> {
  return Object.values((await db.query<Record<string,T>>(sql)).rows[0])[0];
}
async function owner() { await db.exec("SET SESSION AUTHORIZATION postgres; RESET ROLE"); }
async function actor(user = U, company = C, role = "authenticated") {
  await owner();
  await db.exec(`SELECT set_config('test.uid',${q(user)},false),set_config('test.company',${q(company)},false); SET SESSION AUTHORIZATION ${role}`);
}
async function fails(sql: string, message: string, code?: string) {
  await db.exec("SAVEPOINT expected_failure");
  try { await expect(db.exec(sql)).rejects.toMatchObject({ message: expect.stringContaining(message), ...(code ? { code } : {}) }); }
  finally { await db.exec("ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure"); }
}
const saveSql = (payload: Payload, saved?: Saved) => `SELECT public.save_ticket_office_statement_draft(${saved ? q(saved.statement_id) : "NULL"},${saved?.revision ?? 0},${json(payload)})`;
async function save(payload: Payload, saved?: Saved) { return value<Saved>(saveSql(payload,saved)); }
const confirmSql = (s: Saved, approve = false) => `SELECT public.confirm_ticket_office_statement(${q(s.statement_id)},${s.revision},${approve})`;
async function confirm(s: Saved, approve = false) { return value<Receipt>(confirmSql(s,approve)); }
function payload(lines: Line[] = [], total = 10000, account = A): Payload {
  return { financial_account_id: account, number: `Synthetic-${id()}`, statement_date: "2026-10-01", document_total_cents: total, lines, documents: [] };
}
function sales(event = EVENT, amount = 10000): Line {
  return { id: id(), position: 0, document_line_type: "event_sales", description: "Vendas sintéticas",
    amount_cents: amount, event_id: event, event_gross_cents: amount, event_retained_cents: 0, declared_event_net_cents: amount };
}
function opening(amount = -1000): Line {
  return { id: id(), position: 1, document_line_type: "opening_balance", description: "Base manual sintética", amount_cents: amount, opening_note: "Abertura revista sintética" };
}
async function enabled(account = A, company = C) {
  await owner();
  // Instalação de feature exclusivamente no catálogo sintético; a migração não a cria.
  await db.exec(`SELECT set_config('test.uid',${q(U)},false),set_config('test.company',${q(company)},false);
    INSERT INTO company_features(company_id,feature_key,enabled,config) VALUES (${q(company)},'ticket-office-statements-v2',true,
      ${json({ accounts: [{ financial_account_id: account, enabled: true, contract_version: 2 }] })});
    UPDATE company_features SET enabled=true WHERE company_id=${q(company)} AND feature_key='ticket-office-statements-v2'`);
}
// R4 fake local, nunca gerado para migração. A posição vem de uma tabela separada,
// não de document_total/sum(lines). Permite testar R3 depois da barreira real 55000.
async function syntheticR4() {
  await owner();
  await db.exec(`CREATE OR REPLACE FUNCTION issue303_private.r4_validate(p_statement uuid,p_revision bigint)
    RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
      SELECT jsonb_build_object('contract_version',2,'statement_id',p_statement,'revision',p_revision,
        'independent_position',position,'position_cutoff_at','2026-10-02T00:00:00Z',
        'position_timezone','UTC','position_cutoff_source','pdf_explicit',
        'sources',jsonb_build_array(jsonb_build_object('synthetic_independent_ledger',id)))
      FROM issue303_private.synthetic_positions WHERE id=p_statement $$`);
}
async function position(s: Saved, cents: number) {
  await owner();
  await db.exec(`INSERT INTO issue303_private.synthetic_positions VALUES (${q(s.statement_id)},${cents}/100.0)
    ON CONFLICT(id) DO UPDATE SET position=excluded.position`);
}
async function verifiedFile(s: Saved, name = "statement.pdf", company = C) {
  await owner();
  const vid = id(), object = id(), path = `${company}/statements/${s.statement_id}/${vid}_${name}`;
  const bytes = `%PDF-1.7\nSYNTHETIC ${vid}\n%%EOF`;
  await db.exec(insert("storage.objects", { id: object, bucket_id: "ticket-office-settlements", name: path, metadata: "{}" }));
  await db.exec(`INSERT INTO issue303_private.verified_files(id,company_id,bucket_id,file_path,storage_object_id,bytes)
    VALUES (${q(vid)},${q(company)},'ticket-office-settlements',${q(path)},${q(object)},convert_to(${q(bytes)},'UTF8'))`);
  return { vid, object, path, bytes, hash: createHash("sha256").update(bytes).digest("hex") };
}
async function draft(lines: Line[] = [sales()], total = 10000, account = A) {
  const p = payload(lines,total,account);
  await actor();
  let s = await save(payload([],0,account)); // cria ID antes de preparar uploads canónicos
  p.number = `Synthetic-${s.statement_id}`;
  const proof = await verifiedFile(s);
  p.documents = [{ id: id(), verified_file_id: proof.vid, file_name: "statement.pdf", mime_type: "application/pdf", document_source: "apuramento" }];
  p.primary_document_id = String(p.documents[0].id);
  p.lines = p.lines.map((l,i) => ({ ...l, position: i, source_sha256: proof.hash, document_page: 1, document_line_ref: `L${i+1}` }));
  await actor(); s = await save(p,s);
  await position(s,total);
  await actor();
  return { s,p,proof };
}
async function transaction(overrides: Line = {}) {
  await owner();
  const row = { id: id(), company_id: C, account_id: A, event_id: EVENT, amount: 10, paid_amount: 10,
    type: "expense", status: "paid", currency: "EUR", category_id: uid(11), ...overrides };
  await db.exec(insert("transactions",row));
  return String(row.id);
}
const invoice = (tx: string, amount = -1000): Line => ({ id: id(), position: 1, document_line_type: "ticketline_invoice",
  description: "Fatura sintética", amount_cents: amount, transaction_id: tx, event_id: EVENT });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TYPE app_role AS ENUM ('admin','manager','platform_admin','viewer');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.company',true),'')::uuid $$;
    CREATE TABLE user_roles(user_id uuid,company_id uuid,role app_role);
    INSERT INTO user_roles VALUES ('${U}','${C}','admin'),('${U}','${B}','admin'),('${MANAGER}','${C}','manager'),('${PLATFORM}','${C}','platform_admin');
    CREATE FUNCTION is_platform_admin(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role='platform_admin') $$;
    CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT is_platform_admin($1) OR EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND company_id=current_company_id() AND role=$2) $$;
    CREATE FUNCTION has_staff_role(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL $$;
    CREATE FUNCTION row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1=current_company_id() $$;
    CREATE FUNCTION update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=now(); RETURN NEW; END $$;
    CREATE FUNCTION set_company_id_on_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.company_id:=current_company_id(); RETURN NEW; END $$;
    CREATE TABLE companies(id uuid PRIMARY KEY,slug text);
    CREATE TABLE financial_accounts(id uuid PRIMARY KEY,company_id uuid REFERENCES companies,type text);
    CREATE TABLE events(id uuid PRIMARY KEY,company_id uuid REFERENCES companies);
    CREATE TABLE event_ticket_office_assignments(event_id uuid,financial_account_id uuid);
    CREATE TABLE account_categories(id uuid PRIMARY KEY,company_id uuid,code text);
    CREATE TABLE transactions(id uuid PRIMARY KEY,company_id uuid,account_id uuid,event_id uuid,invoice_group_id uuid,
      amount numeric(14,2),paid_amount numeric(14,2),type text,status text,currency text,category_id uuid,reversed_at timestamptz,settlement_id uuid);
    CREATE TABLE transaction_payments(id uuid PRIMARY KEY,transaction_id uuid REFERENCES transactions,amount numeric);
    CREATE TABLE transaction_documents(id uuid PRIMARY KEY,transaction_id uuid REFERENCES transactions,file_url text);
    CREATE TABLE ticket_office_settlements(id uuid PRIMARY KEY,company_id uuid,financial_account_id uuid,event_id uuid,status text);
    CREATE TABLE event_ticket_office_advances(id uuid PRIMARY KEY);
    CREATE TABLE storage_deletion_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket text,object_path text);
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text,name text,metadata jsonb,UNIQUE(bucket_id,name));
    INSERT INTO companies VALUES ('${C}','synthetic-a'),('${B}','synthetic-b');
    INSERT INTO auth.users VALUES ('${U}'),('${MANAGER}'),('${PLATFORM}');
    INSERT INTO financial_accounts VALUES ('${A}','${C}','ticket_office'),('${OFF}','${C}','ticket_office'),('${FOREIGN}','${B}','ticket_office');
    INSERT INTO events VALUES ('${EVENT}','${C}'),('${FOREIGN_EVENT}','${B}');
    INSERT INTO event_ticket_office_assignments VALUES ('${EVENT}','${A}'),('${EVENT}','${OFF}'),('${FOREIGN_EVENT}','${FOREIGN}');
    INSERT INTO account_categories VALUES ('${uid(11)}','${C}','10.3');
    SELECT set_config('test.uid','${U}',false),set_config('test.company','${C}',false);`);
  await db.exec(read("supabase/migrations/20260516044247_d211f8c9-7cc0-4917-b04e-eb8d4a66796d.sql").split("-- Seed")[0]);
  await db.exec(read("drizzle/migrations/0077_derp231_ticket_office_statements.sql"));
  await db.exec(read("drizzle/migrations/0090_ticket_office_statement_documents.sql"));
  await db.exec(read("drizzle/migrations/0213_issue333_tosl_guard.sql"));
  await db.exec(`GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,anon,service_role;
    GRANT SELECT ON companies,financial_accounts,events TO authenticated;
    GRANT ALL ON company_features TO authenticated,service_role;
    GRANT ALL ON storage.objects,transactions,transaction_payments,transaction_documents,ticket_office_settlements,storage_deletion_log TO authenticated,service_role;`);
  await db.exec(read("drizzle/migrations/0345_issue303_apuramento_contract.sql"));
  await db.exec(migration);
  await db.exec("CREATE TABLE issue303_private.synthetic_positions(id uuid PRIMARY KEY,position numeric(14,2))");
},30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await owner(); await db.exec("BEGIN"); await enabled(); await actor(); });
afterEach(async () => { await db.exec("ROLLBACK"); await owner(); });

describe("#303 / 0346 — preparação dos comandos v2", () => {
  it("mantém ficheiros idênticos, sem activações e rollback só comentado", async () => {
    expect(read("supabase/manual/0346_issue303_commands.sql")).toBe(migration);
    expect(migration).toContain("PREPARADA, NÃO APLICADA");
    expect(migration).not.toMatch(/INSERT INTO public.company_features/i);
    expect(rollback.split("\n").filter(l=>l.trim()).every(l=>l.startsWith("--"))).toBe(true);
    await owner();
    expect(await value("SELECT count(*)::int FROM issue303_private.command_context")).toBe(0);
  });

  it("só expõe as três RPCs de sessão; helpers e tabelas privadas não são executáveis/escrevíveis", async () => {
    await owner();
    for (const signature of ["save_ticket_office_statement_draft(uuid,bigint,jsonb)","confirm_ticket_office_statement(uuid,bigint,boolean)","add_ticket_office_statement_supplement(uuid,bigint,jsonb,text)"]) {
      for (const role of ["anon","service_role","authenticated"]) expect(await value(`SELECT has_function_privilege(${q(role)},${q(signature)},'EXECUTE')`)).toBe(role === "authenticated");
      expect(await value(`SELECT prosecdef AND proconfig = ARRAY['search_path=pg_catalog, public, pg_temp'] FROM pg_proc WHERE oid=${q(signature)}::regprocedure`)).toBe(true);
    }
    const functions = (await db.query<{sig:string}>("SELECT oid::regprocedure::text sig FROM pg_proc WHERE pronamespace='issue303_private'::regnamespace")).rows;
    for (const f of functions) for (const role of ["anon","authenticated","service_role"]) expect(await value(`SELECT has_function_privilege(${q(role)},${q(f.sig)},'EXECUTE')`)).toBe(false);
    for (const role of ["anon","authenticated","service_role"]) {
      expect(await value(`SELECT has_schema_privilege(${q(role)},'issue303_private','USAGE')`)).toBe(false);
      expect(await value(`SELECT has_table_privilege(${q(role)},'issue303_private.command_context','INSERT,UPDATE,DELETE')`)).toBe(false);
    }
  });

  it("admin e manager preparam; a autoria/abertura/revisão são do servidor e cêntimos fraccionários recusam", async () => {
    await actor(MANAGER);
    const p = payload([opening()],-1000); p.lines[0].opening_created_by = PLATFORM;
    const s = await save(p);
    await owner();
    expect(await value(`SELECT created_by FROM ticket_office_statements WHERE id=${q(s.statement_id)}`)).toBe(MANAGER);
    expect(await value(`SELECT opening_created_by FROM ticket_office_statement_lines WHERE statement_id=${q(s.statement_id)}`)).toBe(MANAGER);
    expect(await value(`SELECT opening_created_at=now() FROM ticket_office_statement_lines WHERE statement_id=${q(s.statement_id)}`)).toBe(true);
    await actor(MANAGER);
    const next = await save(p,s); expect(next.revision).toBe(2);
    await fails(saveSql(p,s),"issue303_revision_conflict","40001");
    p.document_total_cents = 1.001;
    await fails(saveSql(p,next),"issue303_invalid_cents","22023");
    await actor(PLATFORM); await fails(saveSql(payload()),"issue303_company_role_required","42501");
  });

  it("recusa manager, platform_admin isolado, ausência de sessão e service_role na confirmação", async () => {
    const {s} = await draft(); await syntheticR4();
    for (const user of [MANAGER,PLATFORM,""]) { await actor(user); await fails(confirmSql(s),"issue303_company_role_required","42501"); }
    await actor(U,C,"service_role"); await fails(confirmSql(s),"permission denied","42501");
    await actor(); const r = await confirm(s); expect(r.confirmed_by).toBe(U);
    expect(r.calculated_total).toBe(100); expect(r.independent_position).toBe(100);
  });

  it("recusa empresa cruzada em conta, pai, evento e fonte, inclusive com role admin nos dois tenants", async () => {
    const {s,p} = await draft();
    await actor(U,B); await fails(confirmSql(s),"issue303_company_role_required","42501");
    await actor(); await fails(saveSql(payload([],0,FOREIGN)),"issue303_account_not_enabled","42501");
    p.lines[0].event_id = FOREIGN_EVENT; await fails(saveSql(p,s),"issue303_invalid_event","42501");
    const tx = await transaction({company_id:B,account_id:FOREIGN});
    p.lines = [invoice(tx)]; p.document_total_cents = -1000;
    await actor(); await fails(saveSql(p,s),"issue303_invalid_transaction_source","42501");
  });

  for (const delta of [-1,1]) it(`recusa diferença de ${delta} cêntimo sem ajuste nem efeitos`, async () => {
    const {s} = await draft([sales()],10000+delta);
    await fails(confirmSql(s),"issue303_total_mismatch","23514");
    expect(await value(`SELECT status||':'||revision FROM ticket_office_statements WHERE id=${q(s.statement_id)}`)).toBe("draft:2");
    expect(await value("SELECT count(*)::int FROM ticket_office_statement_events")).toBe(0);
  });

  it("pending_document com zero ou NULL bloqueia antes de comparar totais", async () => {
    for (const amount of [0,null]) {
      const l = sales(EVENT,0); l.amount_cents = amount; l.pending_document = true;
      const {s} = await draft([l],0); await fails(confirmSql(s),"issue303_pending_document","23514");
    }
  });

  it("quota final divergente recusa mesmo quando o total fecha", async () => {
    const l = sales(); l.declared_event_net_cents = 9999;
    const {s} = await draft([l]); await fails(confirmSql(s),"issue303_quota_mismatch","23514");
  });

  it("recusa revisão obsoleta, número normalizado repetido e referencias de quota estrangeiras", async () => {
    const {s,p} = await draft();
    await fails(confirmSql({...s,revision:1}),"issue303_revision_conflict","40001");
    await fails(saveSql({...payload([],0),number:` ${p.number.toLowerCase()} `}),"issue303_duplicate_number","23505");
    const tx = await transaction(); await actor();
    p.lines.push({...invoice(tx),position:1,quota_line_id:id()}); p.document_total_cents=9000;
    await fails(saveSql(p,s),"foreign key","23503");
  });

  it("R4 real ausente recusa explicitamente e não consome abertura/pertença/fontes/contexto", async () => {
    const {s} = await draft([sales(),opening()],9000);
    await fails(confirmSql(s,true),"capacidade_r4_em_falta","55000");
    await owner();
    expect(await value("SELECT count(*)::int FROM ticket_office_statement_events")).toBe(0);
    expect(await value("SELECT count(*)::int FROM issue303_private.source_claims")).toBe(0);
    expect(await value("SELECT count(*)::int FROM issue303_private.command_context")).toBe(0);
    expect(await value(`SELECT confirmation_receipt IS NULL AND opening_balance_line_id IS NULL FROM ticket_office_statements WHERE id=${q(s.statement_id)}`)).toBe(true);
  });

  it("posição sintética independente divergente recusa atomicamente", async () => {
    const {s} = await draft(); await syntheticR4(); await position(s,9999); await actor();
    await fails(confirmSql(s),"issue303_invalid_r4_proof","23514");
    expect(await value("SELECT count(*)::int FROM ticket_office_statement_events")).toBe(0);
  });

  it("falha tardia no carimbo desfaz pertença, consumo de fonte, abertura e contexto na mesma transacção", async () => {
    const tx = await transaction({event_id:null});
    const advance: Line = {id:id(),position:2,document_line_type:"advance",description:"Repasse sintético",amount_cents:-1000,transaction_id:tx};
    const {s} = await draft([sales(),opening(),advance],8000);
    await syntheticR4();
    await db.exec(`DO $$ DECLARE body text; BEGIN
      SELECT prosrc INTO body FROM pg_proc WHERE oid='issue303_private.r4_validate(uuid,bigint)'::regprocedure;
      EXECUTE 'CREATE OR REPLACE FUNCTION issue303_private.r4_validate(p_statement uuid,p_revision bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS '
        ||quote_literal(replace(body,'''UTC''','''Invalid/Timezone'''));
    END $$`);
    await actor(); await fails(confirmSql(s,true),"issue303_invalid_timezone","23514");
    await owner();
    for (const table of ["ticket_office_statement_events","issue303_private.source_claims","issue303_private.command_context"]) {
      expect(await value(`SELECT count(*)::int FROM ${table}`)).toBe(0);
    }
    expect(await value(`SELECT status='draft' AND confirmation_receipt IS NULL AND opening_balance_line_id IS NULL FROM ticket_office_statements WHERE id=${q(s.statement_id)}`)).toBe(true);
    expect(await value(`SELECT amount FROM transactions WHERE id=${q(tx)}`)).toBe("10.00");
  });

  it("abertura exige nota e aprovação explícita e grava preparação/aprovação do servidor no recibo", async () => {
    await actor(MANAGER); const l = opening(); delete l.opening_note;
    await fails(saveSql(payload([l],-1000)),"issue303_opening_fields","23514");
    const {s} = await draft([opening()],-1000); await syntheticR4(); await actor();
    await fails(confirmSql(s),"issue303_opening_first_admin_approval_required","23514");
    const r = await confirm(s,true);
    expect(r.opening_approved).toBe(true); expect(r.opening?.prepared_by).toBe(U); expect(r.opening?.approved_by).toBe(U);
    expect(r.opening?.note).toBe("Abertura revista sintética"); expect(r.opening?.approved_at).toBe(r.confirmed_at);
    expect(await value(`SELECT opening_balance_line_id IS NOT NULL FROM ticket_office_statements WHERE id=${q(s.statement_id)}`)).toBe(true);
  });

  it("duas propostas de abertura intercaladas: só a primeira confirma e retry não consome outra", async () => {
    const first = await draft([opening()],-1000), second = await draft([opening()],-1000);
    await syntheticR4(); await actor();
    const receipt = await confirm(first.s,true);
    await fails(confirmSql(second.s,true),"issue303_opening_first_admin_approval_required","23514");
    expect(await confirm(first.s,true)).toEqual(receipt);
    expect(await value("SELECT count(*)::int FROM ticket_office_statements WHERE opening_balance_line_id IS NOT NULL")).toBe(1);
  });

  it("primeiro confirmado sem abertura também consome a excepção da conta, mesmo após desligar/reactivar", async () => {
    const first = await draft(); await syntheticR4(); await actor(); await confirm(first.s);
    await owner(); await db.exec("UPDATE company_features SET enabled=false; UPDATE company_features SET enabled=true");
    const second = await draft([opening()],-1000);
    await fails(confirmSql(second.s,true),"issue303_opening_first_admin_approval_required","23514");
  });

  it("pertença do mesmo evento só confirma uma vez, inclusive em duas contas activas", async () => {
    await owner();
    await db.exec("UPDATE company_features SET config="+json({accounts:[{financial_account_id:A,enabled:true,contract_version:2},{financial_account_id:OFF,enabled:true,contract_version:2}] }));
    const first = await draft(), second = await draft([sales()],10000,OFF);
    await syntheticR4(); await actor(); await confirm(first.s);
    await fails(confirmSql(second.s),"issue303_event_already_confirmed","23505");
    expect(await value(`SELECT statement_id FROM ticket_office_statement_events WHERE event_id=${q(EVENT)}`)).toBe(first.s.statement_id);
  });

  it("confirmado e linhas não mudam, não voltam a draft, não movem pai e não desaparecem em cascata", async () => {
    const first = await draft(), other = await draft(); await syntheticR4(); await actor(); await confirm(first.s);
    const before = await value(`SELECT to_jsonb(s) FROM ticket_office_statements s WHERE id=${q(first.s.statement_id)}`);
    for (const change of ["status='draft'","document_total=0","primary_document_sha256=repeat('b',64)","company_id='"+B+"'","contract_version=1"]) {
      await fails(`UPDATE ticket_office_statements SET ${change} WHERE id=${q(first.s.statement_id)}`,"issue303_confirmed_or_retained_immutable","42501");
    }
    await fails(`DELETE FROM ticket_office_statements WHERE id=${q(first.s.statement_id)}`,"issue303_confirmed_or_retained_immutable","42501");
    await fails(`UPDATE ticket_office_statement_lines SET statement_id=${q(other.s.statement_id)} WHERE statement_id=${q(first.s.statement_id)}`,"issue303_private_command_required","42501");
    await fails(saveSql(first.p,first.s),"issue303_invalid_draft","42501");
    expect(await value(`SELECT to_jsonb(s) FROM ticket_office_statements s WHERE id=${q(first.s.statement_id)}`)).toEqual(before);
  });

  it("bytes/hash/PDF/provas/pertença e arquivo são congelados também para service_role e com feature desligada", async () => {
    const {s,p,proof} = await draft(); await syntheticR4(); await actor(); const receipt = await confirm(s);
    await owner(); await db.exec("UPDATE company_features SET enabled=false");
    await actor(U,C,"service_role");
    await fails(`UPDATE ticket_office_statement_documents SET file_path='other.pdf' WHERE id=${q(p.primary_document_id)}`,"issue303_private_command_required","42501");
    await fails(`DELETE FROM storage.objects WHERE id=${q(proof.object)}`,"issue303_evidence_frozen","42501");
    await fails(`UPDATE storage.objects SET name='moved.pdf' WHERE id=${q(proof.object)}`,"issue303_evidence_frozen","42501");
    await fails(insert("storage_deletion_log",{bucket:"ticket-office-settlements",object_path:proof.path}),"issue303_evidence_frozen","42501");
    await owner();
    await fails(`UPDATE issue303_private.verified_files SET bytes=convert_to('changed','UTF8') WHERE id=${q(proof.vid)}`,"issue303_verified_bytes_append_only","42501");
    await fails(`DELETE FROM ticket_office_statement_events WHERE statement_id=${q(s.statement_id)}`,"issue303_private_command_required","42501");
    expect(await value(`SELECT sha256 FROM issue303_private.verified_files WHERE id=${q(proof.vid)}`)).toBe(proof.hash);
    expect(receipt.documents[0].sha256).toBe(proof.hash);
  });

  it("complemento só adiciona uma prova nova auditada e não muda o recibo/revisão/bytes originais", async () => {
    const {s} = await draft(); await syntheticR4(); await actor(); const receipt = await confirm(s);
    const f = await verifiedFile(s,"supplement.pdf"); await actor(MANAGER);
    const doc = {verified_file_id:f.vid,file_name:"supplement.pdf",mime_type:"application/pdf"};
    const sql = `SELECT add_ticket_office_statement_supplement(${q(s.statement_id)},${s.revision},${json(doc)},'Prova adicional sintética')`;
    const added = await value<string>(sql);
    expect(await value(`SELECT created_by FROM ticket_office_statement_documents WHERE id=${q(added)}`)).toBe(MANAGER);
    expect(await value(`SELECT supplement_reason FROM ticket_office_statement_documents WHERE id=${q(added)}`)).toBe("Prova adicional sintética");
    expect(await value(`SELECT verified_sha256 FROM ticket_office_statement_documents WHERE id=${q(added)}`)).toBe(f.hash);
    expect(await value(`SELECT created_at=now() FROM ticket_office_statement_documents WHERE id=${q(added)}`)).toBe(true);
    expect(await value(`SELECT confirmation_receipt FROM ticket_office_statements WHERE id=${q(s.statement_id)}`)).toEqual(receipt);
    await fails(sql,"issue303_new_verified_supplement_required","23514");
    await fails(`DELETE FROM ticket_office_statement_documents WHERE id=${q(added)}`,"issue303_private_command_required","42501");
    await fails(`UPDATE storage.objects SET metadata='{"changed":true}' WHERE id=${q(f.object)}`,"issue303_evidence_frozen","42501");
  });

  it("repetição devolve recibo original sem depender de R4 nem duplicar pertenças; revisão incompatível recusa", async () => {
    const {s} = await draft(); await syntheticR4(); await actor(); const receipt = await confirm(s);
    await owner(); await db.exec(`CREATE OR REPLACE FUNCTION issue303_private.r4_validate(p_statement uuid,p_revision bigint)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'capacidade_r4_em_falta'; END $$`);
    await actor(); expect(await confirm(s)).toEqual(receipt);
    await fails(confirmSql({...s,revision:s.revision+1}),"issue303_revision_conflict","40001");
    await fails(confirmSql(s,true),"issue303_incompatible_retry","22023");
    expect(await value("SELECT count(*)::int FROM ticket_office_statement_events")).toBe(1);
  });

  it("índices persistentes e lock da conta/eventos existem no catálogo para as propostas intercaladas", async () => {
    await owner();
    for (const index of ["issue303_opening_account_once","ticket_office_statement_events_pkey"]) expect(await value(`SELECT indisunique FROM pg_index WHERE indexrelid=${q(index)}::regclass`)).toBe(true);
    const body = await value<string>("SELECT prosrc FROM pg_proc WHERE oid='issue303_private.lock_document(uuid)'::regprocedure");
    expect(body.indexOf("FROM public.financial_accounts")).toBeLessThan(body.indexOf("FROM public.ticket_office_statements\n    WHERE"));
    expect(body.indexOf("FROM public.ticket_office_statements\n    WHERE")).toBeLessThan(body.indexOf("FROM public.events"));
    expect(body).toMatch(/ORDER BY id FOR UPDATE/g);
  });

  it("escritores directos/legados e GUCs não abrem v2; falha SQL desfaz efeitos anteriores do escritor", async () => {
    const {s} = await draft();
    await db.exec("SELECT set_config('issue303.command','confirm',true)");
    await fails(`SELECT confirm_ticket_office_statement(${q(s.statement_id)})`,"issue303_private_command_required","42501");
    await fails(`UPDATE ticket_office_statements SET notes='bypass' WHERE id=${q(s.statement_id)}`,"issue303_private_command_required","42501");
    await owner();
    await db.exec(`CREATE FUNCTION public.synthetic_old_writer(p_statement uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
      BEGIN INSERT INTO transaction_payments VALUES ('${id()}',NULL,1); UPDATE ticket_office_statements SET notes='bypass' WHERE id=p_statement; END $$`);
    await actor(); await fails(`SELECT synthetic_old_writer(${q(s.statement_id)})`,"issue303_private_command_required","42501");
    expect(await value("SELECT count(*)::int FROM transaction_payments")).toBe(0);
    await fails("INSERT INTO issue303_private.command_context VALUES(pg_backend_pid(),txid_current(),gen_random_uuid(),'confirm')","permission denied","42501");
  });

  it("conta desligada mantém CRUD, anexos e confirmação manager legados com corpos/ACL idênticos", async () => {
    await actor(MANAGER);
    const sid = id(), line = id(), doc = id();
    await db.exec(insert("ticket_office_statements",{id:sid,company_id:C,financial_account_id:OFF,number:id(),statement_date:"2026-10-01",document_total:-10}));
    await db.exec(insert("ticket_office_statement_lines",{id:line,statement_id:sid,company_id:C,position:0,line_type:"carry_over",description:"Legado sintético",amount:-10}));
    await db.exec(insert("ticket_office_statement_documents",{id:doc,statement_id:sid,company_id:C,file_path:"legacy.pdf",file_name:"legacy.pdf",mime_type:"application/pdf",document_source:"apuramento"}));
    await db.exec(`UPDATE ticket_office_statement_documents SET file_name='edited.pdf' WHERE id=${q(doc)};
      DELETE FROM ticket_office_statement_documents WHERE id=${q(doc)};
      UPDATE ticket_office_statement_lines SET description='Legacy' WHERE id=${q(line)};
      SELECT confirm_ticket_office_statement(${q(sid)})`);
    expect(await value(`SELECT contract_version||':'||status FROM ticket_office_statements WHERE id=${q(sid)}`)).toBe("1:confirmed");
    await owner();
    expect(await value("SELECT md5(prosrc) FROM pg_proc WHERE oid='confirm_ticket_office_statement(uuid)'::regprocedure")).toBe("2e868bc2a28ec291581028f6dc579c6a");
    await actor(); await fails(saveSql(payload([],0,OFF)),"issue303_account_not_enabled","42501");
  });

  it("fontes de fatura e grupo são revalidadas, deduplicadas e ficam imutáveis após confirmar", async () => {
    const group = id(), tx = await transaction({invoice_group_id:group});
    const sourceDoc = id(), sourceObject = id(), sourcePath = `${C}/synthetic-invoice.pdf`;
    await db.exec(insert("transaction_documents",{id:sourceDoc,transaction_id:tx,file_url:sourcePath}));
    await db.exec(insert("storage.objects",{id:sourceObject,bucket_id:"transaction-documents",name:sourcePath,metadata:"{}"}));
    const sale = sales(), deduction = {...invoice(tx),quota_line_id:sale.id}; sale.declared_event_net_cents=9000;
    const {s} = await draft([deduction,sale],9000);
    await syntheticR4(); await actor(); await confirm(s);
    await owner();
    expect(await value("SELECT count(*)::int FROM issue303_private.source_claims")).toBe(1);
    for (const sql of [`UPDATE transactions SET amount=11 WHERE id=${q(tx)}`,`DELETE FROM transactions WHERE id=${q(tx)}`,
      insert("transactions",{id:id(),company_id:C,account_id:A,invoice_group_id:group,amount:1,type:"expense"}),
      insert("transaction_payments",{id:id(),transaction_id:tx,amount:1}),
      insert("transaction_documents",{id:id(),transaction_id:tx,file_url:"replacement.pdf"})]) await fails(sql,"issue303_frozen_source_or_legacy_writer","42501");
    await fails(`DELETE FROM storage.objects WHERE id=${q(sourceObject)}`,"issue303_evidence_frozen","42501");
    await fails(insert("storage_deletion_log",{bucket:"transaction-documents",object_path:sourcePath}),"issue303_evidence_frozen","42501");
    const other = await draft([opening()],-1000);
    other.p.lines=[{...invoice(tx),transaction_id:null,invoice_group_id:group,source_sha256:other.proof.hash}];
    await actor(); await fails(saveSql(other.p,other.s),"issue303_source_already_used","23505");
  });

  it("advance exige perna expense 10.3 paga na conta, sem evento e sem duplicação financeira", async () => {
    const tx = await transaction({event_id:null});
    const l: Line = {id:id(),position:0,document_line_type:"advance",description:"Repasse sintético",amount_cents:-1000,transaction_id:tx};
    const {s} = await draft([l],-1000); await syntheticR4(); await actor(); await confirm(s);
    await owner(); expect(await value("SELECT count(*)::int FROM transactions")).toBe(1);
    expect(await value("SELECT count(*)::int FROM transaction_payments")).toBe(0);
    const bad = await transaction({status:"pending"});
    await actor(); await fails(saveSql(payload([{...l,id:id(),transaction_id:bad}],-1000)),"issue303_invalid_transaction_source","42501");
  });

  it("acerto posterior exige documento/linha/motivo do original e confirma sem novo event_sales nem pertença", async () => {
    const original = await draft(); await syntheticR4(); await actor(); const receipt = await confirm(original.s);
    const tx = await transaction();
    const adjustment = {...invoice(tx),adjusts_statement_id:original.s.statement_id,adjusts_line_id:original.p.lines[0].id,adjustment_reason:"Fatura tardia sintética"};
    const later = await draft([adjustment],-1000);
    await confirm(later.s);
    expect(await value("SELECT count(*)::int FROM ticket_office_statement_events")).toBe(1);
    expect(await value(`SELECT count(*)::int FROM ticket_office_statement_lines WHERE statement_id=${q(later.s.statement_id)} AND document_line_type='event_sales'`)).toBe(0);
    expect(await value(`SELECT confirmation_receipt FROM ticket_office_statements WHERE id=${q(original.s.statement_id)}`)).toEqual(receipt);
    const invalid = {...adjustment,id:id(),transaction_id:await transaction()}; delete (invalid as Line).adjusts_line_id;
    await actor(); await fails(saveSql(payload([invalid],-1000)),"issue303_adjustment","23514");
    const noLink = invoice(await transaction());
    await actor(); await fails(saveSql(payload([noLink],-1000)),"issue303_adjustment_reference_required","23514");
  });

  it("grupo resolve todos os membros e recusa soma divergente, repetição individual e membro de outro tenant", async () => {
    const group = id(), tx = await transaction({invoice_group_id:group}); await transaction({invoice_group_id:group,amount:5});
    const line: Line = {...invoice(tx,-1500),transaction_id:null,invoice_group_id:group};
    const good = await draft([line],-1500);
    const bad = {...good.p,document_total_cents:-1499,lines:[{...good.p.lines[0],amount_cents:-1499}]};
    await actor(); await fails(saveSql(bad,good.s),"issue303_source_amount_mismatch","23514");
    const reused = {...payload([invoice(tx)],-1000)};
    await fails(saveSql(reused),"issue303_source_already_used","23505");
    await transaction({invoice_group_id:group,company_id:B,account_id:FOREIGN,amount:2});
    await actor(); await fails(saveSql(good.p,good.s),"issue303_invalid_transaction_source","42501");
  });

  it("hash do cliente não prova upload e provas verificadas não são substituíveis antes de confirmar", async () => {
    const {s,p,proof} = await draft();
    const modified = {...p,lines:[{...p.lines[0],source_sha256:"b".repeat(64)}]};
    await fails(saveSql(modified,s),"issue303_unverified_line_proof","23514");
    await fails(`UPDATE storage.objects SET metadata='{"changed":true}' WHERE id=${q(proof.object)}`,"issue303_evidence_frozen","42501");
    const wrong = {...p,documents:[{...p.documents[0],verified_file_id:id()}]};
    await fails(saveSql(wrong,s),"issue303_verified_document_required","23514");
    await owner();
    expect(await value(`SELECT encode(bytes,'hex') FROM issue303_private.verified_files WHERE id=${q(proof.vid)}`)).toBe(Buffer.from(proof.bytes).toString("hex"));
  });

  it("bloqueia escritores de fecho/transferência activos antes de efeitos e conserva o fecho desligado", async () => {
    await owner(); const sid = id();
    await fails(insert("ticket_office_settlements",{id:sid,company_id:C,financial_account_id:A,event_id:EVENT,status:"draft"}),"issue303_frozen_source_or_legacy_writer","42501");
    await db.exec(insert("ticket_office_settlements",{id:sid,company_id:C,financial_account_id:OFF,event_id:EVENT,status:"draft"}));
    await db.exec(`UPDATE ticket_office_settlements SET status='confirmed' WHERE id=${q(sid)}`);
    await db.exec("UPDATE company_features SET config=jsonb_set(config,'{accounts}',"+json([{financial_account_id:A,enabled:true,contract_version:2},{financial_account_id:OFF,enabled:true,contract_version:2}])+")");
    await fails(insert("transactions",{id:id(),company_id:C,account_id:OFF,settlement_id:sid,amount:1,type:"expense"}),"issue303_frozen_source_or_legacy_writer","42501");
    expect(await value("SELECT count(*)::int FROM transactions")).toBe(0);
  });

  it("rollback comentado aplica contenção sem perder recibos, bytes, pertenças ou acesso legado", async () => {
    const {s,proof} = await draft(); await syntheticR4(); await actor(); const receipt = await confirm(s);
    await owner();
    const sql = rollback.split("\n").map(l=>l.replace(/^-- ?/,"")).join("\n");
    // Mantém o rollback no isolamento do teste; BEGIN/COMMIT pertencem à execução futura.
    await db.exec(sql.slice(sql.indexOf("DO $rollback_0346$"),sql.lastIndexOf("COMMIT;")));
    expect(await value(`SELECT _issue303_account_enabled(${q(C)},${q(A)})`)).toBe(false);
    expect(await value(`SELECT confirmation_receipt FROM ticket_office_statements WHERE id=${q(s.statement_id)}`)).toEqual(receipt);
    expect(await value(`SELECT sha256 FROM issue303_private.verified_files WHERE id=${q(proof.vid)}`)).toBe(proof.hash);
    expect(await value("SELECT count(*)::int FROM ticket_office_statement_events")).toBe(1);
    expect(await value("SELECT has_function_privilege('authenticated','confirm_ticket_office_statement(uuid,bigint,boolean)','EXECUTE')")).toBe(false);
    expect(await value("SELECT has_function_privilege('authenticated','confirm_ticket_office_statement(uuid)','EXECUTE')")).toBe(true);
    await actor(); await fails(`UPDATE ticket_office_statements SET status='draft' WHERE id=${q(s.statement_id)}`,"issue303_confirmed_or_retained_immutable","42501");
  });
});
