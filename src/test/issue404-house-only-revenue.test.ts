import { describe, it, expect } from "vitest";
import { computeStatementEngine, buildPartnerStatement, type StatementBundle } from "@shared/settlement/statement-service.ts";
import { computeSettlementRevenue } from "@shared/settlement/settlement-revenue.ts";
import { expandMasterRevenueToSplits } from "@shared/settlement/master-revenue-proration.ts";
import { partnerSettlementExclusionReason } from "@shared/settlement/fecho-filters.ts";
import { roundCents } from "@shared/settlement/iva.ts";

const root = "5e56f568-506f-4469-8802-050182c6d479";
const node = "0f1f7f67-50cf-4f14-ba6b-8f1ba7e31017";
const supplier = "cc61a57c-6322-4590-93e7-24dd7129bcd2";
const txIds = ["bb8641b0-9488-474e-ac9a-db929d7c3862", "bcf33eae-911a-49d8-9931-202ae220d535"];
const bpIds = ["e7fb595a-8e95-4747-ae1b-91916d0eb401", "3ff5e3e0-4a54-42bc-ae2c-b8b61513d98c"];

/** Aggregate fixture from docs/testes/issue404-revenue-share-fora-do-acerto.md; no live reads. */
function sm(marked: boolean): StatementBundle {
  return {
    eventId: root, eventName: "Turnê Simone Mendes 2026", eventDate: null, eventLocation: null,
    calcBasis: "net_result_gross_expenses", basis: { withVat: true, includeOverhead: true, expenseSource: "committed" },
    events: [{ id: root, parent_event_id: null }],
    transactions: txIds.map((id, i) => ({ id, type: "income", event_id: root, amount: [4200.75, 5278.87][i], iva_rate: 23, status: "paid", description: "Ticketline Revenue Share", excluded_from_partner_settlement: marked, account_categories: { code: "1.3.04", name: "Revenue Share" } })),
    forecasts: [
      ...bpIds.map((id, i) => ({ id, transaction_id: txIds[i], type: "income", event_id: root, amount: [4200.75, 5278.875][i], iva_rate: 23, status: "approved", description: "Ticketline Revenue Share BP", excluded_from_partner_settlement: marked, account_categories: { code: "1.3.04" } })),
      { id: "aggregate-cost", type: "expense", event_id: root, amount: 444288.23, iva_rate: (39383.57 / 444288.23) * 100, status: "approved", description: "Despesa agregada da medição" },
    ],
    ticketSales: [{ net: 439051.89, gross: 439051.89 }], ticketBreakdown: [], categories: [],
    settlements: [{ id: node, name: "Fechamento do evento", parent_id: null }],
    participants: [
      { id: "rss", participantId: "rss", settlement_id: node, supplier_id: supplier, mode: "settles", percentage: 25, loss_percentage: null, name: "RSS 2011 BR LTDA", isHouse: false },
      { id: "house", participantId: "house", settlement_id: node, supplier_id: null, mode: "settles", percentage: 75, loss_percentage: 75, name: "MUNDO PROPÍCIO", isHouse: true },
    ], paidExpenses: [], extras: [], revenuesHeldRaw: [], grossDisbursementSupplierIds: [], operations: [], participations: [], localeBySupplier: {},
  };
}

describe("#404 (a) SM: receita da MP fora do acerto, dentro do resultado", () => {
  it("preserva 4.243,28 / −35.140,29 e entrega a redução de 2.369,91 à MP", () => {
    const before = computeStatementEngine(sm(false));
    const after = computeStatementEngine(sm(true));
    expect(before.eventNetResult).toBe(4243.28);
    expect(after.eventNetResult).toBe(4243.28);
    expect(roundCents(after.nodes[0].resultGross + 9479.62)).toBe(-35140.29);
    expect(before.nodes[0].participants[0].share).toBe(-8785.07);
    expect(after.nodes[0].participants[0].share).toBe(-11154.98);
    expect(before.house.residual).toBe(13028.35);
    expect(after.house.residual).toBe(15398.26);
    expect(after.house.houseOnlyRevenue).toBe(9479.62);
    expect(after.c1.value).toBe(0);
    expect(after.c2.value).toBe(0);
  });
});

it("#404 (b): TX marcada conserva a presença real do bucket; BP não o repõe", () => {
  const bundle = sm(true);
  bundle.forecasts = bundle.forecasts.map(f => ({ ...f, excluded_from_partner_settlement: false }));
  const revenue = computeSettlementRevenue({ incomeTransactions: bundle.transactions, incomeForecasts: bundle.forecasts });
  expect(revenue.revenueNet).toBe(0);
  expect(roundCents(revenue.houseOnlyRevenueNet)).toBe(9479.62);
  expect(revenue.bpLinesUsed).toHaveLength(0);
});

it("#404 (c): documento do sócio usa só a receita repartível e fecha ao cêntimo", () => {
  const result = buildPartnerStatement(sm(true), supplier);
  if (!result) throw new Error("Documento ausente");
  expect(result.doc.revenues.some(l => l.description.includes("Revenue Share"))).toBe(false);
  expect(roundCents(result.doc.revenues.reduce((sum, l) => sum + l.net, 0))).toBe(439051.89);
  expect(result.block.account.transferBase).toBe(-11154.98);
});

it("#404 (d): fatias TX e BP herdam a marca do Master", () => {
  const split = expandMasterRevenueToSplits({
    events: [{ id: "master" }, { id: "lisboa", parent_event_id: "master" }, { id: "porto", parent_event_id: "master" }],
    forecasts: [{ id: "bp", event_id: "master", type: "income", amount: 100, revenue_split_mode: "equal", excluded_from_partner_settlement: true }],
    transactions: [{ id: "tx", event_id: "master", type: "income", amount: 100, forecast_id: "bp", excluded_from_partner_settlement: false }],
  });
  expect(split.forecastSlices.map(l => l.excluded_from_partner_settlement)).toEqual([true, true]);
  expect(split.transactionSlices.map(l => l.excluded_from_partner_settlement)).toEqual([true, true]);
});

it.each([
  [{ type: "expense" }, true], [{ type: "income", is_transitory: true }, true],
  [{ type: "income", exclude_from_result: true }, true], [{ type: "income", event_settlement_id: "child" }, true],
  [{ type: "income", is_overhead: true }, true], [{ type: "income" }, false],
])("#404 (f): incompatibilidades do interruptor %j", (row, disabled) => {
  expect(partnerSettlementExclusionReason(row) !== null).toBe(disabled);
});

it("#404: BP marcada sem real mantém o resultado, não a base do sócio", () => {
  const revenue = computeSettlementRevenue({ incomeForecasts: [{ id: "bp", event_id: root, type: "income", amount: 70, status: "approved", excluded_from_partner_settlement: true }] });
  expect(revenue.revenueNet).toBe(0);
  expect(revenue.eventRevenueNet).toBe(70);
  expect(revenue.houseOnlyLines[0].id).toBe("bp");
});