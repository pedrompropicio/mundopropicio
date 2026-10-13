import { describe, expect, it } from "vitest";
import { sessionCashPreview } from "@/lib/camarim-bp-rules";

const paid = (total_amount: number, payment_origin = "advance", status = "approved") => ({ total_amount, payment_origin, status });

describe("Camarim — caixa em mão e reembolso", () => {
  it("saldo negativo mostra reembolso positivo, incluindo gastos do bolso", () => {
    const result = sessionCashPreview(200, 0, [paid(250), paid(62.56, "out_of_pocket", "integrated")]);
    expect(result).toMatchObject({ balance: -112.56, displayAmount: 112.56, label: "A reembolsar", note: "Gasto acima do adiantamento", type: "reinforcement" });
  });

  it("saldo positivo mostra caixa em mão e desconta devoluções", () => {
    expect(sessionCashPreview(500, 20, [paid(400)])).toMatchObject({ balance: 80, displayAmount: 80, label: "Caixa em mão", note: null, type: "refund" });
  });

  it("saldo zero mostra caixa em mão sem aviso", () => {
    expect(sessionCashPreview(100, 0, [paid(100)])).toMatchObject({ balance: 0, displayAmount: 0, label: "Caixa em mão", note: null, type: "balanced" });
  });

  it("exclui cartão e itens ainda não aprovados, rejeitados ou divididos", () => {
    expect(sessionCashPreview(100, 0, [paid(10), paid(900, "card"), paid(900, "advance", "draft"), paid(900, "advance", "rejected"), paid(900, "advance", "split"), paid(900, "advance", "pending_review")]).balance).toBe(90);
  });

  it("modal, cartão e PDF usam a mesma conta e apresentação", async () => {
    const fs = await import("node:fs");
    const detail = fs.readFileSync("src/pages/CamarimSessionDetail.tsx", "utf8");
    const pdf = fs.readFileSync("src/lib/export-camarim-session-pdf.ts", "utf8");
    expect(detail).toContain("sessionCashPreview(totals.advances, totals.refunds, items)");
    expect(detail).toContain("settlementPreview.displayAmount");
    expect(detail).toContain("settlementPreview.label");
    expect(detail).toContain('settlementPreview.balance < 0 && "text-warning"');
    expect(detail).not.toContain("formatCurrency(totals.cashOnHand, session.currency)");
    expect(pdf).toContain("sessionCashPreview(advances, refunds, items)");
    expect(pdf).toContain("[cash.label, fmt(cash.displayAmount)]");
  });
});