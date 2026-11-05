// @vitest-environment node
// #314 E2b / 6629854062: só PGlite em memória, sem credenciais, SQL externo ou Live.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migrationPath = 'drizzle/migrations/0323_issue314_fecho_entrada_sem_conta.sql';
const manualPath = 'supabase/manual/0323_issue314_fecho_entrada_sem_conta.sql';
const rollbackPath = 'supabase/manual/rollback_0323_issue314_fecho_entrada_sem_conta_comentado.sql';
const transferSource = readFileSync('supabase/migrations/20260912193941_e33bfb5f-eba7-440a-a815-f8e6b4f43651.sql', 'utf8');
const saveSource = readFileSync('drizzle/migrations/0094_derp_296_triggers_own_invoice_paid.sql', 'utf8');
const migration = readFileSync(manualPath, 'utf8');
const rollbackFile = readFileSync(rollbackPath, 'utf8');
const rollback = rollbackFile.split('-- >>> ROLLBACK\n')[1].split('-- <<< ROLLBACK')[0]
  .split('\n').filter(line => line.length > 0).map(line => line.slice(3)).join('\n');
const proof = readFileSync('docs/testes/issue314-fecho/prova-janela.sql', 'utf8');
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const company = id(1), office = id(2), bank = id(3), settlement = id(4), event = id(5), user = id(6);
const date = '2026-10-21';
const pairError = '#314: perna de par do fecho/devolução paga exige banco';
const oldError = 'Contas de origem e destino são obrigatórias';
const transferSignature = 'public.create_settlement_transfer(uuid,uuid,uuid,numeric,date,boolean)';
const saveSignature = 'public.save_ticket_office_settlement(uuid,jsonb,boolean,jsonb,jsonb,text,text,text)';

function definition(sql: string, name: string): string {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS (\\$(?:\\w+)?\\$)[\\s\\S]*?\\1;`));
  if (!match) throw new Error(`Definição ausente: ${name}`);
  return match[0];
}
const originalTransfer = definition(transferSource, 'create_settlement_transfer');
const originalSave = definition(saveSource, 'save_ticket_office_settlement');

let db: PGlite;
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
async function clean() {
  await db.exec(`TRUNCATE transactions, ticket_office_settlements, transaction_payments,
    transaction_audit_log, event_ticket_office_assignments;
    ALTER SEQUENCE fixture_id RESTART WITH 100;
    INSERT INTO ticket_office_settlements(id,company_id,event_id,status)
    VALUES ('${settlement}','${company}','${event}','confirmed');`);
}
const transfer = (to: string | null, credited = false, from: string | null = office) => db.query(
  `SELECT public.create_settlement_transfer($1,$2,$3,123.45,$4,$5) AS id`,
  [settlement, from, to, date, credited],
);
const payload = {
  financial_account_id: office, event_id: event, settlement_date: date,
  gross_revenue: 150, total_deductions: 26.55, net_calculated: 123.45,
};
const save = (to: Record<string, unknown>, confirm = true, existing: string | null = null) => db.query<{ result: { settlement_id: string } }>(
  `SELECT public.save_ticket_office_settlement($1,$2,$3,'[]'::jsonb,$4,'retido','restante','teste') AS result`,
  [existing, payload, confirm, { amount: 123.45, ...to }],
);
const snapshot = () => one(`SELECT
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY type) FROM transactions t) AS legs,
  (SELECT to_jsonb(s) FROM ticket_office_settlements s WHERE id='${settlement}') AS settlement`);
const catalog = () => db.query<{ signature: string; hash: string; acl: string[]; secdef: boolean }>(`SELECT
  p.oid::regprocedure::text AS signature, md5(pg_get_functiondef(p.oid)) AS hash,
  p.proacl AS acl, p.prosecdef AS secdef FROM pg_proc p
  WHERE p.oid IN ('${transferSignature}'::regprocedure,'${saveSignature}'::regprocedure) ORDER BY 1`);
type Catalog = Awaited<ReturnType<typeof catalog>>['rows'];
let beforeCatalog: Catalog;
let baselinePending: Record<string, unknown>;
let baselineCredited: Record<string, unknown>;

beforeAll(async () => {
  db = new PGlite();
  // Os IDs gerados e todos os actores/entidades do fixture são sintéticos 00000000-… .
  // category_id é preservado literalmente nos corpos de produção, sem FK para dados reais.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE ROLE sandbox_exec_issue314 NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${user}'::uuid $$;
    CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.is_platform_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION public.has_permission(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT '${company}'::uuid $$;
    CREATE SEQUENCE fixture_id;
    CREATE TABLE public.financial_accounts(id uuid PRIMARY KEY, company_id uuid, name text);
    CREATE TABLE public.ticket_office_settlements(
      id uuid PRIMARY KEY DEFAULT ('00000000-0000-0000-0000-' || lpad(nextval('fixture_id')::text,12,'0'))::uuid,
      company_id uuid, financial_account_id uuid, event_id uuid, settlement_date date,
      gross_revenue numeric, total_deductions numeric, net_calculated numeric, net_adjusted numeric,
      adjustment_notes text, gross_adjustment_notes text, forma_liquidacao_manual text,
      forma_liquidacao_manual_notes text, net_transferred numeric, transfer_account_id uuid,
      transfer_transaction_id uuid, document_url text, document_name text, notes text,
      venue_retained_amount numeric, venue_retained_invoice_id uuid, venue_retained_notes text,
      venue_retained_payment_id uuid, venue_invoice_remainder_paid boolean,
      venue_invoice_remainder_amount numeric, venue_invoice_remainder_payment_id uuid,
      status text, closed_at timestamptz, closed_by uuid, created_by uuid, statement_id uuid
    );
    CREATE TABLE public.transactions(
      id uuid PRIMARY KEY DEFAULT ('00000000-0000-0000-0000-' || lpad(nextval('fixture_id')::text,12,'0'))::uuid,
      company_id uuid, event_id uuid, type text CHECK(type IN ('income','expense')), category_id uuid,
      description text, amount numeric, iva_rate numeric, date date, status text, paid_amount numeric,
      payment_date date, account_id uuid, payment_method text, exclude_from_result boolean,
      currency text, settlement_id uuid, operation_key text, reversed_at timestamptz,
      reversal_kind text, is_transitory boolean, is_reimbursement boolean
    );
    CREATE TABLE public.transaction_payments(
      id uuid DEFAULT ('00000000-0000-0000-0000-' || lpad(nextval('fixture_id')::text,12,'0'))::uuid,
      transaction_id uuid, amount numeric, payment_date date, payment_method text,
      account_id uuid, notes text, created_by text
    );
    CREATE TABLE public.transaction_audit_log(transaction_id uuid,changed_by text,field_name text,old_value text,new_value text);
    CREATE TABLE public.event_ticket_office_assignments(event_id uuid,financial_account_id uuid,is_conciliated boolean,conciliated_at timestamptz,conciliated_by text);
    INSERT INTO financial_accounts VALUES ('${office}','${company}','Bilheteira teste'), ('${bank}','${company}','Banco teste');
    GRANT USAGE ON SCHEMA public TO authenticated, service_role, sandbox_exec_issue314;
    GRANT SELECT, INSERT, UPDATE, DELETE ON transactions TO authenticated, service_role, sandbox_exec_issue314;
    GRANT USAGE ON SEQUENCE fixture_id TO authenticated, service_role, sandbox_exec_issue314;
  `);
  // Carrega os dois ficheiros de origem, incluindo as ACL, e a guarda legada real.
  await db.exec(transferSource);
  await db.exec(saveSource);
  const paidGuardSource = readFileSync('supabase/migrations/20260913060148_7c92312e-0147-4a46-8f8e-fa425229c3fb.sql', 'utf8');
  await db.exec(definition(paidGuardSource, 'enforce_tx_paid_requires_account'));
  await db.exec(`CREATE TRIGGER trg_enforce_tx_paid_requires_account BEFORE INSERT ON transactions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_tx_paid_requires_account();
    GRANT EXECUTE ON FUNCTION ${transferSignature} TO service_role, sandbox_exec_issue314;
    GRANT EXECUTE ON FUNCTION ${saveSignature} TO sandbox_exec_issue314;`);
  beforeCatalog = (await catalog()).rows;
  await clean();
  // Prova a linha de base antes de carregar a 0323; nunca substitui os corpos por stubs.
  await expect(transfer(null)).rejects.toMatchObject({ message: oldError, code: '22023' });
  await expect(save({ to_account_id: '' })).rejects.toMatchObject({ code: '22P02' });
  expect(await one('SELECT count(*)::int AS n FROM transactions')).toEqual({ n: 0 });
  await clean();
  await transfer(bank, false);
  baselinePending = await snapshot();
  await clean();
  await transfer(bank, true);
  baselineCredited = await snapshot();
  await clean();
  await db.exec(migration);
}, 30000);

beforeEach(clean);
afterAll(async () => { await db?.close(); });

describe.sequential('#314 / 0323 — fecho pendente sem banco', () => {
  it('mantém cópia byte a byte, rollback todo comentado e só um nullif no corpo da 0094', () => {
    expect(readFileSync(migrationPath)).toEqual(readFileSync(manualPath));
    expect(rollbackFile.trimEnd().split('\n').every(line => line.startsWith('-- '))).toBe(true);
    expect(definition(rollback, 'create_settlement_transfer')).toBe(originalTransfer);
    expect(definition(rollback, 'save_ticket_office_settlement')).toBe(originalSave);
    expect(definition(migration, 'save_ticket_office_settlement')).toBe(originalSave.replace(
      "(p_transfer->>'to_account_id')::uuid", "nullif(p_transfer->>'to_account_id','')::uuid",
    ));
    const transferDef = definition(migration, 'create_settlement_transfer');
    expect(transferDef).toBe(originalTransfer.replace(
      "IF p_from_account_id IS NULL OR p_to_account_id IS NULL THEN\n    RAISE EXCEPTION 'Contas de origem e destino são obrigatórias' USING ERRCODE = '22023';",
      "IF p_from_account_id IS NULL THEN\n    RAISE EXCEPTION 'Conta de origem (bilheteira) é obrigatória' USING ERRCODE = '22023';\n  END IF;\n  IF p_to_account_id IS NULL AND p_credited THEN\n    RAISE EXCEPTION 'Crédito confirmado exige banco; sem banco o repasse fica a receber' USING ERRCODE = '22023';",
    ).replace("coalesce(v_to_name, '?')", "coalesce(v_to_name, CASE WHEN p_to_account_id IS NULL THEN 'banco na liquidação' ELSE '?' END)"));
    expect(migration).not.toMatch(/(?:GRANT|REVOKE)[^;]+(?:create_settlement_transfer|save_ticket_office_settlement)/i);
  });

  async function assertPendingPair(settlementId: string, outId?: string) {
    const rows = (await db.query<Record<string, unknown>>(`SELECT *, date::text AS date FROM transactions ORDER BY type`)).rows;
    expect(rows).toHaveLength(2);
    const [out, incoming] = rows;
    expect(out).toMatchObject({ type: 'expense', account_id: office, settlement_id: settlementId });
    if (outId) expect(out.id).toBe(outId);
    expect(incoming).toMatchObject({ type: 'income', account_id: null, settlement_id: null });
    const key = `TRF-FECHO-${settlementId.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    for (const leg of rows) {
      expect(leg).toMatchObject({
        company_id: company, event_id: event, operation_key: key,
        category_id: 'b32df086-c995-4747-a3f9-bfefa0063d0a', amount: '123.45',
        iva_rate: '0', date, status: 'pending', paid_amount: '0', payment_date: null,
        payment_method: 'transfer', exclude_from_result: true, currency: 'EUR',
        description: 'Transferência fecho bilheteira Bilheteira teste -> banco na liquidação (a receber)',
      });
    }
    expect(await one('SELECT transfer_transaction_id,transfer_account_id,net_transferred FROM ticket_office_settlements WHERE id=$1', [settlementId]))
      .toEqual({ transfer_transaction_id: out.id, transfer_account_id: null, net_transferred: '123.45' });
  }

  it('cria duas pernas pendentes com entrada e transfer_account_id nulos', async () => {
    const out = (await transfer(null)).rows[0] as { id: string };
    await assertPendingPair(settlement, out.id);
  });

  it('recusa crédito confirmado sem banco antes de inserir qualquer perna', async () => {
    await expect(transfer(null, true)).rejects.toMatchObject({
      message: 'Crédito confirmado exige banco; sem banco o repasse fica a receber', code: '22023',
    });
    expect(await one('SELECT count(*)::int AS n FROM transactions')).toEqual({ n: 0 });
    expect(await one(`SELECT transfer_transaction_id,net_transferred FROM ticket_office_settlements WHERE id='${settlement}'`))
      .toEqual({ transfer_transaction_id: null, net_transferred: null });
  });

  it.each([false, true])('com banco mantém todas as colunas da linha de base (credited=%s)', async credited => {
    await transfer(bank, credited);
    expect(await snapshot()).toEqual(credited ? baselineCredited : baselinePending);
  });

  it.each([{}, { to_account_id: '' }])('save normaliza destino ausente/vazio: %j', async to => {
    const result = (await save(to)).rows[0].result;
    await assertPendingPair(result.settlement_id);
    expect(await one('SELECT status FROM ticket_office_settlements WHERE id=$1', [result.settlement_id])).toEqual({ status: 'confirmed' });
    expect(await one('SELECT count(*)::int AS n FROM transaction_payments')).toEqual({ n: 0 });
  });

  it.each([{}, { to_account_id: '' }])('save recusa crédito sem banco atomicamente: %j', async to => {
    await expect(save({ ...to, credited: true })).rejects.toMatchObject({ code: '22023' });
    expect(await one('SELECT count(*)::int AS n FROM transactions')).toEqual({ n: 0 });
    expect(await one('SELECT count(*)::int AS n FROM ticket_office_settlements')).toEqual({ n: 1 });
  });

  it('mantém a conta de origem obrigatória, contas distintas e duplicação recusada', async () => {
    await expect(transfer(null, false, null)).rejects.toMatchObject({ message: 'Conta de origem (bilheteira) é obrigatória', code: '22023' });
    await expect(transfer(office)).rejects.toMatchObject({ code: '22023' });
    await transfer(null);
    await expect(transfer(null)).rejects.toMatchObject({ message: 'Este fecho já tem transferência lançada', code: '22023' });
    expect(await one('SELECT count(*)::int AS n FROM transactions')).toEqual({ n: 2 });
  });

  it('gravar rascunho ou fecho de apuramento sem p_transfer não cria par', async () => {
    await save({}, false);
    await db.exec(`UPDATE ticket_office_settlements SET statement_id='${id(7)}' WHERE id='${settlement}'`);
    await db.query(`SELECT public.save_ticket_office_settlement($1,$2,true,'[]',NULL,'','','teste')`, [settlement, payload]);
    expect(await one('SELECT count(*)::int AS n FROM transactions')).toEqual({ n: 0 });
    expect(await one(`SELECT statement_id FROM ticket_office_settlements WHERE id='${settlement}'`)).toEqual({ statement_id: id(7) });
  });

  it('UPDATE paid na entrada sem banco só falha no COMMIT, com 23514', async () => {
    await transfer(null);
    await db.exec('BEGIN');
    try {
      await db.exec("UPDATE transactions SET status='paid' WHERE type='income'");
      expect(await one("SELECT status,account_id FROM transactions WHERE type='income'"))
        .toEqual({ status: 'paid', account_id: null });
      await expect(db.exec('COMMIT')).rejects.toMatchObject({ message: pairError, code: '23514' });
    } finally { await db.exec('ROLLBACK'); }
    expect(await one("SELECT status FROM transactions WHERE type='income'")).toEqual({ status: 'pending' });
  });

  it('aceita paid → conta na mesma transação, como a sequência settle', async () => {
    await transfer(null);
    await db.exec('BEGIN');
    try {
      await db.exec("UPDATE transactions SET status='paid' WHERE type='income'");
      await db.exec(`UPDATE transactions SET account_id='${bank}' WHERE type='income'`);
      await db.exec('COMMIT');
    } finally { await db.exec('ROLLBACK'); }
    expect(await one("SELECT status,account_id FROM transactions WHERE type='income'"))
      .toEqual({ status: 'paid', account_id: bank });
  });

  it.each(['TRF-FECHO-', 'DEVOL-SALA-'])('recusa INSERT paid sem banco para %s (sem isenções de papel/flags)', async prefix => {
    for (const role of ['postgres', 'authenticated', 'service_role', 'sandbox_exec_issue314']) {
      await db.exec('BEGIN');
      try {
        await db.exec(`SET LOCAL ROLE ${role}`);
        await db.query(`INSERT INTO transactions(company_id,type,status,account_id,operation_key,
          exclude_from_result,is_transitory,is_reimbursement,payment_method)
          VALUES ($1,'income','paid',NULL,$2,true,true,true,'compensation')`, [company, `${prefix}00000000`]);
        await expect(db.exec('COMMIT')).rejects.toMatchObject({ message: pairError, code: '23514' });
      } finally { await db.exec('ROLLBACK'); }
    }
    expect(await one('SELECT count(*)::int AS n FROM transactions')).toEqual({ n: 0 });
  });

  it('recusa retirar conta ou acrescentar uma chave protegida a uma linha já paga', async () => {
    await transfer(bank, true);
    await expect(db.exec("UPDATE transactions SET account_id=NULL WHERE type='income'"))
      .rejects.toMatchObject({ message: pairError, code: '23514' });
    // Também a perna de saída está protegida.
    await expect(db.exec("UPDATE transactions SET account_id=NULL WHERE type='expense'"))
      .rejects.toMatchObject({ message: pairError, code: '23514' });
    await db.exec(`INSERT INTO transactions(id,type,status,exclude_from_result) VALUES ('${id(9)}','income','paid',true)`);
    await expect(db.exec(`UPDATE transactions SET operation_key='DEVOL-SALA-00000000' WHERE id='${id(9)}'`))
      .rejects.toMatchObject({ message: pairError, code: '23514' });
  });

  it('preserva a isenção legada para uma linha sem chave e exclude_from_result', async () => {
    await db.exec(`BEGIN; SET LOCAL ROLE authenticated;
      INSERT INTO transactions(type,status,exclude_from_result) VALUES ('income','paid',true); COMMIT;`);
    expect(await one('SELECT status,account_id,operation_key FROM transactions'))
      .toEqual({ status: 'paid', account_id: null, operation_key: null });
  });

  it('relê a linha final: inserir e apagar, ou reverter paid antes do COMMIT, passa', async () => {
    await db.exec(`BEGIN;
      INSERT INTO transactions(id,type,status,operation_key,exclude_from_result)
      VALUES ('${id(9)}','income','paid','TRF-FECHO-00000000',true);
      DELETE FROM transactions WHERE id='${id(9)}'; COMMIT;`);
    expect(await one('SELECT count(*)::int AS n FROM transactions')).toEqual({ n: 0 });
    await db.exec(`BEGIN;
      INSERT INTO transactions(id,type,status,operation_key,exclude_from_result)
      VALUES ('${id(9)}','income','paid','DEVOL-SALA-00000000',true);
      UPDATE transactions SET status='pending' WHERE id='${id(9)}'; COMMIT;`);
    expect(await one('SELECT status FROM transactions')).toEqual({ status: 'pending' });
  });

  it('preserva ACL/SECDEF das duas RPCs e instala constraint diferida com helper fechado', async () => {
    const after = (await catalog()).rows;
    expect(after.map(({ hash: _hash, ...row }) => row)).toEqual(beforeCatalog.map(({ hash: _hash, ...row }) => row));
    expect(after.map(row => row.hash)).not.toEqual(beforeCatalog.map(row => row.hash));
    expect(await one(`SELECT tgdeferrable,tginitdeferred,tgenabled FROM pg_trigger
      WHERE tgname='trg_settlement_pair_paid_requires_account'`))
      .toEqual({ tgdeferrable: true, tginitdeferred: true, tgenabled: 'O' });
    expect(await one(`SELECT prosecdef,proconfig,
      has_function_privilege('anon',oid,'EXECUTE') AS anon,
      has_function_privilege('authenticated',oid,'EXECUTE') AS authenticated,
      EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public
      FROM pg_proc WHERE oid='public.enforce_settlement_pair_paid_requires_account()'::regprocedure`))
      .toEqual({ prosecdef: true, proconfig: ['search_path=public'], anon: false, authenticated: false, public: false });
  });

  it('a prova de janela contém apenas SELECT e executa no catálogo do fixture', async () => {
    const sql = proof.replace(/--[^\n]*/g, '');
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    expect(statements).toHaveLength(5);
    expect(statements.every(s => /^SELECT\b/i.test(s))).toBe(true);
    const result = await db.exec(proof);
    expect(result[0].rows).toEqual([{ pernas_pagas_sem_conta: 0 }]);
    expect(result[2].rows).toHaveLength(2);
    expect(result[3].rows).toHaveLength(1);
  });

  it.each(['TRF-FECHO-', 'DEVOL-SALA-'])('aborta a 0323 com violação prévia %s sem mudar corpos, ACL ou dados', async prefix => {
    await db.exec('BEGIN');
    try {
      // Volta à linha de base e introduz a violação apenas no fixture isolado.
      await db.exec(rollback);
      await db.query(`INSERT INTO transactions(id,type,status,operation_key,exclude_from_result)
        VALUES ($1,'income','paid',$2,true)`, [id(9), `${prefix}00000000`]);
      await db.exec('SAVEPOINT before_migration');
      await expect(db.exec(migration)).rejects.toMatchObject({
        code: '23514', message: '#314: existem pernas de fecho/devolução pagas sem banco; corrigir por DML próprio antes da 0323',
      });
      await db.exec('ROLLBACK TO SAVEPOINT before_migration');
      expect((await catalog()).rows).toEqual(beforeCatalog);
      expect(await one(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='trg_settlement_pair_paid_requires_account'`)).toEqual({ n: 0 });
      expect(await one(`SELECT status,account_id FROM transactions WHERE id='${id(9)}'`)).toEqual({ status: 'paid', account_id: null });
    } finally { await db.exec('ROLLBACK'); }
  });

  it('rollback descomentado restaura definições, ACL e os dois erros da linha de base', async () => {
    await db.exec('BEGIN');
    try {
      await db.exec(rollback);
      expect((await catalog()).rows).toEqual(beforeCatalog);
      expect(await one("SELECT to_regprocedure('public.enforce_settlement_pair_paid_requires_account()') AS helper"))
        .toEqual({ helper: null });
      await db.exec('SAVEPOINT baseline');
      await expect(transfer(null)).rejects.toMatchObject({ message: oldError, code: '22023' });
      await db.exec('ROLLBACK TO SAVEPOINT baseline');
      await expect(save({ to_account_id: '' })).rejects.toMatchObject({ code: '22P02' });
      await db.exec('ROLLBACK TO SAVEPOINT baseline');
      expect(await one('SELECT count(*)::int AS n FROM transactions')).toEqual({ n: 0 });
    } finally { await db.exec('ROLLBACK'); }
  });
});
