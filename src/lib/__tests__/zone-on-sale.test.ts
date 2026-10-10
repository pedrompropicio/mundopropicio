import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { onSaleAlert } from "@/lib/zone-on-sale";

describe("#143 alerta da marca à venda", () => {
  it("falha da leitura automática (403) → alerta com motivo", () => {
    expect(onSaleAlert({ lastEdge: { started_at: "x", status: "failed", error_message: "página ECI respondeu 403" }, lastManual: null }))
      .toContain("403");
  });
  it("nunca correu → alerta", () => {
    expect(onSaleAlert({ lastEdge: null, lastManual: null })).toContain("não está a correr");
  });
  it("sucesso → sem alerta", () => {
    expect(onSaleAlert({ lastEdge: { started_at: "x", status: "success", error_message: null }, lastManual: null })).toBeNull();
  });
});
