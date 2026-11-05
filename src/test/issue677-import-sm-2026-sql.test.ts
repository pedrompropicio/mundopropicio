// @vitest-environment node
// Apenas PGlite em memória, dados sintéticos; sem URL, segredos ou pedidos externos.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const migrationPath = 'drizzle/migrations/0338_issue677_import_sm_2026.sql';
const migration = read(migrationPath);
const rollback = read('supabase/manual/rollback_0338_issue677_import_sm_2026_comentado.sql');
const paidSource = 'supabase/migrations/20261002120740_6be30c36-594d-4678-9477-1a3b995136ac.sql';
const deriveSource = 'supabase/migrations/20260928221118_bea24c4b-e61c-4fd0-b901-59eba78bfbe1.sql';
const fxSource = 'drizzle/migrations/0304_issue498_fx_native_currency.sql';
const balanceSource = 'supabase/migrations/20260911143727_5167c2fe-81f6-49cd-ba7f-214f917141db.sql';
const adminSource = 'supabase/migrations/20260930101458_5bdbefad-7062-4d28-a0be-c956b86d8447.sql';
const tables = ['staging','column_map','category_map','account_map','supplier_map','event_map','batches','tx'];
const functions = ['import_sm_2026_apply_batch(uuid,date)','import_sm_2026_batch_close(uuid,date)',
  'import_sm_2026_rollback_batch(uuid)','import_sm_2026_parse_date(text,text)','import_sm_2026_has_references(regclass,uuid)'];
const id = (n: number) => `00000000-0000-0000-0000-${n.toString().padStart(12, '0')}`;
const company = id(1), other = id(2), admin = id(3), accountA = id(10), accountB = id(11);
const category = id(20), loan = id(21), supplier = id(30), event = id(40);
const month = '2026-01-01';
let db: PGlite;
let originalColumns: unknown;

// Extrai a declaração COMPLETA e exacta, incluindo o corpo real e search_path.
function sourceFunction(path: string, name: string) {
  const source = read(path);
  const start = source.search(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\(`, 'i'));
  if (start < 0) throw new Error(`Função ausente: ${path} / ${name}`);
  const rest = source.slice(start);
  const delimiter = rest.match(/\bAS\s+(\$[\w]*\$)/i)?.[1];
  if (!delimiter) throw new Error(`Delimitador ausente: ${name}`);
  const bodyStart = rest.indexOf(delimiter);
  const end = rest.indexOf(delimiter, bodyStart + delimiter.length);
  if (end < 0) throw new Error(`Corpo incompleto: ${name}`);
  return rest.slice(0, rest.indexOf(';', end + delimiter.length) + 1);
}
async function q<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
  return (await db.query<T>(sql, params)).rows;
}
async function scalar<T = number>(sql: string, params?: unknown[]): Promise<T> {
  return Object.values((await q<Record<string, T>>(sql, params))[0])[0];
}
async function apply() {
  return scalar<{batch_id: string; rows: number; created_suppliers: string[]; created_events: string[]; by_account: unknown[]}>(
    'SELECT public.import_sm_2026_apply_batch($1,$2)', [company, month]);
}
async function roll(batch: string) {
  return scalar<{rows: number; kept_suppliers: string[]; kept_events: string[]; deleted_suppliers: string[]; deleted_events: string[]}>(
    'SELECT public.import_sm_2026_rollback_batch($1)', [batch]);
}
async function cell(row: number, key: string, value: string | null) {
  await q(`UPDATE import_sm_2026_staging SET raw = raw || jsonb_build_object($1::text,$2::text) WHERE row_no = $3`, [key, value, row]);
}
async function asRole<T>(role: string, run: () => Promise<T>) {
  // Identidade de sessão efectiva: não mede SET ROLE a partir do superutilizador.
  await db.exec(`SET SESSION AUTHORIZATION ${role}`);
  try {
    expect(await q('SELECT current_user,session_user')).toEqual([{current_user:role,session_user:role}]);
    return await run();
  } finally { await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE'); }
}
async function counts() {
  return q(`SELECT (SELECT count(*)::int FROM transactions) AS tx,
    (SELECT count(*)::int FROM transaction_payments) AS payments,
    (SELECT count(*)::int FROM import_sm_2026_batches) AS batches,
    (SELECT count(*)::int FROM suppliers) AS suppliers,(SELECT count(*)::int FROM events) AS events`);
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm, unaccent } });
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE EXTENSION pg_trgm; CREATE EXTENSION unaccent SCHEMA extensions;
    CREATE TYPE public.app_role AS ENUM ('admin','platform_admin');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.is_platform_admin(uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce($1 = '${admin}'::uuid,false) $$;
    CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.is_platform_admin($1) $$;
    CREATE FUNCTION public.has_permission(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.is_platform_admin($1) $$;
    CREATE FUNCTION public.has_permission_in(uuid,text,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    -- Só o lookup da janela é sintético; a guarda administrativa abaixo é o corpo real.
    CREATE FUNCTION public.admin_window_event_for(uuid,date) RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('test.admin_window',true),'')::uuid $$;
    CREATE TABLE companies(id uuid PRIMARY KEY,currency text NOT NULL,country text NOT NULL);
    CREATE TABLE financial_accounts(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies,
      code text,bank_details_br jsonb,initial_balance numeric,initial_balance_date date,
      skip_balance_check boolean DEFAULT false,balance_visible_to_all boolean DEFAULT true);
    CREATE TABLE account_categories(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies,
      code text,name text,type text,allocate_to_active_event boolean DEFAULT false,UNIQUE(company_id,code));
    CREATE TABLE suppliers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies,
      name text NOT NULL,nif text,country text NOT NULL CHECK(country ~ '^[A-Z]{2}$'),is_active boolean DEFAULT true,iban text,iban_2 text,iban_3 text);
    CREATE TABLE events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies,
      name text NOT NULL,date date NOT NULL,event_nature text NOT NULL CHECK(event_nature IN
      ('producao_propria','intermediacao','coproducao','parceiro_local','temporada')));
    CREATE TABLE transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES companies,
      type text NOT NULL CHECK(type IN ('income','expense')),amount numeric(14,2) NOT NULL,
      iva_rate numeric NOT NULL DEFAULT 23,currency text NOT NULL DEFAULT 'EUR',
      date date NOT NULL,due_date date,description text NOT NULL,status text NOT NULL CHECK(status IN ('approved','paid')),
      paid_amount numeric DEFAULT 0,payment_date date,account_id uuid REFERENCES financial_accounts,
      category_id uuid REFERENCES account_categories,supplier_id uuid REFERENCES suppliers,event_id uuid REFERENCES events,
      payment_method text DEFAULT 'transfer',parent_transaction_id uuid REFERENCES transactions ON DELETE CASCADE,
      split_percentage numeric,is_reimbursement boolean DEFAULT false,updated_at timestamptz DEFAULT now(),
      is_transitory boolean DEFAULT false,transitory_reason text);
    CREATE TABLE partner_paid_expenses(transaction_id uuid REFERENCES transactions);
    CREATE TABLE transaction_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),transaction_id uuid NOT NULL REFERENCES transactions ON DELETE CASCADE,
      company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES companies,amount numeric NOT NULL,payment_date date NOT NULL,
      account_id uuid REFERENCES financial_accounts,currency text NOT NULL DEFAULT 'EUR',status text DEFAULT 'paid',
      closes_transaction boolean DEFAULT false,payment_method text DEFAULT 'transfer',original_amount numeric,fx_rate numeric,
      withholding_amount numeric DEFAULT 0,credit_amount numeric DEFAULT 0,created_by text,notes text,reversed_at timestamptz,reversal_reason text);
    CREATE TABLE supplier_similarity_flags(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,
      supplier_id uuid REFERENCES suppliers ON DELETE CASCADE,similar_supplier_id uuid REFERENCES suppliers ON DELETE CASCADE,
      motivo text,source text,CONSTRAINT supplier_similarity_flags_source_check CHECK(source IN ('sponsors_import','apply_coala_bp','backfill_09_10')),
      UNIQUE(supplier_id,similar_supplier_id,motivo));
    CREATE TABLE system_audit_log(entity_type text,entity_id text,action text,changed_by text,company_id uuid,new_data jsonb,metadata jsonb);
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
  `);
  for (const [path, name] of [
    ['drizzle/migrations/0046_derp199_check_supplier_similar.sql','normalize_supplier_name'],
    ['drizzle/migrations/0048_derp201_supplier_similarity_flags.sql','normalize_supplier_nif'],
    ['drizzle/migrations/0048_derp201_supplier_similarity_flags.sql','_supplier_similar_candidates'],
    ['drizzle/migrations/0335_issue664_supplier_country_required.sql','_supplier_resolve_or_create'],
    [deriveSource,'_derive_paid_amount'],[deriveSource,'sync_paid_amount_from_payments'],
    [paidSource,'_paid_guard_is_exempt'],[paidSource,'materialize_paid_amount_payment'],
    [fxSource,'issue498_validate_payment_native_fx'],
    [balanceSource,'_account_true_balance_asof_raw'],[balanceSource,'account_true_balances_asof'],
    ['drizzle/migrations/0272_p3_transitory_reason_10_1_03.sql','force_transitory_for_capital_branch'],
    [adminSource,'enforce_admin_window_event'],
  ]) await db.exec(sourceFunction(path, name));
  await db.exec(`
    CREATE TRIGGER zz_materialize_paid_amount_payment AFTER INSERT OR UPDATE OF paid_amount ON transactions
      FOR EACH ROW EXECUTE FUNCTION materialize_paid_amount_payment();
    CREATE TRIGGER zz_issue498_payment_native_fx BEFORE INSERT OR UPDATE ON transaction_payments
      FOR EACH ROW EXECUTE FUNCTION issue498_validate_payment_native_fx();
    CREATE TRIGGER trg_sync_paid_amount_from_payments AFTER INSERT OR UPDATE OR DELETE ON transaction_payments
      FOR EACH ROW EXECUTE FUNCTION sync_paid_amount_from_payments();
    CREATE TRIGGER trg_force_transitory_capital BEFORE INSERT OR UPDATE OF category_id ON transactions
      FOR EACH ROW EXECUTE FUNCTION force_transitory_for_capital_branch();
    CREATE TRIGGER trg_enforce_admin_window_event BEFORE INSERT OR UPDATE OF event_id,category_id,date,company_id,type ON transactions
      FOR EACH ROW EXECUTE FUNCTION enforce_admin_window_event();
  `);
  originalColumns = await q(`SELECT attname,atttypid,attnotnull,atthasdef FROM pg_attribute WHERE attrelid = 'transactions'::regclass AND attnum > 0 ORDER BY attnum`);
  await db.exec(migration);
}, 60000);

afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`
    SET SESSION AUTHORIZATION postgres; RESET ROLE;
    SELECT set_config('request.jwt.claim.sub','${admin}',false),set_config('test.admin_window','',false);
    TRUNCATE companies CASCADE; TRUNCATE import_sm_2026_column_map;
    INSERT INTO companies VALUES ('${company}','BRL','BR'),('${other}','EUR','PT');
    INSERT INTO financial_accounts(id,company_id,code,bank_details_br,initial_balance,initial_balance_date) VALUES
      ('${accountA}','${company}','CODE-A','{"routing_number":"001-A","account_number":"0001-2"}',1000,'2025-12-31'),
      ('${accountB}','${company}','CODE-B','{"routing_number":"002-B","account_number":"0002-3"}',200,'2025-12-31');
    INSERT INTO account_categories(id,company_id,code,name,type) VALUES
      ('${category}','${company}','2.1.99','Categoria sintética','expense'),('${loan}','${company}','10.1.04','Empréstimo sintético','income');
    INSERT INTO suppliers(id,company_id,name,nif,country) VALUES ('${supplier}','${company}','Fornecedor existente sintético','SYN-001','BR');
    INSERT INTO events VALUES ('${event}','${company}','Evento existente sintético','2026-01-10','producao_propria');
    INSERT INTO import_sm_2026_column_map(role,header,format) VALUES
      ('date','Dia','DD/MM/YYYY'),('amount','Valor',','),('direction','Sentido',NULL),('agency','Agência',NULL),('account','Conta',NULL),
      ('category','Categoria',NULL),('legacy_code','Código',NULL),('legacy_description','Descrição',NULL),('due_date','Vencimento','DD/MM/YYYY'),
      ('payment_date','Pagamento','DD/MM/YYYY'),('supplier','Fornecedor',NULL),('supplier_doc','Documento',NULL),('event','Evento',NULL);
    INSERT INTO import_sm_2026_category_map VALUES ('${company}','CAT-SYN','${category}'),('${company}','LOAN-SYN','${loan}');
    INSERT INTO import_sm_2026_account_map VALUES ('${company}','001-A','0001-2','${accountA}'),('${company}','002-B','0002-3','${accountB}');
    INSERT INTO import_sm_2026_supplier_map VALUES
      ('${company}','EXIST-SYN','${supplier}',NULL,NULL,NULL),
      ('${company}','NEW-SYN',NULL,'Fornecedor novo sintético','SYN-999','US');
    INSERT INTO import_sm_2026_event_map(company_id,legacy_event,event_id,no_event) VALUES
      ('${company}','EXIST-SYN','${event}',false),('${company}','',NULL,true);
    INSERT INTO import_sm_2026_event_map(company_id,legacy_event,create_name,create_date,create_nature) VALUES
      ('${company}','NEW-SYN','Evento novo sintético','2026-01-20','coproducao');
  `);
  // Lote de seis linhas, nomes/cabeçalhos/valores exclusivamente sintéticos.
  const rows = [
    { Valor: '100,00', Sentido: 'expense', Pagamento: '05/01/2026', Fornecedor: 'EXIST-SYN' },
    { Valor: '50,00', Sentido: 'expense', Vencimento: '15/02/2026' },
    { Valor: '300,00', Sentido: 'income', Categoria: 'LOAN-SYN', Pagamento: '05/01/2026' },
    { Valor: '25,00', Sentido: 'expense', Evento: '', Pagamento: '05/01/2026' },
    { Valor: '20,00', Sentido: 'expense', Fornecedor: 'NEW-SYN', Documento: 'SYN-999', Pagamento: '05/01/2026' },
    { Valor: '10,00', Sentido: 'expense', Evento: 'NEW-SYN', Pagamento: '05/01/2026', Agência: '002-B', Conta: '0002-3' },
  ];
  for (const [i, overrides] of rows.entries()) {
    const raw = { Dia: '05/01/2026', Valor: '', Sentido: '', Agência: '001-A', Conta: '0001-2', Categoria: 'CAT-SYN',
      Código: `SYN-${i + 1}`, Descrição: `Movimento sintético ${i + 1}`, Vencimento: '', Pagamento: '',
      Fornecedor: '', Documento: '', Evento: 'EXIST-SYN', ...overrides };
    await q('INSERT INTO import_sm_2026_staging(company_id,batch_month,row_no,raw) VALUES($1,$2,$3,$4)', [company,month,i+1,raw]);
  }
});

describe('#677 / 0338 — preparação, contratos reais e fixtures sintéticas', () => {
  it('tem cópia exacta, rollback completo comentado, prova e fecho só SELECT, sem DDL em transactions', async () => {
    expect(read('supabase/manual/0338_issue677_import_sm_2026.sql')).toBe(migration);
    expect(migration).toContain('PREPARADA, NÃO APLICADA');
    expect(migration).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(migration).not.toMatch(/(?:ALTER|CREATE|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?public\.transactions\b/i);
    expect(migration).not.toMatch(/(?:CREATE|DROP)\s+(?:TRIGGER|INDEX)[^;]*\bON\s+public\.transactions\b/i);
    expect(rollback.split('\n').filter(Boolean).every(l => l.startsWith('--'))).toBe(true);
    for (const name of tables) expect(rollback).toContain(`DROP TABLE public.import_sm_2026_${name};`);
    for (const name of functions) expect(rollback).toContain(`DROP FUNCTION public.${name};`);
    for (const path of ['docs/testes/issue677/fecho-lote.sql','docs/testes/issue677/prova-janela-0338.sql']) {
      const sql = read(path).replace(/--[^\n]*/g, '').replace(/'(?:''|[^'])*'/g, "''");
      expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|DO|CALL|ALTER|DROP|SET|BEGIN|COMMIT)\b/i);
      expect(sql.trim()).toMatch(/^SELECT\b/);
    }
    expect(await q(`SELECT attname,atttypid,attnotnull,atthasdef FROM pg_attribute WHERE attrelid = 'transactions'::regclass AND attnum > 0 ORDER BY attnum`)).toEqual(originalColumns);
  });

  it('aplica seis linhas: BRL/IVA zero, pagamentos BRL, derivados, empréstimo e legado lateral', async () => {
    const result = await asRole('service_role', apply);
    expect(result.rows).toBe(6);
    expect(result.created_suppliers).toHaveLength(1); expect(result.created_events).toHaveLength(1);
    expect(result.by_account).toEqual([
      { financial_account_id: accountA, rows: 5, signed_amount: 105, signed_paid_amount: 155 },
      { financial_account_id: accountB, rows: 1, signed_amount: -10, signed_paid_amount: -10 },
    ]);
    expect(await scalar('SELECT count(*)::int FROM transactions WHERE company_id = $1 AND currency = $2 AND iva_rate = 0',[company,'BRL'])).toBe(6);
    expect(await q(`SELECT currency,count(*)::int AS n FROM transaction_payments GROUP BY currency`)).toEqual([{currency:'BRL',n:5}]);
    expect(await q(`SELECT it.legacy_code,t.status,t.paid_amount::text,t.payment_date::text FROM transactions t
      JOIN import_sm_2026_tx it ON it.transaction_id=t.id ORDER BY it.legacy_code`)).toEqual([
      ['SYN-1','paid','100.00','2026-01-05'],['SYN-2','approved','0',null],['SYN-3','paid','300.00','2026-01-05'],
      ['SYN-4','paid','25.00','2026-01-05'],['SYN-5','paid','20.00','2026-01-05'],['SYN-6','paid','10.00','2026-01-05'],
    ].map(([legacy_code,status,paid_amount,payment_date]) => ({legacy_code,status,paid_amount,payment_date})));
    expect(await scalar(`SELECT count(*)::int FROM transactions t JOIN import_sm_2026_tx it ON it.transaction_id=t.id
      WHERE it.company_id=t.company_id AND it.legacy_description=t.description AND it.batch_id=$1`,[result.batch_id])).toBe(6);
    expect(await q(`SELECT is_transitory,transitory_reason FROM transactions WHERE category_id=$1`,[loan])).toEqual([{is_transitory:true,transitory_reason:'emprestimo_socio'}]);
    expect(await scalar(`SELECT t.event_id FROM transactions t JOIN import_sm_2026_tx it ON it.transaction_id=t.id WHERE it.legacy_code='SYN-4'`)).toBeNull();
    expect(await scalar(`SELECT country FROM suppliers WHERE id=$1`,[result.created_suppliers[0]])).toBe('US');
    expect(await scalar(`SELECT event_nature FROM events WHERE id=$1`,[result.created_events[0]])).toBe('coproducao');
    expect(await scalar(`SELECT due_date::text FROM transactions WHERE description='Movimento sintético 2'`)).toBe('2026-02-15');
  });

  it('prova o caminho perigoso real: paid_amount directo materializa EUR e falha na moeda nativa', async () => {
    await expect(q(`INSERT INTO transactions(company_id,type,amount,date,description,status,paid_amount,account_id,currency)
      VALUES($1,'income',10,'2026-01-05','Controlo sintético','paid',10,$2,'BRL')`,[company,accountA]))
      .rejects.toThrow('Pagamento em moeda diferente da empresa');
    expect(await scalar('SELECT count(*)::int FROM transactions')).toBe(0);
    expect(await scalar('SELECT count(*)::int FROM transaction_payments')).toBe(0);
  });

  it('agrega todos os erros de leitura/mapas e não cria lote, fornecedor, evento nem transação', async () => {
    const before = await counts();
    await cell(1,'Categoria','SEM-MAPA-SYN'); await cell(2,'Dia','31/02/2026'); await cell(3,'Valor','impossível');
    await cell(4,'Evento','SEM-EVENTO-SYN'); await cell(5,'Fornecedor','SEM-FORNECEDOR-SYN');
    let failure = '';
    try { await apply(); } catch (e) { failure = (e as Error).message; }
    for (const role of ['category','date','amount','event','supplier']) expect(failure).toContain(`"role": "${role}"`);
    for (const row of [1,2,3,4,5]) expect(failure).toContain(`"row": ${row}`);
    expect(failure).toContain('SEM-MAPA-SYN'); expect(await counts()).toEqual(before);
  });

  it('recusa repetir um mês applied, mas permite reaplicação depois do rollback', async () => {
    const first = await apply(); await expect(apply()).rejects.toThrow('Já existe lote applied');
    expect(await scalar('SELECT count(*)::int FROM transactions')).toBe(6);
    await roll(first.batch_id);
    const second = await apply(); expect(second.batch_id).not.toBe(first.batch_id); expect(second.rows).toBe(6);
    expect(await scalar(`SELECT count(*)::int FROM import_sm_2026_batches WHERE status='rolled_back'`)).toBe(1);
  });

  it('recusa conta mapeada pelo código, par diferente ou separador/zero perdido', async () => {
    for (const [agency,account] of [['CODE-A','CODE-A'],['001-A','00012'],['1-A','0001-2'],['002-B','0001-2']]) {
      await cell(1,'Agência',agency); await cell(1,'Conta',account);
      await expect(apply()).rejects.toThrow('agency+account');
      expect(await scalar('SELECT count(*)::int FROM transactions')).toBe(0);
    }
  });

  it('fecha no último dia do mês pela função canónica, incluindo abertura e ignorando o mês seguinte', async () => {
    await apply();
    await q(`INSERT INTO transactions(company_id,type,amount,date,description,status,account_id,currency)
      VALUES($1,'income',777,'2026-02-01','Futuro sintético','approved',$2,'BRL')`,[company,accountA]);
    const future = await scalar<string>(`SELECT id FROM transactions WHERE description='Futuro sintético'`);
    await q(`INSERT INTO transaction_payments(transaction_id,company_id,account_id,amount,currency,payment_date) VALUES($1,$2,$3,777,'BRL','2026-02-01')`,[future,company,accountA]);
    expect(await asRole('service_role', () => q(`SELECT financial_account_id,agency,account,balance::text FROM import_sm_2026_batch_close($1,$2)`,[company,month])))
      .toEqual([{financial_account_id:accountA,agency:'001-A',account:'0001-2',balance:'1155.00'},
        {financial_account_id:accountB,agency:'002-B',account:'0002-3',balance:'190.00'}]);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','',false)`);
    expect(await scalar(`SELECT bool_and(balance IS NULL) FROM import_sm_2026_batch_close($1,$2)`,[company,month])).toBe(true);
  });

  it('rollback só apaga o lote e retém fornecedor criado que ganhou outro uso', async () => {
    const result = await apply();
    await q(`INSERT INTO transactions(company_id,type,amount,date,description,status,supplier_id,currency)
      VALUES($1,'expense',7,'2026-01-06','Fora do lote sintético','approved',$2,'BRL')`,[company,result.created_suppliers[0]]);
    const reversed = await asRole('service_role', () => roll(result.batch_id));
    expect(reversed.rows).toBe(6); expect(reversed.kept_suppliers).toEqual(result.created_suppliers);
    expect(reversed.deleted_events).toEqual(result.created_events);
    expect(await q('SELECT description FROM transactions')).toEqual([{description:'Fora do lote sintético'}]);
    expect(await scalar('SELECT count(*)::int FROM transaction_payments')).toBe(0);
    expect(await scalar('SELECT count(*)::int FROM import_sm_2026_tx')).toBe(0);
    expect(await q(`SELECT status,rolled_back_at IS NOT NULL AS stamped FROM import_sm_2026_batches`)).toEqual([{status:'rolled_back',stamped:true}]);
    await expect(roll(result.batch_id)).rejects.toThrow('Lote não está applied');
    expect(await scalar(`SELECT event_id FROM import_sm_2026_event_map WHERE legacy_event='NEW-SYN'`)).toBeNull();
  });

  it('rollback preserva outros usos mesmo com FK CASCADE/SET NULL e elimina entidades sem uso', async () => {
    const result = await apply();
    await db.exec('CREATE TABLE synthetic_event_usage(event_id uuid REFERENCES events ON DELETE CASCADE)');
    try {
      await q('INSERT INTO synthetic_event_usage VALUES($1)',[result.created_events[0]]);
      const reversed = await roll(result.batch_id);
      expect(reversed.kept_events).toEqual(result.created_events);
      expect(reversed.deleted_suppliers).toEqual(result.created_suppliers);
      expect(await scalar('SELECT count(*)::int FROM synthetic_event_usage')).toBe(1);
      expect(await scalar(`SELECT supplier_id FROM import_sm_2026_supplier_map WHERE legacy_name='NEW-SYN'`)).toBeNull();
    } finally { await db.exec('DROP TABLE synthetic_event_usage'); }
  });

  it('rollback recusa filha externa ao lote antes de apagar por cascata', async () => {
    const result = await apply();
    const parent = await scalar<string>(`SELECT transaction_id FROM import_sm_2026_tx WHERE legacy_code='SYN-1'`);
    await q(`INSERT INTO transactions(company_id,type,amount,date,description,status,parent_transaction_id)
      VALUES($1,'expense',1,'2026-01-06','Filha externa sintética','approved',$2)`,[company,parent]);
    const before = await counts();
    await expect(roll(result.batch_id)).rejects.toThrow('filha externa');
    expect(await counts()).toEqual(before);
  });

  it('não declara sucesso se os triggers não derivarem o pagamento integral', async () => {
    // A função real _derive_paid_amount considera a soma <= 0.01 como zero.
    await cell(1,'Valor','0,01');
    const before = await counts();
    await expect(apply()).rejects.toThrow('não foi integralmente derivado');
    expect(await counts()).toEqual(before);
  });

  it('mapas/staging impõem unicidade e criações exigem país e sem evento explícito', async () => {
    await expect(q(`INSERT INTO import_sm_2026_staging(company_id,batch_month,row_no,raw) VALUES($1,$2,1,'{}')`,[company,month])).rejects.toThrow('duplicate key');
    await expect(q(`INSERT INTO import_sm_2026_account_map VALUES($1,'001-A','0001-2',$2)`,[company,accountB])).rejects.toThrow('duplicate key');
    await expect(q(`INSERT INTO import_sm_2026_category_map VALUES($1,'CAT-SYN',$2)`,[company,loan])).rejects.toThrow('duplicate key');
    await expect(q(`INSERT INTO import_sm_2026_supplier_map(company_id,legacy_name,create_name) VALUES($1,'INVALID-SYN','Fornecedor inválido sintético')`,[company])).rejects.toThrow('check constraint');
    await expect(q(`INSERT INTO import_sm_2026_event_map(company_id,legacy_event) VALUES($1,'INVALID-SYN')`,[company])).rejects.toThrow('check constraint');
    await expect(q(`UPDATE import_sm_2026_supplier_map SET country='USA' WHERE legacy_name='NEW-SYN'`)).rejects.toThrow('check constraint');
    await cell(5,'Documento','SYN-DIVERGENTE');
    await expect(apply()).rejects.toThrow('Documento diverge do mapa');
  });

  it('usa o resolvedor real e reutiliza fornecedor pelo documento, sem o marcar como criado', async () => {
    await q(`UPDATE import_sm_2026_supplier_map SET doc='SYN-001' WHERE legacy_name='NEW-SYN'`);
    await cell(5,'Documento','SYN-001');
    const result = await apply(); expect(result.created_suppliers).toEqual([]);
    expect(await scalar(`SELECT supplier_id FROM import_sm_2026_supplier_map WHERE legacy_name='NEW-SYN'`)).toBe(supplier);
    await roll(result.batch_id); expect(await scalar('SELECT count(*)::int FROM suppliers')).toBe(1);
  });

  it('um RAISE do trigger administrativo reverte tudo e conserva a mensagem original', async () => {
    await q(`UPDATE account_categories SET allocate_to_active_event=true WHERE id=$1`,[category]);
    // As primeiras cinco linhas passam; a sexta cria evento antes de falhar no trigger.
    await db.exec(`SELECT set_config('test.admin_window','${event}',false)`);
    const before = await counts();
    await expect(apply()).rejects.toThrow('Esta conta é custo do evento Evento existente sintético nesta data');
    expect(await counts()).toEqual(before);
    expect(await scalar(`SELECT supplier_id FROM import_sm_2026_supplier_map WHERE legacy_name='NEW-SYN'`)).toBeNull();
    expect(await scalar(`SELECT event_id FROM import_sm_2026_event_map WHERE legacy_event='NEW-SYN'`)).toBeNull();
  });

  it('aceita o sinal sem direction e rejeita datas normalizadas, formatos/valores ambíguos e mês errado', async () => {
    await db.exec(`DELETE FROM import_sm_2026_column_map WHERE role='direction'`);
    for (const i of [1,2,4,5,6]) {
      const value = await scalar<string>(`SELECT raw->>'Valor' FROM import_sm_2026_staging WHERE row_no=$1`,[i]);
      await cell(i,'Valor',`-${value}`);
    }
    await apply(); expect(await scalar(`SELECT count(*)::int FROM transactions WHERE type='expense'`)).toBe(5);
    await db.exec(`TRUNCATE transactions CASCADE; TRUNCATE import_sm_2026_batches CASCADE`);
    for (const [key,value] of [['Dia','32/01/2026'],['Dia','2026-01-05'],['Dia','05/02/2026'],['Valor','1.23,00'],['Valor','1,234'],['Valor','NaN'],['Valor','1e3']]) {
      const old = await scalar<string>(`SELECT raw->>$1 FROM import_sm_2026_staging WHERE row_no=1`,[key]);
      await cell(1,key,value); await expect(apply()).rejects.toThrow('validação falhou'); await cell(1,key,old);
    }
  });

  it('recusa empresa não BRL, mapas obrigatórios ausentes, mês inválido e staging vazia', async () => {
    await expect(q('SELECT import_sm_2026_apply_batch($1,$2)',[other,month])).rejects.toThrow('moeda diferente de BRL');
    await expect(q('SELECT import_sm_2026_apply_batch($1,$2)',[company,'2026-01-02'])).rejects.toThrow('primeiro dia');
    await expect(q('SELECT import_sm_2026_apply_batch($1,$2)',[company,'2027-01-01'])).rejects.toThrow('2026');
    await db.exec(`DELETE FROM import_sm_2026_column_map WHERE role='agency'`);
    await expect(apply()).rejects.toThrow('Papéis obrigatórios em falta');
    await db.exec(`INSERT INTO import_sm_2026_column_map VALUES('agency','Agência',NULL); TRUNCATE import_sm_2026_staging`);
    await expect(apply()).rejects.toThrow('Staging sem linhas');
  });

  it('exige sem evento explícito e rejeita cabeçalho ausente ou célula composta', async () => {
    await db.exec(`DELETE FROM import_sm_2026_event_map WHERE legacy_event=''`);
    await expect(apply()).rejects.toThrow('sem evento exige no_event');
    await db.exec(`INSERT INTO import_sm_2026_event_map(company_id,legacy_event,no_event) VALUES('${company}','',true);
      UPDATE import_sm_2026_staging SET raw=raw-'Conta' WHERE row_no=1`);
    await expect(apply()).rejects.toThrow('Cabeçalho ausente');
    await db.exec(`UPDATE import_sm_2026_staging SET raw=raw || '{"Conta": {"nested":"synthetic"}}'::jsonb WHERE row_no=1`);
    await expect(apply()).rejects.toThrow('célula não escalar');
  });

  it('recusa referências de outra empresa nos quatro mapas', async () => {
    for (const [table,target] of [['account_categories',category],['financial_accounts',accountA],['suppliers',supplier],['events',event]]) {
      await q(`UPDATE ${table} SET company_id=$1 WHERE id=$2`,[other,target]);
      await expect(apply()).rejects.toThrow('Sem mapa válido');
      expect(await scalar('SELECT count(*)::int FROM transactions')).toBe(0);
      await q(`UPDATE ${table} SET company_id=$1 WHERE id=$2`,[company,target]);
    }
  });

  it('ACL: RLS em oito tabelas, anon sem acesso, authenticated sem escrita/RPC e só platform_admin lê', async () => {
    expect(await scalar(`SELECT count(*)::int FROM pg_class WHERE relname LIKE 'import_sm_2026_%' AND relkind='r' AND relrowsecurity`)).toBe(8);
    for (const suffix of tables) {
      const table = `public.import_sm_2026_${suffix}`;
      for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])
        expect(await scalar('SELECT has_table_privilege($1,$2,$3)',['anon',table,privilege])).toBe(false);
      for (const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])
        expect(await scalar('SELECT has_table_privilege($1,$2,$3)',['authenticated',table,privilege])).toBe(false);
      for (const privilege of ['SELECT','INSERT','UPDATE','DELETE'])
        expect(await scalar('SELECT has_table_privilege($1,$2,$3)',['service_role',table,privilege])).toBe(true);
      await expect(asRole('anon', () => q(`SELECT * FROM ${table}`))).rejects.toThrow('permission denied');
    }
    for (const f of functions) for (const role of ['anon','authenticated','service_role'])
      expect(await scalar('SELECT has_function_privilege($1,$2,$3)',[role,`public.${f}`,'EXECUTE'])).toBe(role==='service_role');
    for (const role of ['anon','authenticated']) {
      await expect(asRole(role,apply)).rejects.toThrow('permission denied');
      await expect(asRole(role,() => q('SELECT import_sm_2026_batch_close($1,$2)',[company,month]))).rejects.toThrow('permission denied');
      await expect(asRole(role,() => roll(id(999)))).rejects.toThrow('permission denied');
      expect(await scalar('SELECT has_sequence_privilege($1,$2,$3)',[role,'public.import_sm_2026_staging_id_seq','USAGE'])).toBe(false);
    }
    await db.exec(`SELECT set_config('request.jwt.claim.sub','',false)`);
    for (const suffix of tables) expect(await asRole('authenticated',() => scalar(`SELECT count(*)::int FROM import_sm_2026_${suffix}`))).toBe(0);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${admin}',false)`);
    expect(await asRole('authenticated',() => scalar('SELECT count(*)::int FROM import_sm_2026_staging'))).toBe(6);
    await expect(asRole('authenticated',() => q('DELETE FROM import_sm_2026_staging'))).rejects.toThrow('permission denied');
    expect(await asRole('service_role',apply)).toMatchObject({rows:6});
  });

  it('rollback estrutural comentado executa em PGlite, repõe CHECK e não toca no schema transacional', async () => {
    await db.exec('BEGIN');
    try {
      const sql = rollback.slice(rollback.indexOf('-- DO $guard$')).split('\n').map(l => l.replace(/^-- ?/,'')).join('\n');
      // A última linha é explicativa, não SQL executável.
      await db.exec(sql.slice(0, sql.indexOf('A sequência owned-by')));
      expect(await scalar(`SELECT count(*)::int FROM pg_class WHERE relname LIKE 'import_sm_2026_%'`)).toBe(0);
      expect(await scalar(`SELECT count(*)::int FROM pg_proc WHERE proname LIKE 'import_sm_2026_%'`)).toBe(0);
      expect(await scalar(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='supplier_similarity_flags_source_check'`)).not.toContain('import_sm_2026');
      expect(await q(`SELECT attname,atttypid,attnotnull,atthasdef FROM pg_attribute WHERE attrelid = 'transactions'::regclass AND attnum > 0 ORDER BY attnum`)).toEqual(originalColumns);
    } finally { await db.exec('ROLLBACK'); }
  });
});
