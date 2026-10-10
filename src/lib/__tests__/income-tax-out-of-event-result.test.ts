import { describe, it, expect } from "vitest";
import { computeEventCostOnBasis } from "../event-cost-basis";
import { computeEventSettlementTotals, collectSettlementExpenseDocLines } from "../event-settlement-inputs";
import { isIncomeTaxLine, withoutIncomeTax } from "../fecho-filters";

// Adenda D-ERP151 (10/10/2026): IRC fora do resultado do evento — caso Coala 2027.
const IRC = { code: "10.5.03", ebitda_class: "imposto_rendimento" };
const FIN = { code: "10.6.02", ebitda_class: "financeiro" };
const OP = { code: "2.2.01", ebitda_class: null };

const forecasts = [
  { id: "f1", type: "expense", status: "approved", amount: 14163, iva_rate: 0, category_id: "irc", account_categories: IRC },
  { id: "f2", type: "expense", status: "approved", amount: 1000, iva_rate: 23, category_id: "op", account_categories: OP },
  { id: "f3", type: "expense", status: "approved", amount: 50, iva_rate: 0, category_id: "fin", account_categories: FIN },
];
const transactions = [
  { id: "t1", type: "expense", status: "paid", amount: 4721, iva_rate: 0, category_id: "irc", account_categories: IRC },
  { id: "t2", type: "expense", status: "paid", amount: 4721, iva_rate: 0, category_id: "irc", account_categories: [IRC] },
  { id: "t3", type: "expense", status: "paid", amount: 800, iva_rate: 23, category_id: "op", account_categories: OP },
  { id: "t4", type: "expense", status: "paid", amount: 50, iva_rate: 0, category_id: "fin", account_categories: FIN },
];

describe("IRC fora do custo do evento", () => {
  it("identifica a classe pelo embed (objecto ou array)", () => {
    expect(isIncomeTaxLine(transactions[0])).toBe(true);
    expect(isIncomeTaxLine(transactions[1])).toBe(true);
    expect(isIncomeTaxLine(transactions[3])).toBe(false);
    expect(withoutIncomeTax(transactions)).toHaveLength(2);
  });

  it("committed: sai exactamente o BP de IRC (14.163); financeiro fica", () => {
    const r = computeEventCostOnBasis({ forecasts, transactions, mode: "committed", withVat: false, includeOverhead: false });
    expect(r.total).toBeCloseTo(1050, 2);
  });

  it("realized: saem as 2 transações de IRC (9.442); financeiro fica", () => {
    const r = computeEventCostOnBasis({ forecasts, transactions, mode: "realized", withVat: false, includeOverhead: false });
    expect(r.total).toBeCloseTo(850, 2);
  });

  it("motor do fecho e linhas do documento do sócio sem IRC", () => {
    const events = [{ id: "e", parent_event_id: null }];
    for (const expenseSource of ["committed", "realized"] as const) {
      const input = { events, transactions, forecasts, ticketSales: [], basis: { includeOverhead: false, expenseSource } };
      const tot = computeEventSettlementTotals(input);
      expect(tot.expensesNet).toBeCloseTo(expenseSource === "committed" ? 1050 : 850, 2);
      const lines = collectSettlementExpenseDocLines(input);
      expect(lines.some((l) => l.categoryId === "irc")).toBe(false);
    }
  });

  it("sem IRC, números iguais aos de antes (regressão)", () => {
    const f = forecasts.filter((x) => x.category_id !== "irc");
    const t = transactions.filter((x) => x.category_id !== "irc");
    const strip = (a: any[]) => a.map(({ account_categories, ...rest }) => rest);
    for (const mode of ["committed", "realized"] as const) {
      const a = computeEventCostOnBasis({ forecasts: f, transactions: t, mode, withVat: true, includeOverhead: true }).total;
      const b = computeEventCostOnBasis({ forecasts: strip(f), transactions: strip(t), mode, withVat: true, includeOverhead: true }).total;
      expect(a).toBeCloseTo(b, 6);
    }
  });
});
