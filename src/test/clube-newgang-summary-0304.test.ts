// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const name = '0304_issue450_clube_newgang_summary_cache.sql';
const sql = readFileSync(`drizzle/migrations/${name}`, 'utf8');
const A = 'c0000000-0000-0000-0000-000000000001';
const B = 'c0000000-0000-0000-0000-000000000002';
let db: PGlite;
const summary = async (company: string) =>
  (await db.query<{ v: Record<string, unknown> }>(`SELECT clube_newgang_summary_compute('${company}') v`)).rows[0].v;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE lead_capture(id serial PRIMARY KEY, company_id uuid, email text, source text,
      created_at timestamptz, raw jsonb DEFAULT '{}', geo_city text, geo_country text,
      utm_source text, utm_medium text, utm_campaign text);
    CREATE TABLE portal_sites(id uuid PRIMARY KEY, company_id uuid, brand_key text);
    CREATE TABLE club_members(id uuid PRIMARY KEY, company_id uuid, site_id uuid, email text, created_at timestamptz);
    CREATE TABLE club_member_profiles(member_id uuid PRIMARY KEY, company_id uuid, site_id uuid,
      birth_date date, residence_country text, city text);
    CREATE TABLE portugal_municipalities_ref(city_key text, name text);
    CREATE FUNCTION club_city_key(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(btrim($1)) $$;
    CREATE FUNCTION _clube_newgang_birth(jsonb) RETURNS date LANGUAGE sql IMMUTABLE AS $$ SELECT ($1->>'birth_date')::date $$;
    CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT '${A}'::uuid $$;
    CREATE FUNCTION _clube_newgang_assert_access() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('test.deny',true)='yes' THEN RAISE EXCEPTION 'denied'; END IF;
    END $$;
    INSERT INTO portugal_municipalities_ref VALUES ('lisboa','Lisboa');
    INSERT INTO portal_sites VALUES ('50000000-0000-0000-0000-000000000001','${A}','newgang');
    INSERT INTO club_members VALUES ('a0000000-0000-0000-0000-000000000001','${A}',
      '50000000-0000-0000-0000-000000000001','ana@example.test',now());
    INSERT INTO club_member_profiles VALUES ('a0000000-0000-0000-0000-000000000001','${A}',
      '50000000-0000-0000-0000-000000000001',current_date - interval '20 years','PT',' lisboa ');
    INSERT INTO lead_capture(company_id,email,source,created_at,raw,geo_city,geo_country) VALUES
      ('${A}',' ANA@example.test ','clube_newgang',now(),'{}',NULL,NULL),
      ('${A}','ana@example.test','clube_newgang',now()+interval '1 minute','{}','Lisbon','PT'),
      ('${A}','bia@example.test','clube_newgang',now()-interval '2 days','{}','Lisbon','PT'),
      ('${A}','caio@example.test','clube_newgang',now()-interval '8 days','{"city":"Lisboa","residence_country":"BR"}',NULL,NULL),
      ('${B}','ana@example.test','clube_newgang',now(),'{}','Paris','FR');
  `);
  await db.exec(sql);
}, 60000);
afterAll(async () => { await db?.close(); });

describe('0304 resumo Newgang em memória', () => {
  it('mantém cópia byte a byte e cron/rollback inertes', () => {
    expect(readFileSync(`supabase/manual/${name}`, 'utf8')).toBe(sql);
    const rollback = readFileSync('supabase/manual/rollback_0304_issue450_clube_newgang_summary_cache_comentado.sql','utf8');
    expect(sql.endsWith(rollback)).toBe(true);
    expect(rollback.split('\n').every(line => !line || line.startsWith('--'))).toBe(true);
    expect(sql.replace(/--[^\n]*/g, '')).not.toMatch(/cron\.(schedule|unschedule)/);
  });
  it('compute mantém sete chaves, primeira captura, perfil, cidade e faixas ordenadas', async () => {
    const v = await summary(A);
    expect(Object.keys(v).sort()).toEqual(['total','today','last7','by_day','by_city','by_utm','by_age'].sort());
    expect(v).toMatchObject({ total: 3, today: 1, last7: 2,
      by_city: [{ k: 'Lisboa', n: 3, n_declarada: 2, n_estimada: 1 }],
      by_utm: [{ k: '(direto) / — / —', n: 3 }],
      by_age: ['<18','18–24','25–34','35–44','45+','sem data'].map((k,i) => ({ k, n: i===1 ? 1 : i===5 ? 2 : 0 })) });
    expect(v.by_day).toHaveLength(3);
    expect(await summary(B)).toMatchObject({ total: 1, today: 1, last7: 1,
      by_city: [{ k: '(sem cidade)', n: 1, n_declarada: 0, n_estimada: 0 }] });
  });
  it('refresh preenche e atualiza uma linha por empresa', async () => {
    await db.exec('SELECT clube_newgang_summary_refresh(); SELECT clube_newgang_summary_refresh();');
    const rows = (await db.query<{ company_id: string; payload: unknown }>('SELECT company_id,payload FROM clube_newgang_summary_cache ORDER BY company_id')).rows;
    expect(rows).toEqual([{ company_id: A, payload: await summary(A) },{ company_id: B, payload: await summary(B) }]);
  });
  it('RPC lê a cache e acrescenta computed_at; fallback grava a empresa corrente', async () => {
    await db.exec(`UPDATE clube_newgang_summary_cache SET payload='{"total":99}' WHERE company_id='${A}'`);
    const cached = (await db.query<{ v: { total: number; computed_at: string } }>('SELECT clube_newgang_summary() v')).rows[0].v;
    expect(cached.total).toBe(99);
    expect(Number.isNaN(Date.parse(cached.computed_at))).toBe(false);
    await db.exec(`DELETE FROM clube_newgang_summary_cache WHERE company_id='${A}'`);
    const fresh = (await db.query<{ v: Record<string, unknown> }>('SELECT clube_newgang_summary() v')).rows[0].v;
    expect(fresh).toEqual({ ...await summary(A), computed_at: expect.any(String) });
    expect((await db.query('SELECT * FROM clube_newgang_summary_cache')).rows).toHaveLength(2);
  });
  it('guard de acesso corre mesmo com cache preenchida', async () => {
    await db.exec("SET test.deny='yes'");
    await expect(db.query('SELECT clube_newgang_summary()')).rejects.toThrow('denied');
    await db.exec("SET test.deny='no'");
  });
  it('funções internas e tabela fechadas a anon/authenticated', async () => {
    for (const role of ['anon','authenticated','service_role']) {
      const v = (await db.query<{ compute: boolean; refresh: boolean; read: boolean; write: boolean }>(`SELECT
        has_function_privilege('${role}','clube_newgang_summary_compute(uuid)','EXECUTE') compute,
        has_function_privilege('${role}','clube_newgang_summary_refresh()','EXECUTE') refresh,
        has_table_privilege('${role}','clube_newgang_summary_cache','SELECT') read,
        has_table_privilege('${role}','clube_newgang_summary_cache','INSERT') write`)).rows[0];
      expect(v).toEqual({ compute: role==='service_role', refresh: role==='service_role', read: role==='service_role', write: false });
    }
    expect((await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE oid='clube_newgang_summary_cache'::regclass")).rows[0].relrowsecurity).toBe(true);
  });
});
