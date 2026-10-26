// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const sql = readFileSync("supabase/manual/0261_issue359_lead_capture_consent_resumo.sql", "utf8");
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.lead_capture(id int PRIMARY KEY, company_id uuid, source text,
      created_at timestamptz, email text, name text, consent_email boolean,
      consent_email_text_version text, consent_whatsapp boolean,
      consent_whatsapp_text_version text, consent_decided_at timestamptz,
      consent_event_id uuid, fbp text, fbc text, raw jsonb);
    INSERT INTO public.lead_capture(id,consent_event_id,fbp,fbc,raw) VALUES
      (1,'00000000-0000-0000-0000-000000000001','pixel',null,'{"consent_proof_origin":"historico_site"}'),
      (2,null,'pixel',null,'{}'), (3,null,null,'click','{}'),
      (4,null,null,null,null), (5,null,null,null,'{"consent_proof_origin":"other"}');
    GRANT SELECT ON public.lead_capture TO authenticated;
    ALTER TABLE public.lead_capture ENABLE ROW LEVEL SECURITY;
    CREATE POLICY visible_rows ON public.lead_capture FOR SELECT TO authenticated USING (id = 1);`);
  await db.exec(sql);
}, 60000);
afterAll(async () => { await db?.close(); });

describe("#359 consent summary", () => {
  it("tracked migration matches the manual copy byte for byte", () => {
    expect(readFileSync("drizzle/migrations/0261_issue359_lead_capture_consent_resumo.sql", "utf8")).toBe(sql);
  });
  it("contains invoker, exact categories and anonymous revocation", () => {
    expect(sql).toMatch(/security_invoker\s*=\s*true/i);
    for (const value of ["aceite_com_prova", "aceite_inferido_pixel", "sem_registo", "historico_site", "registada_na_hora"])
      expect(sql).toContain(`'${value}'`);
    expect(sql).toMatch(/REVOKE ALL ON public\.lead_capture_consent_resumo FROM PUBLIC, anon/);
  });
  it("prioritizes consent_event_id over pixels", async () => {
    const result = await db.query("SELECT cookies_marketing FROM public.lead_capture_consent_resumo WHERE id=1");
    expect(result.rows).toEqual([{ cookies_marketing: "aceite_com_prova" }]);
  });
  it("infers from either fbp or fbc only when proof is absent", async () => {
    const result = await db.query("SELECT cookies_marketing FROM public.lead_capture_consent_resumo WHERE id IN (2,3) ORDER BY id");
    expect(result.rows).toEqual([{ cookies_marketing: "aceite_inferido_pixel" }, { cookies_marketing: "aceite_inferido_pixel" }]);
  });
  it("returns sem_registo without proof or pixels", async () => {
    const result = await db.query("SELECT cookies_marketing FROM public.lead_capture_consent_resumo WHERE id=4");
    expect(result.rows).toEqual([{ cookies_marketing: "sem_registo" }]);
  });
  it("marks only the explicit historical origin", async () => {
    const result = await db.query("SELECT origem_prova FROM public.lead_capture_consent_resumo WHERE id IN (1,4,5) ORDER BY id");
    expect(result.rows).toEqual([{ origem_prova: "historico_site" }, { origem_prova: "registada_na_hora" }, { origem_prova: "registada_na_hora" }]);
  });
  it("denies anon SELECT and grants only SELECT to authenticated/service_role", async () => {
    const result = await db.query(`SELECT role,
      has_table_privilege(role,'public.lead_capture_consent_resumo','SELECT') AS sel,
      has_table_privilege(role,'public.lead_capture_consent_resumo','INSERT') AS ins,
      has_table_privilege(role,'public.lead_capture_consent_resumo','UPDATE') AS upd,
      has_table_privilege(role,'public.lead_capture_consent_resumo','DELETE') AS del
      FROM (VALUES ('anon'),('authenticated'),('service_role')) r(role) ORDER BY role`);
    expect(result.rows).toEqual([
      { role: "anon", sel: false, ins: false, upd: false, del: false },
      { role: "authenticated", sel: true, ins: false, upd: false, del: false },
      { role: "service_role", sel: true, ins: false, upd: false, del: false },
    ]);
  });
  it("respects underlying RLS rather than the view owner's privileges", async () => {
    await db.exec("SET ROLE authenticated");
    try {
      const result = await db.query("SELECT id FROM public.lead_capture_consent_resumo ORDER BY id");
      expect(result.rows).toEqual([{ id: 1 }]);
    } finally { await db.exec("RESET ROLE"); }
  });
});