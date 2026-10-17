import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }) },
  rpc: async () => ({ data: { company_id: "c1" }, error: null }),
  functions: { invoke: vi.fn(async () => ({ data: null, error: new Error("offline") })) },
} }));
import { attemptCapabilities, canConfirmNewIntent } from "@/lib/standalone-attempt-client";

describe("#333 routing", () => {
  it("falha/ausência do endpoint mantém ramo legacy (capacidade fechada)", async () => {
    expect(await attemptCapabilities({ user_id: "u1", company_id: "c1" })).toEqual({ scanner_create: false, accountant_edit: false });
  });
  it("contexto divergente nunca abre capacidade", async () => {
    expect(await attemptCapabilities({ user_id: "outro", company_id: "c1" })).toEqual({ scanner_create: false, accountant_edit: false });
  });
  it("nova intenção só para tentativa concluída e mais recente", () => {
    expect(canConfirmNewIntent({ state: "completed" }, true)).toBe(true);
    expect(canConfirmNewIntent({ state: "completed" }, false)).toBe(false);
    for (const s of ["prepare", "authorized", "inprogress", "review"]) expect(canConfirmNewIntent({ state: s }, true)).toBe(false);
  });
});
