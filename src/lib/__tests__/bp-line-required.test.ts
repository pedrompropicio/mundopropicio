import { describe, it, expect } from "vitest";
import { isInternalTransferCategoryCode, structurallyNeedsBpLine } from "../bp-line-required";

// #111 — 10.3 "Transferências Internas" nunca exige linha de BP (com ou sem evento).
describe("bp-line-required — isenção 10.3 (#111)", () => {
  const base = {
    id: "tx-1",
    type: "expense" as const,
    event_id: "evt-1",
    forecast_id: null,
    parent_transaction_id: null,
  };

  it("10.3 com evento → não exige linha", () => {
    expect(structurallyNeedsBpLine({ ...base, category_code: "10.3" })).toBe(false);
  });

  it("descendente de 10.3 com evento → não exige linha", () => {
    expect(structurallyNeedsBpLine({ ...base, category_code: "10.3.01" })).toBe(false);
  });

  it("10.3 sem evento → não exige linha", () => {
    expect(structurallyNeedsBpLine({ ...base, event_id: null, category_code: "10.3.02" })).toBe(false);
  });

  it("2.x com evento → continua a exigir linha", () => {
    expect(structurallyNeedsBpLine({ ...base, category_code: "2.6.04" })).toBe(true);
  });

  it("sem código conhecido e com evento → continua a exigir (resolve-se na BD)", () => {
    expect(structurallyNeedsBpLine({ ...base, category_id: "cat-1" })).toBe(true);
  });

  it("10.30 não é descendente de 10.3, mas o prefixo cobre-o — código só existe como 10.3.x", () => {
    expect(isInternalTransferCategoryCode("10.3")).toBe(true);
    expect(isInternalTransferCategoryCode("10.4")).toBe(false);
    expect(isInternalTransferCategoryCode(null)).toBe(false);
  });
});
