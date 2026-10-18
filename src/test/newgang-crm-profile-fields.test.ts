// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { countryName, displayCity } from '@/lib/crm/countries';

let db: PGlite;
const company = '10000000-0000-0000-0000-000000000001';
const site = '40000000-0000-0000-0000-000000000001';
const sql = readFileSync('drizzle/migrations/0199_newgang_crm_profile_fields.sql', 'utf8');
const list = (args = '') => db.query<any>(`SELECT * FROM clube_newgang_list(${args})`).then((r) => r.rows);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE FUNCTION row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${company}'::uuid $$;
 CREATE FUNCTION _clube_newgang_assert_access() RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
 CREATE FUNCTION club_city_display(text,text) RETURNS text LANGUAGE sql AS $$ SELECT CASE WHEN lower(btrim($2))='lisboa' THEN 'Lisboa' ELSE nullif(btrim($2),'') END $$;
 CREATE FUNCTION club_city_key(text) RETURNS text LANGUAGE sql AS $$ SELECT lower(btrim($1)) $$;
 CREATE FUNCTION _clube_newgang_birth(jsonb) RETURNS date LANGUAGE sql AS $$ SELECT nullif($1->>'birth_date','')::date $$;
 CREATE TABLE contacts(id uuid PRIMARY KEY,company_id uuid,consent_whatsapp boolean,consent_whatsapp_source text);
 CREATE FUNCTION crm_whatsapp_eligible(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 CREATE TABLE portal_sites(id uuid,company_id uuid,brand_key text);
 CREATE TABLE club_members(id uuid PRIMARY KEY,company_id uuid,site_id uuid,contact_id uuid,email text,phone text,member_no int,confirmed_at timestamptz,created_at timestamptz DEFAULT now());
 CREATE TABLE club_member_profiles(member_id uuid,site_id uuid,company_id uuid,birth_date date,birth_country text,residence_country text,city text,completed_at timestamptz);
 CREATE TABLE lead_capture(id uuid,name text,email text,phone text,raw jsonb,company_id uuid,source text,consent_email boolean,consent_whatsapp boolean,utm_source text,utm_medium text,utm_campaign text,created_at timestamptz,ip_inet inet,geo_city text,geo_region text,geo_country text);
 CREATE TABLE ip_city_ranges(ip_from inet,ip_to inet,country text,region text,city text,source_month date);
 CREATE FUNCTION clube_newgang_list(text DEFAULT NULL,int DEFAULT 50,int DEFAULT 0) RETURNS int LANGUAGE sql AS $$ SELECT 0 $$;
 GRANT EXECUTE ON FUNCTION clube_newgang_list(text,int,int) TO authenticated;
 CREATE FUNCTION clube_newgang_summary() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
 INSERT INTO portal_sites VALUES('${site}','${company}','newgang');
 INSERT INTO ip_city_ranges VALUES('203.0.113.0','203.0.113.255','PT','Lisboa','Lisboa','2026-10-01');`);
  // Live drift guard is checked by the official tool; locally skip it.
  await db.exec(sql.slice(sql.indexOf('CREATE TEMP TABLE')).replace('ON COMMIT DROP', ''));
  await db.exec(`
 INSERT INTO club_members VALUES
 ('30000000-0000-0000-0000-000000000001','${company}','${site}',null,'perfil@fixture.invalid',null,1,now(),'2026-10-10'),
 ('30000000-0000-0000-0000-000000000002','${company}','${site}',null,'form@fixture.invalid',null,2,null,'2026-10-11');
 INSERT INTO club_member_profiles VALUES('30000000-0000-0000-0000-000000000001','${site}','${company}','1990-05-01','br','PT','lisboa','2026-10-12');
 INSERT INTO lead_capture(id,name,email,raw,company_id,source,created_at,ip_inet,geo_city,geo_region,geo_country) VALUES
 ('50000000-0000-0000-0000-000000000001','Perfil','Perfil@fixture.invalid','{"city":"Porto","birth_date":"2001-01-01","residence_country":"ES"}','${company}','clube_newgang','2026-10-10',null,'Madrid','Madrid','es'),
 ('50000000-0000-0000-0000-000000000002','Form','form@fixture.invalid','{"city":"Faro","birth_date":"2000-02-02"}','${company}','clube_newgang','2026-10-11',null,null,null,null),
 ('50000000-0000-0000-0000-000000000003','Form again','form@fixture.invalid','{}','${company}','clube_newgang','2026-10-12',null,'Faro','Algarve','PT'),
 ('50000000-0000-0000-0000-000000000004','Sem','sem@fixture.invalid','{}','${company}','clube_newgang','2026-10-13',null,'Braga','Braga','PT');`);
});
afterAll(async () => { await db.close(); });

describe('CRM Newgang profile-first list', () => {
  it('reads profile fields first and never overwrites the declared city with the estimate', async () => {
    const r = (await list("'perfil'"))[0];
    expect(r).toMatchObject({ birth_date: '1990-05-01', birth_country: 'BR', residence_country: 'PT', city: 'Lisboa', city_source: 'perfil', profile_complete: true, estimated_city: 'Madrid', estimated_country: 'ES' });
  });
  it('falls back to the first capture when there is no profile', async () => {
    const r = (await list("'form@'"))[0];
    expect(r).toMatchObject({ birth_date: '2000-02-02', city: 'Faro', city_source: 'formulario', profile_complete: false, submissions: 2, estimated_city: 'Faro' });
  });
  it('estimated city stays separate when no declared city exists', async () => {
    const r = (await list("'sem'"))[0];
    expect(r.city).toBeNull();
    expect(r.city_source).toBeNull();
    expect(r.estimated_city).toBe('Braga');
  });
  it('filters by profile complete yes/no and keeps paging/count', async () => {
    expect((await list('NULL,50,0,true')).map((r) => r.name)).toEqual(['Perfil']);
    expect(await list('NULL,50,0,false')).toHaveLength(2);
    const page = await list('NULL,1,1');
    expect(page).toHaveLength(1);
    expect(Number(page[0].total_count)).toBe(3);
  });
  it('summary counts unique people and uses the profile city/age first', async () => {
    const s = (await db.query<any>('SELECT clube_newgang_summary() s')).rows[0].s;
    expect(s.total).toBe(3);
    expect(s.by_city).toEqual(expect.arrayContaining([{ k: 'Lisboa', n: 1 }, { k: 'Faro', n: 1 }, { k: '(sem cidade)', n: 1 }]));
    expect(s.by_city.find((x: any) => x.k === 'Porto')).toBeUndefined();
    expect(s.by_age.find((x: any) => x.k === 'sem data').n).toBe(1);
  });
  it('preserves the previous grant on the new signature', async () => {
    const r = (await db.query<any>("SELECT has_function_privilege('authenticated','clube_newgang_list(text,int,int,boolean)','EXECUTE') ok")).rows[0];
    expect(r.ok).toBe(true);
  });
});

describe('local geo for new captures', () => {
  it('fills geo_* from the local table only when empty and an IP was stored', async () => {
    await db.exec(`INSERT INTO lead_capture(id,email,company_id,source,created_at,ip_inet) VALUES('50000000-0000-0000-0000-000000000009','g@fixture.invalid','${company}','x',now(),'203.0.113.7');
     INSERT INTO lead_capture(id,email,company_id,source,created_at,ip_inet,geo_city,geo_country) VALUES('50000000-0000-0000-0000-000000000010','h@fixture.invalid','${company}','x',now(),'203.0.113.8','Porto','PT');
     INSERT INTO lead_capture(id,email,company_id,source,created_at) VALUES('50000000-0000-0000-0000-000000000011','i@fixture.invalid','${company}','x',now());`);
    const rows = (await db.query<any>("SELECT email,geo_city FROM lead_capture WHERE source='x' ORDER BY email")).rows;
    expect(rows).toEqual([{ email: 'g@fixture.invalid', geo_city: 'Lisboa' }, { email: 'h@fixture.invalid', geo_city: 'Porto' }, { email: 'i@fixture.invalid', geo_city: null }]);
  });
});

describe('screen helpers', () => {
  it('shows country names, not only codes', () => {
    expect(countryName('PT')).toBe('Portugal');
    expect(countryName('br')).toBe('Brasil');
    expect(countryName('ZZ')).toBe('ZZ');
    expect(countryName(null)).toBeNull();
  });
  it('marks the estimated city and prefers the declared one', () => {
    expect(displayCity({ city: 'Lisboa', estimated_city: 'Madrid' })).toEqual({ text: 'Lisboa', estimated: false });
    expect(displayCity({ city: null, estimated_city: 'Braga' })).toEqual({ text: 'Braga', estimated: true });
    expect(displayCity({ city: null, estimated_city: null })).toEqual({ text: null, estimated: false });
  });
});
