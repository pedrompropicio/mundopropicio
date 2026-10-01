import { describe, it, expect } from "vitest";
import { proposeBpLine, computeBpFit, parseIntegrateError, sessionBaseAmount } from "@/lib/camarim-integrate";

// Caso real Ivete Clareou 2026 (01/10/2026) — linhas 2.6.04 em Live.
const lines = [
  { id: "bebidas", description: "Bebidas Camarim", specification: null, amount: 558, status: "approved", realized: 0 },
  { id: "staff", description: "Produtor + Staffs Camarim", specification: null, amount: 2140, status: "approved", realized: 2140 },
  { id: "super", description: "Compras Supermercado/reembolsos", specification: null, amount: 764.85, status: "approved", realized: 135.29 },
];

describe("camarim-integrate", () => {
  it("propõe a linha aprovada com mais verba disponível", () => {
    expect(proposeBpLine(lines)).toBe("super");
    expect(proposeBpLine([])).toBeNull();
    expect(proposeBpLine([{ ...lines[0], status: "draft" }])).toBe("bebidas");
  });

  it("calcula o excesso igual à edge function (38,37 € → sugere 803,22 €)", () => {
    const f = computeBpFit(lines[2], 667.93);
    expect(f.fits).toBe(false);
    expect(f.excess).toBe(38.37);
    expect(f.suggestedAmount).toBe(803.22);
    expect(f.disponivel).toBe(629.56);
    expect(computeBpFit(lines[2], 600).fits).toBe(true);
  });

  it("base da sessão usa base_amount ou total − IVA", () => {
    expect(sessionBaseAmount([{ base_amount: 10 }, { base_amount: 0, total_amount: 12.3, iva_amount: 2.3 }])).toBe(20);
  });

  it("traduz respostas de erro em texto legível", () => {
    expect(parseIntegrateError(422, { error: "Falta linha" }).message).toBe("Falta linha");
    const ex = parseIntegrateError(422, { error: "excede", budget_excess: [{ forecast_id: "x", suggested_amount: 803.22 }] });
    expect(ex.budgetExcess?.[0].suggested_amount).toBe(803.22);
    expect(parseIntegrateError(422, { errors: ["a", "b"] })).toMatchObject({ message: "A integração falhou.", details: ["a", "b"] });
    expect(parseIntegrateError(500, null).message).toMatch(/HTTP 500/);
    expect(parseIntegrateError(502, "<html>bad gateway</html>").message).toContain("bad gateway");
  });
});
