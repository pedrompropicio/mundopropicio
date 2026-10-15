// Issue #320 P1 — lógica pura das guardas CAPI (sem rede; fetch bloqueado).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  classifyMetaResponse, interpretAlertRecorded, interpretDispatchAllowed, interpretGuard,
} from "../../supabase/functions/_shared/capi-guard";

const realFetch = globalThis.fetch;
beforeAll(() => { globalThis.fetch = vi.fn(() => { throw new Error("egress bloqueado"); }) as any; });
afterAll(() => { globalThis.fetch = realFetch; });

describe("classifyMetaResponse", () => {
  it("2xx ok", () => expect(classifyMetaResponse(200, {}).kind).toBe("ok"));
  it("100/33 terminal com alerta", () => {
    const r = classifyMetaResponse(400, { error: { code: 100, error_subcode: 33, message: "x" } });
    expect(r.kind).toBe("meta_access");
  });
  it("100 sem subcode 33 não é meta_access", () =>
    expect(classifyMetaResponse(400, { error: { code: 100, error_subcode: 1 } }).kind).toBe("transient"));
  it("2804050 terminal", () =>
    expect(classifyMetaResponse(400, { error: { error_subcode: 2804050 } }).kind).toBe("insufficient"));
  it("500 transitório", () => expect(classifyMetaResponse(500, null, "boom").kind).toBe("transient"));
});

describe("interpretGuard", () => {
  it("erro RPC bloqueia", () => expect(interpretGuard(null, { message: "x" })).toEqual({ allowed: false, reason: "guard_rpc_error" }));
  it("resposta vazia bloqueia", () => expect(interpretGuard(null, null).allowed).toBe(false));
  for (const reason of ["suspended", "wrong_kind", "expired", "no_consent", "no_identity", "wrong_event", "not_claimed"]) {
    it(`bloqueio ${reason}`, () => expect(interpretGuard({ allowed: false, reason }, null)).toEqual({ allowed: false, reason }));
  }
  it("allowed sem event_time do servidor bloqueia", () =>
    expect(interpretGuard({ allowed: true }, null).allowed).toBe(false));
  it("allowed com event_time do servidor", () =>
    expect(interpretGuard({ allowed: true, event_time: 1700000000 }, null)).toEqual({ allowed: true, reason: null, event_time: 1700000000 }));
  it("allowed não-booleano (string) bloqueia", () =>
    expect(interpretGuard({ allowed: "true", event_time: 1 }, null).allowed).toBe(false));
});

describe("interpretDispatchAllowed", () => {
  it("só true explícito", () => {
    expect(interpretDispatchAllowed(true, null)).toBe(true);
    expect(interpretDispatchAllowed(false, null)).toBe(false);
    expect(interpretDispatchAllowed(null, null)).toBe(false);
    expect(interpretDispatchAllowed(true, { message: "x" })).toBe(false);
  });
});

describe("interpretAlertRecorded", () => {
  it("erro RPC não conta como registado", () => expect(interpretAlertRecorded("error_meta_access", { message: "x" })).toBe(false));
  it("retorno inesperado não conta", () => expect(interpretAlertRecorded(null, null)).toBe(false));
  it("confirmado", () => expect(interpretAlertRecorded("error_meta_access", null)).toBe(true));
});

it("nenhum fetch foi feito", () => expect(globalThis.fetch).not.toHaveBeenCalled());
