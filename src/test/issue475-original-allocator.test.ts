// @vitest-environment node
// Mathematical helper only. The old RPC is still NOT integrated or qualified.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { distributeInstallmentOriginal } from '../lib/installment-original';

let db: PGlite;
const sql = readFileSync('supabase/manual/issue475_original_allocator.INERTE.sql', 'utf8');
const max = 9007199254740991n;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql); // Execute the complete file bytes, never a copied function.
});
afterAll(async () => { await db?.close(); });

async function allocate(total: string, weights: string): Promise<bigint[]> {
  const result = await db.query<{ cents: string }>(`
    SELECT v::text AS cents
    FROM unnest(pg_temp.issue475_original_allocator($1::numeric,$2::numeric[]))
      WITH ORDINALITY AS u(v,pos) ORDER BY pos`, [total, weights]);
  return result.rows.map(row => BigInt(row.cents));
}
const array = (weights: bigint[]) => `{${weights.join(',')}}`;
// Parse the actual helper's decimal payload, without floating multiplication.
function payloadCents(value: number): bigint {
  const text = String(value);
  expect(text).toMatch(/^\d+(?:\.\d{1,2})?$/);
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function originalText(cents: bigint): string {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
function invariants(total: bigint, weights: bigint[], actual: bigint[]) {
  expect(actual).toHaveLength(weights.length);
  expect(actual.reduce((a, b) => a + b, 0n)).toBe(total);
  const sum = weights.reduce((a, b) => a + b, 0n);
  actual.forEach((value, i) => {
    expect(value >= 0n).toBe(true);
    if (sum > 0n) {
      const errorNumerator = value * sum - total * weights[i];
      expect(errorNumerator < sum && errorNumerator > -sum).toBe(true);
    }
  });
  // An awarded cent must outrank every unawarded cent; ties use input order.
  if (sum > 0n) weights.forEach((w, i) => weights.forEach((other, j) => {
    if (actual[i] * sum > total * w && actual[j] * sum <= total * other) {
      const ri = total * w % sum;
      const rj = total * other % sum;
      expect(ri > rj || (ri === rj && i < j)).toBe(true);
    }
  }));
}

describe('#475 inert exact original allocator (old RPC remains unchanged)', () => {
  it.each([
    ['10001', '{1,1,1}', [3334n,3334n,3333n]],
    ['10002', '{1,1,1}', [3334n,3334n,3334n]],
    ['10001', '{1,2,3}', [1667n,3334n,5000n]],
    ['1', '{1,1,1,1}', [1n,0n,0n,0n]],
    ['0', '{0,0}', [0n,0n]],
    ['0', '{1,2}', [0n,0n]],
    ['2', '{0,1,0,1,1}', [0n,1n,0n,1n,0n]],
    ['10002', '{68089}', [10002n]],
    ['5', '{1,1,1}', [2n,2n,1n]],
    ['10001', '{10001,20002,30003}', [1667n,3334n,5000n]],
    ['10001', '[0:2]={1,1,1}', [3334n,3334n,3333n]],
    ['1', '[-3:0]={0,1,1,0}', [0n,1n,0n,0n]],
    [String(max), `{${max}}`, [max]],
    [String(max), '{4503599627370495,4503599627370496}', [4503599627370495n,4503599627370496n]],
    [String(max), '{1,1,1}', [3002399751580331n,3002399751580330n,3002399751580330n]],
  ])('allocates %s with %s', async (total, weights, expected) => {
    expect(await allocate(total, weights)).toEqual(expected);
  });

  const invalid: [string | null, string | null][] = [
    ...[null,'-1','0.1','NaN','Infinity','-Infinity','9007199254740992']
      .map(total => [total, '{1}'] as [string | null, string]),
    ...[null,'{}','{{1,2},{3,4}}','{NULL}','{-1}','{0.1}','{NaN}',
      '{Infinity}','{-Infinity}','{9007199254740992}','{9007199254740991,1}','{0,0}']
      .map(weights => ['1', weights] as [string, string | null]),
    // Zero total must not bypass any weight validation.
    ...['{NULL}','{-1}','{0.1}','{NaN}','{Infinity}','{-Infinity}',
      '{9007199254740992}','{9007199254740991,1}','{}','{{1},{2}}']
      .map(weights => ['0', weights] as [string, string]),
  ];
  it.each(invalid)('rejects total %s / weights %s', async (total, weights) => {
    await expect(db.query('SELECT pg_temp.issue475_original_allocator($1::numeric,$2::numeric[])',
      [total, weights])).rejects.toMatchObject({ code: '22023' });
  });

  it('matches the real #471 helper and exact invariants in a deterministic common domain', async () => {
    let seed = 475;
    const next = () => (seed = (seed * 48271) % 2147483647);
    for (let n = 0; n < 120; n++) {
      const total = BigInt(next() % 1000001);
      const weights = Array.from({ length: 1 + next() % 9 }, () => BigInt(next() % 100000));
      if (weights.reduce((sum, w) => sum + w, 0n) === 0n) weights[0] = 1n;
      const actual = await allocate(String(total), array(weights));
      const client = distributeInstallmentOriginal(originalText(total), weights.map(w => Number(w) / 10000));
      expect(actual).toEqual(client.map(payloadCents));
      invariants(total, weights, actual);
    }
  });

  it('separates SQL integer acceptance from centsPayload number serialization safety', async () => {
    expect(await allocate(String(max), '{1}')).toEqual([max]);
    expect(() => distributeInstallmentOriginal('90071992547409.91', [1])).toThrow('limite seguro');
    // SQL-only proofs: intermediate product exceeds bigint; no transport parity claim.
    expect(max * max > 9223372036854775807n).toBe(true);
    const weights = [max - 1n, 1n];
    const actual = await allocate(String(max), array(weights));
    expect(actual).toEqual(weights);
    invariants(max, weights, actual);
  });

  it('is immutable invoker with fixed search_path and no PUBLIC or product-role execute grants', async () => {
    await db.exec('CREATE ROLE issue475_product_probe NOLOGIN');
    const result = await db.query(`SELECT p.prosecdef, p.provolatile, p.proconfig,
      has_function_privilege('issue475_product_probe',p.oid,'EXECUTE') AS probe_execute,
      EXISTS (SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
      FROM pg_proc p WHERE p.oid='pg_temp.issue475_original_allocator(numeric,numeric[])'::regprocedure`);
    expect(result.rows).toEqual([{ prosecdef: false, provolatile: 'i',
      proconfig: ['search_path=pg_catalog'], probe_execute: false, public_execute: false }]);
    const grants = await db.query<{ owner_only: boolean }>(`SELECT a.grantee=p.proowner AS owner_only
      FROM pg_proc p, LATERAL aclexplode(p.proacl) a
      WHERE p.oid='pg_temp.issue475_original_allocator(numeric,numeric[])'::regprocedure`);
    expect(grants.rows.length).toBeGreaterThan(0);
    expect(grants.rows.every(row => row.owner_only === true)).toBe(true);
  });
});
