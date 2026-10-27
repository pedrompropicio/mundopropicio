// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';

const C = '7d831e59-6e82-427b-95a0-64904aae5dd2';
const MP = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
const PH = '+351912345678';
const TOKEN = 'a'.repeat(64);
const CID = '10000000-0000-0000-0000-000000000001';
let db: PGlite;
const sql = (part: string) => readFileSync(`supabase/manual/draft_359_ponto4_${part}.sql`, 'utf8');
async function state(token: string | null = TOKEN) {
  return (await db.query<{ v: Record<string, unknown> }>('SELECT coala_autorizacoes_estado($1) v', [token])).rows[0]?.v;
}
async function save(ads: boolean, wa: boolean, phone: string | null = null, locale = 'pt', token: string | null = TOKEN) {
  return (await db.query<{ v: Record<string, unknown> }>('SELECT coala_autorizacoes_gravar($1,$2,$3,$4,$5) v', [token,ads,wa,phone,locale])).rows[0]?.v;
}
async function count() { return (await db.query<{ n: number }>('SELECT count(*)::int n FROM coala_person_consents')).rows[0]?.n; }
async function eligible(id = CID) { return (await db.query<{ v: boolean }>('SELECT crm_whatsapp_eligible($1::uuid) v',[id])).rows[0]?.v; }
async function texts() {
  await db.exec(`INSERT INTO consent_text_versions(company_id,channel,locale,version,valid_from) VALUES
  ('${C}','ads','pt','coala-anuncios-2026-10-v1','2020-01-01'),('${C}','whatsapp','pt','coala-whatsapp-2026-10-v1','2020-01-01');`);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
  CREATE FUNCTION row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  CREATE FUNCTION _club332_whatsapp_fp(text) RETURNS text LANGUAGE sql AS $$ SELECT 'fp:'||$1 $$;
  CREATE TABLE contacts(id uuid PRIMARY KEY,company_id uuid,email text,phone_e164 text,consent_whatsapp boolean NOT NULL DEFAULT false,consent_whatsapp_source text,consent_whatsapp_at timestamptz);
  CREATE UNIQUE INDEX contacts_email_unique_idx ON contacts(company_id,lower(btrim(email))) WHERE email IS NOT NULL;
  CREATE UNIQUE INDEX contacts_phone_unique_idx ON contacts(company_id,phone_e164) WHERE phone_e164 IS NOT NULL;
  CREATE TABLE email_unsubscribe_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,email text,token text UNIQUE,used_at timestamptz);
  CREATE TABLE suppressed_emails(company_id uuid,email text);
  CREATE TABLE consent_text_versions(company_id uuid,channel text,locale text,version text,valid_from timestamptz,valid_to timestamptz,created_at timestamptz DEFAULT now());
  CREATE TABLE wa_latest(contact_id uuid,decision text,phone text,phone_fp text);
  CREATE FUNCTION _crm_whatsapp_latest(uuid,uuid) RETURNS TABLE(decision text,phone text,phone_fp text) LANGUAGE sql STABLE AS $$ SELECT decision,phone,phone_fp FROM wa_latest WHERE contact_id=$1 $$;
  CREATE FUNCTION _crm_whatsapp_contact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN IF TG_OP='UPDATE' AND (NEW.consent_whatsapp,NEW.consent_whatsapp_at,NEW.consent_whatsapp_source) IS NOT DISTINCT FROM (OLD.consent_whatsapp,OLD.consent_whatsapp_at,OLD.consent_whatsapp_source) THEN RETURN NEW; END IF;
  IF NEW.consent_whatsapp THEN NEW.consent_whatsapp_source:='form_legacy_sem_prova'; ELSE NEW.consent_whatsapp_at:=NULL; NEW.consent_whatsapp_source:=NULL; END IF; RETURN NEW; END $$;
  CREATE TRIGGER crm_whatsapp_contact_guard BEFORE INSERT OR UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION _crm_whatsapp_contact_guard();`);
  for (const p of ['A_ledger','B_rpcs','C_eligible']) await db.exec(sql(p));
},30000);
afterAll(async()=>{ await db?.close(); });
beforeEach(async()=>{
  // Append-only production trigger stays installed: reset each test inside rollback, never truncate ledger.
  await db.exec('BEGIN');
  await db.exec(`INSERT INTO contacts(id,company_id,email,phone_e164) VALUES('${CID}','${C}','person@example.test','${PH}');
  INSERT INTO email_unsubscribe_tokens(company_id,email,token) VALUES('${C}','person@example.test','${TOKEN}');`);
});
afterEach(async()=>{ await db.exec('ROLLBACK'); });

it('invalid null/length/unknown token returns neutral response with no effects',async()=>{
  for(const token of [null,'abc','z'.repeat(64),'b'.repeat(64)]) {
    expect(await state(token)).toEqual({status:'invalid'});
    expect(await save(true,true,PH,'pt',token)).toEqual({status:'invalid'});
  }
  expect(await count()).toBe(0);
});
it('another company token cannot read or write Coala',async()=>{
  await db.exec(`UPDATE email_unsubscribe_tokens SET company_id='${MP}'`);
  expect(await state()).toEqual({status:'invalid'});
  expect(await save(false,false)).toEqual({status:'invalid'});
});
it('grant without registered text fails atomically',async()=>{
  await expect(save(true,false)).rejects.toThrow('consent_text_unregistered');
});
it('WhatsApp grant without text also fails',async()=>{ await expect(save(false,true)).rejects.toThrow('consent_text_unregistered'); });
it('revocation accepted after text expiration and with invalid supplied phone',async()=>{
  await texts(); await save(true,true);
  await db.exec(`DELETE FROM consent_text_versions`);
  expect(await save(false,false,'invalid')).toMatchObject({ads:false,whatsapp:false});
  expect(await count()).toBe(4); expect(await eligible()).toBe(false);
});
it('server picks current registered version, server clock and fingerprint',async()=>{
  await texts(); await save(true,true);
  const rows=(await db.query<{channel:string;text_version:string;phone_fp:string;recent:boolean}>(`SELECT channel,text_version,phone_fp,created_at<=clock_timestamp() AND created_at>clock_timestamp()-interval '1 minute' recent FROM coala_person_consents`)).rows;
  expect(rows.find(r=>r.channel==='ads')?.text_version).toBe('coala-anuncios-2026-10-v1');
  expect(rows.find(r=>r.channel==='whatsapp')?.text_version).toBe('coala-whatsapp-2026-10-v1');
  expect(rows.every(r=>r.recent)).toBe(true);
});
it('unchanged decisions are idempotent; both false initially create no rows',async()=>{
  expect(await save(false,false)).toMatchObject({ads:false,whatsapp:false}); expect(await count()).toBe(0);
  await texts(); await save(true,true); await save(true,true); expect(await count()).toBe(2);
});
it('invalid WhatsApp phone rejected',async()=>{ await texts(); await expect(save(false,true,'91234')).rejects.toThrow('whatsapp_invalid_phone'); });
it('empty phone filled under existing guard without changing consent boolean/source',async()=>{
  await texts(); await db.exec('UPDATE contacts SET phone_e164=NULL');
  expect(await save(false,true,PH)).toMatchObject({status:'ok',whatsapp:true,tem_telemovel:true});
  expect((await db.query(`SELECT phone_e164,consent_whatsapp,consent_whatsapp_source FROM contacts`)).rows[0]).toEqual({phone_e164:PH,consent_whatsapp:false,consent_whatsapp_source:null});
  expect(await eligible()).toBe(true);
});
it('different supplied phone persists grant and reports phone_conflict, ineligible',async()=>{
  await texts(); const other='+351923456789';
  expect(await save(false,true,other)).toMatchObject({status:'phone_conflict',whatsapp:true});
  expect((await db.query('SELECT phone_e164 FROM contacts')).rows[0]?.phone_e164).toBe(PH);
  expect((await db.query('SELECT phone FROM coala_person_consents')).rows[0]?.phone).toBe(other);
  expect(await eligible()).toBe(false);
});
it('phone owned by another contact is conflict, not overwritten',async()=>{
  await texts(); await db.exec(`UPDATE contacts SET phone_e164=NULL; INSERT INTO contacts(id,company_id,email,phone_e164) VALUES(gen_random_uuid(),'${C}','other@example.test','${PH}')`);
  expect(await save(false,true,PH)).toMatchObject({status:'phone_conflict'}); expect(await eligible()).toBe(false);
});
it('missing contact records decision but reports contact_missing',async()=>{
  await texts(); await db.exec('DELETE FROM contacts');
  expect(await save(false,true,PH)).toMatchObject({status:'contact_missing'}); expect(await count()).toBe(1);
});
it('used unsubscribe token can revoke but never grant',async()=>{
  await texts(); await save(true,true); await db.exec('UPDATE email_unsubscribe_tokens SET used_at=now()');
  expect(await save(false,false)).toMatchObject({ads:false,whatsapp:false});
  await expect(save(true,false)).rejects.toThrow('consent_grant_forbidden');
});
it.each(['plain','global','hash'])('suppressed %s cannot grant but can revoke',async(kind)=>{
  await texts(); await save(true,true);
  await db.exec(`INSERT INTO suppressed_emails VALUES(${kind==='global'?'NULL':`'${C}'`},${kind==='hash'?`'sha256:'||encode(sha256(convert_to('person@example.test','UTF8')),'hex')`:`'person@example.test'`})`);
  expect(await save(false,false)).toMatchObject({ads:false,whatsapp:false});
  await expect(save(false,true)).rejects.toThrow('consent_grant_forbidden');
});
it('state contains only five allowed fields, no personal data/token/text',async()=>{
  await texts(); await save(true,true);
  expect(await state()).toEqual({status:'ok',locale:'pt',ads:true,whatsapp:true,tem_telemovel:true});
});
it('English grant blocked without approved EN seed; revoke unaffected',async()=>{
  await texts(); await expect(save(true,false,null,'en')).rejects.toThrow('consent_text_unregistered');
});
it('granted matching phone eligible even with consent_whatsapp false',async()=>{ await texts(); await save(false,true); expect(await eligible()).toBe(true); });
it('explicit revoked beats legacy true and other origins',async()=>{
  await texts(); await save(false,true); await save(false,false);
  await db.exec(`ALTER TABLE contacts DISABLE TRIGGER crm_whatsapp_contact_guard; UPDATE contacts SET consent_whatsapp=true,consent_whatsapp_source='coala-form-2026-10-v1';`);
  expect(await eligible()).toBe(false);
});
it('no Coala decision preserves exact0276 other origins, legacy and MP',async()=>{
  await db.exec(`ALTER TABLE contacts DISABLE TRIGGER crm_whatsapp_contact_guard; UPDATE contacts SET consent_whatsapp=true,consent_whatsapp_source='form_legacy_sem_prova';`);
  expect(await eligible()).toBe(false);
  await db.exec(`UPDATE contacts SET consent_whatsapp_source='coala-form-2026-10-v1'`); expect(await eligible()).toBe(true);
  await db.exec(`UPDATE contacts SET company_id='${MP}',consent_whatsapp_source='form_legacy_sem_prova'`); expect(await eligible()).toBe(true);
});
it('future/expired texts fail closed',async()=>{
  await db.exec(`INSERT INTO consent_text_versions VALUES('${C}','ads','pt','future',now()+interval '1 day',NULL,now())`);
  await expect(save(true,false)).rejects.toThrow('consent_text_unregistered');
});
it('append-only rejects UPDATE DELETE and TRUNCATE even owner',async()=>{
  await texts(); await save(true,false);
  for(const query of ['UPDATE coala_person_consents SET decision=\'revoked\'','DELETE FROM coala_person_consents','TRUNCATE coala_person_consents']) {
    await db.exec('SAVEPOINT probe'); await expect(db.exec(query)).rejects.toThrow('coala_consent_append_only'); await db.exec('ROLLBACK TO probe');
  }
});
it('anon/authenticated have RPC execute but no table read/write; no PUBLIC execute',async()=>{
  for(const role of ['anon','authenticated']) {
    const r=(await db.query<{read:boolean;write:boolean;state:boolean;save:boolean}>(`SELECT has_table_privilege('${role}','coala_person_consents','SELECT') read,has_table_privilege('${role}','coala_person_consents','INSERT') write,has_function_privilege('${role}','coala_autorizacoes_estado(text)','EXECUTE') state,has_function_privilege('${role}','coala_autorizacoes_gravar(text,boolean,boolean,text,text)','EXECUTE') save`)).rows[0];
    expect(r).toEqual({read:false,write:false,state:true,save:true});
  }
});
it('real anon/authenticated roles can call RPCs while table access is denied',async()=>{
  await texts();
  for(const role of ['anon','authenticated']) {
    await db.exec(`SET LOCAL ROLE ${role}`);
    expect(await state()).toMatchObject({status:'ok'});
    expect(await save(false,true)).toMatchObject({status:'ok',whatsapp:true});
    await db.exec('SAVEPOINT acl');
    await expect(db.exec('SELECT * FROM coala_person_consents')).rejects.toThrow(/permission denied/);
    await db.exec('ROLLBACK TO acl; RESET ROLE');
  }
});
it('server ignores supplied text version/timestamp, normalizes email and denies nonCoala scope',async()=>{
  await texts();
  await db.exec(`INSERT INTO coala_person_consents(company_id,email,channel,decision,locale,text_version,created_at) VALUES('${C}','  PERSON@EXAMPLE.TEST ','ads','granted','pt','forged','2000-01-01')`);
  expect((await db.query(`SELECT email,text_version,created_at>'2020-01-01'::timestamptz recent FROM coala_person_consents`)).rows[0]).toEqual({email:'person@example.test',text_version:'coala-anuncios-2026-10-v1',recent:true});
  await expect(db.exec(`INSERT INTO coala_person_consents(company_id,email,channel,decision,locale) VALUES('${MP}','other@example.test','ads','revoked','pt')`)).rejects.toThrow(/check constraint/);
});
it('invalid or missing fingerprint fails closed despite matching phone',async()=>{
  await texts(); await save(false,true);
  await db.exec(`UPDATE contacts SET phone_e164='+351923456789'`);
  expect(await eligible()).toBe(false);
});
it('catalog md5 baseline matches Live; print candidate md5 without applying it remotely',async()=>{
  await db.exec(readFileSync('supabase/manual/0276_issue359_whatsapp_coala_legacy.sql','utf8'));
  const baseline=(await db.query<{v:string}>(`SELECT md5(pg_get_functiondef('crm_whatsapp_eligible(uuid)'::regprocedure)) v`)).rows[0]?.v;
  expect(baseline).toBe('dd895c8448e0b5cb0e83c2dbd9554dac');
  await db.exec(sql('C_eligible'));
  const candidate=(await db.query<{v:string}>(`SELECT md5(pg_get_functiondef('crm_whatsapp_eligible(uuid)'::regprocedure)) v`)).rows[0]?.v;
  expect(candidate).not.toBe(baseline);
  console.log(`crm_whatsapp_eligible local baseline=${baseline}; candidate=${candidate}`);
});