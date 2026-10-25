// #359 — rascunhos SQL (supabase/manual) executados em PGlite com stubs mínimos.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const C = "7d831e59-6e82-427b-95a0-64904aae5dd2";
const read = (p: string) => readFileSync(p, "utf8");
const m0169 = read("drizzle/migrations/0169_issue321_crm_ingest_counters_on_success.sql");
const ingestOrig = m0169.slice(m0169.indexOf("CREATE OR REPLACE FUNCTION public.crm_ingest_lead_captures("), m0169.indexOf("$function$;", m0169.indexOf("AS $function$") + 5) + 11);
const m0196 = read("drizzle/migrations/0196_newgang_crm_members_whatsapp.sql");
const gi = m0196.indexOf("CREATE FUNCTION public._crm_whatsapp_contact_guard()");
const guardOrig = m0196.slice(gi, m0196.indexOf("END $$;", gi) + 8);
const draftB = read("supabase/manual/draft_359_migracao_B.sql");
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE public.companies(id uuid PRIMARY KEY); INSERT INTO companies VALUES ('${C}');
  CREATE FUNCTION public.row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql AS 'select true';
  CREATE TABLE public.lead_capture(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, consent_whatsapp boolean);
  CREATE TABLE public.contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, consent_whatsapp boolean DEFAULT false,
    consent_whatsapp_at timestamptz, consent_whatsapp_source text,
    CONSTRAINT contacts_consent_whatsapp_source_check CHECK (consent_whatsapp_source IN ('club_profile_whatsapp-v1','form_legacy_sem_prova')));
  CREATE FUNCTION public._crm_whatsapp_latest(p_contact uuid,p_company uuid) RETURNS TABLE(decision text,decided_at timestamptz,phone text,phone_fp text)
    LANGUAGE sql AS 'select null::text,null::timestamptz,null::text,null::text where false';`);
  await db.exec(ingestOrig);
  await db.exec(guardOrig);
  await db.exec(`CREATE TRIGGER crm_whatsapp_contact_guard BEFORE INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public._crm_whatsapp_contact_guard();`);
}, 60000);
afterAll(async () => { await db?.close(); });

describe("#359 rascunhos", () => {
  it("B aborta antes da A (tabela ausente)", async () => {
    await expect(db.exec(draftB)).rejects.toThrow(/source_drift_359/);
  });
  it("A cria tabela com sha256 gerado e imutável; colunas opcionais", async () => {
    await db.exec(read("supabase/manual/draft_359_migracao_A.sql"));
    const t = "Autorizo o Coala Festival Portugal a enviar-me mensagens por WhatsApp sobre bilhetes, cartaz e novidades do festival. Posso cancelar quando quiser.";
    await db.query(`INSERT INTO consent_text_versions(version,company_id,locale,channel,text,valid_from) VALUES ('coala-form-2026-10-v1',$1,'pt','whatsapp',$2,'2026-10-01')`, [C, t]);
    const { createHash } = await import("node:crypto");
    const r = await db.query<{ text_sha256: string }>(`SELECT text_sha256 FROM consent_text_versions`);
    expect(r.rows[0].text_sha256).toBe(createHash("sha256").update(t, "utf8").digest("hex"));
    await expect(db.exec(`UPDATE consent_text_versions SET text='x'`)).rejects.toThrow(/immutable/);
    await expect(db.exec(`DELETE FROM consent_text_versions`)).rejects.toThrow(/immutable/);
    await db.exec(`UPDATE consent_text_versions SET valid_to='2027-01-01'`);
    await expect(db.exec(`UPDATE consent_text_versions SET valid_to='2028-01-01'`)).rejects.toThrow(/immutable/);
    await expect(db.exec(`INSERT INTO consent_text_versions(version,company_id,locale,channel,text) VALUES ('X',' ${C}','pt','sms','t')`)).rejects.toThrow();
    const cols = await db.query(`SELECT column_name,is_nullable FROM information_schema.columns WHERE table_name='lead_capture' AND column_name LIKE 'consent_%' AND column_name<>'consent_whatsapp' ORDER BY 1`);
    expect(cols.rows).toEqual([{ column_name: "consent_decided_at", is_nullable: "YES" }, { column_name: "consent_email_text_version", is_nullable: "YES" }, { column_name: "consent_whatsapp_text_version", is_nullable: "YES" }]);
  });
  it("B aplica; guarda aceita versão provada e cai em legado no resto", async () => {
    await db.exec(draftB);
    const ins = async (src: string | null) => (await db.query<{ consent_whatsapp_source: string }>(
      `INSERT INTO contacts(company_id,consent_whatsapp,consent_whatsapp_source) VALUES ($1,true,$2) RETURNING consent_whatsapp_source`, [C, src])).rows[0].consent_whatsapp_source;
    expect(await ins("form_coala_coala-form-2026-10-v1")).toBe("form_coala_coala-form-2026-10-v1");
    expect(await ins("form_coala_inventada-v9")).toBe("form_legacy_sem_prova");
    expect(await ins(null)).toBe("form_legacy_sem_prova");
    await expect(db.exec(`ALTER TABLE contacts DISABLE TRIGGER crm_whatsapp_contact_guard; INSERT INTO contacts(consent_whatsapp_source) VALUES ('outra')`)).rejects.toThrow();
    await db.exec(`ALTER TABLE contacts ENABLE TRIGGER crm_whatsapp_contact_guard`);
  });
  it("ingestão: só muda consent_whatsapp_at/source no INSERT de contacts face à 0169", () => {
    const start = draftB.indexOf("CREATE OR REPLACE FUNCTION public.crm_ingest_lead_captures(");
    const ing = draftB.slice(start, draftB.indexOf("$function$;", draftB.indexOf("AS $function$", start) + 5) + 11);
    const a = ingestOrig.split("\n"), b = ing.split("\n");
    const removed = a.filter(l => !b.includes(l)), added = b.filter(l => !a.includes(l));
    expect(removed.map(s => s.trim())).toEqual([
      "consent_email, consent_whatsapp, consent_email_at, consent_whatsapp_at,",
      "CASE WHEN coalesce(lc.consent_whatsapp, false) THEN lc.created_at END,"]);
    expect(added).toHaveLength(3);
    expect(added.join("\n")).toContain("'form_coala_' || lc.consent_whatsapp_text_version");
    expect(added.join("\n")).toContain("coalesce(lc.consent_decided_at, lc.created_at)");
  });
  it("rollback repõe os corpos originais byte-a-byte", async () => {
    await db.exec(`DELETE FROM contacts WHERE consent_whatsapp_source LIKE 'form_coala%'`);
    await db.exec(read("supabase/manual/rollback_359.sql"));
    const md5 = await db.query<{ f: string; m: string }>(`SELECT proname f, md5(prosrc) m FROM pg_proc WHERE proname IN ('crm_ingest_lead_captures','_crm_whatsapp_contact_guard') ORDER BY 1`);
    expect(md5.rows).toEqual([{ f: "_crm_whatsapp_contact_guard", m: "ac7469e0912c890f186d880951623c54" }, { f: "crm_ingest_lead_captures", m: "1dbcd55e81cd63e58e3fb613d9db0283" }]);
  });
});
