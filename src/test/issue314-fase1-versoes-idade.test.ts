// @vitest-environment node
// #314 Fase 1 — idade pela data completa e versões v4/v2, com as funções reais da migração 0265 em PGlite.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const MIG = readFileSync("supabase/manual/0265_issue314_fase1_versoes_idade.sql", "utf8");
const blocks = MIG.split(/\n(?=CREATE OR REPLACE FUNCTION )/);
const fn = (name: string) => {
  const b = blocks.find((x) => x.startsWith(`CREATE OR REPLACE FUNCTION public.${name}(`));
  if (!b) throw new Error(`bloco ${name} em falta`);
  return b;
};
const MP = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const SITE = "51000000-0000-0000-0000-000000000001";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA net; CREATE TABLE net.calls(body jsonb);
  CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.calls VALUES (body) RETURNING 1::bigint $$;
  CREATE TABLE portal_sites(id uuid PRIMARY KEY, company_id uuid, brand_key text, active boolean, domain text, created_at timestamptz DEFAULT now());
  INSERT INTO portal_sites VALUES ('${SITE}','${MP}','newgang',true,'newgangfestival.pt');
  CREATE TABLE events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, slug text);
  CREATE TABLE contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, email text, phone_e164 text, name text,
    consent_email boolean, consent_whatsapp boolean, consent_email_at timestamptz, consent_whatsapp_at timestamptz, source text,
    first_seen_at timestamptz, last_activity_at timestamptz, updated_at timestamptz);
  CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, contact_id uuid, event_id uuid, kind text, source text,
    utm_source text, utm_medium text, utm_campaign text, utm_content text, ip_inet inet, user_agent text, fbc text, fbp text,
    geo_country text, geo_city text, geo_region text, created_at timestamptz, meta jsonb, capi_status text, capi_block_reason text, capi_classified_at timestamptz);
  CREATE TABLE lead_capture(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, source text, email text, phone text, name text,
    raw jsonb DEFAULT '{}', consent_email boolean, consent_whatsapp boolean, event_slug text, utm_source text, utm_medium text, utm_campaign text,
    utm_content text, ip_inet inet, user_agent text, fbc text, fbp text, geo_country text, geo_city text, geo_region text,
    created_at timestamptz DEFAULT now(), processed boolean DEFAULT false, processed_at timestamptz, processing_error text);
  CREATE TABLE club_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, company_id uuid, email text, phone text,
    contact_id uuid, confirmed_at timestamptz, source text, created_at timestamptz DEFAULT now(),
    pending_crew_code text, pending_crew_status text, pending_crew_checked_at timestamptz);
  CREATE TABLE club_member_profiles(member_id uuid PRIMARY KEY, site_id uuid, company_id uuid, birth_date date, updated_at timestamptz DEFAULT now());
  CREATE TABLE suppressed_emails(company_id uuid, email text);
  CREATE TABLE consent_text_versions(company_id uuid, version text, channel text, locale text, valid_from timestamptz, valid_to timestamptz);
  INSERT INTO consent_text_versions VALUES ('${MP}','email-v3','email','pt','2020-01-01',NULL),('${MP}','email-v4','email','pt','2020-01-01',NULL);
  CREATE TABLE club_member_email_consents(id serial, member_id uuid, site_id uuid, company_id uuid, version text, decision text,
    decided_at timestamptz DEFAULT now(), origin text, idempotency_key uuid UNIQUE);
  CREATE FUNCTION club_upsert_member(p_site uuid, p_email text, p_first text, p_phone text, p_contact uuid, p_ref text, p_source text) RETURNS uuid
   LANGUAGE plpgsql AS $$ DECLARE r uuid; BEGIN SELECT id INTO r FROM club_members WHERE site_id=p_site AND lower(email)=lower(p_email);
   IF r IS NULL THEN INSERT INTO club_members(site_id,company_id,email,source) SELECT p_site, company_id, p_email, p_source FROM portal_sites WHERE id=p_site RETURNING id INTO r; END IF; RETURN r; END $$;
  CREATE FUNCTION club_record_terms(uuid, text, timestamptz) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION club_crew_join(uuid, text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;`);
  await db.exec(fn("club_age_class"));
  await db.exec(fn("_club314_birth_date"));
  for (const n of ["crm_ingest_lead_captures", "club_from_lead_capture", "_club332_consent_from_lead_capture", "_club332_email_append"]) await db.exec(fn(n));
  await db.exec(`CREATE TRIGGER trg_club_from_lead_capture AFTER UPDATE OF processed ON lead_capture FOR EACH ROW
    WHEN (NEW.processed IS TRUE AND OLD.processed IS DISTINCT FROM true) EXECUTE FUNCTION club_from_lead_capture();
  CREATE TRIGGER trg_club_zzz_consent_from_lead_capture AFTER UPDATE OF processed ON lead_capture FOR EACH ROW
    WHEN (NEW.processed = true AND OLD.processed IS DISTINCT FROM NEW.processed) EXECUTE FUNCTION _club332_consent_from_lead_capture();`);
}, 60000);
afterAll(async () => { await db?.close(); });

const one = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows[0];
const yearsAgo = (y: number, plusDays = 0) =>
  `((clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date - interval '${y} years' + interval '${plusDays} days')::date`;

async function capture(email: string, raw: Record<string, unknown>, consent = false) {
  const r = await one<{ id: string }>(`INSERT INTO lead_capture(company_id,source,email,name,raw,consent_email)
    VALUES ('${MP}','clube_newgang','${email}','Teste','${JSON.stringify(raw)}'::jsonb,${consent}) RETURNING id`);
  await db.query(`SELECT crm_ingest_lead_captures(10, ARRAY['${r.id}']::uuid[])`);
  return r.id;
}
const member = (email: string) => one<{ id: string; birth_date: string | null } | undefined>(
  `SELECT m.id, p.birth_date::text AS birth_date FROM club_members m LEFT JOIN club_member_profiles p ON p.member_id=m.id WHERE m.email='${email}'`);

describe("#314 club_age_class", () => {
  it("classes nos limites 13/18 e unknown", async () => {
    const r = await one<Record<string, string>>(`SELECT club_age_class(NULL) a, club_age_class('infinity'::date) b,
      club_age_class(${yearsAgo(13, 1)}) c, club_age_class(${yearsAgo(13)}) d, club_age_class(${yearsAgo(18, 1)}) e,
      club_age_class(${yearsAgo(18)}) f, club_age_class('1900-01-01') g`);
    expect(r).toEqual({ a: "unknown", b: "unknown", c: "under13", d: "minor", e: "minor", f: "adult", g: "adult" });
  });
  it("data da inscrição: só ISO real, não futura, ano >= 1900", async () => {
    const r = await one<Record<string, string | null>>(`SELECT _club314_birth_date('2000-02-29')::text a, _club314_birth_date('2001-02-29') b,
      _club314_birth_date('1899-12-31') c, _club314_birth_date('2999-01-01') d, _club314_birth_date('01/02/2000') e, _club314_birth_date(NULL) f`);
    expect(r).toEqual({ a: "2000-02-29", b: null, c: null, d: null, e: null, f: null });
  });
});

describe("#314 ingestão da inscrição", () => {
  it("menor de 13: não cria membro, contacto, lead, consentimento nem notificação", async () => {
    const before = await one<{ n: number }>(`SELECT count(*)::int n FROM net.calls`);
    const bd = (await one<{ d: string }>(`SELECT ${yearsAgo(10)}::text d`)).d;
    const id = await capture("u13@exemplo.invalid", { birth_date: bd, consent_text_version: "email-v4" }, true);
    const lc = await one(`SELECT processed, processing_error FROM lead_capture WHERE id='${id}'`);
    expect(lc).toEqual({ processed: true, processing_error: "under13_blocked" });
    expect(await member("u13@exemplo.invalid")).toBeUndefined();
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM contacts WHERE email='u13@exemplo.invalid'`)).n).toBe(0);
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM leads l JOIN lead_capture c ON l.meta->>'lead_capture_id'=c.id::text WHERE c.id='${id}'`)).n).toBe(0);
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM net.calls`)).n).toBe(before.n);
  });
  it("adulto com data válida: grava birth_date e consentimento email-v4", async () => {
    await capture("ad@exemplo.invalid", { birth_date: "1990-05-17", consent_text_version: "email-v4" }, true);
    const m = await member("ad@exemplo.invalid");
    expect(m?.birth_date).toBe("1990-05-17");
    const c = await one(`SELECT version, origin FROM club_member_email_consents WHERE member_id='${m!.id}'`);
    expect(c).toEqual({ version: "email-v4", origin: "signup" });
  });
  it("data já existente não é sobrescrita", async () => {
    await capture("ex@exemplo.invalid", { birth_date: "1985-01-01" });
    await capture("ex@exemplo.invalid", { birth_date: "1995-09-09" });
    expect((await member("ex@exemplo.invalid"))?.birth_date).toBe("1985-01-01");
  });
  it("sem data (ou data inválida): membro criado, perfil intocado, email-v3 continua aceite", async () => {
    await capture("nd@exemplo.invalid", { consent_text_version: "email-v3" }, true);
    await capture("iv@exemplo.invalid", { birth_date: "2001-02-29" });
    const nd = await member("nd@exemplo.invalid");
    expect(nd?.id).toBeTruthy();
    expect(nd?.birth_date).toBeNull();
    expect((await member("iv@exemplo.invalid"))?.birth_date).toBeNull();
    expect((await one(`SELECT version FROM club_member_email_consents WHERE member_id='${nd!.id}'`))).toEqual({ version: "email-v3" });
  });
  it("versão desconhecida não cria consentimento", async () => {
    await capture("vx@exemplo.invalid", { consent_text_version: "email-v9" }, true);
    const m = await member("vx@exemplo.invalid");
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM club_member_email_consents WHERE member_id='${m!.id}'`)).n).toBe(0);
  });
});

describe("#314 versão gravada pelo histórico de email", () => {
  it("grava a versão recebida; sem versão mantém email-v3; versão de outro canal é recusada", async () => {
    const m = (await member("ad@exemplo.invalid"))!.id;
    await db.exec(`BEGIN; SELECT set_config('club314.consent_version','email-v4',true);
      SELECT _club332_email_append('${m}','${SITE}','revoked','a0000000-0000-0000-0000-000000000001','club_session'); COMMIT;`);
    await db.query(`SELECT _club332_email_append('${m}','${SITE}','revoked','a0000000-0000-0000-0000-000000000002','club_session')`);
    const rows = (await db.query<{ version: string }>(`SELECT version FROM club_member_email_consents WHERE idempotency_key::text LIKE 'a0000000%' ORDER BY id`)).rows;
    expect(rows.map((r) => r.version)).toEqual(["email-v4", "email-v3"]);
    await db.exec(`BEGIN; SELECT set_config('club314.consent_version','anuncios-v2',true);`);
    await expect(db.query(`SELECT _club332_email_append('${m}','${SITE}','revoked','a0000000-0000-0000-0000-000000000003','club_session')`)).rejects.toThrow(/consent_payload/);
    await db.exec(`ROLLBACK`);
  });
});

describe("#314 texto da migração", () => {
  it("coletor v2 exige adulto pela data completa e aceita anuncios-v1/v2", () => {
    const c = fn("crm_meta_audience_collect_leads");
    expect(c).toContain("public.club_age_class(p.birth_date) = 'adult'");
    expect(c).not.toContain("interval '13 years'");
    expect(c).toContain("('anuncios-v1','anuncios-v2')");
  });
  it("preferências mantêm a guarda parental via club_age_class", () => {
    const p = fn("club_profile_preferences");
    expect(p).toContain("IF public.club_age_class(bd) IN ('under13','unknown') THEN RAISE EXCEPTION 'parental_flow_required'");
    for (const s of ["('email-v3','email-v4')", "('anuncios-v1','anuncios-v2')", "('whatsapp-v1','whatsapp-v2')"]) expect(p).toContain(s);
  });
  it("me expõe age_class e club_age_class nunca é executável por anon/PUBLIC", () => {
    expect(fn("club_profile_state")).toContain("'age_class',public.club_age_class(p.birth_date)");
    expect(MIG).toContain("REVOKE ALL ON FUNCTION public.club_age_class(date) FROM PUBLIC;");
    expect(MIG).toContain("GRANT EXECUTE ON FUNCTION public.club_age_class(date) TO authenticated, service_role;");
  });
});
