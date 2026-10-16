// #322 — contrato de consentimento (lógica pura, sem rede).
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  consentRecordResponse, interpretBind, parseConsentDecision, portalForOrigin, readConsentToken, stripMetaIdentifiers, stripMetaParams,
} from "../../supabase/functions/_shared/consent-contract";

const ok = { state: "granted", purpose: "meta_ads", policy_version: "2026-10-v1", banner_version: "b1", client_seq: 1, idempotency_key: "11111111-1111-1111-1111-111111111111" };

describe("portalForOrigin", () => {
  it("MP e Newgang são portais distintos apesar da mesma empresa", () => {
    expect(portalForOrigin("https://www.mundopropicio.com")).toBe("mp");
    expect(portalForOrigin("https://newgangfestival.pt")).toBe("newgang");
    expect(portalForOrigin("https://coalafestival.pt")).toBe("coala");
    expect(portalForOrigin("https://x--1a915f50-55ca-4bb6-9abe-8f241c54647a.lovable.app")).toBe("newgang");
  });
  it("origem desconhecida ou http → null", () => {
    expect(portalForOrigin("https://evil.pt")).toBeNull();
    expect(portalForOrigin("http://x--26b95793-17b6-478c-a6e8-745c0cfb7ed9.lovable.app")).toBeNull();
    expect(portalForOrigin(null)).toBeNull();
  });
});

describe("parseConsentDecision", () => {
  it("aceita decisão válida", () => expect(parseConsentDecision(ok).ok).toBe(true));
  it.each([
    [{ ...ok, purpose: "analytics" }, "purpose_invalid"],
    [{ ...ok, purpose: "newsletter" }, "purpose_invalid"],
    [{ ...ok, state: "maybe" }, "state_invalid"],
    [{ ...ok, policy_version: "" }, "version_invalid"],
    [{ ...ok, client_seq: 0 }, "seq_invalid"],
    [{ ...ok, idempotency_key: "x" }, "idempotency_key_required"],
    [{ ...ok, subject_token: "fb.1.123.abc" }, "subject_invalid"],
  ])("rejeita %#", (p, err) => expect(parseConsentDecision(p)).toEqual({ ok: false, error: err }));
  it("ignora company/portal declarados pelo cliente", () => {
    const r = parseConsentDecision({ ...ok, company_id: "x", portal: "coala" }) as any;
    expect(r.value.company_id).toBeUndefined();
    expect(r.value.portal).toBeUndefined();
  });
});

describe("readConsentToken", () => {
  it("cookie legado / boolean consent não são prova", () => {
    expect(readConsentToken({ consent: true })).toBeNull();
    expect(readConsentToken({ consent_token: "fb.1.1.abc" })).toBeNull();
    expect(readConsentToken({ consent_token: "a".repeat(64) })).toBe("a".repeat(64));
  });
});

describe("stripMetaIdentifiers", () => {
  it("retira fbc/fbp/fbclid mas mantém dados de formulário, UTM e destino funcional", () => {
    const r = stripMetaIdentifiers({ email: "x@example.invalid", fbc: "fb.1", fbp: "fb.2", utm_source: "ig",
      referrer: "https://a.pt/?fbclid=1&utm_source=ig", destination_url: "https://b.pt/e?id=7&fbclid=2#t",
      raw: { referral_code: "NG1", fbclid: "3", _fbc: "4" } });
    expect(r).toEqual({ email: "x@example.invalid", utm_source: "ig", referrer: "https://a.pt/?utm_source=ig",
      destination_url: "https://b.pt/e?id=7#t", raw: { referral_code: "NG1" } });
  });
  it("stripMetaParams não toca URL sem ids", () => expect(stripMetaParams("https://b.pt/e?id=7")).toBe("https://b.pt/e?id=7"));
});

describe("consentRecordResponse", () => {
  it("falha de rede/persistência → 503 bloqueado", () => {
    expect(consentRecordResponse(null, false)).toEqual({ status: 503, body: { ok: false, error: "persist_failed", marketing_allowed: false } });
  });
  it("erro desconhecido da RPC → 503", () => expect(consentRecordResponse({ ok: false, error: "weird" }, true).status).toBe(503));
  it("conflitos → 409; validação → 400", () => {
    expect(consentRecordResponse({ ok: false, error: "seq_conflict" }, true).status).toBe(409);
    expect(consentRecordResponse({ ok: false, error: "policy_invalid" }, true).status).toBe(400);
  });
  it("recibo só com marketing_allowed explícito", () => {
    const r = consentRecordResponse({ ok: true, decision_id: 5, marketing_allowed: "true" }, true);
    expect((r.body as any).receipt.marketing_allowed).toBe(false);
  });
});

describe("interpretBind", () => {
  it("só proof===true com ids conta", () => {
    expect(interpretBind({ proof: true, subject_id: "s", event_id: 1 }, true).proof).toBe(true);
    expect(interpretBind({ proof: "true", subject_id: "s", event_id: 1 }, true).proof).toBe(false);
    expect(interpretBind({ proof: true }, true).proof).toBe(false);
    expect(interpretBind({ proof: true, subject_id: "s", event_id: 1 }, false).proof).toBe(false);
  });
});

describe("portal-track — código-fonte", () => {
  const src = readFileSync("supabase/functions/portal-track/index.ts", "utf8");
  it("não chama serviços externos de eventos e não loga tokens", () => {
    expect(src).not.toMatch(/graph\.facebook|googleads|tiktok|snapchat|resend/i);
    expect(src).not.toMatch(/console\.\w+\([^)]*token/i);
  });
  it("empresa/portal nunca lidos do corpo", () => {
    expect(src).not.toMatch(/body\.(company_id|portal)|payload\.(company_id|portal)/);
  });
  it("sem prova o registo entra sem identificadores Meta", () => {
    expect(src).toMatch(/if \(!marketingBound\) row = stripMetaIdentifiers\(row\)/);
  });
});

it("egress bloqueado neste ficheiro", () => {
  const f = vi.spyOn(globalThis, "fetch");
  parseConsentDecision(ok); stripMetaIdentifiers({ fbc: "x" });
  expect(f).not.toHaveBeenCalled();
});
