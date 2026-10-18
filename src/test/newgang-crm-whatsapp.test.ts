// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';

let db: PGlite;
const company='10000000-0000-0000-0000-000000000001';
const contact='20000000-0000-0000-0000-000000000001';
const member='30000000-0000-0000-0000-000000000001';
const site='40000000-0000-0000-0000-000000000001';
const scalar=async(sql:string)=>(await db.query<any>(sql)).rows[0];
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
 CREATE FUNCTION public.row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${company}'::uuid $$;
 CREATE FUNCTION public._clube_newgang_assert_access() RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
 CREATE FUNCTION public._club332_whatsapp_fp(text) RETURNS text LANGUAGE sql AS $$ SELECT 'fp:'||$1 $$;
 CREATE FUNCTION public.club_city_display(text,text) RETURNS text LANGUAGE sql AS $$ SELECT $2 $$;
 CREATE FUNCTION public.club_city_key(text) RETURNS text LANGUAGE sql AS $$ SELECT lower($1) $$;
 CREATE FUNCTION public._clube_newgang_birth(jsonb) RETURNS date LANGUAGE sql AS $$ SELECT ($1->>'birth_date')::date $$;
 CREATE TABLE contacts(id uuid PRIMARY KEY,company_id uuid,name text,email text,phone_e164 text,consent_email boolean DEFAULT false,consent_whatsapp boolean DEFAULT false,consent_email_at timestamptz,consent_whatsapp_at timestamptz,is_active boolean DEFAULT true,source text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),first_seen_at timestamptz,last_activity_at timestamptz);
 CREATE TABLE club_members(id uuid PRIMARY KEY,company_id uuid,site_id uuid,contact_id uuid,email text,phone text,member_no int,confirmed_at timestamptz,created_at timestamptz DEFAULT now());
 CREATE TABLE club_member_whatsapp_consents(id bigint GENERATED ALWAYS AS IDENTITY,member_id uuid,site_id uuid,company_id uuid,decision text,decided_at timestamptz DEFAULT now(),phone_fp text,version text DEFAULT 'whatsapp-v1');
 CREATE TABLE portal_sites(id uuid,company_id uuid,brand_key text);
 CREATE TABLE lead_capture(id uuid,name text,email text,phone text,raw jsonb,company_id uuid,source text,consent_email boolean,consent_whatsapp boolean,utm_source text,utm_medium text,utm_campaign text,created_at timestamptz);
 CREATE TABLE leads(contact_id uuid,created_at timestamptz,event_id uuid,kind text);
 CREATE TABLE audiences(id uuid,company_id uuid,criterion jsonb);
 CREATE FUNCTION crm_coala_list_set() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
 CREATE FUNCTION crm_criterion_match(contacts,jsonb,jsonb) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
 CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT '${company}'::uuid $$;
 CREATE FUNCTION crm_audience_is_visible(jsonb) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
 CREATE FUNCTION clube_newgang_list(text DEFAULT NULL,int DEFAULT 50,int DEFAULT 0) RETURNS int LANGUAGE sql AS $$ SELECT 0 $$;
 REVOKE ALL ON FUNCTION clube_newgang_list(text,int,int) FROM PUBLIC; GRANT EXECUTE ON FUNCTION clube_newgang_list(text,int,int) TO authenticated;
 `);
 // Live MD5 precondition is independently checked via official SELECT; isolated schema has stub helpers.
 const sql=readFileSync('supabase/manual/20261018_newgang_crm_members_whatsapp.sql','utf8').replace(/DO \$\$ BEGIN[\s\S]*?END \$\$;/,'');
 await db.exec('BEGIN;'+sql+'COMMIT;');
 await db.exec(`INSERT INTO contacts(id,company_id,email,phone_e164) VALUES('${contact}','${company}','fixture@invalid.test','+351912345678');
 INSERT INTO club_members(id,company_id,site_id,contact_id,email,phone,member_no) VALUES('${member}','${company}','${site}','${contact}','fixture@invalid.test','+351912345678',1);
 INSERT INTO portal_sites VALUES('${site}','${company}','newgang');`);
},30000);
afterAll(async()=>{await db?.close()});
async function decision(value:string){await db.exec(`INSERT INTO club_member_whatsapp_consents(member_id,site_id,company_id,decision,phone_fp) VALUES('${member}','${site}','${company}','${value}','fp:+351912345678')`)}
describe.sequential('Canonical SQL WhatsApp projection',()=>{
 it('grant sets true and server decision date',async()=>{await decision('granted');expect(await scalar(`SELECT consent_whatsapp,consent_whatsapp_at=(SELECT decided_at FROM club_member_whatsapp_consents ORDER BY id DESC LIMIT 1) AS exact,consent_whatsapp_source FROM contacts WHERE id='${contact}'`)).toEqual({consent_whatsapp:true,exact:true,consent_whatsapp_source:'club_profile_whatsapp-v1'})});
 it('revoke sets false and clears date',async()=>{await decision('revoked');expect(await scalar(`SELECT consent_whatsapp,consent_whatsapp_at FROM contacts WHERE id='${contact}'`)).toEqual({consent_whatsapp:false,consent_whatsapp_at:null})});
 it('legacy ingestion cannot overwrite revoke',async()=>{await db.exec(`UPDATE contacts SET consent_whatsapp=true,consent_whatsapp_at=now() WHERE id='${contact}'`);expect((await scalar(`SELECT consent_whatsapp FROM contacts WHERE id='${contact}'`)).consent_whatsapp).toBe(false)});
 it('regrant restores eligibility',async()=>{await decision('granted');expect((await scalar(`SELECT crm_whatsapp_eligible('${contact}') ok`)).ok).toBe(true)});
 it('idempotent projection preserves date',async()=>{const before=await scalar(`SELECT consent_whatsapp_at FROM contacts WHERE id='${contact}'`);await db.exec(`UPDATE contacts SET consent_whatsapp=true WHERE id='${contact}'`);expect(await scalar(`SELECT consent_whatsapp_at FROM contacts WHERE id='${contact}'`)).toEqual(before)});
 it('member without contact has no side effects',async()=>{await db.exec(`INSERT INTO club_member_whatsapp_consents(member_id,site_id,company_id,decision) VALUES('30000000-0000-0000-0000-000000000002','${site}','${company}','granted')`);expect((await scalar('SELECT count(*)::int n FROM contacts')).n).toBe(1)});
 it('legacy true preserved and explicitly marked',async()=>{await db.exec(`INSERT INTO contacts(id,company_id,phone_e164,consent_whatsapp) VALUES('20000000-0000-0000-0000-000000000002','${company}','+351912345679',true)`);expect(await scalar(`SELECT consent_whatsapp_source,crm_whatsapp_eligible(id) ok FROM contacts WHERE id='20000000-0000-0000-0000-000000000002'`)).toEqual({consent_whatsapp_source:'form_legacy_sem_prova',ok:true})});
 it('phone without consent never eligible',async()=>{await db.exec(`INSERT INTO contacts(id,company_id,phone_e164) VALUES('20000000-0000-0000-0000-000000000003','${company}','+351912345670')`);expect((await scalar(`SELECT crm_whatsapp_eligible('20000000-0000-0000-0000-000000000003') ok`)).ok).toBe(false)});
 it('invalid E164 never eligible',async()=>{await db.exec(`UPDATE contacts SET phone_e164='912345679' WHERE id='20000000-0000-0000-0000-000000000002'`);expect((await scalar(`SELECT crm_whatsapp_eligible('20000000-0000-0000-0000-000000000002') ok`)).ok).toBe(false)});
 it('changed profile phone invalidates original consent',async()=>{await db.exec(`UPDATE contacts SET phone_e164='+351912345671' WHERE id='${contact}'`);expect((await scalar(`SELECT crm_whatsapp_eligible('${contact}') ok`)).ok).toBe(false)});
 it('normalizes email, counts submissions and uses first capture',async()=>{await db.exec(`INSERT INTO lead_capture(id,name,email,raw,company_id,source,created_at) VALUES
 ('50000000-0000-0000-0000-000000000001','First',' Fixture@invalid.test ','{"city":"Lisboa","birth_date":"2000-01-01"}','${company}','clube_newgang','2026-10-12T12:00:00Z'),
 ('50000000-0000-0000-0000-000000000002','Later','fixture@invalid.test','{"city":"Porto"}','${company}','clube_newgang','2026-10-16T12:00:00Z');`);const rows=(await db.query('SELECT * FROM clube_newgang_list()')).rows;expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({name:'First',email:'fixture@invalid.test',submissions:2,city:'Lisboa',member_no:1});expect((await scalar("SELECT clube_newgang_summary()->>'total' n")).n).toBe('1');});
 it('search and pagination preserve unique count',async()=>{expect((await db.query("SELECT * FROM clube_newgang_list('fixture',50,1)")).rows).toHaveLength(0);expect((await scalar("SELECT total_count FROM clube_newgang_list('fixture')")).total_count).toBe(1)});
});
