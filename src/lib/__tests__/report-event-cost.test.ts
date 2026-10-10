import { describe, it, expect } from "vitest";
import {
  bpLinePeriodDate,
  eventCostLines,
  eventCostMode,
  eventCostTotal,
  transactionBranch,
} from "@/lib/report-event-cost";

const fc = (category_id: string, amount: number, extra: any = {}) => ({
  type: "expense", status: "approved", category_id, amount, iva_rate: 23, version_id: null, ...extra,
});
const tx = (category_id: string, amount: number, extra: any = {}) => ({
  type: "expense", status: "paid", category_id, amount, iva_rate: 23, event_id: "E1",
  is_transitory: false, exclude_from_result: false, reversed_at: null, is_hidden: false, ...extra,
});

describe("#218 nunca pelas duas portas", () => {
  const txs = [
    { id: "a", event_id: "E1", amount: 100 },
    { id: "b", event_id: null, amount: 50 },
    { id: "c", event_id: "E2", amount: 10 },
  ];
  it("modo BP: só transações sem evento entram pelo ramo de transações", () => {
    expect(transactionBranch(txs, "bp").map((t) => t.id)).toEqual(["b"]);
  });
  it("modo transações (comparação): tudo", () => {
    expect(transactionBranch(txs, "transactions")).toHaveLength(3);
  });
  it("custo total = BP do evento + estrutura, sem contar a transação de evento duas vezes", () => {
    const forecasts = [fc("cat1", 300)];
    const evTx = [tx("cat1", 100)];
    const bpCost = eventCostTotal({ forecasts, transactions: evTx, mode: "committed" });
    const structure = transactionBranch([...evTx, { ...tx("cat9", 50), event_id: null }], "bp")
      .reduce((s, t) => s + t.amount, 0);
    expect(bpCost + structure).toBe(350);
  });
});

describe("#218 período = data do evento", () => {
  it("usa events.date", () => {
    expect(bpLinePeriodDate({ date: "2026-07-14" })).toBe("2026-07-14");
    expect(bpLinePeriodDate({ date: "2026-07-14T10:00:00" })).toBe("2026-07-14");
    expect(bpLinePeriodDate({ date: null })).toBeNull();
  });
});

describe("#218 linhas = função única", () => {
  const forecasts = [fc("cat1", 300), fc("cat2", 100), fc("cat3", 50, { status: "pending" })];
  const txs = [tx("cat1", 120), tx("cat2", 180), tx("cat4", 40), tx("cat1", 999, { status: "pending" }), tx("cat2", 500, { reversed_at: "2026-01-01" })];
  it("committed: Σ linhas = computeEventCostOnBasis; max(previsto, realizado) por rubrica", () => {
    const lines = eventCostLines({ eventId: "E1", forecasts, transactions: txs, mode: "committed" });
    const sum = lines.reduce((s, l) => s + l.amount, 0);
    expect(sum).toBeCloseTo(eventCostTotal({ forecasts, transactions: txs, mode: "committed" }), 6);
    // cat1 300 (BP>real) + cat2 180 (real>BP) + cat4 40 (sem BP) = 520
    expect(sum).toBeCloseTo(520, 6);
  });
  it("realized: só transações válidas", () => {
    const lines = eventCostLines({ eventId: "E1", forecasts, transactions: txs, mode: "realized" });
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(340);
  });
  it("critério do evento: default committed", () => {
    expect(eventCostMode({})).toBe("committed");
    expect(eventCostMode({ cost_expense_source: "realized" })).toBe("realized");
  });
});
