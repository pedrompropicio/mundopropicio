// #359 — versão do texto das caixas email/WhatsApp no kind=lead do portal-track.
import { describe, expect, it, vi } from "vitest";
import { createHandler } from "../../supabase/functions/portal-track/handler";
import { resolveConsentVersions, type ConsentVersionRow } from "../../supabase/functions/portal-track/consent-versions";

const COALA = "https://coalafestival.pt";
const V = "coala-form-2026-10-v1";
const ROWS: ConsentVersionRow[] = ["pt", "en"].flatMap(locale => ["email", "whatsapp"].map(channel => (
  { version: V, locale, channel, valid_from: "2026-10-01T00:00:00Z", valid_to: null })));

function harness(opts: { lookup?: "ok" | "fail" | "throw" } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const transport = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("/consent_text_versions")) {
      if (opts.lookup === "throw") throw new Error("down");
      if (opts.lookup === "fail") return new Response("{}", { status: 404 });
      return new Response(JSON.stringify(ROWS), { status: 200 });
    }
    return new Response(null, { status: 201 });
  });
  const geo = vi.fn(async () => ({ country: "PT", city: "Lisboa", region: "11" }));
  const handler = createHandler({ fetch: transport as unknown as typeof fetch, env: () => "fixture", lookupIpGeo: geo, isPrivateOrInvalid: () => false });
  const send = (payload: object, consent = true) => handler(new Request("https://fixture.invalid", {
    method: "POST", headers: { Origin: COALA, "Content-Type": "text/plain", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify({ kind: "lead", consent, payload }),
  }));
  const inserted = () => {
    const c = calls.find(x => x.url.includes("/rest/v1/lead_capture"));
    return c ? JSON.parse(String(c.init!.body)) : null;
  };
  return { calls, send, inserted, geo };
}
const base = { email: "fixture@example.invalid", consent_email: true, consent_whatsapp: true, source: "coala_early_bird" };

describe("portal-track #359 versões do consentimento", () => {
  it("sem campos de versão: um único pedido e row igual ao de hoje (sem colunas novas)", async () => {
    const h = harness();
    const r = await h.send({ ...base, consent_locale: "pt", consent_decided_at: "2026-10-25T10:00:00Z" });
    expect(r.status).toBe(200);
    expect(h.calls).toHaveLength(1);
    const row = h.inserted();
    for (const k of ["consent_email_text_version", "consent_whatsapp_text_version", "consent_decided_at", "raw"]) expect(row).not.toHaveProperty(k);
    expect(row).toMatchObject({ email: base.email, consent_email: true, consent_whatsapp: true, geo_country: "PT", ip_inet: "203.0.113.9" });
  });

  it.each(["pt", "en"])("versão válida %s grava ambas as versões e hora do servidor", async locale => {
    const h = harness();
    const before = Date.now();
    await h.send({ ...base, consent_email_text_version: V, consent_whatsapp_text_version: V, consent_locale: locale, consent_decided_at: "2020-01-01T00:00:00Z" });
    const row = h.inserted();
    expect(row.consent_email_text_version).toBe(V);
    expect(row.consent_whatsapp_text_version).toBe(V);
    expect(Date.parse(row.consent_decided_at)).toBeGreaterThanOrEqual(before);
    expect(row.raw).toEqual({ consent_locale: locale, consent_decided_at_client: "2020-01-01T00:00:00Z" });
    expect(h.calls[0].url).toContain("company_id=eq.7d831e59-6e82-427b-95a0-64904aae5dd2");
  });

  it("versão desconhecida → NULL + aviso, lead aceite", async () => {
    const h = harness();
    expect((await h.send({ ...base, consent_whatsapp_text_version: "coala-form-2099-v9", consent_locale: "pt" })).status).toBe(200);
    const row = h.inserted();
    expect(row.consent_whatsapp_text_version).toBeNull();
    expect(row.consent_decided_at).toBeNull();
    expect(row.raw.consent_version_warnings).toEqual(["whatsapp:unknown_version"]);
  });

  it("locale sem texto registado → NULL + aviso", async () => {
    const h = harness();
    await h.send({ ...base, consent_email_text_version: V, consent_locale: "es" });
    expect(h.inserted().consent_email_text_version).toBeNull();
    expect(h.inserted().raw.consent_version_warnings).toEqual(["email:unknown_version"]);
  });

  it("caixa falsa com versão → não grava essa versão", async () => {
    const h = harness();
    await h.send({ ...base, consent_whatsapp: false, consent_whatsapp_text_version: V, consent_email_text_version: V, consent_locale: "pt" });
    const row = h.inserted();
    expect(row.consent_whatsapp_text_version).toBeNull();
    expect(row.consent_email_text_version).toBe(V);
    expect(row.raw.consent_version_warnings).toEqual(["whatsapp:box_not_checked"]);
  });

  it.each(["fail", "throw"] as const)("lookup %s → NULL + aviso, nunca 4xx", async mode => {
    const h = harness({ lookup: mode });
    expect((await h.send({ ...base, consent_whatsapp_text_version: V, consent_locale: "pt" })).status).toBe(200);
    expect(h.inserted().consent_whatsapp_text_version).toBeNull();
    expect(h.inserted().raw.consent_version_warnings).toEqual(["lookup_failed"]);
  });

  it("geo intacta e consent_event_id não é tocado", async () => {
    const h = harness();
    await h.send({ ...base, consent_whatsapp_text_version: V, consent_locale: "pt" });
    const row = h.inserted();
    expect(row).toMatchObject({ geo_country: "PT", geo_city: "Lisboa", geo_region: "11" });
    expect(row).not.toHaveProperty("consent_event_id");
  });

  it("função pura: vigência fechada não valida", async () => {
    const r = await resolveConsentVersions({ payload: { consent_email: true, consent_email_text_version: V, consent_locale: "pt" }, company: "c", now: new Date("2026-11-01T00:00:00Z") },
      async () => [{ ...ROWS[0], valid_to: "2026-10-30T00:00:00Z" }]);
    expect(r.columns.consent_email_text_version).toBeNull();
  });
});
