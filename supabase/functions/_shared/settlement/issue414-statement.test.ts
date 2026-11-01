import { describe, expect, it } from "vitest";
import { buildPartnerStatementDoc } from "./partner-statement-doc.ts";
import { collectSettlementExpenseDocLines, computeEventSettlementTotals } from "./event-settlement-inputs.ts";
import { buildPartnerStatement, type StatementBundle } from "./statement-service.ts";
import { roundCents } from "./iva.ts";

// SM #414: mesma raiz/participantes e receita repartível da fixture #404;
// baseline separado do excedido para reproduzir o líquido zero/bruto positivo.
const root = "5e56f568-506f-4469-8802-050182c6d479";
const node = "0f1f7f67-50cf-4f14-ba6b-8f1ba7e31017";
const supplier = "cc61a57c-6322-4590-93e7-24dd7129bcd2";
const excess = [["2.6.04", 817.35, 187.99], ["3.1.06", 800, 184], ["3.2.05", 370.87, 85.3]] as const;
const bundle: StatementBundle = {
  eventId: root, eventName: "Turnê Simone Mendes 2026", eventDate: null, eventLocation: null,
  calcBasis: "net_result_gross_expenses", basis: { withVat: true, includeOverhead: true, expenseSource: "committed" },
  events: [{ id: root, parent_event_id: null }],
  forecasts: [
    { id: "baseline", type: "expense", event_id: root, category_id: "baseline", amount: 442300.01, iva_rate: (39383.57 / 442300.01) * 100, status: "approved" },
    ...excess.map(([code, amount]) => ({ id: `bp-${code}`, type: "expense", event_id: root, category_id: code, amount, iva_rate: 0, status: "approved" })),
  ],
  transactions: excess.map(([code, amount]) => ({ id: `tx-${code}`, type: "expense", event_id: root, category_id: code, amount, iva_rate: 23, status: "paid" })),
  ticketSales: [{ net: 439051.89, gross: 439051.89 }], ticketBreakdown: [],
  categories: excess.map(([code]) => ({ id: code, code, name: code, parent_id: null })),
  settlements: [{ id: node, name: "Fechamento do evento", parent_id: null }],
  participants: [
    { id: "rss", participantId: "rss", settlement_id: node, supplier_id: supplier, mode: "settles", percentage: 25, loss_percentage: null, name: "RSS 2011 BR LTDA", isHouse: false },
    { id: "house", participantId: "house", settlement_id: node, supplier_id: null, mode: "settles", percentage: 75, loss_percentage: 75, name: "MUNDO PROPÍCIO", isHouse: true },
  ], paidExpenses: [], extras: [], revenuesHeldRaw: [], grossDisbursementSupplierIds: [], operations: [], participations: [], localeBySupplier: {},
};

function portalInput() {
  const statement = buildPartnerStatement(bundle, supplier);
  if (!statement) throw new Error("Documento SM ausente");
  return statement.doc;
}

describe("#414 documento SM — equipa e Portal usam o mesmo motor", () => {
  it("preserva 457,29 brutos com líquido zero nas três rubricas", () => {
    const lines = collectSettlementExpenseDocLines(bundle).filter(l => l.gross != null);
    expect(lines.map(l => [l.categoryId, l.base, roundCents(l.gross ?? 0)])).toEqual([
      ["2.6.04", 0, 187.99], ["3.1.06", 0, 184], ["3.2.05", 0, 85.3],
    ]);
    expect(roundCents(lines.reduce((s, l) => s + (l.gross ?? 0), 0))).toBe(457.29);
  });

  it.each(["detailed", "totalOnly"] as const)("secção 3 = 483.671,80; resultado = −44.619,91 (%s)", expenseColumns => {
    const doc = buildPartnerStatementDoc({ ...portalInput(), expenseColumns });
    expect(doc.expenseTotal).toBe(483671.8);
    expect(doc.expenseForResult).toBe(483671.8);
    expect(doc.result).toBe(-44619.91);
    expect(doc.cascadeMismatch).toBe(0);
    expect(roundCents(doc.families.reduce((s, f) => s + f.total, 0))).toBe(483671.8);
    expect(doc.families.flatMap(f => f.rubricas).flatMap(r => r.lines).filter(l => l.base === 0).map(l => l.total)).toEqual([187.99, 184, 85.3]);
  });

  it("base efectiva s/IVA não incorpora o excedido apenas bruto", () => {
    const input = portalInput();
    const totals = computeEventSettlementTotals(bundle);
    const doc = buildPartnerStatementDoc({ ...input, usesGrossExpenses: false, resultOverride: roundCents(439051.89 - totals.expensesNet) });
    expect(doc.expenseForResult).toBe(444288.23);
    expect(doc.cascadeMismatch).toBe(0);
  });

  it("reconcilia arredondamentos das linhas sem alterar os totais do motor", () => {
    const input = portalInput();
    const doc = buildPartnerStatementDoc({ ...input, expenseLines: input.expenseLines.map((l, i) => i === 0 ? { ...l, base: l.base + 0.001 } : l) });
    expect(doc.expenseTotal).toBe(483671.8);
    expect(doc.expenseBase).toBe(444288.23);
    expect(roundCents(doc.families.reduce((s, f) => s + f.base, 0))).toBe(444288.23);
  });

  it("avisa na raiz quando despesas menos receitas não correspondem ao resultado", () => {
    const doc = buildPartnerStatementDoc({ ...portalInput(), resultOverride: -44162.62 });
    expect(doc.cascadeMismatch).toBe(457.29);
  });

  it("avisa se a origem da cascata divergir mesmo quando quota e resultado fecham", () => {
    const doc = buildPartnerStatementDoc({ ...portalInput(), cascade: { levels: [{ baseValue: -44162.62, quota: -22081.31, quotaPct: 50, deductions: [] }] }, resultOverride: -22081.31 });
    expect(doc.cascadeMismatch).toBe(457.29);
  });
});