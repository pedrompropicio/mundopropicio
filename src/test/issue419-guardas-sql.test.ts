// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migrationPath = 'drizzle/migrations/0318_issue419_guardas_automatismos.sql';
const manualPath = 'supabase/manual/0318_issue419_guardas_automatismos.sql';
const rollbackPath = 'supabase/manual/rollback_0318_issue419_guardas_automatismos_comentado.sql';
const migration = readFileSync(migrationPath, 'utf8');
const rollback = readFileSync(rollbackPath, 'utf8');
const proof = readFileSync('docs/testes/issue419/prova-janela.sql', 'utf8');
const messages = {
  G1: 'Conta-espelho: o aporte é criado sozinho pela despesa paga. Lance só a despesa.',
  G2: 'O adiantamento por conta de terceiros é criado pela despesa paga com custo partilhado.',
  G3: 'A entrada da carga no cartão é criada sozinha quando a saída fica paga. Lance a carga pela sessão de cartão.',
  G4: 'A compensação faz-se pelo assistente de encontro de contas (#337).',
};
const uuid = (n: number) => `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`;
const company = uuid(1), mirror = uuid(2), bank = uuid(3), partner = uuid(4), card = uuid(5);
const g1 = uuid(10), g2 = uuid(11), cardCategory = uuid(12), ordinary = uuid(13);
const legacyG1 = uuid(100), legacyG2 = uuid(101), legacyG3 = uuid(102), legacyLeg = uuid(200);
const offsetSource = 'supabase/migrations/20260928221118_bea24c4b-e61c-4fd0-b901-59eba78bfbe1.sql';
const paidSource = 'supabase/migrations/20261002120740_6be30c36-594d-4678-9477-1a3b995136ac.sql';
const sharedSource = 'supabase/migrations/20260916024749_0bc034ea-f069-45c8-ad0a-12c4427a7ab1.sql';
const live = JSON.parse(readFileSync('supabase/tests/issue335/live/phase2f-catalog.json', 'utf8')) as {
  triggers: { name: string; function: string; definition: string }[];
};

// Extrai a definição integral, sem reescrever o corpo nem executar a migração-fonte inteira.
function sourceFunction(path: string, name: string) {
  const source = readFileSync(path, 'utf8');
  const start = source.search(new RegExp(`^CREATE OR REPLACE FUNCTION public\\.${name}\\(`, 'im'));
  expect(start, `${name} em ${path}`).toBeGreaterThanOrEqual(0);
  const tail = source.slice(start);
  const body = /\bAS\s+(\$[\w]*\$)/i.exec(tail);
  expect(body, `delimitador de ${name}`).not.toBeNull();
  const end = tail.indexOf(body![1], body!.index + body![0].length);
  expect(end).toBeGreaterThan(body!.index);
  return tail.slice(0, tail.indexOf(';', end + body![1].length) + 1);
}

const beforeCounts = proof.split('-- §1 —')[1].split('\n').slice(1).join('\n').split('-- §2 —')[0].trim();
const afterCounts = proof.split('-- §3 —')[1].split('\n').slice(1).join('\n').split('-- §4 —')[0].trim();
let db: PGlite;
let beforeInstall: unknown;
let afterInstall: unknown;
let proofBefore: unknown;
let proofAfter: unknown;

async function snapshot() {
  return (await db.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t) AS transactions,
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM transaction_payments p) AS payments`)).rows;
}

async function asRole(role: 'authenticated' | 'anon' | 'service_role', run: () => Promise<void>) {
  expect((await db.query('SELECT current_user, session_user')).rows).toEqual([
    { current_user: 'postgres', session_user: 'postgres' },
  ]);
  // Identidade de sessão real: o teste não depende de privilégios do bootstrap administrador.
  await db.exec(`SET SESSION AUTHORIZATION ${role}`);
  try {
    expect((await db.query('SELECT current_user, session_user')).rows).toEqual([
      { current_user: role, session_user: role },
    ]);
    await run();
  } finally {
    // No PGlite restaurar explicitamente o bootstrap, sem depender do reset_val da GUC.
    await db.exec('SET SESSION AUTHORIZATION postgres');
    expect((await db.query('SELECT current_user, session_user')).rows).toEqual([
      { current_user: 'postgres', session_user: 'postgres' },
    ]);
  }
}

async function refuses(sql: string, message: string, params: unknown[] = []) {
  await db.exec('SAVEPOINT rejection');
  try {
    await expect(db.query(sql, params)).rejects.toMatchObject({ code: 'P0001', message });
  } finally {
    await db.exec('ROLLBACK TO SAVEPOINT rejection; RELEASE SAVEPOINT rejection');
  }
}

type TxOptions = {
  type?: string; category?: string | null; account?: string | null; reason?: string | null;
  status?: string; paid?: number; sharedAccount?: string | null;
};
async function insertTx(options: TxOptions = {}) {
  const { rows } = await db.query<{ id: string }>(`INSERT INTO transactions
    (company_id, type, category_id, account_id, transitory_reason, status, paid_amount,
     shared_cost_account_id, shared_cost_counterparty_id, description, amount, date, payment_date)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'despesa de teste',100,'2026-10-01','2026-10-01') RETURNING id`,
  [company, options.type ?? 'income', options.category === undefined ? ordinary : options.category,
    options.account === undefined ? bank : options.account, options.reason ?? null,
    options.status ?? 'approved', options.paid ?? 0, options.sharedAccount ?? null, uuid(30)]);
  return rows[0].id;
}

async function insertLeg(tx: string, method = 'compensation', offset: string | null = null, group: string | null = null) {
  return db.query<{ id: string }>(`INSERT INTO transaction_payments
    (transaction_id, company_id, amount, payment_date, payment_method, offset_id, offset_group_id)
    VALUES ($1,$2,10,'2026-10-01',$3,$4,$5) RETURNING id`, [tx, company, method, offset, group]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"email":"fixture@example.test"}'::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE account_categories (id uuid PRIMARY KEY, company_id uuid, code text);
    CREATE TABLE financial_accounts (id uuid PRIMARY KEY, name text, mirror_partner_aporte boolean, partner_id uuid);
    CREATE TABLE event_partners (id uuid PRIMARY KEY, event_id uuid, supplier_id uuid);
    CREATE TABLE transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, type text,
      category_id uuid REFERENCES account_categories, account_id uuid REFERENCES financial_accounts,
      transitory_reason text, status text DEFAULT 'approved', description text, specification text,
      amount numeric DEFAULT 100, paid_amount numeric DEFAULT 0, iva_rate numeric DEFAULT 0,
      date date, payment_date date, reversed_at timestamptz, updated_at timestamptz,
      event_id uuid, supplier_id uuid, payment_method text DEFAULT 'transfer',
      shared_cost_account_id uuid, shared_cost_counterparty_id uuid,
      exclude_from_result boolean, is_transitory boolean, currency text DEFAULT 'EUR',
      parent_transaction_id uuid, split_percentage numeric, is_reimbursement boolean DEFAULT false
    );
    CREATE TABLE partner_aporte_mirror (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid, account_id uuid, source_transaction_id uuid REFERENCES transactions ON DELETE CASCADE,
      aporte_transaction_id uuid REFERENCES transactions ON DELETE CASCADE, updated_at timestamptz);
    CREATE TABLE partner_capital_moves (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid, event_id uuid, partner_id uuid, transaction_id uuid REFERENCES transactions ON DELETE CASCADE,
      kind text, flow text);
    CREATE TABLE shared_cost_mirror (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid, account_id uuid, source_transaction_id uuid REFERENCES transactions ON DELETE CASCADE,
      mirror_transaction_id uuid REFERENCES transactions ON DELETE CASCADE, updated_at timestamptz);
    CREATE TABLE card_sessions (id uuid PRIMARY KEY, card_account_id uuid);
    CREATE TABLE card_session_loads (id uuid PRIMARY KEY, session_id uuid REFERENCES card_sessions,
      source_account_id uuid, out_transaction_id uuid REFERENCES transactions, in_transaction_id uuid REFERENCES transactions,
      amount numeric, load_date date);
    CREATE TABLE partner_paid_expenses (transaction_id uuid);
    CREATE TABLE transaction_offsets (id uuid PRIMARY KEY, receivable_transaction_id uuid REFERENCES transactions,
      payable_transaction_id uuid REFERENCES transactions, amount numeric);
    CREATE TABLE transaction_payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid NOT NULL REFERENCES transactions,
      company_id uuid, amount numeric NOT NULL, payment_date date NOT NULL, account_id uuid,
      payment_method text NOT NULL DEFAULT 'transfer', status text DEFAULT 'paid',
      offset_id uuid REFERENCES transaction_offsets, offset_group_id uuid,
      created_by text DEFAULT 'fixture', notes text, payment_reference text,
      closes_transaction boolean DEFAULT false, currency text DEFAULT 'EUR',
      reversed_at timestamptz, reversed_by uuid, reversal_reason text, created_at timestamptz DEFAULT now()
    );
    INSERT INTO account_categories VALUES
      ('${g1}','${company}','10.1.01'), ('${g2}','${company}','10.12.01'),
      ('${cardCategory}','${company}','10.3'), ('${ordinary}','${company}','2.1'),
      ('${uuid(14)}','${company}','10.1.01'), ('${uuid(15)}','${company}','10.12.01');
    INSERT INTO financial_accounts VALUES
      ('${mirror}','espelho',true,'${partner}'), ('${bank}','banco',false,null),
      ('${card}','cartão',null,null);
    INSERT INTO event_partners VALUES ('${partner}','${uuid(20)}','${uuid(30)}');
    -- Legado criado ANTES da 0318: as quatro guardas não validam dados para trás.
    INSERT INTO transactions (id,company_id,type,category_id,account_id,transitory_reason) VALUES
      ('${legacyG1}','${company}','income','${g1}','${mirror}',null),
      ('${legacyG2}','${company}','income','${g2}','${bank}',null),
      ('${legacyG3}','${company}','income','${cardCategory}','${card}','carga_cartao');
    INSERT INTO transaction_payments (id,transaction_id,company_id,amount,payment_date,payment_method)
      VALUES ('${legacyLeg}','${legacyG1}','${company}',10,'2026-10-01','compensation');
    GRANT SELECT, INSERT, UPDATE, DELETE ON transactions, transaction_payments, transaction_offsets
      TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  `);

  for (const [path, name] of [
    ['drizzle/migrations/0295_partner_aporte_mirror_descricao_sem_prefixo.sql', 'sync_partner_aporte_mirror'],
    [sharedSource, 'sync_shared_cost_mirror'],
    ['supabase/manual/0298_issue418_card_load_category_by_company.sql', 'card_load_on_out_paid'],
    [paidSource, '_paid_guard_is_exempt'], [paidSource, 'materialize_paid_amount_payment'],
    [offsetSource, '_derive_paid_amount'], [offsetSource, 'sync_paid_amount_from_payments'],
    [offsetSource, '_apply_transaction_offset'], [offsetSource, '_reverse_transaction_offsets_for'],
    [offsetSource, 'apply_transaction_offsets'],
  ]) {
    await db.exec(sourceFunction(path, name));
  }
  // Reproduz nomes, eventos e listas UPDATE OF da captura Live, sem os inventar.
  const functionNames = ['sync_partner_aporte_mirror()', 'sync_shared_cost_mirror()',
    'card_load_on_out_paid()', 'materialize_paid_amount_payment()', 'apply_transaction_offsets()',
    'sync_paid_amount_from_payments()'];
  for (const name of functionNames) {
    const triggers = live.triggers.filter((t) => t.function === name);
    expect(triggers.length, `triggers Live de ${name}`).toBeGreaterThan(0);
    for (const trigger of triggers) await db.exec(trigger.definition);
  }
  await db.exec(`
    GRANT EXECUTE ON FUNCTION public._apply_transaction_offset(uuid,uuid) TO authenticated;
    -- RPC sintética SECDEF: prova o contexto de dono das duas RPCs do despacho,
    -- sem fingir reproduzir os seus restantes fluxos de negócio.
    CREATE FUNCTION public.test_secdef_compensation(p_tx uuid) RETURNS name
      LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
    BEGIN
      INSERT INTO transaction_payments (transaction_id,company_id,amount,payment_date,payment_method)
        VALUES (p_tx,'${company}',10,'2026-10-01','compensation');
      RETURN current_user;
    END $$;
    REVOKE ALL ON FUNCTION public.test_secdef_compensation(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.test_secdef_compensation(uuid) TO authenticated;
  `);
  beforeInstall = await snapshot();
  proofBefore = (await db.query(beforeCounts)).rows;
  await db.exec(migration);
  afterInstall = await snapshot();
  proofAfter = (await db.query(afterCounts)).rows;
}, 60_000);

beforeEach(async () => { await db.exec('BEGIN'); });
afterEach(async () => { await db.exec('ROLLBACK'); });
afterAll(async () => { await db?.close(); });

describe('#419 — 0318 preparada, G1–G4 em PGlite', () => {
  it('mantém bytes idênticos, rollback comentado e instalação sem alterar as linhas existentes', () => {
    expect(readFileSync(migrationPath).equals(readFileSync(manualPath))).toBe(true);
    expect(rollback.trim().split('\n').every((line) => line.startsWith('-- '))).toBe(true);
    expect(migration).toContain('Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim, depois da 0298');
    expect(afterInstall).toEqual(beforeInstall);
    expect(afterCounts).toBe(beforeCounts);
    expect(proofAfter).toEqual(proofBefore);
  });

  it('prova SECDEF/INVOKER, search_path, ACL e eventos das duas guardas pelo catálogo', async () => {
    expect((await db.query(`SELECT proname, prosecdef, proconfig,
      has_function_privilege('anon', oid, 'EXECUTE') AS anon,
      has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated,
      obj_description(oid, 'pg_proc') IS NOT NULL AS comentada
      FROM pg_proc WHERE proname IN ('guard_automatism_rows','guard_manual_compensation_leg') ORDER BY proname`)).rows)
      .toEqual([
        { proname: 'guard_automatism_rows', prosecdef: true, proconfig: ['search_path=public'], anon: false, authenticated: false, comentada: true },
        { proname: 'guard_manual_compensation_leg', prosecdef: false, proconfig: ['search_path=public'], anon: false, authenticated: false, comentada: true },
      ]);
    const { rows } = await db.query<{ definition: string }>(`SELECT pg_get_triggerdef(oid) AS definition
      FROM pg_trigger WHERE tgname IN ('zz_guard_automatism_rows','zz_guard_manual_compensation_leg') ORDER BY tgname`);
    expect(rows.map((r) => r.definition)).toEqual([
      'CREATE TRIGGER zz_guard_automatism_rows BEFORE INSERT OR UPDATE OF type, category_id, account_id, transitory_reason ON public.transactions FOR EACH ROW EXECUTE FUNCTION guard_automatism_rows()',
      'CREATE TRIGGER zz_guard_manual_compensation_leg BEFORE INSERT OR UPDATE OF payment_method, offset_id ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION guard_manual_compensation_leg()',
    ]);
  });

  it('executa toda a prova activa como SELECT e sinaliza a coluna opcional em falta', async () => {
    const active = proof.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
    for (const statement of active.split(';').filter((part) => part.trim())) {
      expect(statement.trim()).toMatch(/^(SELECT|WITH)\b/i);
    }
    await db.exec(active);
    await db.exec('ALTER TABLE transaction_payments DROP COLUMN offset_group_id');
    const [columns] = await db.exec(active);
    expect(columns.rows).toContainEqual({ tabela: 'transaction_payments', coluna: 'offset_group_id', presente: false, tipo: null });
  });

  it.each([
    ['G1', g1, mirror, null], ['G2', g2, bank, null], ['G3', cardCategory, card, 'carga_cartao'],
  ] as const)('recusa INSERT directo %s com P0001 e a mensagem exacta', async (guard, category, account, reason) => {
    await asRole('authenticated', async () => {
      await refuses(`INSERT INTO transactions (type,category_id,account_id,transitory_reason)
        VALUES ('income',$1,$2,$3)`, messages[guard], [category, account, reason]);
    });
  });

  it.each(['authenticated', 'anon', 'service_role'] as const)('G4 recusa API directa como %s, mesmo com created_by forjado', async (role) => {
    await asRole(role, async () => {
      await refuses(`INSERT INTO transaction_payments
        (transaction_id,amount,payment_date,payment_method,created_by)
        VALUES ($1,10,'2026-10-01','compensation','base D-ERP157')`, messages.G4, [legacyG1]);
    });
  });

  it('aceita UPDATE das quatro linhas anteriores à 0318, incluindo colunas vigiadas', async () => {
    await asRole('authenticated', async () => {
      await db.query(`UPDATE transactions SET type=type, category_id=category_id,
        account_id=account_id, transitory_reason=transitory_reason, description='legado editado'
        WHERE id IN ($1,$2,$3)`, [legacyG1, legacyG2, legacyG3]);
      await db.query(`UPDATE transaction_payments SET payment_method=payment_method,offset_id=offset_id,
        notes='legado editado' WHERE id=$1`, [legacyLeg]);
    });
    expect((await db.query("SELECT count(*)::int AS n FROM transactions WHERE description='legado editado'")).rows).toEqual([{ n: 3 }]);
    expect((await db.query('SELECT notes FROM transaction_payments WHERE id=$1', [legacyLeg])).rows).toEqual([{ notes: 'legado editado' }]);
  });

  it.each([
    ['G1', { type: 'expense', category: g1, account: mirror }, "type='income'"],
    ['G1', { category: ordinary, account: mirror }, `category_id='${g1}'`],
    ['G1', { category: g1, account: bank }, `account_id='${mirror}'`],
    ['G2', { type: 'expense', category: g2 }, "type='income'"],
    ['G2', { category: null }, `category_id='${g2}'`],
    ['G3', { type: 'expense', reason: 'carga_cartao' }, "type='income'"],
    ['G3', { reason: null }, "transitory_reason='carga_cartao'"],
  ] as const)('recusa UPDATE que entra no caso %s: %s → %s', async (guard, options, assignment) => {
    await asRole('authenticated', async () => {
      const tx = await insertTx(options);
      await refuses(`UPDATE transactions SET ${assignment} WHERE id=$1`, messages[guard], [tx]);
    });
  });

  it('G1 aceita receitas 10.1.01 fora de conta-espelho e despesas nas rubricas protegidas', async () => {
    await asRole('authenticated', async () => {
      for (const account of [bank, card, null]) await insertTx({ category: g1, account });
      await insertTx({ type: 'expense', category: g1, account: mirror });
      await insertTx({ type: 'expense', category: g2 });
    });
  });

  it('avalia OLD por caso: legado de G1 não permite entrar em G2/G3', async () => {
    await asRole('authenticated', async () => {
      await refuses('UPDATE transactions SET category_id=$1 WHERE id=$2', messages.G2, [g2, legacyG1]);
      await refuses("UPDATE transactions SET transitory_reason='carga_cartao' WHERE id=$1", messages.G3, [legacyG1]);
      await db.query('UPDATE transactions SET category_id=$1 WHERE id=$2', [uuid(14), legacyG1]);
      await db.query('UPDATE transactions SET category_id=$1 WHERE id=$2', [uuid(15), legacyG2]);
      await db.query("UPDATE transactions SET type='expense' WHERE id=$1", [legacyG1]);
      await refuses("UPDATE transactions SET type='income' WHERE id=$1", messages.G1, [legacyG1]);
    });
  });

  it('despesa paga na conta-espelho gera aporte, ponte e movimento de capital pelos automatismos reais', async () => {
    await asRole('authenticated', async () => {
      const tx = await insertTx({ type: 'expense', account: mirror, status: 'paid', paid: 100 });
      // As tabelas auxiliares não estão acessíveis à API; a guarda G1 é SECDEF.
      expect((await db.query(`SELECT type,category_id,account_id,paid_amount,event_id,supplier_id
        FROM transactions WHERE id<>$1 AND description='despesa de teste' AND type='income'`, [tx])).rows)
        .toEqual([{ type: 'income', category_id: g1, account_id: mirror, paid_amount: '100.00', event_id: uuid(20), supplier_id: uuid(30) }]);
      await db.query('UPDATE transactions SET amount=80,paid_amount=80 WHERE id=$1', [tx]);
    });
    expect((await db.query(`SELECT t.paid_amount,m.aporte_transaction_id=c.transaction_id AS linked_capital,c.kind,c.flow
      FROM partner_aporte_mirror m JOIN transactions t ON t.id=m.aporte_transaction_id
      JOIN partner_capital_moves c ON c.transaction_id=t.id`)).rows)
      .toEqual([{ paid_amount: '80.00', linked_capital: true, kind: 'aporte', flow: 'partner_settlement' }]);
  });

  it('custo partilhado pago gera receita 10.12.01 e ponte pela função real', async () => {
    await asRole('authenticated', async () => {
      await insertTx({ type: 'expense', status: 'paid', paid: 100, sharedAccount: bank });
    });
    expect((await db.query(`SELECT t.type,t.category_id,t.paid_amount,t.account_id,t.exclude_from_result
      FROM shared_cost_mirror m JOIN transactions t ON t.id=m.mirror_transaction_id`)).rows)
      .toEqual([{ type: 'income', category_id: g2, paid_amount: '100.00', account_id: bank, exclude_from_result: true }]);
  });

  it('aceita saída despesa carga_cartao e cria a entrada só ao ficar paga pela 0298 real', async () => {
    let tx: string;
    await asRole('authenticated', async () => { tx = await insertTx({ type: 'expense', reason: 'carga_cartao', category: cardCategory }); });
    await db.exec(`INSERT INTO card_sessions VALUES ('${uuid(300)}','${card}');
      INSERT INTO card_session_loads VALUES ('${uuid(301)}','${uuid(300)}','${bank}','${tx!}',NULL,100,'2026-10-01')`);
    expect((await db.query('SELECT in_transaction_id FROM card_session_loads')).rows).toEqual([{ in_transaction_id: null }]);
    await asRole('authenticated', async () => {
      await db.query("UPDATE transactions SET status='paid',paid_amount=100 WHERE id=$1", [tx!]);
    });
    expect((await db.query(`SELECT t.type,t.category_id,t.transitory_reason,t.account_id,t.paid_amount
      FROM card_session_loads l JOIN transactions t ON t.id=l.in_transaction_id`)).rows)
      .toEqual([{ type: 'income', category_id: cardCategory, transitory_reason: 'carga_cartao', account_id: card, paid_amount: '100.00' }]);
  });

  it('materialize_paid_amount_payment real cria compensation sem ligação a partir de AFTER', async () => {
    let tx: string;
    await asRole('authenticated', async () => { tx = await insertTx({ type: 'expense', account: null, status: 'paid', paid: 100 }); });
    expect((await db.query(`SELECT payment_method,offset_id,offset_group_id,created_by,amount
      FROM transaction_payments WHERE transaction_id=$1`, [tx!])).rows)
      .toEqual([{ payment_method: 'compensation', offset_id: null, offset_group_id: null, created_by: 'base D-ERP157', amount: '100.00' }]);
  });

  it('aceita perna ligada por offset_id e o automatismo _apply_transaction_offset real', async () => {
    const receivable = await insertTx();
    const payable = await insertTx({ type: 'expense' });
    await db.query('INSERT INTO transaction_offsets VALUES ($1,$2,$3,25)', [uuid(400), receivable, payable]);
    await asRole('authenticated', async () => {
      // INSERT real dispara apply_transaction_offsets com o trigger da captura Live.
      await insertLeg(receivable, 'transfer');
    });
    const legs = await db.query<{ offset_id: string; payment_method: string; amount: string }>(`SELECT offset_id,payment_method,amount
      FROM transaction_payments WHERE transaction_id=$1`, [payable]);
    expect(legs.rows).toEqual([{ offset_id: uuid(400), payment_method: 'compensation', amount: '25.00' }]);
    await asRole('authenticated', async () => {
      // Ligação explícita também autoriza o caminho invoker directo (profundidade 1).
      await insertLeg(payable, 'compensation', uuid(400));
    });
  });

  it('aceita offset_group_id, função SECDEF de teste e AFTER invoker sem ligação', async () => {
    const tx = await insertTx({ type: 'expense' });
    // AFTER INVOKER isola a isenção de profundidade da isenção de current_user.
    await db.exec(`CREATE TABLE test_after_source (transaction_id uuid);
      CREATE FUNCTION public.test_after_compensation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
      BEGIN
        INSERT INTO transaction_payments (transaction_id,company_id,amount,payment_date,payment_method)
          VALUES (NEW.transaction_id,'${company}',10,'2026-10-01','compensation');
        RETURN NEW;
      END $$;
      CREATE TRIGGER test_after AFTER INSERT ON test_after_source FOR EACH ROW EXECUTE FUNCTION test_after_compensation();
      GRANT INSERT ON test_after_source TO authenticated;`);
    await asRole('authenticated', async () => {
      await insertLeg(tx, 'compensation', null, uuid(401));
      const result = await db.query<{ owner: string }>('SELECT test_secdef_compensation($1) AS owner', [tx]);
      expect(result.rows[0].owner).toBe('postgres');
      await db.query('INSERT INTO test_after_source VALUES ($1)', [tx]);
    });
    expect((await db.query(`SELECT count(*)::int AS n FROM transaction_payments
      WHERE transaction_id=$1 AND payment_method='compensation'`, [tx])).rows).toEqual([{ n: 3 }]);
  });

  it('G4 recusa UPDATE transfer→compensation e remoção de offset_id, preservando legado sem ligação', async () => {
    const tx = await insertTx({ type: 'expense' });
    await db.query('INSERT INTO transaction_offsets VALUES ($1,$2,$3,10)', [uuid(400), legacyG1, tx]);
    await asRole('authenticated', async () => {
      const transfer = (await insertLeg(tx, 'transfer')).rows[0].id;
      await refuses("UPDATE transaction_payments SET payment_method='compensation' WHERE id=$1", messages.G4, [transfer]);
      const linked = (await insertLeg(tx, 'compensation', uuid(400))).rows[0].id;
      await refuses('UPDATE transaction_payments SET offset_id=NULL WHERE id=$1', messages.G4, [linked]);
      await db.query('UPDATE transaction_payments SET offset_id=offset_id WHERE id=$1', [legacyLeg]);
    });
  });

  it('G4 funciona num catálogo sem offset_group_id, sem referência directa à coluna', async () => {
    await db.exec('ALTER TABLE transaction_payments DROP COLUMN offset_group_id');
    await asRole('authenticated', async () => {
      await refuses(`INSERT INTO transaction_payments (transaction_id,amount,payment_date,payment_method)
        VALUES ($1,10,'2026-10-01','compensation')`, messages.G4, [legacyG1]);
      await db.query('UPDATE transaction_payments SET payment_method=payment_method WHERE id=$1', [legacyLeg]);
      await db.query('SELECT test_secdef_compensation($1)', [legacyG1]);
    });
  });

  it('rollback descomentado remove só G1–G4 e volta a aceitar G1 directo', async () => {
    // BEGIN/COMMIT do roteiro ficam no controlo transaccional deste teste.
    const executable = rollback.split('\n').map((line) => line.slice(3))
      .filter((line) => /^DROP (TRIGGER|FUNCTION) IF EXISTS /.test(line)).join('\n');
    expect(executable.split('\n')).toHaveLength(4);
    await db.exec(executable);
    expect((await db.query(`SELECT count(*)::int AS n FROM pg_trigger
      WHERE tgname IN ('zz_guard_automatism_rows','zz_guard_manual_compensation_leg')`)).rows).toEqual([{ n: 0 }]);
    await asRole('authenticated', async () => { await insertTx({ category: g1, account: mirror }); });
  });
});
