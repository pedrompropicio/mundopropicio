import { describe, it, expect } from "vitest";
import { splitPartnerExtrasByKind, partnerExtraValue, type PartnerExtraItem } from "@/lib/partner-extras";
import { computeEventContractResult, computeContractBasisResult } from "@/lib/event-contract-result";

const base = { event_id: "e", description: "x", data: "", transaction_id: null, category: null, notes: null } as const;
const tx: PartnerExtraItem = { ...base, id: "a", origem: "transacao", partner_id: "p", amount: 1000, iva_rate: 23, kind: "extra" };
const man: PartnerExtraItem = { ...base, id: "b", origem: "manual", partner_id: "p", amount: 500, iva_rate: 0, kind: "extra" };
const adj: PartnerExtraItem = { ...base, id: "c", origem: "manual", partner_id: "p", amount: -200, iva_rate: 0, kind: "disbursement_adjustment" };

describe("#148 — extras: as duas naturezas, base do sócio", () => {
  it("s/IVA: transação base + manual pelo valor escrito; ajuste fora", () => {
    expect(splitPartnerExtrasByKind([tx, man, adj], "p", false)).toEqual({ extras: 1500, adjustments: -200 });
  });
  it("c/IVA: transação bruta; manual continua pelo valor escrito", () => {
    expect(splitPartnerExtrasByKind([tx, man, adj], "p", true).extras).toBe(1730);
    expect(partnerExtraValue(man, true)).toBe(500);
  });
});

describe("#223 + adenda D-ERP213 (10/10) — resultado na vista; contrato por baixo", () => {
  const totals = { revenueNet: 326070.99, revenueGross: 345635.25, expensesNet: 306768.92, expensesGross: 344444.58 };
  const contract = computeContractBasisResult(totals, "net_result_gross_expenses");
  it("H&K: contrato = −18.373,59", () => expect(contract).toBeCloseTo(-18373.59, 2));
  for (const v of [{ revenue: true, expense: true }, { revenue: false, expense: false }, { revenue: false, expense: true }]) {
    it(`vistas ${JSON.stringify(v)}: resultado = vista; contrato inalterado`, () => {
      const r = computeEventContractResult(totals, v, undefined, contract, "net_result_gross_expenses");
      const rev = v.revenue ? totals.revenueGross : totals.revenueNet;
      const exp = v.expense ? totals.expensesGross : totals.expensesNet;
      expect(r.result).toBeCloseTo(rev - exp, 2);
      expect(r.settlementResult).toBeCloseTo(-18373.59, 2);
    });
  }
});
