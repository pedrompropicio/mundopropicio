// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const repairSql = readFileSync('supabase/manual/0321_issue213_camarim_file_url_prefix.sql', 'utf8');
const rollbackSql = readFileSync('supabase/manual/rollback_0321_issue213_camarim_file_url_prefix_comentado.sql', 'utf8');
const proofSql = readFileSync('docs/testes/issue213/prova-janela.sql', 'utf8');
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, '').trim();
const statements = (sql: string) => withoutComments(sql).split(';').map(s => s.trim()).filter(Boolean);
const proofStatements = statements(proofSql);

// Só o UUID da MP é real; documentos, transações, sessão e itens são sintéticos.
const company = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
const otherCompany = '10000000-0000-0000-0000-000000000002';
const txA = '6b58adf0-0000-0000-0000-000000000001';
const txB = '3ea19905-0000-0000-0000-000000000002';
const otherTx = '20000000-0000-0000-0000-000000000003';
const session = '30000000-0000-0000-0000-000000000001';
const itemA = '40000000-0000-0000-0000-000000000001';
const itemB = '40000000-0000-0000-0000-000000000002';
const id = (n: number) => `50000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const itemPath = (n: number) => `${session}/${itemA}/${n}-fixture.jpeg`;
const paths = [
  `${session}/${itemA}/1-fixture.jpeg`,
  `${session}/${itemB}/2-fixture.pdf`,
  `dossiers/${session}.html`,
  itemPath(4), itemPath(5), itemPath(6), itemPath(7),
];
const correctedIds = [id(1), id(2), id(3)];
type FixtureDocument = {
  id: string;
  transaction_id: string;
  company_id: string;
  file_url: string;
  name: string;
  is_accounting: boolean;
  partner_visible: boolean;
};
const quotedIds = (ids: string[]) => ids.map(value => `'${value}'`).join(', ');
const proofForIds = (ids: string[]) => proofSql.replace(
  'SELECT unnest(ARRAY[]::uuid[])',
  `SELECT unnest(ARRAY[${quotedIds(ids)}]::uuid[])`,
);

describe('Issue #213 — artefactos manuais 0321', () => {
  it('contém um único UPDATE, limitado à MP, ao prefixo, às transações e ao storage', () => {
    const sql = withoutComments(repairSql);
    expect(statements(repairSql)).toHaveLength(1);
    expect(sql.match(/\bUPDATE\b/gi)).toHaveLength(1);
    expect(sql).toMatch(/^UPDATE public\.transaction_documents td\s+SET file_url =/);
    expect(sql).toContain(`td.company_id = '${company}'`);
    expect(sql).toContain(`td.file_url LIKE 'camarim://${company}/%'`);
    expect(sql).toContain("td.transaction_id::text LIKE '6b58adf0-%'");
    expect(sql).toContain("td.transaction_id::text LIKE '3ea19905-%'");
    expect(sql).toMatch(/AND NOT EXISTS\s*\(\s*SELECT 1\s+FROM storage\.objects/);
    expect(sql).toMatch(/AND EXISTS\s*\(\s*SELECT 1\s+FROM storage\.objects/);
    expect(sql).toContain('substring(td.file_url from 11)');
    expect(sql.match(/o\.bucket_id = 'camarim-documents'/g)).toHaveLength(2);
    expect(sql).not.toMatch(/\b(INSERT|DELETE|CREATE|ALTER|DROP)\b/i);
  });

  it('mantém todo o rollback comentado e dependente dos IDs capturados', () => {
    expect(rollbackSql.trimEnd().split('\n').every(line => line.startsWith('-- '))).toBe(true);
    expect(withoutComments(rollbackSql)).toBe('');
    const sql = rollbackSql.replace(/^-- /gm, '');
    expect(sql).toContain('td.id IN (__IDS_DA_PROVA__)');
    expect(sql).toContain("td.file_url NOT LIKE 'camarim://7c858982-%'");
  });

  it('restringe a prova a SELECTs, incluindo os CTEs e as quatro secções', () => {
    expect(proofSql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    expect(withoutComments(proofSql)).not.toMatch(/\b(MERGE|CREATE|ALTER|DROP|TRUNCATE|DO|CALL)\b/i);
    expect(proofStatements).toHaveLength(5);
    for (const sql of proofStatements) expect(sql).toMatch(/^(WITH|SELECT)\b/);
    for (const section of ['§1', '§2', '§3', '§4']) expect(proofSql).toContain(section);
  });
});

describe('Issue #213 — reparação e prova em PGlite, sem Live', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE SCHEMA storage;
      CREATE TABLE storage.objects (bucket_id text NOT NULL, name text NOT NULL);
      CREATE TABLE public.transaction_documents (
        id uuid PRIMARY KEY, transaction_id uuid, company_id uuid NOT NULL,
        file_url text NOT NULL, name text NOT NULL DEFAULT 'fixture',
        is_accounting boolean NOT NULL DEFAULT true,
        partner_visible boolean NOT NULL DEFAULT false
      );
    `);
  }, 30000);

  afterAll(async () => { await db?.close(); });

  beforeEach(async () => {
    await db.exec('TRUNCATE public.transaction_documents, storage.objects;');
    // 1–3 corrigíveis (dois itens e dossier); 4 existe nos dois caminhos;
    // 5 não existe; 6 é de outra transação; 7 é de outra empresa.
    for (let n = 1; n <= 7; n++) {
      await db.query(`INSERT INTO public.transaction_documents
        (id, transaction_id, company_id, file_url, name, is_accounting, partner_visible)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
        id(n), n === 6 ? otherTx : n % 2 ? txA : txB,
        n === 7 ? otherCompany : company,
        `camarim://${company}/${paths[n - 1]}`, `fixture-${n}`, n % 2 === 0, n % 2 === 1,
      ]);
      if (n !== 5) await db.query('INSERT INTO storage.objects VALUES ($1, $2)', ['camarim-documents', paths[n - 1]]);
    }
    await db.query('INSERT INTO storage.objects VALUES ($1, $2)', ['camarim-documents', `${company}/${paths[3]}`]);
  });

  const documents = async () => (await db.query<FixtureDocument>('SELECT * FROM public.transaction_documents ORDER BY id')).rows;
  const objects = async () => (await db.query('SELECT * FROM storage.objects ORDER BY bucket_id, name')).rows;

  it('altera só os três corrigíveis, conserva os restantes campos e não toca nos objectos', async () => {
    const before = await documents();
    const storageBefore = await objects();
    expect((await db.exec(repairSql))[0].affectedRows).toBe(3);
    expect(await documents()).toEqual(before.map(row => correctedIds.includes(row.id)
      ? { ...row, file_url: `camarim://${paths[correctedIds.indexOf(row.id)]}` }
      : row));
    expect(await objects()).toEqual(storageBefore);
  });

  it('é idempotente e o rollback com os três IDs repõe exactamente os valores antigos', async () => {
    // Uma referência já canónica da mesma transação não pertence ao rollback.
    await db.query(`INSERT INTO public.transaction_documents (id, transaction_id, company_id, file_url)
      VALUES ($1, $2, $3, $4)`, [id(8), txA, company, `camarim://${itemPath(8)}`]);
    const before = await documents();
    expect((await db.exec(repairSql))[0].affectedRows).toBe(3);
    const after = await documents();
    expect((await db.exec(repairSql))[0].affectedRows).toBe(0);
    expect(await documents()).toEqual(after);
    // Só se descomentam as linhas SQL; o cabeçalho continua inerte.
    const rollback = rollbackSql.slice(rollbackSql.indexOf('-- UPDATE'))
      .replace(/^-- /gm, '').replace('__IDS_DA_PROVA__', quotedIds(correctedIds));
    expect((await db.exec(rollback))[0].affectedRows).toBe(3);
    expect(await documents()).toEqual(before);
    expect((await db.exec(rollback))[0].affectedRows).toBe(0);
  });

  it('valida os nomes no bucket correcto para os dois guardas de existência', async () => {
    // Um objecto actual só noutro bucket não impede a correcção.
    await db.query('INSERT INTO storage.objects VALUES ($1, $2)', ['transaction-documents', `${company}/${paths[0]}`]);
    // Um destino só noutro bucket não autoriza a correcção do documento 5.
    await db.query('INSERT INTO storage.objects VALUES ($1, $2)', ['transaction-documents', paths[4]]);
    expect((await db.exec(repairSql))[0].affectedRows).toBe(3);
    const rows = await documents();
    expect(rows.find(row => row.id === id(1))?.file_url).toBe(`camarim://${paths[0]}`);
    expect(rows.find(row => row.id === id(5))?.file_url).toBe(`camarim://${company}/${paths[4]}`);
  });

  it('executa a prova SELECT-only antes/depois, regista os perdidos e conserva a contagem total', async () => {
    const before = await db.exec(proofForIds(correctedIds));
    expect(before[0].rows.map(row => row.id).sort()).toEqual(correctedIds);
    for (const row of before[0].rows) {
      expect([txA, txB]).toContain(row.transaction_id);
      expect(row.objecto_actual_existe).toBe(false);
      expect(row.objecto_destino_existe).toBe(true);
      expect(Number(row.total_candidatos)).toBe(3);
      expect(row.novo_file_url).toBe(`camarim://${row.novo_caminho}`);
    }
    expect(before[1].rows.map(row => row.id)).toEqual([id(5)]);
    expect(before[2].rows[0]).toMatchObject({ referencias_validas: 0, prova_ok: false });
    await db.exec(repairSql);
    const after = await db.exec(proofForIds(correctedIds));
    expect(after[0].rows).toEqual([]);
    expect(after[1].rows).toEqual(before[1].rows);
    expect(after[2].rows[0]).toMatchObject({
      ids_na_prova: 3, ids_distintos: 3, linhas_encontradas: 3, referencias_validas: 3, prova_ok: false,
    });
    expect(after[3].rows).toEqual([{ candidatos_restantes: 0 }]);
    expect(after[4].rows).toEqual(before[4].rows);
    expect(after[4].rows).toEqual([{ total_camarim_mp: 6 }]);
    const unfilled = await db.exec(proofSql);
    expect(unfilled[2].rows[0]).toMatchObject({ ids_na_prova: 0, prova_ok: false });
  });

  it('só valida a prova com os 11 IDs distintos, presentes e com objecto no caminho gravado', async () => {
    const allIds = [...correctedIds];
    for (let n = 8; n <= 15; n++) {
      allIds.push(id(n));
      await db.query(`INSERT INTO public.transaction_documents (id, transaction_id, company_id, file_url)
        VALUES ($1, $2, $3, $4)`, [id(n), n % 2 ? txA : txB, company, `camarim://${company}/${itemPath(n)}`]);
      await db.query('INSERT INTO storage.objects VALUES ($1, $2)', ['camarim-documents', itemPath(n)]);
    }
    expect((await db.exec(proofSql))[0].rows).toHaveLength(11);
    expect((await db.exec(repairSql))[0].affectedRows).toBe(11);
    const verify = async (ids: string[]) => (await db.exec(proofForIds(ids)))[2].rows[0];
    const result = await verify(allIds);
    expect(result).toMatchObject({
      ids_na_prova: 11, ids_distintos: 11, linhas_encontradas: 11, referencias_validas: 11, prova_ok: true,
    });
    expect(result.documentos).toHaveLength(11);
    for (const doc of result.documentos as { objecto_gravado_existe: boolean }[]) {
      expect(doc.objecto_gravado_existe).toBe(true);
    }
    expect(await verify([...allIds.slice(1), allIds[1]])).toMatchObject({ ids_distintos: 10, prova_ok: false });
    expect(await verify([...allIds.slice(1), id(99)])).toMatchObject({ linhas_encontradas: 10, prova_ok: false });
    await db.query('DELETE FROM storage.objects WHERE bucket_id = $1 AND name = $2', ['camarim-documents', paths[0]]);
    expect(await verify(allIds)).toMatchObject({ referencias_validas: 10, prova_ok: false });
  });
});
