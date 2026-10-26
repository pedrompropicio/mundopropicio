// @vitest-environment node
// #359 — rascunho C (anti-forja lead_capture) em PGlite com papéis reais via SET ROLE.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const draftC = readFileSync("supabase/manual/draft_359_migracao_C_trigger.sql", "utf8");
const CE = "c0000000-0000-0000-0000-000000000001";
let db: PGlite;
const PROOF = "consent_email_text_version, consent_whatsapp_text_version, consent_decided_at";
const OTHER = "name, email, consent_email, consent_whatsapp, consent_event_id, raw";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_admin;
  CREATE TABLE public.lead_capture(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, email text,
    consent_email boolean, consent_whatsapp boolean, consent_event_id uuid, raw jsonb,
    consent_email_text_version text, consent_whatsapp_text_version text, consent_decided_at timestamptz);
  GRANT INSERT, SELECT ON public.lead_capture TO anon;
  GRANT INSERT, SELECT, UPDATE ON public.lead_capture TO authenticated, service_role;`);
}, 60000);
afterAll(async () => { await db?.close(); });

async function insertAs(role: string) {
  await db.exec(`SET ROLE ${role}`);
  const r = await db.query<Record<string, unknown>>(`INSERT INTO lead_capture(${OTHER}, ${PROOF})
    VALUES ('N','n@x.pt',true,true,'${CE}','{"a":1}','forjada-v1','forjada-v1','2020-01-01Z') RETURNING *`);
  await db.exec(`RESET ROLE`);
  return r.rows[0];
}
const other = (r: Record<string, unknown>) => ({ name: r.name, email: r.email, ce: r.consent_email, cw: r.consent_whatsapp, ev: r.consent_event_id, raw: r.raw });
const expectedOther = { name: "N", email: "n@x.pt", ce: true, cw: true, ev: CE, raw: { a: 1 } };

describe("#359 migração C", () => {
  it("guarda aborta sem as colunas da A", async () => {
    const d = new PGlite();
    await d.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE public.lead_capture(id int)`);
    await expect(d.exec(draftC)).rejects.toThrow(/source_drift_359_c/);
    await d.close();
  });
  it("aplica; função SECURITY INVOKER sem EXECUTE para PUBLIC", async () => {
    await db.exec(draftC);
    const f = await db.query<{ prosecdef: boolean; pub: boolean }>(`SELECT prosecdef, has_function_privilege('anon','public._lead_capture_consent_proof_guard()','EXECUTE') pub FROM pg_proc WHERE proname='_lead_capture_consent_proof_guard'`);
    expect(f.rows[0]).toEqual({ prosecdef: false, pub: false });
  });
  it.each(["anon", "authenticated"])("INSERT como %s: prova fica NULL, linha entra, resto intacto", async (role) => {
    const r = await insertAs(role);
    expect([r.consent_email_text_version, r.consent_whatsapp_text_version, r.consent_decided_at]).toEqual([null, null, null]);
    expect(other(r)).toEqual(expectedOther);
  });
  it.each(["service_role", "postgres", "supabase_admin"])("INSERT como %s: prova mantém-se", async (role) => {
    const r = await insertAs(role);
    expect(r.consent_email_text_version).toBe("forjada-v1");
    expect(r.consent_whatsapp_text_version).toBe("forjada-v1");
    expect(r.consent_decided_at).not.toBeNull();
    expect(other(r)).toEqual(expectedOther);
  });
  it("UPDATE como authenticated não altera a prova mas altera outras colunas; anon sem UPDATE", async () => {
    const id = (await insertAs("service_role")).id as string;
    await db.exec(`SET ROLE authenticated`);
    const r = (await db.query<Record<string, unknown>>(`UPDATE lead_capture SET consent_email_text_version='x', consent_whatsapp_text_version=NULL, consent_decided_at=now(), name='M' WHERE id=$1 RETURNING *`, [id])).rows[0];
    await db.exec(`RESET ROLE`);
    expect([r.consent_email_text_version, r.consent_whatsapp_text_version, r.name]).toEqual(["forjada-v1", "forjada-v1", "M"]);
    expect(new Date(r.consent_decided_at as string).toISOString()).toBe("2020-01-01T00:00:00.000Z");
    await db.exec(`SET ROLE anon`);
    await expect(db.query(`UPDATE lead_capture SET name='z' WHERE id=$1`, [id])).rejects.toThrow(/permission denied/);
    await db.exec(`RESET ROLE`);
  });
  it.each(["service_role", "postgres"])("UPDATE como %s altera a prova", async (role) => {
    const id = (await insertAs("service_role")).id as string;
    await db.exec(`SET ROLE ${role}`);
    const r = (await db.query<Record<string, unknown>>(`UPDATE lead_capture SET consent_email_text_version='v2', consent_decided_at=NULL WHERE id=$1 RETURNING *`, [id])).rows[0];
    await db.exec(`RESET ROLE`);
    expect([r.consent_email_text_version, r.consent_decided_at]).toEqual(["v2", null]);
    expect(other(r)).toEqual(expectedOther);
  });
  it("SECURITY DEFINER de postgres chamado por anon é tratado como confiança (como crm_ingest_*)", async () => {
    await db.exec(`CREATE FUNCTION public.f_def() RETURNS text LANGUAGE sql SECURITY DEFINER AS
      $$ INSERT INTO lead_capture(consent_decided_at) VALUES ('2021-01-01Z') RETURNING consent_decided_at::text $$;
      GRANT EXECUTE ON FUNCTION public.f_def() TO anon; SET ROLE anon;`);
    const r = await db.query<{ f_def: string }>(`SELECT public.f_def()`);
    await db.exec(`RESET ROLE`);
    expect(r.rows[0].f_def).not.toBeNull();
  });
  it("rollback (bloco C comentado) remove trigger e função", async () => {
    const rb = readFileSync("supabase/manual/rollback_359.sql", "utf8");
    const blk = rb.slice(rb.indexOf("-- Migração C")).split("\n").filter(l => l.startsWith("-- DROP")).map(l => l.slice(3)).join("\n");
    await db.exec(blk);
    const n = await db.query(`SELECT 1 FROM pg_proc WHERE proname='_lead_capture_consent_proof_guard'`);
    expect(n.rows).toHaveLength(0);
  });
});
