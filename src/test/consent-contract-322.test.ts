// #322 (correção) — contrato e endpoint portal-track com fetch/geo injetados. Egress real proibido.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consentRecordResponse, interpretBind, parseConsentDecision, portalForOrigin, readConsentReceipt, readConsentToken,
  stripMetaIdentifiers, stripMetaJson, stripMetaParams,
} from "../../supabase/functions/_shared/consent-contract";
import { createHandler } from "../../supabase/functions/portal-track/handler";

const TOK = "a".repeat(64);
const REC = `5.1.${"b".repeat(64)}`;
const ok = { state: "granted", purpose: "meta_ads", policy_version: "2026-10-v1", banner_version: "b1", client_seq: 1,
  idempotency_key: "11111111-1111-1111-1111-111111111111", subject_token: TOK, expected_revision: 0 };

let globalFetch: ReturnType<typeof vi.spyOn>;
beforeEach(() => { globalFetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("egress bloqueado"); }); });
afterEach(() => { expect(globalFetch).not.toHaveBeenCalled(); globalFetch.mockRestore(); });

describe("portalForOrigin", () => {
  it("MP e Newgang são portais distintos", () => {
    expect(portalForOrigin("https://www.mundopropicio.com")).toBe("mp");
    expect(portalForOrigin("https://newgangfestival.pt")).toBe("newgang");
    expect(portalForOrigin("https://coalafestival.pt")).toBe("coala");
  });
  it("desconhecida/http → null", () => {
    expect(portalForOrigin("https://evil.pt")).toBeNull();
    expect(portalForOrigin("http://x--26b95793-17b6-478c-a6e8-745c0cfb7ed9.lovable.app")).toBeNull();
  });
});

describe("parseConsentDecision", () => {
  it("aceita", () => expect(parseConsentDecision(ok).ok).toBe(true));
  it.each([
    [{ ...ok, purpose: "newsletter" }, "purpose_invalid"],
    [{ ...ok, state: "maybe" }, "state_invalid"],
    [{ ...ok, subject_token: undefined }, "subject_invalid"],
    [{ ...ok, subject_token: "fb.1.1.abc" }, "subject_invalid"],
    [{ ...ok, expected_revision: undefined }, "expected_revision_required"],
    [{ ...ok, expected_revision: -1 }, "expected_revision_required"],
  ])("rejeita %#", (p, err) => expect(parseConsentDecision(p)).toEqual({ ok: false, error: err }));
  it("revoke sem revisão é aceite (conservador)", () => expect(parseConsentDecision({ ...ok, state: "revoked", expected_revision: undefined }).ok).toBe(true));
});

describe("sanitização (igual à BD)", () => {
  it.each([
    ["https://x.invalid/?fbclid=A&fbp=B&_fbc=C&id=7", "https://x.invalid/?id=7"],
    ["https://x.invalid/p?%5Ffbc=1&FBCLID=2&%66bp=3&utm_source=ig#k=1&fbclid=9", "https://x.invalid/p?utm_source=ig#k=1"],
    ["https://x.invalid/?fbclid=1", "https://x.invalid/"],
    ["https://x.invalid/?%255Ffbp=1&a=1", "https://x.invalid/?a=1"],
    ["olá? a=b&&c", "olá? a=b&&c"],
    ["https://b.pt/e?id=7", "https://b.pt/e?id=7"],
  ])("%s", (i, o) => expect(stripMetaParams(i)).toBe(o));
  it("raw.landing_url/referrer e aninhados", () => {
    expect(stripMetaJson({ landing_url: "https://a.pt/?fbclid=1&x=2", referrer: "https://g.pt/?_fbp=1", n: { FBC: "z", arr: ["https://q.pt/?fbp=1&id=3"] }, form: "ok" }))
      .toEqual({ landing_url: "https://a.pt/?x=2", referrer: "https://g.pt/", n: { arr: ["https://q.pt/?id=3"] }, form: "ok" });
  });
  it("row: fbc/fbp fora, UTM e destino funcional mantidos", () => {
    expect(stripMetaIdentifiers({ fbc: "1", fbp: "2", utm_source: "ig", destination_url: "https://b.pt/e?id=7&fbclid=2#t" }))
      .toEqual({ utm_source: "ig", destination_url: "https://b.pt/e?id=7#t" });
  });
});

describe("recibos", () => {
  it("token sozinho/cookie legado não são prova", () => {
    expect(readConsentReceipt({ consent_token: TOK })).toBeNull();
    expect(readConsentToken({ consent_token: "fb.1.1.abc" })).toBeNull();
    expect(readConsentReceipt({ consent_receipt: REC })).toBe(REC);
  });
  it("revoke nunca devolve marketing_allowed=true", () => {
    const r = consentRecordResponse({ ok: true, decision_id: 9, recorded_state: "revoked", marketing_allowed: true, consent_receipt: REC }, true);
    expect((r.body as any).receipt.marketing_allowed).toBe(false);
    expect((r.body as any).receipt.consent_receipt).toBeNull();
  });
  it("revision_conflict → 409 bloqueado", () => {
    const r = consentRecordResponse({ ok: false, error: "revision_conflict", effective_state: "revoked", effective_revision: 2 }, true);
    expect(r).toEqual({ status: 409, body: { ok: false, error: "revision_conflict", marketing_allowed: false, effective_state: "revoked", effective_revision: 2 } });
  });
  it("falha de persistência → 503", () => expect(consentRecordResponse(null, false).status).toBe(503));
  it("bind só proof===true", () => expect(interpretBind({ proof: "true", subject_id: "s", event_id: 1 }, true).proof).toBe(false));
});

// ---------- endpoint: handler → RPC → insert (mock) ----------
type Call = { url: string; body: any; prefer: string | null };
function mkDb(opts: { bind?: any; bindFail?: "throw" | 500; insertResult?: any; insertStatus?: number; record?: any; recordFail?: "throw" | 500; onBind?: () => void }) {
  const calls: Call[] = [];
  const f = vi.fn(async (u: any, init: any) => {
    const url = String(u); const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url, body, prefer: init?.headers?.Prefer ?? null });
    if (!url.startsWith("https://db.invalid/")) throw new Error("egress inesperado: " + url);
    if (url.includes("/rpc/marketing_consent_record")) {
      if (opts.recordFail === "throw") throw new Error("timeout");
      if (opts.recordFail === 500) return new Response("x", { status: 500 });
      return new Response(JSON.stringify(opts.record), { status: 200 });
    }
    if (url.includes("/rpc/marketing_consent_bind")) {
      if (opts.bindFail === "throw") throw new Error("timeout");
      if (opts.bindFail === 500) return new Response("x", { status: 500 });
      opts.onBind?.();
      return new Response(JSON.stringify(opts.bind ?? { proof: true, subject_id: "s1", event_id: 5 }), { status: 200 });
    }
    const st = opts.insertStatus ?? 201;
    return new Response(opts.insertResult === undefined ? null : JSON.stringify(opts.insertResult), { status: st });
  });
  const geo = vi.fn(async () => ({ country: null, city: null, region: null }));
  const h = createHandler({ fetch: f as any, env: (k) => (k === "SUPABASE_URL" ? "https://db.invalid" : "svc-test"), lookupIpGeo: geo, isPrivateOrInvalid: () => true });
  return { h, calls, f };
}
const req = (body: any, origin = "https://www.mundopropicio.com") =>
  new Request("https://fn.invalid/portal-track", { method: "POST", headers: { origin, "content-type": "text/plain" }, body: JSON.stringify(body) });
const lead = (extra: any = {}) => ({ kind: "lead", payload: { email: "x@example.invalid", fbc: "fb.1.1.x", raw: { landing_url: "https://a.pt/?fbclid=1&utm_source=ig", referrer: "https://g.pt/?fbp=1" } }, ...extra });

describe("portal-track handler", () => {
  it("consent: empresa/portal do Origin, revisão passada à RPC, recibo devolvido", async () => {
    const { h, calls } = mkDb({ record: { ok: true, decision_id: 5, revision: 1, recorded_state: "granted", marketing_allowed: true, consent_receipt: REC, expires_at: "2027-04-14T00:00:00Z" } });
    const r = await h(req({ kind: "consent", payload: { ...ok, company_id: "x", portal: "coala" } }, "https://newgangfestival.pt"));
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.receipt).toMatchObject({ marketing_allowed: true, consent_receipt: REC, revision: 1 });
    expect(calls[0].body).toMatchObject({ p_company: "7c858982-6ccd-47ca-bd65-e0dd3eebf01c", p_portal: "newgang", p_expected_revision: 0, p_token: TOK });
  });
  it("consent: timeout da RPC → 503 bloqueado", async () => {
    const { h } = mkDb({ recordFail: "throw" });
    const r = await h(req({ kind: "consent", payload: ok }));
    expect(r.status).toBe(503); expect((await r.json()).marketing_allowed).toBe(false);
  });
  it("consent: origem sem portal → 403", async () => {
    const { h, f } = mkDb({});
    const r = await h(req({ kind: "consent", payload: ok }, "https://evil.pt"));
    expect(r.status).toBe(403); expect(f).not.toHaveBeenCalled();
  });
  it("lead sem prova: entra no CRM sem ids Meta, sem chamar bind", async () => {
    const { h, calls } = mkDb({});
    const r = await h(req(lead()));
    expect(await r.json()).toEqual({ ok: true, marketing_bound: false });
    expect(calls.map((c) => c.url)).toEqual(["https://db.invalid/rest/v1/lead_capture?select=consent_event_id"]);
    expect(calls[0].body.fbc).toBeUndefined();
    expect(calls[0].body.raw).toEqual({ landing_url: "https://a.pt/?utm_source=ig", referrer: "https://g.pt/" });
    expect(calls[0].prefer).toBe("return=minimal");
  });
  it("lead só com token (sem recibo da decisão) não liga", async () => {
    const { h, calls } = mkDb({});
    await h(req(lead({ consent_token: TOK })));
    expect(calls.some((c) => c.url.includes("bind"))).toBe(false);
  });
  it("lead com recibo e vínculo persistido → marketing_bound=true", async () => {
    const { h, calls } = mkDb({ insertResult: [{ consent_event_id: 5 }] });
    const r = await h(req(lead({ consent_token: TOK, consent_receipt: REC })));
    expect(await r.json()).toEqual({ ok: true, marketing_bound: true });
    expect(calls[0].body).toMatchObject({ p_token: TOK, p_receipt: REC, p_portal: "mp" });
    expect(calls[1].body).toMatchObject({ consent_event_id: 5, fbc: "fb.1.1.x" });
    expect(calls[1].prefer).toBe("return=representation");
  });
  it("revogação entre bind e insert: trigger retira → marketing_bound=false", async () => {
    const { h } = mkDb({ insertResult: [{ consent_event_id: null }] });
    expect(await (await h(req(lead({ consent_token: TOK, consent_receipt: REC })))).json()).toEqual({ ok: true, marketing_bound: false });
  });
  it("representação ilegível após insert → fail-closed", async () => {
    const { h } = mkDb({ insertResult: undefined });
    expect(await (await h(req(lead({ consent_token: TOK, consent_receipt: REC })))).json()).toEqual({ ok: true, marketing_bound: false });
  });
  it.each(["throw", 500] as const)("bind falha (%s): lead entra sem ids Meta", async (mode) => {
    const { h, calls } = mkDb({ bindFail: mode });
    expect(await (await h(req(lead({ consent_token: TOK, consent_receipt: REC })))).json()).toEqual({ ok: true, marketing_bound: false });
    const ins = calls.find((c) => c.url.includes("lead_capture"))!;
    expect(ins.body.fbc).toBeUndefined(); expect(ins.body.consent_event_id).toBeUndefined();
  });
  it("bind recusa (superseded) → sem vínculo", async () => {
    const { h, calls } = mkDb({ bind: { proof: false, reason: "superseded" } });
    await h(req(lead({ consent_token: TOK, consent_receipt: REC })));
    expect(calls[1].body.consent_event_id).toBeUndefined();
  });
  it("insert falha → 500 (sem falso sucesso)", async () => {
    const { h } = mkDb({ insertStatus: 500 });
    expect((await h(req(lead()))).status).toBe(500);
  });
  it("redirect com recibo leva consent_company_id do Origin", async () => {
    const { h, calls } = mkDb({ insertResult: [{ consent_event_id: 5 }] });
    await h(req({ kind: "redirect", payload: { event_slug: "e", destination_url: "https://t.pt/?fbclid=1&id=2" }, consent_token: TOK, consent_receipt: REC }, "https://coalafestival.pt"));
    expect(calls[1].body).toMatchObject({ consent_company_id: "7d831e59-6e82-427b-95a0-64904aae5dd2", consent_portal: "coala" });
  });
});

describe("portal-track — código-fonte", () => {
  const src = readFileSync("supabase/functions/portal-track/handler.ts", "utf8");
  it("sem serviços externos de eventos e sem logs de token/corpo", () => {
    expect(src).not.toMatch(/graph\.facebook|googleads|tiktok|snapchat|resend/i);
    expect(src).not.toMatch(/console\.\w+\([^)]*(token|receipt|r\.text)/i);
  });
  it("empresa/portal nunca do corpo", () => expect(src).not.toMatch(/body\.(company_id|portal)|payload\.(company_id|portal)/));
});
