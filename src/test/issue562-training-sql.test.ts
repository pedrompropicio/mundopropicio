// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const manual = readFileSync("supabase/manual/0308_issue562_training_companies.sql", "utf8");
const real = "00000000-0000-4000-8000-000000000001";
const training = "00000000-0000-4000-8000-000000000002";
const tables = ["ticketline_sync_config", "bol_sync_config", "fever_sync_config", "crm.ad_platform_connections", "artist_channel_connections", "camarim_integrations", "card_integrations", "data_entry_gmail_connections", "email_campaigns"];
const source = (prefix: string) => readFileSync(`drizzle/migrations/${readdirSync("drizzle/migrations").find(n => n.startsWith(prefix))}`, "utf8");
const definition = (text: string, name: string) => text.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$\\s*;`, "i"))![0];
const shape = "RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)";
let db: PGlite;
let baseline: unknown[];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA crm;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE FUNCTION has_role(uuid, text) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.admin', true) = 'yes' $$;
    CREATE TABLE marketing_consent_events(id bigint, subject_id uuid, state text, purpose text, company_id uuid, portal text, revision bigint);
    CREATE FUNCTION marketing_consent_effective(uuid,timestamptz) RETURNS TABLE(event_id bigint, valid_grant boolean) LANGUAGE sql AS $$ SELECT 1::bigint, true $$;
    CREATE TABLE companies(id uuid PRIMARY KEY, slug text, status text DEFAULT 'active');
    CREATE TABLE invariant_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ran_by uuid, drift_count integer, results jsonb);
    CREATE TABLE system_invariants(name text PRIMARY KEY, description text, severity text DEFAULT 'error', scope text DEFAULT 'empresa', reference_count bigint DEFAULT 0, notes text);
    CREATE TABLE transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, description text, supplier_id uuid, account_id uuid, event_id uuid, category_id uuid, parent_transaction_id uuid, installment_group_id uuid, type text DEFAULT 'expense', paid_amount numeric, amount numeric, iva_rate numeric, forecast_id uuid, invoice_group_id uuid, date date, invoice_ref text, is_transitory boolean, transitory_reason text, status text, split_percentage numeric, is_reimbursement boolean, reversed_at timestamptz, exclude_from_result boolean);
    CREATE TABLE suppliers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, name text, iban text, is_active boolean);
    CREATE TABLE events(id uuid PRIMARY KEY, company_id uuid, name text);
    CREATE TABLE financial_accounts(id uuid PRIMARY KEY, company_id uuid, name text);
    CREATE TABLE account_categories(id uuid PRIMARY KEY, company_id uuid, code text, parent_id uuid);
    CREATE TABLE coala_supplier_category_map(id uuid, company_id uuid, supplier_id uuid);
    CREATE TABLE ticket_office_settlements(id uuid, company_id uuid, event_id uuid, net_calculated numeric, net_adjusted numeric, net_transferred numeric, status text);
    CREATE TABLE event_forecasts(id uuid, company_id uuid, event_id uuid, description text, category_id uuid, type text, version_id uuid, transaction_id uuid);
    CREATE TABLE invoice_group_audit(invoice_group_id uuid, run_at timestamptz, veredicto text, aplicado boolean);
    CREATE TABLE partner_advance_expenses(transaction_id uuid);
    CREATE TABLE card_session_loads(id uuid, session_id uuid, load_date date, amount numeric, out_transaction_id uuid, in_transaction_id uuid);
    CREATE TABLE payment_list_items(transaction_id uuid, manually_marked_paid boolean, removed_at timestamptz);
    CREATE TABLE backup_runs(company_id uuid, status text, finished_at timestamptz, scope text);
    CREATE TABLE backup_excluded_tables(schema_name text, table_name text, reason text);
    CREATE TABLE transaction_payments(id uuid, company_id uuid, transaction_id uuid, amount numeric, status text, currency text, original_amount numeric, fx_rate numeric, payment_date date, payment_method text, reversed_at timestamptz, offset_id uuid);
    CREATE TABLE partner_paid_expenses(transaction_id uuid);
    CREATE TABLE bank_statement_lines(id uuid, company_id uuid, financial_account_id uuid, statement_id uuid, booking_date date, description text, amount numeric, matched_by text, matched_at timestamptz, status text, matched_transaction_id uuid, created_transaction_id uuid, matched_sepa_export_id uuid, matched_payment_list_id uuid);
    CREATE TABLE bank_line_transactions(line_id uuid);
    CREATE TABLE transaction_offsets(id uuid, company_id uuid, receivable_transaction_id uuid, payable_transaction_id uuid, amount numeric, offset_group_id uuid);
    CREATE TABLE camarim_sessions(id uuid, company_id uuid, title text, advance_account_id uuid, status text);
    CREATE FUNCTION _account_true_balance_raw(uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT 0::numeric $$;
    CREATE TABLE reimbursement_notes(id uuid, code text, status text, payment_transaction_id uuid);
    CREATE FUNCTION issue335_invariant_counts() RETURNS TABLE(name text, current_count bigint) LANGUAGE sql AS $$ SELECT null::text, 0::bigint WHERE false $$;
    CREATE SCHEMA cron; CREATE SCHEMA storage;
    CREATE TABLE cron.job_run_details(jobid bigint, runid bigint, status text, end_time timestamptz);
    CREATE TABLE storage.objects(bucket_id text, name text);
    CREATE TABLE storage.buckets(id text);
    CREATE TABLE portal_error_log(company_id uuid, message text, route text, created_at timestamptz);
    CREATE TABLE card_sessions(id uuid, company_id uuid, card_account_id uuid);
    CREATE TABLE card_session_items(id uuid, session_id uuid, item_date date, amount numeric, iva_rate numeric, description text, status text, transaction_id uuid);
    CREATE TABLE camarim_fund_moves(id uuid, session_id uuid, company_id uuid, move_type text);
    CREATE FUNCTION _camarim_fund_move_legs(uuid) RETURNS TABLE(session_tx uuid,bank_tx uuid) LANGUAGE sql AS $$ SELECT null::uuid,null::uuid WHERE false $$;
    CREATE TABLE supplier_similarity_flags(id uuid,company_id uuid,supplier_id uuid,similar_supplier_id uuid,motivo text,source text,resolved_at timestamptz,created_at timestamptz);
    CREATE TABLE supplier_credit_usages(transaction_id uuid);
    CREATE TABLE ticketline_sync_runs(config_id uuid, status text, import_audit jsonb, started_at timestamptz);
    CREATE TABLE event_ticket_zones(id uuid PRIMARY KEY, event_id uuid, sync_generated boolean, name text);
    CREATE TABLE ticket_sales(zone_id uuid, source text, quantity numeric,total_value numeric,sale_date date);
    CREATE TABLE cache_payment_contracts(id uuid,company_id uuid,root_event_id uuid,artist_supplier_id uuid,cancelled_at timestamptz);
    CREATE TABLE cache_payment_contract_cities(contract_id uuid,event_id uuid,quota numeric,cap numeric);
    CREATE FUNCTION cache_max_contracts() RETURNS integer LANGUAGE sql AS $$ SELECT 10 $$;
    CREATE FUNCTION _cache_free_advances_x(uuid,uuid,uuid) RETURNS TABLE(event_id uuid, amount numeric) LANGUAGE sql AS $$ SELECT null::uuid,0::numeric WHERE false $$;
    CREATE FUNCTION _account_true_balance_asof_raw(uuid,date) RETURNS numeric LANGUAGE sql AS $$ SELECT 0::numeric $$;
    ALTER TABLE events ADD COLUMN parent_event_id uuid;
    ALTER TABLE transactions ADD COLUMN payment_date date, ADD COLUMN is_hidden boolean, ADD COLUMN declared_withholding_amount numeric, ADD COLUMN cache_role text, ADD COLUMN cache_contract_id uuid;
    ALTER TABLE financial_accounts ADD COLUMN initial_balance numeric, ADD COLUMN initial_balance_date date, ADD COLUMN type text;
    ALTER TABLE account_categories ADD COLUMN type text;
    ALTER TABLE ticket_office_settlements ADD COLUMN venue_retained_invoice_id uuid, ADD COLUMN reversed_at timestamptz;
    ALTER TABLE backup_runs ADD COLUMN storage_report jsonb;
    CREATE TABLE leads(id uuid,company_id uuid,kind text,created_at timestamptz,capi_status text,capi_sent_at timestamptz,event_id uuid,contact_id uuid,fbc text,fbp text,ip_inet inet,user_agent text);
    CREATE TABLE contacts(id uuid,email text,phone_e164 text);
    ALTER TABLE events ADD COLUMN meta_pixel_id text, ADD COLUMN ticketing_url text;
    CREATE FUNCTION capi_dispatch_allowed() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION capi_consent_proof(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION capi_lead_block_reason(uuid) RETURNS text LANGUAGE sql AS $$ SELECT null::text $$;
    CREATE FUNCTION _capi_classify_lead(uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'synthetic'::text $$;
    CREATE TABLE payment_lists(id uuid PRIMARY KEY, company_id uuid);
    CREATE TABLE payment_list_sepa_exports(id uuid DEFAULT gen_random_uuid(), payment_list_id uuid);
    CREATE TABLE accounting_exports(id uuid DEFAULT gen_random_uuid(), company_id uuid);
    CREATE TABLE notification_queue(id uuid DEFAULT gen_random_uuid(), company_id uuid, status text CHECK(status IN ('queued','sending','sent','delivered','read','failed','skipped')), last_error text);
    CREATE TABLE system_reminders(id uuid DEFAULT gen_random_uuid(), company_id uuid, key text UNIQUE, title text, message text, due_date date, frequency text, link_url text, is_active boolean, completed_at timestamptz, updated_at timestamptz);
    CREATE TABLE email_send_log(company_id uuid, message_id text, template_name text, recipient_email text, status text CHECK(status IN ('pending','sent','suppressed','failed','bounced','complained','dlq')), error_message text, created_at timestamptz DEFAULT now());
    INSERT INTO companies(id, slug) VALUES ('${real}', 'real-fixture');
    INSERT INTO system_invariants(name) VALUES ('tx_fornecedor_outra_empresa'),('tipo_invalido'),('fornecedor_iban_duplicado_ativo'),('backup_empresa_em_falta'),('transacao_duplica_fatura');
    INSERT INTO transactions(company_id, type) VALUES ('${real}', 'synthetic_invalid');
    INSERT INTO backup_runs VALUES ('${real}', 'ok', now(), 'company'), (null, 'ok', now(), 'global');
  `);
  for (const table of tables) await db.exec(`CREATE TABLE ${table}(id uuid DEFAULT gen_random_uuid(), company_id uuid, value text);`);
  for (const [prefix, name] of [["0052_", "_run_invariant_checks_raw"], ["0288_", "_run_invariant_checks_extra"], ["0044_", "_run_invariant_checks_duplicate_invoices"]]) {
    await db.exec(definition(source(prefix), name));
  }
  for (const table of ["transaction_documents", "payment_list_documents", "camarim_item_documents", "card_item_documents", "event_forecast_attachments", "bank_line_documents", "event_ab_attachments", "entity_documents", "supplier_documents"]) {
    await db.exec(`CREATE TABLE ${table}(id uuid DEFAULT gen_random_uuid(), company_id uuid, file_url text, file_path text, storage_path text, transaction_id uuid, uploaded_at timestamptz);`);
  }
  await db.exec("ALTER TABLE ticketline_sync_config ADD COLUMN event_id uuid");
  const keys = ["paid_sem_pagamento", "erros_portal_24h", "item_de_cartao_duplica_transacao", "supplier_similar_por_rever", "pago_abaixo_do_bruto", "ticketline_series_paralelas", "documentos_inalcancaveis", "documento_sem_ficheiro_no_storage", "documento_sem_ficheiro_por_tabela", "saldo_conta_difere_do_extrato", "camarim_adiantamento_sem_entrada", "maes_rateio_divergentes", "conta_cash_saldo_negativo", "transacoes_natureza_divergente_da_rubrica", "cache_contrato_cidade_divergente", "cache_contratos_acima_limite", "cache_contrato_estrutura_invalida", "cache_cidade_teto_excedido"];
  for (const key of keys) await db.exec(`INSERT INTO system_invariants(name) VALUES ('${key}')`);
  for (const match of manual.matchAll(/-- Latest versioned base: ([^\n]+)\n-- SHA256 of exact CREATE FUNCTION: [^\n]+\nCREATE OR REPLACE FUNCTION public\.(_run_invariant_checks_\w+)_scoped/g)) {
    await db.exec(definition(readFileSync(match[1], "utf8"), match[2]));
  }
  // Pure catalog families use empty fixtures; their unchanged definitions are not under test.
  for (const name of ["secrets", "secdef", "tenant", "isolation"]) await db.exec(`CREATE FUNCTION _run_invariant_checks_${name}() ${shape} LANGUAGE sql AS $$ SELECT null::text,null::text,null::text,null::text,0::bigint,0::bigint,true,null::text,'[]'::jsonb WHERE false $$;`);
  await db.exec(definition(source("0214_"), "_run_invariant_checks_all"));
  const loggerSource = readFileSync("supabase/migrations/20260917222206_cc918411-1854-44d9-bca2-265a9418485a.sql", "utf8");
  await db.exec(definition(loggerSource, "run_invariant_checks_and_log"));
  baseline = (await db.query("SELECT name, current_count FROM _run_invariant_checks_all() ORDER BY name")).rows;
  await db.exec(manual);
  await db.exec(`INSERT INTO companies(id, slug, is_training) VALUES ('${training}', 'training-fixture', true);`);
}, 30000);
afterAll(async () => { await db?.close(); });

describe("#562 SQL inerte em PGlite", () => {
  it("manual e migração são byte-idênticos; rollback inteiro comentado; bases por SHA", () => {
    expect(Buffer.from(manual).equals(readFileSync("drizzle/migrations/0308_issue562_training_companies.sql"))).toBe(true);
    expect(readFileSync("supabase/manual/rollback_0308_issue562_training_companies_comentado.sql", "utf8").split("\n").every(l => !l.trim() || l.startsWith("--"))).toBe(true);
    for (const [prefix, name] of [["0052_", "_run_invariant_checks_raw"], ["0288_", "_run_invariant_checks_extra"], ["0044_", "_run_invariant_checks_duplicate_invoices"]]) {
      expect(manual).toContain(createHash("sha256").update(definition(source(prefix), name)).digest("hex"));
    }
  });
  it("coluna false por omissão, helper e ACL fechada a anon", async () => {
    expect((await db.query(`SELECT is_training FROM companies WHERE id='${real}'`)).rows).toEqual([{ is_training: false }]);
    expect((await db.query(`SELECT is_training_company('${training}') training, is_training_company('${real}') real, is_training_company(null) global`)).rows).toEqual([{ training: true, real: false, global: false }]);
    expect((await db.query(`SELECT has_function_privilege('anon','is_training_company(uuid)','EXECUTE') anon, has_function_privilege('authenticated','is_training_company(uuid)','EXECUTE') authenticated`)).rows).toEqual([{ anon: false, authenticated: true }]);
  });
  it.each(tables)("%s recusa INSERT/UPDATE de treino e aceita empresa real", async table => {
    await expect(db.exec(`INSERT INTO ${table}(company_id) VALUES ('${training}')`)).rejects.toThrow("training_company_no_integrations");
    await db.exec(`INSERT INTO ${table}(company_id) VALUES ('${real}'); UPDATE ${table} SET value='real';`);
    await expect(db.exec(`UPDATE ${table} SET company_id='${training}'`)).rejects.toThrow("training_company_no_integrations");
  });
  it("supressão nas três filas preserva empresas reais e linhas globais", async () => {
    for (const company of [real, training, null]) {
      const id = company ? `'${company}'` : "null";
      await db.exec(`INSERT INTO notification_queue(company_id,status,last_error) VALUES (${id},'queued','original');
        INSERT INTO system_reminders(company_id,message,is_active) VALUES (${id},'original',true);
        INSERT INTO email_send_log(company_id,status,error_message) VALUES (${id},'pending','original');`);
    }
    for (const company of [real, null]) {
      const where = company ? `company_id='${company}'` : "company_id IS NULL";
      expect((await db.query(`SELECT status,last_error FROM notification_queue WHERE ${where}`)).rows).toEqual([{ status: "queued", last_error: "original" }]);
      expect((await db.query(`SELECT is_active,completed_at,message FROM system_reminders WHERE ${where}`)).rows).toEqual([{ is_active: true, completed_at: null, message: "original" }]);
      expect((await db.query(`SELECT status,error_message FROM email_send_log WHERE ${where}`)).rows).toEqual([{ status: "pending", error_message: "original" }]);
    }
    expect((await db.query(`SELECT status,last_error FROM notification_queue WHERE company_id='${training}'`)).rows).toEqual([{ status: "skipped", last_error: "suppressed_training" }]);
    expect((await db.query(`SELECT is_active, completed_at IS NOT NULL done, message FROM system_reminders WHERE company_id='${training}'`)).rows).toEqual([{ is_active: false, done: true, message: "original\nsuppressed_training" }]);
    expect((await db.query(`SELECT status,error_message FROM email_send_log WHERE company_id='${training}'`)).rows).toEqual([{ status: "suppressed", error_message: "suppressed_training" }]);
  });
  it("alteração da flag exige platform_admin; true→false com dados é recusado", async () => {
    await db.exec(`SET test.uid='00000000-0000-4000-8000-000000000099'; SET test.admin='no';`);
    await expect(db.exec(`UPDATE companies SET is_training=false WHERE id='${training}'`)).rejects.toThrow("training_company_platform_admin_required");
    await expect(db.exec(`INSERT INTO companies(id,is_training) VALUES ('00000000-0000-4000-8000-000000000077',true)`)).rejects.toThrow("training_company_platform_admin_required");
    await db.exec("SET test.admin='yes';");
    await db.exec(`UPDATE companies SET is_training=false WHERE id='${training}'; UPDATE companies SET is_training=true WHERE id='${training}';`);
    for (const table of ["transactions", "events", "suppliers"]) {
      await db.exec(`INSERT INTO ${table}(id,company_id) VALUES ('00000000-0000-4000-8000-000000000088','${training}')`);
      await expect(db.exec(`UPDATE companies SET is_training=false WHERE id='${training}'`)).rejects.toThrow("training_company_has_data");
      await db.exec(`DELETE FROM ${table} WHERE id='00000000-0000-4000-8000-000000000088'`);
    }
    await db.exec("RESET test.uid;");
  });
  it("SEPA e contabilístico recusam registo real de treino", async () => {
    for (const company of [real, training]) {
      await db.exec(`INSERT INTO payment_lists VALUES ('${company}','${company}')`);
      for (const sql of [`INSERT INTO payment_list_sepa_exports(payment_list_id) VALUES ('${company}')`, `INSERT INTO accounting_exports(company_id) VALUES ('${company}')`]) {
        if (company === training) await expect(db.exec(sql)).rejects.toThrow("training_company_no_real_export");
        else await db.exec(sql);
      }
    }
  });
  it("todas as famílias com âmbito preservam contagens reais com violações sintéticas de treino", async () => {
    await db.exec(`INSERT INTO transactions(company_id,type) VALUES ('${training}','synthetic_invalid'),('${training}','synthetic_invalid');
      INSERT INTO suppliers(company_id,name,iban,is_active) VALUES ('${training}','A','TEST',true),('${training}','B','TEST',true);
      INSERT INTO portal_error_log(company_id,message,route,created_at) VALUES ('${training}','fixture','/fixture',now());
      INSERT INTO transaction_documents(company_id,file_url) VALUES ('${training}','synthetic-missing-file');
      INSERT INTO supplier_similarity_flags(company_id) VALUES ('${training}');`);
    expect((await db.query("SELECT name,current_count FROM _run_invariant_checks_all() ORDER BY name")).rows).toEqual(baseline);
    const counts = (await db.query<{ name: string; current_count: number }>("SELECT name,current_count FROM _run_invariant_checks_raw_scoped(true)")).rows;
    expect(counts.find(c => c.name === "tipo_invalido")?.current_count).toBe(2);
    expect(counts.find(c => c.name === "fornecedor_iban_duplicado_ativo")?.current_count).toBe(1);
  });
  it("CAPI antiga: seleção e guarda final recusam treino sem alterar contratos", async () => {
    await db.exec(`INSERT INTO leads(id,company_id,created_at,capi_status) VALUES ('${training}','${training}',now(),'processing'),('${real}','${real}',now(),'processing')`);
    const allowed = async (company: string) => (await db.query<{ result: { allowed: boolean; reason: string | null } }>(`SELECT capi_guard_lead_dispatch('${company}','ViewContent') result`)).rows[0].result;
    expect(await allowed(training)).toEqual({ allowed: false, reason: "training_company" });
    expect(await allowed(real)).toMatchObject({ allowed: true, reason: null });
    await db.exec("UPDATE leads SET capi_status=null");
    await db.query("SELECT * FROM process_leads_capi_batch(25)");
    expect((await db.query(`SELECT capi_status FROM leads WHERE id='${training}'`)).rows).toEqual([{ capi_status: null }]);
    expect((await db.query(`SELECT capi_status FROM leads WHERE id='${real}'`)).rows).toEqual([{ capi_status: "skipped_no_pixel" }]);
  });
  it("CAPI: prova idêntica aceita a empresa real e recusa treino antes do envio", async () => {
    for (const [company, subject, event] of [[real, real, 1], [training, training, 2]] as const) {
      await db.exec(`INSERT INTO marketing_consent_events VALUES (${event},'${subject}','granted','meta_ads','${company}','synthetic',1)`);
      // Effective state is a deterministic consent fixture, isolated from training policy.
      await db.exec(`CREATE OR REPLACE FUNCTION marketing_consent_effective(uuid,timestamptz) RETURNS TABLE(event_id bigint, valid_grant boolean) LANGUAGE sql AS $$ SELECT ${event}::bigint, true $$`);
      expect((await db.query(`SELECT marketing_consent_binding_valid('${subject}',${event},'${company}','synthetic',now()) allowed`)).rows).toEqual([{ allowed: company === real }]);
    }
  });
  it("corrida só-treino grava scope_training e não escreve lembretes", async () => {
    const before = (await db.query("SELECT * FROM system_reminders ORDER BY id")).rows;
    await db.query("SELECT run_training_invariant_checks_and_log()");
    expect((await db.query("SELECT * FROM system_reminders ORDER BY id")).rows).toEqual(before);
    const rows = (await db.query<{ scope_training: boolean; results: { name: string; current_count: number }[] }>("SELECT scope_training, results FROM invariant_runs")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].scope_training).toBe(true);
    expect(rows[0].results.find(r => r.name === "tipo_invalido")?.current_count).toBe(2);
    for (const name of ["erros_portal_24h", "documento_sem_ficheiro_no_storage", "supplier_similar_por_rever"]) expect(rows[0].results.find(r => r.name === name)?.current_count).toBe(1);
    await db.query("SELECT run_invariant_checks_and_log()");
    expect((await db.query("SELECT scope_training FROM invariant_runs WHERE NOT scope_training")).rows).toHaveLength(1);
  });
});

it("#562 inventário contém cada job ativo e os crons manuais", () => {
  const inventory = readFileSync("docs/testes/issue562/inventario.md", "utf8");
  const source = JSON.parse(readFileSync("docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json", "utf8"));
  const active = source.proposals.filter((j: { active: boolean }) => j.active);
  expect(active).toHaveLength(72);
  for (const job of active) expect(inventory).toContain(`| ${job.jobid} / \`${job.jobname}\` |`);
  for (const file of readdirSync("supabase/manual").filter(n => /^cron_.*_live\.sql$/.test(n))) expect(inventory).toContain(file);
  expect(readFileSync("docs/testes/issue562/prova-isolamento.sql", "utf8")).toContain("NÃO EXECUTADO");
});
