// Issue #320 / D-ERP281 — testes do P1 CAPI com mocks e rede bloqueada.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  classifyMetaResponse,
  consentProof,
  dispatchAllowed,
  localBlockReason,
  META_MAX_AGE_MS,
  suspendedResponse,
  type RpcFn,
} from "../../supabase/functions/_shared/capi-guard";

const realFetch = globalThis.fetch;
beforeAll(() => {
  // Egress bloqueado: qualquer fetch real rebenta o teste.
  globalThis.fetch = vi.fn(() => { throw new Error("egress bloqueado nos testes"); }) as any;
});
afterAll(() => { globalThis.fetch = realFetch; });

const rpcReturning = (map: Record<string, unknown>): RpcFn =>
  async (fn) => (fn in map ? { data: map[fn], error: null } : { data: null, error: { message: "nope" } });

describe("interruptor persistente", () => {
  it("suspenso → false", async () => expect(await dispatchAllowed(rpcReturning({ capi_dispatch_allowed: false }))).toBe(false));
  it("erro de RPC conta como suspenso", async () => expect(await dispatchAllowed(rpcReturning({}))).toBe(false));
  it("excepção conta como suspenso", async () => expect(await dispatchAllowed(async () => { throw new Error("x"); })).toBe(false));
  it("resposta ambígua (string 'true') conta como suspenso", async () =>
    expect(await dispatchAllowed(rpcReturning({ capi_dispatch_allowed: "true" }))).toBe(false));
  it("bloqueio manual responde 423", async () => expect(suspendedResponse({}).status).toBe(423));
});

describe("consentimento por interacção", () => {
  it("ausente (false) bloqueia", async () => expect(await consentProof(rpcReturning({ capi_consent_proof: false }), "l", "ViewContent")).toBe(false));
  it("recusado/revogado (null) bloqueia", async () => expect(await consentProof(rpcReturning({ capi_consent_proof: null }), "l", "Lead")).toBe(false));
  it("erro de RPC bloqueia", async () => expect(await consentProof(rpcReturning({}), null, "InitiateCheckout")).toBe(false));
  it("só true explícito do servidor autoriza", async () => expect(await consentProof(rpcReturning({ capi_consent_proof: true }), "l", "Lead")).toBe(true));
});

describe("regras antes do POST", () => {
  const now = Date.parse("2026-10-15T22:00:00Z");
  it("redirect_click em ViewContent é tipo inválido", () =>
    expect(localBlockReason({ kind: "redirect_click", event_name: "ViewContent", created_at: "2026-10-15T21:00:00Z", now })).toBe("wrong_kind"));
  it("ViewContent sem tipo bloqueia", () =>
    expect(localBlockReason({ kind: null, event_name: "ViewContent", created_at: "2026-10-15T21:00:00Z", now })).toBe("wrong_kind"));
  it("expirado > 7 dias", () =>
    expect(localBlockReason({ kind: "event_interest", event_name: "ViewContent", created_at: new Date(now - META_MAX_AGE_MS - 1).toISOString(), now })).toBe("expired"));
  it("data inválida bloqueia", () =>
    expect(localBlockReason({ kind: "event_interest", event_name: "ViewContent", created_at: "lixo", now })).toBe("expired"));
  it("dentro do prazo e tipo válido passa as regras locais", () =>
    expect(localBlockReason({ kind: "event_interest", event_name: "ViewContent", created_at: "2026-10-15T21:00:00Z", now })).toBeNull());
});

describe("respostas da Meta (mock)", () => {
  it("100/33 é terminal de acesso", () =>
    expect(classifyMetaResponse(400, { error: { code: 100, error_subcode: 33, message: "x" } }).kind).toBe("access_100_33"));
  it("2804050 é dados insuficientes", () =>
    expect(classifyMetaResponse(400, { error: { code: 100, error_subcode: 2804050 } }).kind).toBe("insufficient_data"));
  it("500 é transitório", () => expect(classifyMetaResponse(500, null).kind).toBe("transient"));
  it("200 é ok", () => expect(classifyMetaResponse(200, {}).kind).toBe("ok"));
  it("detalhe não leva mensagem nem token", () =>
    expect(classifyMetaResponse(400, { error: { code: 100, error_subcode: 33, message: "token EAAB…" } }).detail).not.toMatch(/EAAB|token/));
});

describe("corrida", () => {
  it("suspensão a meio: o segundo check devolve false e nada sai", async () => {
    let calls = 0;
    const rpc: RpcFn = async () => ({ data: ++calls === 1, error: null });
    expect(await dispatchAllowed(rpc)).toBe(true);
    expect(await dispatchAllowed(rpc)).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
