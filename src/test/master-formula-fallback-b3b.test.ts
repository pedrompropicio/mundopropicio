import { describe, expect, it, vi } from "vitest";
import { masterFormulaShares, masterFormulaAmountForCity, masterFormulaCostInputsForCity } from "@/lib/master-formula";
import { expandOverheadToSplits, overheadLinesFor } from "@/lib/overhead-proration";
import { expandMasterAdoptedExpensesToSplits } from "@/lib/master-adopted-expense-proration";
import { loadMasterFormulaExpenseSlicesFor } from "@/lib/master-formula-load";
import { computeEventSettlementTotals } from "@/lib/event-settlement-inputs";
import { buildPartnerStatement, type StatementBundle } from "@shared/settlement/statement-service.ts";

const events = [{ id: "m" }, { id: "a", parent_event_id: "m" }, { id: "b", parent_event_id: "m" }];
const scenarios = [
  { name: "composição ausente", params: { min: 100.01 }, code: "composition_pending" },
  { name: "base zero com mínimo", params: { min: 100.01, master_city_bases: { a: 0, b: 0 } }, code: "zero_city_bases" },
];
const makeLine = (params: any) => ({ id: "f", event_id: "m", description: "Custo Master", amount: 100.01, iva_rate: 0,
  type: "expense", status: "approved", is_overhead: true, exclude_from_result: true,
  formula_type: "pct_ticket_revenue", formula_params: params });
function client(line: any) {
  const tables: Record<string, any[]> = { events, event_forecasts: [line], transactions: [] };
  return { from: (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const q: any = { select: () => q, order: () => q,
      in: (key: string, values: any[]) => { rows = rows.filter(r => values.includes(r[key])); return q; },
      eq: (key: string, value: any) => { rows = rows.filter(r => r[key] === value); return q; },
      is: (key: string, value: any) => { rows = rows.filter(r => (r[key] ?? null) === value); return q; },
      range: async (a: number, b: number) => ({ data: rows.slice(a, b + 1), error: null }),
      then: (resolve: any) => resolve({ data: rows, error: null }) };
    return q;
  } };
}

describe.each(scenarios)("#339 B3b — $name", ({ params, code }) => {
  it("overhead reparte ao cêntimo e devolve aviso sem lançar", () => {
    const slices = overheadLinesFor(expandOverheadToSplits([makeLine(params)], events), "slices");
    expect(slices.map(s => s.amount)).toEqual([50.01, 50]);
    expect(Math.round(slices.reduce((s, r) => s + Number(r.amount), 0) * 100)).toBe(10001);
    expect(slices.map(s => s._master_formula_warning?.code)).toEqual([code, code]);
  });
  it("despesa adoptada reparte ao cêntimo com o mesmo aviso", () => {
    const slices = expandMasterAdoptedExpensesToSplits({ events,
      forecasts: [makeLine(params), ...["a", "b"].map(id => ({ id: `f-${id}`, event_id: id, master_forecast_id: "f", transaction_id: "tx" }))],
      transactions: [{ id: "tx", event_id: "m", type: "expense", amount: 100.01 }] });
    expect(slices.map(s => s.amount)).toEqual([50.01, 50]);
    expect(slices.map(s => s._master_formula_warning?.code)).toEqual([code, code]);
  });
  it("cartões escalam a linha e a transação, sem perder os avisos", () => {
    const inputs = masterFormulaCostInputsForCity([makeLine(params)], [{ id: "tx", forecast_id: "f", amount: 100.01 }], ["a", "b"], "a");
    expect(inputs?.forecasts[0].amount).toBe(50.01);
    expect(inputs?.transactions[0].amount).toBe(50.01);
    expect(inputs?.warnings.map(w => w.code)).toEqual([code, code]);
  });
  it("leitor ERP/Acerto e statement-service mantêm a paridade das duas cidades", async () => {
    for (const city of ["a", "b"]) {
      const loaded = await loadMasterFormulaExpenseSlicesFor(client(makeLine(params)), [{ id: city, parent_event_id: "m" }]);
      const bundle = {
        eventId: city, eventName: city, eventDate: "2026-10-23", eventLocation: null,
        basis: { withVat: false, includeOverhead: true, expenseSource: "committed" }, calcBasis: "net_result",
        events: [{ id: city, parent_event_id: "m" }], forecasts: loaded.forecastSlices,
        transactions: [{ id: "income", event_id: city, type: "income", amount: 1000, iva_rate: 0, status: "paid", date: "2026-10-23" }],
        categories: [], settlements: [{ id: "root", name: "Fecho", parent_id: null, position: 1 }],
        participants: [
          { id: "house", participantId: "house", settlement_id: "root", supplier_id: null, isHouse: true, mode: "settles", percentage: 60, name: "MP" },
          { id: "partner", participantId: "partner", settlement_id: "root", supplier_id: "sup", isHouse: false, mode: "settles", percentage: 40, name: "Sócio" },
        ], paidExpenses: [], extras: [], revenuesHeldRaw: [], grossDisbursementSupplierIds: [],
        ticketSales: [], ticketBreakdown: [], operations: [], participations: [], localeBySupplier: {},
      } as unknown as StatementBundle;
      const erp = computeEventSettlementTotals({ events: bundle.events, forecasts: bundle.forecasts,
        transactions: bundle.transactions, ticketSales: [], basis: { includeOverhead: true, expenseSource: "committed" } });
      const statement = buildPartnerStatement(bundle, "sup");
      expect(statement).not.toBeNull();
      expect(erp.expensesNet).toBe(city === "a" ? 50.01 : 50);
      expect(statement?.cards.result).toBeCloseTo(1000 - erp.expensesNet, 2);
      expect(statement?.block.account.share).toBeCloseTo((1000 - erp.expensesNet) * 0.4, 2);
    }
  });
});

describe("#339 B3b — guardas de leitura", () => {
  it("composição incompleta ou inválida usa ÷N", () => {
    for (const bases of [{ a: 10 }, { a: -1, b: 10 }, { a: null, b: 10 }]) {
      const r = masterFormulaShares(makeLine({ master_city_bases: bases }), ["a", "b"], 100.01);
      expect(r?.amounts).toEqual([50.01, 50]);
      expect(r?.warning?.code).toBe("composition_pending");
    }
  });
  it("cidade fora da família não lança e regista erro com aviso", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const warnings: any[] = [];
      expect(masterFormulaAmountForCity(makeLine({}), ["a", "b"], "other", 100, 123, warnings)).toBe(50);
      expect(warnings[0].code).toBe("city_outside_family");
      expect(error).toHaveBeenCalledOnce();
    } finally { error.mockRestore(); }
  });
  it("composição de outra família e família vazia não lançam", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(masterFormulaShares(makeLine({ master_city_bases: { a: 1, b: 3, other: 2 } }), ["a", "b"], 100)?.amounts).toEqual([50, 50]);
      expect(masterFormulaShares(makeLine({}), [], 100)?.amounts).toEqual([]);
      expect(error).toHaveBeenCalledTimes(2);
    } finally { error.mockRestore(); }
  });
  it("recalcular a composição muda automaticamente de ÷N para proporcional", () => {
    const line = makeLine({});
    expect(masterFormulaShares(line, ["a", "b"], line.amount)?.amounts).toEqual([50.01, 50]);
    line.formula_params = { master_city_bases: { a: 1, b: 3 } };
    const result = masterFormulaShares(line, ["a", "b"], line.amount);
    expect(result?.amounts).toEqual([25, 75.01]);
    expect(result?.warning).toBeUndefined();
  });
});