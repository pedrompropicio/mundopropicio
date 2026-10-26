// @vitest-environment node
// #368 fase 2 — 0264 em PGlite: leads anonimizadas, reinscrição limpa só a supressão por apagamento.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const sql = readFileSync("supabase/manual/0264_newgang_erasure_leads_resubscribe.sql", "utf8");
const CO = "c0000000-0000-0000-0000-000000000001", SITE = "50000000-0000-0000-0000-000000000001";
const M = "a0000000-0000-0000-0000-000000000001", M2 = "a0000000-0000-0000-0000-000000000002";
const CT = "b0000000-0000-0000-0000-000000000001", CT2 = "b0000000-0000-0000-0000-000000000002";
const E = "ana.teste@example.pt", H = createHash("sha256").update(E).digest("hex");
let db: PGlite;
const one = async (q: string) => (await db.query<any>(q)).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE contacts(id uuid PRIMARY KEY, company_id uuid, email text, phone_e164 text, name text, consent_email boolean, consent_whatsapp boolean, is_active boolean, updated_at timestamptz);
  CREATE TABLE leads(id serial, contact_id uuid, ip_inet inet, user_agent text, meta jsonb, kind text);
  CREATE TABLE club_members(id uuid PRIMARY KEY, company_id uuid, site_id uuid, contact_id uuid, email text NOT NULL, phone text, first_name text, instagram_handle text, tiktok_handle text, pending_crew_code text, pending_crew_status text, updated_at timestamptz, erased_at timestamptz);
  CREATE TABLE lead_capture(id serial, company_id uuid, email text, name text, phone text, ip_inet inet, user_agent text, raw jsonb, source text, processed boolean);
  CREATE TABLE coala_invites(company_id uuid, email text NOT NULL, confirm_url text NOT NULL);
  CREATE TABLE coala_list_consents(company_id uuid, email text);
  CREATE TABLE fever_buyers(company_id uuid, email text NOT NULL, first_name text, last_name text, order_ref text);
  CREATE TABLE meta_audience_upload_members(company_id uuid, email text, phone_e164 text, email_hash_sha256 text);
  CREATE TABLE vip_coupon_email_log(email text);
  CREATE TABLE club_member_sessions(member_id uuid, site_id uuid, email text);
  CREATE TABLE club_wallet_passes(member_id uuid);
  CREATE TABLE club_member_profiles(member_id uuid, birth_date date, birth_country text, residence_country text, city text, updated_at timestamptz);
  CREATE TABLE club_mission_submissions(member_id uuid, proof_url text, proof_image_path text, reject_reason text);
  CREATE TABLE club_points(member_id uuid, rule_key text, reason text);
  CREATE TABLE email_unsubscribe_tokens(company_id uuid, email text);
  CREATE TABLE email_send_log(recipient_email text);
  CREATE TABLE suppressed_emails(email text NOT NULL, reason text NOT NULL, company_id uuid, UNIQUE(email, company_id));
  CREATE TABLE club_member_whatsapp_consents(member_id uuid);
  CREATE TABLE club_member_email_consents(id bigserial, member_id uuid, site_id uuid, company_id uuid, version text, decision text, origin text, idempotency_key uuid);
  CREATE TABLE club_retention_log(id bigserial, run_id uuid NOT NULL, old_member_id uuid NOT NULL, email_sha256 text NOT NULL, reason text NOT NULL CONSTRAINT club_retention_log_reason_check CHECK (reason IN ('erasure_request','retention_36m')), tables_affected jsonb NOT NULL, created_at timestamptz DEFAULT now());
  CREATE FUNCTION _club_site_lock(uuid, boolean) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION _club332_email_append(p uuid, s uuid, d text, k uuid, o text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION _club332_whatsapp_append(p uuid, s uuid, d text, k uuid, o text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION _club332_ads_append(p uuid, s uuid, d text, a text[], k uuid, o text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  INSERT INTO contacts VALUES('${CT}','${CO}','${E}','+351910000000','Ana',true,true,true,now()),('${CT2}','${CO}',' ANA.teste@example.pt','+351910000001','Ana B',true,false,true,now());
  INSERT INTO leads(contact_id,ip_inet,user_agent,meta,kind) VALUES('${CT2}','1.2.3.4','ua','{"a":1}','lead'),('${CT}',NULL,'ua2',NULL,'lead');
  INSERT INTO club_members VALUES('${M}','${CO}','${SITE}','${CT}','${E}','+351910000000','Ana',NULL,NULL,NULL,NULL,now(),NULL);
  INSERT INTO lead_capture(company_id,email,name,phone,ip_inet,user_agent,raw,source,processed) VALUES
   ('${CO}','Ana.Teste@example.pt','Ana','+351910000000','1.2.3.4','ua','{"email":"x","first_name":"Ana","city":"Lisboa","utm":"y"}','clube_newgang',true),
   ('${CO}','outra@x.pt','Outra',NULL,NULL,NULL,'{}','coala_hero',true);
  INSERT INTO coala_invites VALUES('${CO}','${E}','https://c/t');
  INSERT INTO coala_list_consents VALUES('${CO}','${E}');
  INSERT INTO fever_buyers VALUES('${CO}','${E}','Ana','T','F1');
  INSERT INTO meta_audience_upload_members VALUES('${CO}','${E}','+351','hh');
  INSERT INTO vip_coupon_email_log VALUES('${E}');
  INSERT INTO suppressed_emails VALUES('sha256:${H}','bounce','00000000-0000-0000-0000-000000000009');`);
  await db.exec(sql);
}, 60000);
afterAll(async () => { await db?.close(); });

describe("0264 club_member_erase + reinscrição", () => {
  it("dry_run conta as leads e não altera nada", async () => {
    const r = (await one(`SELECT club_member_erase('${M}') r`)).r;
    expect(r.status).toBe("dry_run");
    expect(r.tables_affected).toMatchObject({ lead_capture: 1, contacts_anonymized: 1, leads_anonymized: 2, coala_invites: 1, fever_buyers: 1, meta_audience_upload_members: 1, vip_coupon_email_log: 1 });
    expect((await one(`SELECT email FROM lead_capture WHERE id=1`)).email).toBe("Ana.Teste@example.pt");
  });
  it("apagamento real: registos mantidos, PII a NULL, outros leads intocados", async () => {
    expect((await one(`SELECT club_member_erase('${M}','erasure_request',false) r`)).r.status).toBe("erased");
    expect(await one(`SELECT email,name,phone,ip_inet,raw,source,processed FROM lead_capture WHERE id=1`)).toEqual({ email: null, name: null, phone: null, ip_inet: null, raw: { city: "Lisboa", utm: "y" }, source: "clube_newgang", processed: true });
    expect((await one(`SELECT email FROM lead_capture WHERE id=2`)).email).toBe("outra@x.pt");
    expect((await one(`SELECT count(*)::int n FROM lead_capture`)).n).toBe(2);
    expect(await one(`SELECT email,phone_e164,name,is_active FROM contacts WHERE id='${CT2}'`)).toEqual({ email: null, phone_e164: null, name: null, is_active: false });
    expect(await one(`SELECT count(*)::int n, count(ip_inet)::int ip FROM leads WHERE contact_id='${CT2}'`)).toEqual({ n: 1, ip: 0 });
    expect((await one(`SELECT email FROM fever_buyers`)).email).toBe(`erased+${M}@invalid`);
    expect((await one(`SELECT order_ref FROM fever_buyers`)).order_ref).toBe("F1");
    expect(await one(`SELECT email, email_hash_sha256 FROM meta_audience_upload_members`)).toEqual({ email: null, email_hash_sha256: "hh" });
    expect((await one(`SELECT count(*)::int n FROM suppressed_emails WHERE email='sha256:${H}' AND reason='erasure_request'`)).n).toBe(1);
  });
  it("log sem PII (sem emails nem telefones)", async () => {
    const t = JSON.stringify((await db.query(`SELECT * FROM club_retention_log`)).rows);
    expect(t).not.toMatch(/example\.pt|\+351\d+/);
  });
  it("idempotente", async () => {
    expect((await one(`SELECT club_member_erase('${M}','erasure_request',false) r`)).r.status).toBe("already_erased");
  });
  it("reinscrição sem consentimento novo: continua suprimido", async () => {
    await db.exec(`INSERT INTO club_members(id,company_id,site_id,email) VALUES('${M2}','${CO}','${SITE}','${E}');
     INSERT INTO club_member_email_consents(member_id,site_id,company_id,version,decision,origin,idempotency_key) VALUES('${M2}','${SITE}','${CO}','email-v3','revoked','club_session',gen_random_uuid()),('${M2}','${SITE}','${CO}','email-v3','granted','club_session',gen_random_uuid());`);
    expect((await one(`SELECT count(*)::int n FROM suppressed_emails WHERE email='sha256:${H}' AND company_id='${CO}'`)).n).toBe(1);
  });
  it("reinscrição com consentimento novo: limpa só a supressão por apagamento desta empresa e regista sem PII", async () => {
    await db.exec(`INSERT INTO club_member_email_consents(member_id,site_id,company_id,version,decision,origin,idempotency_key) VALUES('${M2}','${SITE}','${CO}','email-v3','granted','signup',gen_random_uuid())`);
    expect((await one(`SELECT count(*)::int n FROM suppressed_emails WHERE email='sha256:${H}' AND company_id='${CO}'`)).n).toBe(0);
    expect((await one(`SELECT count(*)::int n FROM suppressed_emails WHERE email='sha256:${H}' AND reason='bounce'`)).n).toBe(1);
    expect((await one(`SELECT count(*)::int n FROM suppressed_emails WHERE email='erased+${M}@invalid'`)).n).toBe(1);
    const l = await one(`SELECT old_member_id, email_sha256 FROM club_retention_log WHERE reason='resubscribe_clear'`);
    expect(l).toEqual({ old_member_id: M2, email_sha256: H });
  });
});
