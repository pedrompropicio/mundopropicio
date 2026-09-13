/**
 * (g17-c) Cards do Portal e cascata do bloco "O seu fechamento".
 *
 * Regra provada aqui: os cards mostram o EVENTO INTEIRO na base do fechamento
 * raiz (receitas do perímetro raiz, despesas na base da raiz, resultado = a
 * primeira linha da cascata) — nunca o resultado do nó do sócio. E todos os
 * valores do bloco saem já arredondados ao cêntimo (g15-b).
 */
import { describe, expect, it } from "vitest";
import { buildPartnerStatement, type StatementBundle } from "@shared/settlement/statement-service.ts";

const EVENT = "ev-1";
const ROOT = "st-root";
const CHILD = "st-child";
const SUP_PARTNER = "sup-partner";

function bundle(): StatementBundle {
  return {
    eventId: EVENT,
    eventName: "Evento de teste",
    eventDate: "2026-01-10",
    eventLocation: "Lisboa",
    basis: { withVat: true, includeOverhead: true, expenseSource: "committed" },
    calcBasis: "net_result_gross_expenses",
    events: [{ id: EVENT, parent_event_id: null, name: "Evento de teste" }],
    transactions: [
      {
        id: "tx-1",
        description: "Receita do evento",
        amount: 100000,
        iva_rate: 0,
        type: "income",
        date: "2026-01-11",
        status: "paid",
        event_id: EVENT,
        event_settlement_id: null,
      },
    ],
    forecasts: [
      {
        id: "f-1",
        event_id: EVENT,
        description: "Despesa do evento",
        type: "expense",
        amount: 40000,
        iva_rate: 23,
        status: "approved",
        is_overhead: false,
        event_settlement_id: null,
      },
    ],
    categories: [],
    settlements: [
      { id: ROOT, name: "Fechamento do evento", parent_id: null, position: 1, parent_share_pct: null },
      { id: CHILD, name: "Fechamento B", parent_id: ROOT, position: 2, parent_share_pct: 30, parent_share_basis: "net_result_gross_expenses" },
    ],
    participants: [
      {
        id: "p-house",
        participantId: "p-house",
        settlement_id: ROOT,
        settlementName: "Fechamento do evento",
        supplier_id: null,
        isHouse: true,
        mode: "settles",
        percentage: 70,
        loss_percentage: null,
        expense_includes_iva: null,
        transfer_with_vat: false,
        name: "MUNDO PROPÍCIO",
      },
      {
        id: "p-partner",
        participantId: "p-partner",
        settlement_id: CHILD,
        settlementName: "Fechamento B",
        supplier_id: SUP_PARTNER,
        isHouse: false,
        mode: "settles",
        percentage: 20,
        loss_percentage: null,
        expense_includes_iva: null,
        transfer_with_vat: false,
        name: "SÓCIO B",
      },
    ] as any,
    paidExpenses: [],
    extras: [],
    revenuesHeldRaw: [],
    grossDisbursementSupplierIds: [],
    ticketSales: [],
    ticketBreakdown: [],
    operations: [],
    participations: [],
    localeBySupplier: {},
  } as unknown as StatementBundle;
}

describe("(g17-c) cards e cascata do Portal", () => {
  const res = buildPartnerStatement(bundle(), SUP_PARTNER);

  it("os cards mostram o evento inteiro na base da raiz", () => {
    expect(res).not.toBeNull();
    const c = res!.cards;
    expect(c.revenueNet).toBeCloseTo(100000, 2);
    expect(c.expenses).toBeCloseTo(49200, 2); // 40.000 + 23% IVA
    expect(c.result).toBeCloseTo(50800, 2);
    expect(c.expensesWithVat).toBe(true);
    // O resultado é exactamente a primeira linha da cascata.
    expect(res!.block.cascade[0].value).toBeCloseTo(c.result, 2);
  });

  it("todos os valores do bloco vêm arredondados ao cêntimo", () => {
    for (const line of res!.block.cascade) {
      expect(Math.abs(line.value - Math.round(line.value * 100) / 100)).toBeLessThan(1e-9);
    }
    const a = res!.block.account;
    for (const v of [a.share, a.transferBase, a.transferVat, a.transferTotal, a.financingToReturn]) {
      expect(Math.abs(v - Math.round(v * 100) / 100)).toBeLessThan(1e-9);
    }
  });

  it("sem IVA/exclusivos/operações a somar, a linha Resultado não se repete", () => {
    const labels = res!.block.cascade.map((l) => l.label);
    expect(labels).not.toContain("Resultado");
    expect(labels.some((l) => l.startsWith("Resultado da sociedade"))).toBe(true);
  });
});
