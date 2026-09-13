import { describe, expect, it } from "vitest";
import {
  collectBpPaidLines,
  collectDisbursementAdjustments,
  collectRevenuesHeld,
  partnerAdvancedTotal,
  partnerDisbursement,
  partnerFinancingToReturn,
  sumLineAmounts,
} from "@/lib/partner-disbursement";

const EIN = "ein-partner";

const forecasts = [
  { id: "1", description: "Palco", amount: 75000, iva_rate: 23, type: "expense", paying_partner_id: EIN, transaction_id: null },
  { id: "2", description: "Bombeiros", amount: 6000, iva_rate: 0, type: "expense", paying_partner_id: EIN, transaction_id: null },
  { id: "3", description: "Open bar", amount: 64029.84, iva_rate: 23, type: "expense", paying_partner_id: EIN, transaction_id: "tx-open-bar" },
  { id: "4", description: "Já em partner_paid_expenses", amount: 1000, iva_rate: 23, type: "expense", paying_partner_id: EIN, transaction_id: "tx-paid" },
  { id: "5", description: "De outro sócio", amount: 500, iva_rate: 23, type: "expense", paying_partner_id: "outro", transaction_id: null },
  { id: "6", description: "Receita", amount: 900, iva_rate: 0, type: "income", paying_partner_id: EIN, transaction_id: null },
];

describe("(g5) desembolso do sócio", () => {
  it("inclui linhas com transação ligada (open bar) e exclui só as já contadas por transação", () => {
    const lines = collectBpPaidLines(forecasts as any, EIN, false, {}, ["tx-paid"]);
    expect(lines.map((l) => l.id)).toEqual(["1", "2", "3"]);
    expect(sumLineAmounts(lines)).toBe(145029.84);
    expect(lines.find((l) => l.id === "3")?.hasTransaction).toBe(true);
  });

  it("valoriza s/IVA por defeito", () => {
    const lines = collectBpPaidLines(forecasts as any, EIN, false, {}, ["tx-paid"]);
    expect(lines[0].amount).toBe(75000);
  });

  it("valoriza c/IVA quando o sócio não deduz IVA (pt-BR)", () => {
    const lines = collectBpPaidLines(forecasts as any, EIN, true, {}, ["tx-paid"]);
    expect(lines[0].amount).toBe(roundish(75000 * 1.23));
  });

  it("soma ao pago por transações sem dupla contagem", () => {
    const bp = sumLineAmounts(collectBpPaidLines(forecasts as any, EIN, false, {}, ["tx-paid"]));
    expect(partnerDisbursement(1000, bp)).toBe(146029.84);
  });
});

describe("(g5) ajustes ao desembolso", () => {
  const rows = [
    { id: "a", partner_id: EIN, description: "SPA: lançada a 5% no BP, paga a 3,5%", amount: -34304.72, kind: "disbursement_adjustment" },
    { id: "b", partner_id: EIN, description: "Extra normal", amount: 3100, kind: "extra" },
    { id: "c", partner_id: "outro", description: "Outro sócio", amount: -1, kind: "disbursement_adjustment" },
  ];

  it("filtra pelo sócio e pelo tipo, mantendo o sinal", () => {
    const adj = collectDisbursementAdjustments(rows as any, EIN);
    expect(adj).toHaveLength(1);
    expect(adj[0].amount).toBe(-34304.72);
  });
});

describe("(g5) receitas em poder do sócio e financiamento a devolver", () => {
  const held = [
    { id: "h1", partnerId: EIN, source: "settlement_account" as const, accountName: "Acerto EIN", description: "Ticketline", amount: 905000, date: "2026-09-04", eventId: "e1" },
    { id: "h2", partnerId: EIN, source: "third_party" as const, accountName: "Bares", description: "Resultado do operador", amount: 194468.13, date: "", eventId: "e1" },
    { id: "h3", partnerId: "outro", source: "partner_account" as const, accountName: "X", description: "—", amount: 10, date: "", eventId: "e1" },
  ];

  it("filtra pelo sócio nas três fontes", () => {
    expect(collectRevenuesHeld(held, EIN)).toHaveLength(2);
  });

  it("financiamento a devolver = desembolso ± ajustes − receitas em poder", () => {
    const revenues = sumLineAmounts(collectRevenuesHeld(held, EIN));
    expect(partnerFinancingToReturn(1170562.18, -34304.72, revenues)).toBe(36789.33);
  });

  it("já adiantado são só os extras", () => {
    expect(partnerAdvancedTotal(3100)).toBe(3100);
  });
});

function roundish(v: number) {
  return Math.round(v * 100) / 100;
}

describe("(g7) receitas recebidas por encontro de contas", () => {
  const held = [
    { id: "c1", partnerId: EIN, source: "compensation" as const, accountName: "A&B Food — quota 30%", description: "A&B Food — quota 30%", amount: 29613.5, date: "2026-08-31", eventId: "e1" },
    { id: "c2", partnerId: "outro-socio", source: "compensation" as const, accountName: "Bengaleiro", description: "Bengaleiro", amount: 138.82, date: "2026-08-31", eventId: "e1" },
  ];

  it("conta a receita de compensação em poder do sócio", () => {
    const rows = collectRevenuesHeld(held, EIN);
    expect(rows).toHaveLength(1);
    expect(sumLineAmounts(rows)).toBe(29613.5);
  });

  it("não conta a receita de compensação em poder de outro sócio", () => {
    expect(collectRevenuesHeld(held, "terceiro")).toHaveLength(0);
  });

  it("abate ao financiamento a devolver", () => {
    const revenues = sumLineAmounts(collectRevenuesHeld(held, EIN));
    expect(partnerFinancingToReturn(100000, 0, revenues)).toBe(70386.5);
  });
});
