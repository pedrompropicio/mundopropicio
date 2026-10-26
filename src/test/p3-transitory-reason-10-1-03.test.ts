// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';

const sql = readFileSync('supabase/manual/0272_p3_transitory_reason_10_1_03.sql', 'utf8');
const original = readFileSync('supabase/manual/rollback_0272_p3_transitory_reason_10_1_03.sql', 'utf8')
  .split('\n').slice(1).filter(line => line.startsWith('-- ')).map(line => line.slice(3)).join('\n') + '\n';
const branch = "        WHEN v_code = '10.1.03' THEN 'distribuicao_resultado'\n";
const liveCheck = `CHECK (((transitory_reason IS NULL) OR (transitory_reason = ANY (ARRAY['partner_advance'::text, 'repasse'::text, 'caucao'::text, 'emprestimo_socio'::text, 'carga_cartao'::text, 'aporte_socio'::text, 'entrada_a_repassar'::text, 'devolucao_socio'::text]))))`;
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE account_categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text);
    CREATE TABLE transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid, is_transitory boolean DEFAULT false, transitory_reason text);
    CREATE TABLE live_checked_transactions(LIKE transactions INCLUDING ALL);
    ALTER TABLE live_checked_transactions ADD CONSTRAINT transactions_transitory_reason_domain ${liveCheck};
    ALTER TABLE live_checked_transactions ADD CONSTRAINT transactions_transitory_reason_required CHECK ((NOT is_transitory) OR transitory_reason IS NOT NULL);
    INSERT INTO account_categories(code) VALUES ('10.1.01'),('10.1.03'),('10.1.04'),('10.1.09'),('1.2.01');`);
  await db.exec(sql);
  for (const table of ['transactions', 'live_checked_transactions']) {
    await db.exec(`CREATE TRIGGER trg_force_transitory_capital BEFORE INSERT OR UPDATE OF category_id,is_transitory ON ${table} FOR EACH ROW EXECUTE FUNCTION force_transitory_for_capital_branch()`);
  }
}, 60000);
afterAll(async () => { await db?.close(); });
async function insert(code: string, table = 'transactions') {
  return (await db.query<{is_transitory: boolean; transitory_reason: string | null}>(
    `INSERT INTO ${table}(category_id,transitory_reason) SELECT id,'entrada_a_repassar' FROM account_categories WHERE code=$1 RETURNING is_transitory,transitory_reason`, [code])).rows[0];
}
describe('P3 passo 2 — candidato NÃO aplicado; CHECK Live bloqueia', () => {
  it('definição original tem exatamente o md5 Live e só se acrescenta o ramo 10.1.03', () => {
    expect(createHash('md5').update(original).digest('hex')).toBe('cf9e97d154a437ea66139ce0b04873ed');
    expect(sql.replace(branch, '')).toBe(original);
    expect(sql.split(branch)).toHaveLength(2);
  });
  it('10.1.03 deriva distribuicao_resultado numa tabela sem o CHECK (teste isolado da função)', async () => {
    expect(await insert('10.1.03')).toEqual({ is_transitory: true, transitory_reason: 'distribuicao_resultado' });
  });
  it('CHECK real de Live recusa 10.1.03: candidato não é aplicável isoladamente', async () => {
    await expect(insert('10.1.03','live_checked_transactions')).rejects.toThrow(/transactions_transitory_reason_domain/);
    expect((await db.query<{n: number}>(`SELECT count(*)::int n FROM live_checked_transactions`)).rows[0]?.n).toBe(0);
  });
  it.each(['10.1.01','10.1.09'])('%s mantém aporte_socio e passa no CHECK Live', async code => {
    expect(await insert(code,'live_checked_transactions')).toEqual({is_transitory:true,transitory_reason:'aporte_socio'});
  });
  it('10.1.04 mantém emprestimo_socio e passa no CHECK Live', async () => {
    expect(await insert('10.1.04','live_checked_transactions')).toEqual({is_transitory:true,transitory_reason:'emprestimo_socio'});
  });
  it('fora de capital não força transitória e limpa o motivo', async () => {
    expect(await insert('1.2.01','live_checked_transactions')).toEqual({is_transitory:false,transitory_reason:null});
  });
  it('mudança de rubrica para 10.1.03 deriva o motivo novo', async () => {
    await db.exec(`UPDATE transactions SET category_id=(SELECT id FROM account_categories WHERE code='10.1.03')`);
    expect((await db.query<{transitory_reason:string}>(`SELECT transitory_reason FROM transactions`)).rows.every(row => row.transitory_reason==='distribuicao_resultado')).toBe(true);
  });
  it('rollback restaura a função original e 10.1.03 volta a aporte_socio', async () => {
    await db.exec(original);
    expect(await insert('10.1.03','live_checked_transactions')).toEqual({is_transitory:true,transitory_reason:'aporte_socio'});
  });
});
