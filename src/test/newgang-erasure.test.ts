// @vitest-environment node
// R2 passo 4 — apagamento a pedido (club_member_erase) em PGlite com esquema mínimo.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const sql = readFileSync("supabase/manual/0263_newgang_erasure_on_request.sql", "utf8");
const CO = "c0000000-0000-0000-0000-000000000001";
const SITE = "50000000-0000-0000-0000-000000000001";
const M = "a0000000-0000-0000-0000-000000000001";
const CT = "b0000000-0000-0000-0000-000000000001";
const EMAIL = " Ana.Teste@Example.PT ";
const H = createHash("sha256").update("ana.teste@example.pt").digest("hex");
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE contacts(id uuid PRIMARY KEY, email text);
  CREATE TABLE club_members(id uuid PRIMARY KEY, company_id uuid, site_id uuid, contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
    email text NOT NULL, phone text, first_name text, instagram_handle text, tiktok_handle text, pending_crew_code text, pending_crew_status text, updated_at timestamptz);
  CREATE TABLE club_member_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id uuid, site_id uuid, email text);
  CREATE TABLE club_wallet_passes(member_id uuid);
  CREATE TABLE club_member_profiles(member_id uuid, birth_date date, birth_country text, residence_country text, city text, updated_at timestamptz);
  CREATE TABLE club_mission_submissions(member_id uuid, proof_url text, proof_image_path text, reject_reason text);
  CREATE TABLE club_points(member_id uuid, rule_key text, points int, reason text);
  CREATE TABLE email_unsubscribe_tokens(company_id uuid, email text);
  CREATE TABLE email_send_log(recipient_email text);
  CREATE TABLE suppressed_emails(email text NOT NULL, reason text NOT NULL, company_id uuid, CONSTRAINT suppressed_emails_reason_check CHECK (reason IN ('unsubscribe')));
  CREATE UNIQUE INDEX ON suppressed_emails(email, company_id) NULLS NOT DISTINCT;
  CREATE TABLE club_member_whatsapp_consents(member_id uuid, decision text);
  CREATE TABLE consent_calls(kind text, member_id uuid, decision text, k uuid, UNIQUE(kind, member_id, k));
  CREATE FUNCTION _club_site_lock(uuid, boolean) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION _club332_email_append(p uuid, s uuid, d text, k uuid, o text) RETURNS void LANGUAGE sql AS $$ INSERT INTO consent_calls VALUES('email',p,d,k) $$;
  CREATE FUNCTION _club332_whatsapp_append(p uuid, s uuid, d text, k uuid, o text) RETURNS void LANGUAGE sql AS $$ INSERT INTO consent_calls VALUES('whatsapp',p,d,k) $$;
  CREATE FUNCTION _club332_ads_append(p uuid, s uuid, d text, a text[], k uuid, o text) RETURNS void LANGUAGE sql AS $$ INSERT INTO consent_calls VALUES('ads',p,d,k) $$;
  INSERT INTO contacts VALUES('${CT}','x');
  INSERT INTO club_members VALUES('${M}','${CO}','${SITE}','${CT}','${EMAIL}','+351910000000','Ana','ana.t','ana.t',NULL,NULL,now());
  INSERT INTO club_member_sessions(member_id,site_id,email) VALUES('${M}','${SITE}',NULL),(NULL,'${SITE}','ana.teste@example.pt');
  INSERT INTO club_wallet_passes VALUES('${M}');
  INSERT INTO club_member_profiles VALUES('${M}','2000-01-01','PT','PT','Lisboa',now());
  INSERT INTO club_mission_submissions VALUES('${M}','https://x/p','p/1.jpg',NULL);
  INSERT INTO club_points VALUES('${M}','join',10,'texto'),('${M}','mission',20,NULL);
  INSERT INTO email_unsubscribe_tokens VALUES('${CO}','ana.teste@example.pt');
  INSERT INTO email_send_log VALUES('ana.teste@example.pt'),('outra@x.pt');
  INSERT INTO suppressed_emails VALUES('ana.teste@example.pt','unsubscribe','${CO}');
  INSERT INTO club_member_whatsapp_consents VALUES('${M}','granted');`);
  await db.exec(sql);
}, 60000);
afterAll(async () => { await db?.close(); });

const erase = async (dry?: boolean) => (await db.query<{ r: any }>(
  dry === undefined ? `SELECT club_member_erase('${M}') r` : `SELECT club_member_erase('${M}','erasure_request',${dry}) r`)).rows[0].r;
const one = async (q: string) => (await db.query<any>(q)).rows[0];

describe("club_member_erase", () => {
  it("só service_role tem EXECUTE; log fechado a anon/authenticated", async () => {
    const r = await one(`SELECT has_function_privilege('anon','club_member_erase(uuid,text,boolean,uuid)','EXECUTE') a,
      has_function_privilege('authenticated','club_member_erase(uuid,text,boolean,uuid)','EXECUTE') u,
      has_function_privilege('service_role','club_member_erase(uuid,text,boolean,uuid)','EXECUTE') s,
      has_table_privilege('authenticated','club_retention_log','SELECT') l`);
    expect(r).toEqual({ a: false, u: false, s: true, l: false });
  });
  it("dry_run por omissão: devolve contagens e não altera nada", async () => {
    const r = await erase();
    expect(r.status).toBe("dry_run");
    expect(r.email_sha256).toBe(H);
    expect(r.tables_affected).toMatchObject({ club_member_sessions: 2, contacts: 1, email_send_log: 1, suppressed_emails_plain_removed: 1 });
    expect((await one(`SELECT email, first_name FROM club_members`))).toEqual({ email: EMAIL, first_name: "Ana" });
    expect((await one(`SELECT count(*)::int n FROM club_retention_log`)).n).toBe(0);
    expect((await one(`SELECT count(*)::int n FROM consent_calls`)).n).toBe(0);
  });
  it("eliminação real: dados pessoais apagados, pontos/missões anónimos", async () => {
    const r = await erase(false);
    expect(r.status).toBe("erased");
    const m = await one(`SELECT email, phone, first_name, instagram_handle, tiktok_handle, contact_id, erased_at IS NOT NULL e FROM club_members`);
    expect(m).toEqual({ email: `erased+${M}@invalid`, phone: null, first_name: null, instagram_handle: null, tiktok_handle: null, contact_id: null, e: true });
    expect((await one(`SELECT count(*)::int n FROM contacts`)).n).toBe(0);
    expect((await one(`SELECT count(*)::int n FROM club_member_sessions`)).n).toBe(0);
    expect((await one(`SELECT count(*)::int n FROM club_wallet_passes`)).n).toBe(0);
    expect((await one(`SELECT count(*)::int n FROM email_unsubscribe_tokens`)).n).toBe(0);
    expect(await one(`SELECT birth_date, city FROM club_member_profiles`)).toEqual({ birth_date: null, city: null });
    expect(await one(`SELECT proof_url, proof_image_path FROM club_mission_submissions`)).toEqual({ proof_url: null, proof_image_path: null });
    expect(await one(`SELECT sum(points)::int p, count(reason)::int r FROM club_points`)).toEqual({ p: 30, r: 0 });
    expect((await db.query(`SELECT recipient_email FROM email_send_log ORDER BY 1`)).rows.map((x: any) => x.recipient_email)).toEqual(["outra@x.pt", `sha256:${H}`]);
  });
  it("supressão só por hash (reason=erasure_request), sem email em claro", async () => {
    const rows = (await db.query<any>(`SELECT email, reason FROM suppressed_emails ORDER BY email`)).rows;
    expect(rows).toEqual([{ email: `erased+${M}@invalid`, reason: "erasure_request" }, { email: `sha256:${H}`, reason: "erasure_request" }]);
  });
  it("consentimentos email, WhatsApp e anúncios revogados", async () => {
    const rows = (await db.query<any>(`SELECT kind, decision FROM consent_calls ORDER BY kind`)).rows;
    expect(rows).toEqual([{ kind: "ads", decision: "revoked" }, { kind: "email", decision: "revoked" }, { kind: "whatsapp", decision: "revoked" }]);
  });
  it("prova sem dados pessoais", async () => {
    const l = await one(`SELECT old_member_id, email_sha256, reason, tables_affected::text t FROM club_retention_log`);
    expect(l.old_member_id).toBe(M);
    expect(l.email_sha256).toBe(H);
    expect(l.reason).toBe("erasure_request");
    expect(l.t).not.toMatch(/example|Ana|351/i);
  });
  it("idempotente: segunda chamada não altera nada", async () => {
    const r = await erase(false);
    expect(r.status).toBe("already_erased");
    expect((await one(`SELECT count(*)::int n FROM club_retention_log`)).n).toBe(1);
    expect((await one(`SELECT count(*)::int n FROM consent_calls`)).n).toBe(3);
  });
  it("motivo inválido é rejeitado", async () => {
    await expect(db.query(`SELECT club_member_erase('${M}','outro',false)`)).rejects.toThrow(/erase_reason/);
  });
});
