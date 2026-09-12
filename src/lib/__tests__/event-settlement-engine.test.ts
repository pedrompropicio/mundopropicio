import { describe, it, expect } from "vitest";
import { computeSettlementEngine, type EngineInput } from "@/lib/event-settlement-engine";

const base = (over: Partial<EngineInput> = {}): EngineInput => ({
  eventBasis: "net_result",
  eventTotals: { revenueNet: 1_000_000, expensesNet: 400_000, expensesGross: 460_000 },
  settlements: [{ id: "root", name: "Raiz", parent_id: null, position: 0 }],
  participants: [],
  ...over,
});

describe("computeSettlementEngine", () => {
  it("paridade: raiz sem linhas marcadas = total do evento", () => {
    const r = computeSettlementEngine(
      base({
        participants: [
          { id: "p1", settlement_id: "root", participant_kind: "partner", name: "SÓCIO", mode: "settles", profit_pct: 70, loss_pct: null },
          { id: "h", settlement_id: "root", participant_kind: "house", name: "MP", mode: "settles", profit_pct: 30, loss_pct: null },
        ],
      }),
    );
    expect(r.nodes[0].perimeter.revenueNet).toBe(1_000_000);
    expect(r.nodes[0].resultNet).toBe(600_000);
    expect(r.nodes[0].participants[0].share).toBe(420_000);
    expect(r.eventNetResult).toBe(600_000);
    expect(r.c1.ok).toBe(true);
    expect(r.c2.ok).toBe(true);
  });

  it("base própria do sócio (c/IVA) gera IVA dedutível para a MP", () => {
    const r = computeSettlementEngine(
      base({
        participants: [
          { id: "p1", settlement_id: "root", participant_kind: "partner", name: "BR", mode: "settles", profit_pct: 50, loss_pct: null, expense_includes_iva: true },
          { id: "h", settlement_id: "root", participant_kind: "house", name: "MP", mode: "settles", profit_pct: 50, loss_pct: null },
        ],
      }),
    );
    // R_c = 1.000.000 − 460.000 = 540.000 → parte = 270.000
    expect(r.nodes[0].participants[0].share).toBe(270_000);
    expect(r.house.declared).toBe(300_000);
    expect(r.house.ivaDeductible).toBe(30_000);
    expect(r.house.residual).toBe(330_000);
    expect(r.house.rest).toBe(0);
    expect(r.c1.ok && r.c2.ok).toBe(true);
  });

  it("perímetro marcado sai da raiz e forma o apuramento filho", () => {
    const r = computeSettlementEngine(
      base({
        settlements: [
          { id: "root", name: "Raiz", parent_id: null, position: 0 },
          { id: "s2", name: "Nível 2", parent_id: "root", position: 1, parent_share_pct: 30, parent_share_basis: "net_result" },
        ],
        markedLines: [
          { event_settlement_id: "s2", kind: "tx", type: "income", amount: 100_000 },
          { event_settlement_id: "s2", kind: "tx", type: "expense", amount: 40_000, iva_rate: 23 },
        ],
        participants: [
          { id: "a", settlement_id: "root", participant_kind: "partner", name: "A", mode: "settles", profit_pct: 55, loss_pct: null },
          { id: "h", settlement_id: "root", participant_kind: "house", name: "MP", mode: "settles", profit_pct: 15, loss_pct: null },
          { id: "b", settlement_id: "s2", participant_kind: "partner", name: "B", mode: "settles", profit_pct: 100, loss_pct: null },
        ],
      }),
    );
    const root = r.nodes.find((n) => n.id === "root")!;
    const s2 = r.nodes.find((n) => n.id === "s2")!;
    expect(root.perimeter.revenueNet).toBe(900_000);
    expect(root.perimeter.expensesNet).toBe(360_000);
    expect(root.resultNet).toBe(540_000);
    expect(s2.parentQuota).toBe(162_000);
    expect(s2.resultNet).toBe(162_000 + 100_000 - 40_000);
    expect(root.moneyNet).toBe(540_000 - 162_000);
    expect(r.eventNetResult).toBe(600_000);
    expect(r.c1.ok).toBe(true);
    expect(r.c2.ok).toBe(true);
  });

  it("quota nominal não é paga e cai no residual da MP", () => {
    const r = computeSettlementEngine(
      base({
        participants: [
          { id: "a", settlement_id: "root", participant_kind: "partner", name: "A", mode: "settles", profit_pct: 55, loss_pct: null },
          { id: "n", settlement_id: "root", participant_kind: "partner", name: "N", mode: "nominal", profit_pct: 30, loss_pct: null },
          { id: "h", settlement_id: "root", participant_kind: "house", name: "MP", mode: "settles", profit_pct: 15, loss_pct: null },
        ],
      }),
    );
    expect(r.partnersPaidTotal).toBe(330_000);
    expect(r.house.nominalGap).toBe(180_000);
    expect(r.house.declared).toBe(90_000);
    expect(r.house.residual).toBe(270_000);
    expect(r.house.rest).toBe(0);
  });

  it("percentagens que não somam 100 fazem C2 falhar", () => {
    const r = computeSettlementEngine(
      base({
        participants: [
          { id: "a", settlement_id: "root", participant_kind: "partner", name: "A", mode: "settles", profit_pct: 55, loss_pct: null },
          { id: "h", settlement_id: "root", participant_kind: "house", name: "MP", mode: "settles", profit_pct: 15, loss_pct: null },
        ],
      }),
    );
    expect(r.c2.ok).toBe(false);
    expect(r.house.rest).toBe(180_000);
  });

  it("resultado negativo usa a % de perda", () => {
    const r = computeSettlementEngine(
      base({
        eventTotals: { revenueNet: 100_000, expensesNet: 300_000, expensesGross: 340_000 },
        participants: [
          { id: "a", settlement_id: "root", participant_kind: "partner", name: "A", mode: "settles", profit_pct: 70, loss_pct: 40 },
          { id: "h", settlement_id: "root", participant_kind: "house", name: "MP", mode: "settles", profit_pct: 30, loss_pct: 60 },
        ],
      }),
    );
    expect(r.nodes[0].resultNet).toBe(-200_000);
    expect(r.nodes[0].participants[0].share).toBe(-80_000);
    expect(r.house.declared).toBe(-120_000);
    expect(r.house.rest).toBe(0);
  });

  it("sócio a acertar em dois apuramentos é erro", () => {
    const r = computeSettlementEngine(
      base({
        settlements: [
          { id: "root", name: "Raiz", parent_id: null, position: 0 },
          { id: "s2", name: "N2", parent_id: "root", position: 1, parent_share_pct: 10, parent_share_basis: "net_result" },
        ],
        participants: [
          { id: "a", settlement_id: "root", participant_kind: "partner", supplier_id: "sup", name: "A", mode: "settles", profit_pct: 50, loss_pct: null },
          { id: "a2", settlement_id: "s2", participant_kind: "partner", supplier_id: "sup", name: "A", mode: "settles", profit_pct: 100, loss_pct: null },
        ],
      }),
    );
    expect(r.errors.some((e) => e.includes("acerta em mais"))).toBe(true);
  });
});
