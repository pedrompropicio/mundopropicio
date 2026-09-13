import { describe, expect, it } from "vitest";
import {
  collectBpPaidLines,
  collectSettlementAccountEntries,
  partnerAdvancedTotal,
  partnerDisbursement,
  sumLineAmounts,
} from "@/lib/partner-disbursement";

const EIN = "ein-partner";

const forecasts = [
  { id: "1", description: "Palco", amount: 75000, iva_rate: 23, type: "expense", paying_partner_id: EIN, transaction_id: null },
  { id: "2", description: "Bombeiros", amount: 6000, iva_rate: 0, type: "expense", paying_partner_id: EIN, transaction_id: null },
  { id: "3", description: "Já tem transação", amount: 1000, iva_rate: 23, type: "expense", paying_partner_id: EIN, transaction_id: "tx-1" },
  { id: "4", description: "De outro sócio", amount: 500, iva_rate: 23, type: "expense", paying_partner_id: "outro", transaction_id: null },
  { id: "5", description: "Receita", amount: 900, iva_rate: 0, type: "income", paying_partner_id: EIN, transaction_id: null },
];

describe("desembolso do sócio (BP sem transação)", () => {
  it("conta só despesas do sócio sem transação", () => {
    const lines = collectBpPaidLines(forecasts as any, EIN, false);
    expect(lines.map((l) => l.id)).toEqual(["1", "2"]);
    expect(sumLineAmounts(lines)).toBe(81000);
  });

  it("valoriza c/IVA quando a base do fechamento é bruta", () => {
    const lines = collectBpPaidLines(forecasts as any, EIN, true);
    expect(sumLineAmounts(lines)).toBe(roundish(75000 * 1.23 + 6000));
  });

  it("soma ao pago por transações sem dupla contagem", () => {
    const bp = sumLineAmounts(collectBpPaidLines(forecasts as any, EIN, false));
    expect(partnerDisbursement(18420.55, bp)).toBe(99420.55);
  });
});

describe("contas de acerto do sócio", () => {
  const entries = [
    { id: "a", partnerId: EIN, accountName: "Acerto EIN", description: "Ticketline", amount: 905000, date: "2026-09-04", eventId: "e1" },
    { id: "b", partnerId: "outro", accountName: "Acerto X", description: "—", amount: 1000, date: "2026-09-04", eventId: "e1" },
  ];

  it("filtra pelo sócio e abate no já adiantado", () => {
    const mine = collectSettlementAccountEntries(entries, EIN);
    expect(mine).toHaveLength(1);
    expect(partnerAdvancedTotal(28100, sumLineAmounts(mine))).toBe(933100);
  });

  it("sem contas de acerto o já adiantado são só os extras", () => {
    expect(partnerAdvancedTotal(3100, 0)).toBe(3100);
  });
});

function roundish(v: number) {
  return Math.round(v * 100) / 100;
}
