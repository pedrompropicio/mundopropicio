// @vitest-environment node
// SQL apenas em PGlite em memória, sem credenciais, rede ou bases externas.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migrationPath = 'drizzle/migrations/0320_issue312_rubrica_2615_outras_empresas.sql';
const manualPath = 'supabase/manual/0320_issue312_rubrica_2615_outras_empresas.sql';
const rollbackPath = 'supabase/manual/rollback_0320_issue312_rubrica_2615_outras_empresas_comentado.sql';
const migration = readFileSync(manualPath, 'utf8');
const rollback = readFileSync(rollbackPath, 'utf8');
const proof = readFileSync('docs/testes/issue312/prova-janela.sql', 'utf8');
const standardName = 'Encargos Bancários e Taxas de Transferência';
const mp = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
const company = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const category = (n: number) => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const statements = (sql: string) => sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
const rollbackSql = (previousIds = [category(11), category(14)]) => rollback
  .slice(rollback.indexOf('-- DELETE FROM'))
  .replace(/^-- /gm, '')
  .replace('__IDS_2615_ANTES__', previousIds.map(id => `'${id}'::uuid`).join(', '));

type Category = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  is_active: boolean;
  event_required: boolean;
  allocate_to_active_event: boolean;
};

describe('#312 — artefactos preparados para a janela', () => {
  it('mantém as cópias byte a byte e um único comando de criação sem ID fixo', () => {
    expect(readFileSync(migrationPath).equals(readFileSync(manualPath))).toBe(true);
    expect(migration).toContain('Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim');
    expect(migration).toContain(rollbackPath);
    expect(statements(migration)).toHaveLength(1);
    expect(statements(migration)[0]).toMatch(/^INSERT INTO public\.account_categories \(company_id, code,/);
    expect(statements(migration)[0]).toMatch(/ON CONFLICT \(company_id, code\) DO NOTHING$/);
    expect(statements(migration)[0]).not.toMatch(/\b(UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
    expect(migration).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('mantém cada linha do rollback comentada e a prova limitada a SELECT', () => {
    expect(rollback.trimEnd().split('\n').every(line => line.startsWith('-- '))).toBe(true);
    expect(rollback).toContain('__IDS_2615_ANTES__');
    expect(statements(rollbackSql())).toHaveLength(1);
    expect(statements(rollbackSql())[0]).toMatch(/^DELETE FROM public\.account_categories/);
    expect(statements(proof)).toHaveLength(7);
    for (const statement of statements(proof)) {
      expect(statement).toMatch(/^SELECT\b/);
      expect(statement).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|INTO)\b/i);
    }
  });

  it('regista a regra no procedimento entre os Passos 4 e 5 e na tabela do Passo 1', () => {
    const proc = readFileSync('docs/procedimentos/PROC-entrada-de-dados.md', 'utf8');
    const section = proc.split('## Encargos bancários de pagamentos\n')[1]?.split('## Passo 5')[0];
    expect(proc.indexOf('## Encargos bancários de pagamentos')).toBeGreaterThan(proc.indexOf('## Passo 4'));
    expect(proc).toContain('| Taxa bancária de pagamento de evento | 2.6.15 + linha de BP |');
    expect(section).toContain('2.6.15 — Encargos Bancários e Taxas de Transferência');
    expect(section).toContain('linha de BP por evento na 2.6.15 no momento do pagamento');
    expect(section).toContain('formalidade **fechado**');
    expect(section).toContain('IVA do documento bancário');
    expect(section).toContain('10.6.01 — Taxas e Encargos Bancários');
    for (const text of ['excedido que o fecho não vê', '80,40 €', 'Anitta', 'D-ERP255', 'D-ERP347', '#312']) {
      expect(section).toContain(text);
    }
  });
});

describe('#312 — migração e rollback em PGlite', () => {
  let db: PGlite;
  const all = async () => (await db.query<Category>('SELECT * FROM public.account_categories ORDER BY id')).rows;
  const apply = () => db.exec(readFileSync(manualPath, 'utf8'));

  beforeAll(async () => {
    db = new PGlite();
    // Colunas/defaults, CHECKs e unicidade relevantes do catálogo canon12f.
    // Empresa corrente nula: omitir company_id falha, em vez de mascarar fuga entre empresas.
    await db.exec(`
      CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE TABLE public.companies (id uuid PRIMARY KEY, display_name text NOT NULL, country text NOT NULL);
      CREATE TABLE public.account_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL,
        name text NOT NULL,
        type text NOT NULL CHECK (type IN ('income', 'expense')),
        parent_id uuid REFERENCES public.account_categories(id),
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        event_required boolean NOT NULL DEFAULT true,
        company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
        allocate_to_active_event boolean NOT NULL DEFAULT false,
        ebitda_class text CHECK (ebitda_class IN ('financeiro', 'imposto_rendimento', 'amortizacao')),
        UNIQUE (company_id, code)
      );
      CREATE TABLE public.transactions (category_id uuid REFERENCES public.account_categories(id));
      CREATE TABLE public.event_forecasts (category_id uuid REFERENCES public.account_categories(id));
      CREATE TABLE public.recurring_transactions (category_id uuid REFERENCES public.account_categories(id));
    `);
    for (const [n, label, country] of [[1, 'A', 'PT'], [2, 'B', 'BR'], [3, 'C', 'PT'], [4, 'D', 'BR'], [5, 'E', 'PT']] as const) {
      await db.query('INSERT INTO public.companies VALUES ($1, $2, $3)', [company(n), label, country]);
    }
    for (const n of [1, 2, 4, 5]) {
      await db.query(`INSERT INTO public.account_categories
        (id, company_id, code, name, type, is_active, event_required)
        VALUES ($1, $2, '2.6', 'Operação', 'expense', $3, false)`, [category(n), company(n), n !== 5]);
    }
    await db.query(`INSERT INTO public.account_categories (id, company_id, code, name, type, parent_id)
      VALUES ($1, $2, '2.6.15', $3, 'expense', $4)`, [category(11), company(1), standardName, category(1)]);
    await db.query(`INSERT INTO public.account_categories
      (id, company_id, code, name, type, parent_id, is_active, event_required)
      VALUES ($1, $2, '2.6.15', 'Nome próprio da empresa D', 'expense', $3, false, false)`,
    [category(14), company(4), category(4)]);
  }, 30000);

  beforeEach(async () => { await db.exec('BEGIN'); });
  afterEach(async () => { await db.exec('ROLLBACK'); });
  afterAll(async () => { await db?.close(); });

  it('só B ganha 2.6.15, com pai próprio e flags certas; A, C, D e E ficam intactas', async () => {
    const before = await all();
    await apply();
    const after = await all();
    const added = after.filter(row => !before.some(old => old.id === row.id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      company_id: company(2), code: '2.6.15', name: standardName, type: 'expense',
      parent_id: category(2), is_active: true, event_required: true, allocate_to_active_event: false,
    });
    expect(after.filter(row => row.id !== added[0].id)).toEqual(before);
    expect(after).toHaveLength(before.length + 1);
    for (const n of [3, 5]) expect(after.some(row => row.company_id === company(n) && row.code === '2.6.15')).toBe(false);
  });

  it('uma segunda execução preserva contagens, IDs e todos os campos', async () => {
    await apply();
    const first = await all();
    await apply();
    expect(await all()).toEqual(first);
  });

  it('não cria rubrica sob uma 2.6 de receita', async () => {
    await db.query("UPDATE public.account_categories SET type = 'income' WHERE id = $1", [category(2)]);
    const before = await all();
    await apply();
    expect(await all()).toEqual(before);
  });

  it('o rollback com IDs anteriores A e D apaga só a rubrica criada de B', async () => {
    const before = await all();
    await apply();
    await db.exec(rollbackSql());
    expect(await all()).toEqual(before);
  });

  it.each(['transactions', 'event_forecasts', 'recurring_transactions'])('o rollback preserva a rubrica usada em %s', async table => {
    await apply();
    await db.exec(`INSERT INTO public.${table} (category_id)
      SELECT id FROM public.account_categories WHERE company_id = '${company(2)}' AND code = '2.6.15'`);
    const before = await all();
    await db.exec(rollbackSql());
    expect(await all()).toEqual(before);
  });

  it('o rollback preserva uma rubrica nova da MP mesmo sem a incluir nos IDs anteriores', async () => {
    await db.query("INSERT INTO public.companies VALUES ($1, 'MP', 'PT')", [mp]);
    await db.query(`INSERT INTO public.account_categories (id, company_id, code, name, type)
      VALUES ($1, $2, '2.6', 'Operação', 'expense')`, [category(6), mp]);
    await apply();
    const mpBefore = (await all()).filter(row => row.company_id === mp);
    expect(mpBefore).toHaveLength(2);
    await db.exec(rollbackSql());
    expect((await all()).filter(row => row.company_id === mp)).toEqual(mpBefore);
    expect((await all()).some(row => row.company_id === company(2) && row.code === '2.6.15')).toBe(false);
  });

  it('o rollback preserva uma rubrica nova cujo nome tenha mudado', async () => {
    await apply();
    await db.query("UPDATE public.account_categories SET name = 'Nome revisto' WHERE company_id = $1 AND code = '2.6.15'", [company(2)]);
    const before = await all();
    await db.exec(rollbackSql());
    expect(await all()).toEqual(before);
  });

  it('outra FK impede o rollback em vez de ser removida ou contornada', async () => {
    await apply();
    await db.query(`INSERT INTO public.account_categories (company_id, code, name, type, parent_id)
      SELECT company_id, '2.6.15.01', 'Filha', 'expense', id FROM public.account_categories
      WHERE company_id = $1 AND code = '2.6.15'`, [company(2)]);
    await expect(db.exec(rollbackSql())).rejects.toThrow(/foreign key constraint/i);
  });

  it('a prova mede candidatos, nomes divergentes, pais, flags e totais antes/depois', async () => {
    const before = await db.exec(proof);
    expect(before[0].rows).toHaveLength(5);
    expect(before[1].rows).toMatchObject([{ company_id: company(4), name: 'Nome próprio da empresa D' }]);
    expect(before[2].rows[0]).toEqual({ total_2615_antes: 2, ids_2615_antes: `'${category(11)}'::uuid, '${category(14)}'::uuid` });
    expect(before[3].rows).toMatchObject([{ company_id: company(2), pai_26_id: category(2) }]);
    expect(before[4].rows[0]).toEqual({ insercoes_esperadas: 1 });
    expect(before[6].rows[0]).toEqual({ total_categorias: 6, total_2615: 2, empresas_com_2615: 2 });
    await apply();
    const after = await db.exec(proof);
    expect(after[3].rows).toEqual([]);
    expect(after[4].rows[0]).toEqual({ insercoes_esperadas: 0 });
    expect(after[5].rows.find(row => (row as { company_id: string }).company_id === company(2))).toMatchObject({
      elegivel_0320: true, quantidade_2615: 1, uma_2615: true, pai_26_da_empresa: true,
      evento_obrigatorio: true, rubrica_activa: true, sem_alocacao_automatica: true,
    });
    expect(after[6].rows[0]).toEqual({ total_categorias: 7, total_2615: 3, empresas_com_2615: 3 });
  });
});
