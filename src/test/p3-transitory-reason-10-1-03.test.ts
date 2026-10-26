// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';

const sql = readFileSync('supabase/manual/0272_p3_transitory_reason_10_1_03.sql', 'utf8');
const rollback = readFileSync('supabase/manual/rollback_0272_p3_transitory_reason_10_1_03.sql', 'utf8')
  .split('\n').filter(line => line.startsWith('-- ')).slice(2).map(line => line.slice(3)).join('\n') + '\n';
function definition(source: string) {
  const match = source.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/);
  if (!match) throw new Error('Missing function definition');
  return match[0].slice(0, -1) + '\n';
}
const original = definition(rollback);
const branch = "        WHEN v_code = '10.1.03' THEN 'distribuicao_resultado'\n";
const liveCheck = `CHECK (((transitory_reason IS NULL) OR (transitory_reason = ANY (ARRAY['partner_advance'::text, 'repasse'::text, 'caucao'::text, 'emprestimo_socio'::text, 'carga_cartao'::text, 'aporte_socio'::text, 'entrada_a_repassar'::text, 'devolucao_socio'::text]))))`;
const requiredCheck = 'CHECK (((NOT is_transitory) OR (transitory_reason IS NOT NULL)))';
const reasons = ['partner_advance','repasse','caucao','emprestimo_socio','carga_cartao','aporte_socio','entrada_a_repassar','devolucao_socio'];
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE account_categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text);
    CREATE TABLE transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid, is_transitory boolean DEFAULT false, transitory_reason text);
    ALTER TABLE transactions ADD CONSTRAINT transactions_transitory_reason_domain ${liveCheck};
    ALTER TABLE transactions ADD CONSTRAINT transactions_transitory_reason_required ${requiredCheck};
    INSERT INTO account_categories(code) VALUES ('10.1.01'),('10.1.03'),('10.1.04'),('10.1.09'),('1.2.01');`);
  await db.exec(original);
  await db.exec(`CREATE TRIGGER trg_force_transitory_capital BEFORE INSERT OR UPDATE OF category_id,is_transitory ON transactions FOR EACH ROW EXECUTE FUNCTION force_transitory_for_capital_branch()`);
  await db.exec(sql);
}, 60000);
afterAll(async () => { await db?.close(); });
async function insert(code: string) {
  return (await db.query<{is_transitory: boolean; transitory_reason: string | null}>(
    `INSERT INTO transactions(category_id,transitory_reason) SELECT id,'entrada_a_repassar' FROM account_categories WHERE code=$1 RETURNING is_transitory,transitory_reason`, [code])).rows[0];
}
async function check(name: string) {
  return (await db.query<{def:string}>(`SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='transactions'::regclass AND conname=$1`,[name])).rows[0]?.def;
}
describe('P3 passo 2 — CHECK e função atómicos, candidato NÃO aplicado', () => {
  it('rollback contém função byte-idêntica ao md5 Live; candidato só acrescenta 10.1.03', () => {
    expect(createHash('md5').update(original).digest('hex')).toBe('cf9e97d154a437ea66139ce0b04873ed');
    expect(definition(sql).replace(branch, '')).toBe(original);
    expect(definition(sql).split(branch)).toHaveLength(2);
  });
  it('CHECK real estendido mantém os oito motivos e inclui apenas o novo', async () => {
    expect(await check('transactions_transitory_reason_domain')).toBe(liveCheck.replace("'devolucao_socio'::text]", "'devolucao_socio'::text, 'distribuicao_resultado'::text]"));
    for (const reason of reasons) await db.query(`INSERT INTO transactions(is_transitory,transitory_reason) VALUES(true,$1)`,[reason]);
  });
  it('10.1.03 passa no CHECK real estendido e deriva distribuicao_resultado', async () => {
    expect(await insert('10.1.03')).toEqual({is_transitory:true,transitory_reason:'distribuicao_resultado'});
  });
  it.each(['10.1.01','10.1.09'])('%s mantém aporte_socio', async code => {
    expect(await insert(code)).toEqual({is_transitory:true,transitory_reason:'aporte_socio'});
  });
  it('10.1.04 mantém emprestimo_socio', async () => {
    expect(await insert('10.1.04')).toEqual({is_transitory:true,transitory_reason:'emprestimo_socio'});
  });
  it('fora de capital não força transitória e limpa o motivo', async () => {
    expect(await insert('1.2.01')).toEqual({is_transitory:false,transitory_reason:null});
  });
  it('CHECK required permanece idêntico e motivo vazio continua recusado', async () => {
    expect(await check('transactions_transitory_reason_required')).toBe(requiredCheck);
    await expect(db.exec(`INSERT INTO transactions(is_transitory) VALUES(true)`)).rejects.toThrow(/transactions_transitory_reason_required/);
  });
  it('motivo desconhecido continua recusado pelo domínio', async () => {
    await expect(db.exec(`INSERT INTO transactions(is_transitory,transitory_reason) VALUES(true,'inventado')`)).rejects.toThrow(/transactions_transitory_reason_domain/);
  });
  it('editar sem mudar rubrica reenvia e preserva o motivo novo', async () => {
    const id = (await db.query<{id:string}>(`INSERT INTO transactions(category_id) SELECT id FROM account_categories WHERE code='10.1.03' RETURNING id`)).rows[0]?.id;
    expect(id).toBeDefined();
    const row = (await db.query<{transitory_reason:string}>(`UPDATE transactions SET category_id=category_id,is_transitory=true,transitory_reason='distribuicao_resultado' WHERE id=$1 RETURNING transitory_reason`,[id])).rows[0];
    expect(row?.transitory_reason).toBe('distribuicao_resultado');
  });
  it('mudança de rubrica para 10.1.03 deriva o novo motivo', async () => {
    await db.exec(`UPDATE transactions SET category_id=(SELECT id FROM account_categories WHERE code='10.1.03') WHERE category_id=(SELECT id FROM account_categories WHERE code='1.2.01')`);
    expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM transactions WHERE category_id=(SELECT id FROM account_categories WHERE code='10.1.03') AND transitory_reason IS DISTINCT FROM 'distribuicao_resultado'`)).rows[0]?.n).toBe(0);
  });
  it('rollback com motivos novos falha inteiro, mantendo função e CHECK novos', async () => {
    await expect(db.exec(rollback)).rejects.toThrow(/transactions_transitory_reason_domain/);
    await db.exec('ROLLBACK;');
    expect(await insert('10.1.03')).toEqual({is_transitory:true,transitory_reason:'distribuicao_resultado'});
    expect(await check('transactions_transitory_reason_domain')).toContain("'distribuicao_resultado'::text");
  });
  it('rollback sem motivos novos restaura CHECK e função Live byte a byte', async () => {
    await db.exec(`DELETE FROM transactions WHERE transitory_reason='distribuicao_resultado'`);
    await db.exec(rollback);
    expect(await check('transactions_transitory_reason_domain')).toBe(liveCheck);
    expect(await check('transactions_transitory_reason_required')).toBe(requiredCheck);
    const restored = (await db.query<{def:string}>(`SELECT pg_get_functiondef('force_transitory_for_capital_branch()'::regprocedure) def`)).rows[0]?.def;
    expect(restored).toBe(original);
    expect(await insert('10.1.03')).toEqual({is_transitory:true,transitory_reason:'aporte_socio'});
  });
});
