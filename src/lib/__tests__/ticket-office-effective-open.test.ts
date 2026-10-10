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
