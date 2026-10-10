import { describe, it, expect } from "vitest";
import { computeSettlement, effectiveInvoiceOpen } from "../ticket-office-settlement-calc";

describe("#302 effectiveInvoiceOpen", () => {
  const settlement = {
    venue_retained_invoice_id: "inv",
    venue_retained_payment_id: "p1",
    venue_invoice_remainder_payment_id: "p2",
  };
  it("repõe o saldo de antes da confirmação", () => {
    // Antes: total 5000, pago 0 → aberto 5000; retido 3725,50 + restante 1274,50
    const open = effectiveInvoiceOpen({
      invoiceId: "inv", total: 5000, paidAmount: 5000, settlement,
      ownPayments: [
        { id: "p1", transaction_id: "inv", amount: 3725.5 },
        { id: "p2", transaction_id: "inv", amount: 1274.5 },
      ],
    });
    expect(open).toBe(5000);
    const r = computeSettlement({ grossRevenue: 5000, totalDeductions: 0, totalAdvances: 0, venueRetainedAmount: 3725.5, selectedInvoiceOpen: open, payInvoiceRemainder: true });
    expect(r.venueRetainedExceedsInvoice).toBe(false);
    expect(r.invoiceRemainder).toBeCloseTo(1274.5, 2);
    expect(r.netCalculated).toBeCloseTo(0, 2);
  });
  it("ignora pagamentos de outra fatura ou fecho novo", () => {
    expect(effectiveInvoiceOpen({ invoiceId: "x", total: 100, paidAmount: 100, settlement, ownPayments: [{ id: "p1", transaction_id: "inv", amount: 50 }] })).toBe(0);
    expect(effectiveInvoiceOpen({ invoiceId: "inv", total: 100, paidAmount: 40, settlement: null })).toBe(60);
    expect(effectiveInvoiceOpen({ invoiceId: "inv", total: 100, paidAmount: 100, settlement, ownPayments: [{ id: "p1", transaction_id: "other", amount: 50 }] })).toBe(0);
  });
});

describe("#302 casos de Live (SM Lisboa 9557adbe, SM Porto 1950c08e)", () => {
  const cases = [
    { nome: "SM Lisboa", amount: 3150, iva: 23, paid: 3874.5, p1: 2600, p2: 1274.5, gross: 208945, ded: 10542.92, ret: 2600, rem: 1274.5, net: 194527.58 },
    { nome: "SM Porto", amount: 11000, iva: 23, paid: 13530, p1: 2195, p2: 11335, gross: 256330, ded: 16345.15, ret: 2195, rem: 11335, net: 226454.85 },
  ];
  for (const c of cases) {
    it(`${c.nome}: reabrir mostra o mesmo saldo restante e direito gravados`, () => {
      const total = c.amount * (1 + c.iva / 100);
      const open = effectiveInvoiceOpen({
        invoiceId: "inv", total, paidAmount: c.paid,
        settlement: { venue_retained_invoice_id: "inv", venue_retained_payment_id: "p1", venue_invoice_remainder_payment_id: "p2" },
        ownPayments: [{ id: "p1", transaction_id: "inv", amount: c.p1 }, { id: "p2", transaction_id: "inv", amount: c.p2 }],
      });
      const r = computeSettlement({ grossRevenue: c.gross, totalDeductions: c.ded, venueRetainedAmount: c.ret, selectedInvoiceOpen: open, payInvoiceRemainder: true });
      expect(r.venueRetainedExceedsInvoice).toBe(false);
      expect(r.invoiceRemainder).toBeCloseTo(c.rem, 2);
      expect(r.netCalculated).toBeCloseTo(c.net, 2);
    });
  }
});
