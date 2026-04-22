import { describe, expect, it } from "vitest";
import { expandMasterAdoptedExpensesToSplits } from "../master-adopted-expense-proration";

const events = [
  { id: "master-1", parent_event_id: null },
  { id: "split-a", parent_event_id: "master-1" },
  { id: "split-b", parent_event_id: "master-1" },
  { id: "split-c", parent_event_id: "master-1" },
  { id: "solo-1", parent_event_id: null },
];

describe("expandMasterAdoptedExpensesToSplits", () => {
  it("cria fatias virtuais quando a despesa Master está adotada em todos os splits", () => {
    const out = expandMasterAdoptedExpensesToSplits({
      events,
      forecasts: [
        { id: "f-a", event_id: "split-a", master_forecast_id: "mf-1", transaction_id: "tx-master" },
        { id: "f-b", event_id: "split-b", master_forecast_id: "mf-1", transaction_id: "tx-master" },
        { id: "f-c", event_id: "split-c", master_forecast_id: "mf-1", transaction_id: "tx-master" },
      ],
      transactions: [
        { id: "tx-master", event_id: "master-1", amount: 900, iva_rate: 23, type: "expense" },
      ],
    });

    expect(out).toHaveLength(3);
    expect(out.map((row) => row.event_id).sort()).toEqual(["split-a", "split-b", "split-c"]);
    expect(out.every((row) => Number(row.amount) === 300)).toBe(true);
    expect(out.every((row) => row._adopted_via_master)).toBe(true);
  });

  it("não cria fatias se a adoção estiver incompleta nos subeventos", () => {
    const out = expandMasterAdoptedExpensesToSplits({
      events,
      forecasts: [
        { id: "f-a", event_id: "split-a", master_forecast_id: "mf-1", transaction_id: "tx-master" },
        { id: "f-b", event_id: "split-b", master_forecast_id: "mf-1", transaction_id: "tx-master" },
      ],
      transactions: [
        { id: "tx-master", event_id: "master-1", amount: 900, type: "expense" },
      ],
    });

    expect(out).toHaveLength(0);
  });

  it("ignora transações fora de Masters com splits", () => {
    const out = expandMasterAdoptedExpensesToSplits({
      events,
      forecasts: [
        { id: "f-a", event_id: "solo-1", master_forecast_id: "mf-solo", transaction_id: "tx-solo" },
      ],
      transactions: [
        { id: "tx-solo", event_id: "solo-1", amount: 500, type: "expense" },
      ],
    });

    expect(out).toHaveLength(0);
  });
});