import { describe, it, expect } from "vitest";
import {
  computeSettlement,
  applyPaymentToInvoice,
  revertPaymentFromInvoice,
} from "../ticket-office-settlement-calc";

describe("computeSettlement — fluxo base", () => {
  it("sem retenção e sem fatura: líquido = bruto − deduções − adiantamentos", () => {
    const r = computeSettlement({
      grossRevenue: 10000,
      totalDeductions: 1500,
      totalAdvances: 500,
      venueRetainedAmount: 0,
      selectedInvoiceOpen: null,
      payInvoiceRemainder: false,
    });
    expect(r.netCalculated).toBe(8000);
    expect(r.invoiceRemainder).toBe(0);
    expect(r.remainderApplied).toBe(false);
    expect(r.venueRetainedExceedsInvoice).toBe(false);
    expect(r.totalAppliedToInvoice).toBe(0);
  });

  it("com retenção mas sem fatura: abate apenas o líquido", () => {
    const r = computeSettlement({
      grossRevenue: 10000,
      totalDeductions: 0,
      totalAdvances: 0,
      venueRetainedAmount: 1200,
      selectedInvoiceOpen: null,
      payInvoiceRemainder: false,
    });
    expect(r.netCalculated).toBe(8800);
    expect(r.invoiceRemainder).toBe(0);
    expect(r.remainderApplied).toBe(false);
    expect(r.totalAppliedToInvoice).toBe(0); // sem fatura, nada vai aplicar
  });
});

describe("computeSettlement — venda retida com fatura", () => {
  it("retenção parcial cobre parte da fatura, restante NÃO é abatido (sem opt-in)", () => {
    const r = computeSettlement({
      grossRevenue: 10000,
      totalDeductions: 0,
      totalAdvances: 0,
      venueRetainedAmount: 1200,
      selectedInvoiceOpen: 5000, // aluguer da sala em aberto
      payInvoiceRemainder: false,
    });
    expect(r.invoiceRemainder).toBe(3800);
    expect(r.remainderApplied).toBe(false);
    expect(r.netCalculated).toBe(8800); // só abate retenção
    expect(r.totalAppliedToInvoice).toBe(1200);
  });

  it("retenção parcial + opt-in: abate retenção + restante do líquido", () => {
    const r = computeSettlement({
      grossRevenue: 10000,
      totalDeductions: 0,
      totalAdvances: 0,
      venueRetainedAmount: 1200,
      selectedInvoiceOpen: 5000,
      payInvoiceRemainder: true,
    });
    expect(r.invoiceRemainder).toBe(3800);
    expect(r.remainderApplied).toBe(true);
    expect(r.netCalculated).toBe(5000); // 10000 − 1200 − 3800
    expect(r.totalAppliedToInvoice).toBe(5000); // fatura totalmente quitada
  });

  it("retenção exatamente igual ao saldo: nada sobra; checkbox irrelevante", () => {
    const r = computeSettlement({
      grossRevenue: 10000,
      totalDeductions: 0,
      totalAdvances: 0,
      venueRetainedAmount: 5000,
      selectedInvoiceOpen: 5000,
      payInvoiceRemainder: true, // não tem efeito
    });
    expect(r.invoiceRemainder).toBe(0);
    expect(r.remainderApplied).toBe(false);
    expect(r.netCalculated).toBe(5000);
    expect(r.totalAppliedToInvoice).toBe(5000);
  });

  it("retenção zero + opt-in liquida 100% da fatura pela bilheteira", () => {
    const r = computeSettlement({
      grossRevenue: 10000,
      totalDeductions: 0,
      totalAdvances: 0,
      venueRetainedAmount: 0,
      selectedInvoiceOpen: 5000,
      payInvoiceRemainder: true,
    });
    expect(r.invoiceRemainder).toBe(5000);
    expect(r.remainderApplied).toBe(true);
    expect(r.netCalculated).toBe(5000);
    expect(r.totalAppliedToInvoice).toBe(5000);
  });

  it("retenção excede o saldo da fatura: sinaliza erro e mantém remainder=0", () => {
    const r = computeSettlement({
      grossRevenue: 10000,
      totalDeductions: 0,
      totalAdvances: 0,
      venueRetainedAmount: 6000,
      selectedInvoiceOpen: 5000,
      payInvoiceRemainder: false,
    });
    expect(r.venueRetainedExceedsInvoice).toBe(true);
    expect(r.invoiceRemainder).toBe(0); // open − retido = -1000 → max(0, .)
  });
});

describe("computeSettlement — combinações com deduções e adiantamentos", () => {
  it("tudo somado: bruto − deduções − adiantamentos − retido − restante", () => {
    const r = computeSettlement({
      grossRevenue: 20000,
      totalDeductions: 2000, // segurança, comissões…
      totalAdvances: 3000, // adiantamento já recebido pela bilheteira
      venueRetainedAmount: 1000, // venda à porta retida
      selectedInvoiceOpen: 4500, // saldo do aluguer
      payInvoiceRemainder: true,
    });
    expect(r.invoiceRemainder).toBe(3500);
    expect(r.netCalculated).toBe(20000 - 2000 - 3000 - 1000 - 3500); // 10500
    expect(r.totalAppliedToInvoice).toBe(4500); // fatura quitada
  });

  it("netCalculated pode ficar negativo (caso degenerado) — não força clamp", () => {
    const r = computeSettlement({
      grossRevenue: 1000,
      totalDeductions: 500,
      totalAdvances: 600,
      venueRetainedAmount: 0,
      selectedInvoiceOpen: null,
      payInvoiceRemainder: false,
    });
    expect(r.netCalculated).toBe(-100);
  });
});

describe("computeSettlement — epsilon e arredondamentos", () => {
  it("restante < EPS é tratado como zero (não aplica)", () => {
    const r = computeSettlement({
      grossRevenue: 1000,
      totalDeductions: 0,
      totalAdvances: 0,
      venueRetainedAmount: 4999.999,
      selectedInvoiceOpen: 5000,
      payInvoiceRemainder: true,
    });
    expect(r.remainderApplied).toBe(false); // diff < EPS
    expect(r.netCalculated).toBeCloseTo(1000 - 4999.999, 5);
  });

  it("retenção exatamente no limite EPS não dispara excesso", () => {
    const r = computeSettlement({
      grossRevenue: 1000,
      totalDeductions: 0,
      totalAdvances: 0,
      venueRetainedAmount: 5000.004, // dentro do EPS
      selectedInvoiceOpen: 5000,
      payInvoiceRemainder: false,
    });
    expect(r.venueRetainedExceedsInvoice).toBe(false);
  });

  it("retenção fora do EPS dispara excesso", () => {
    const r = computeSettlement({
      grossRevenue: 1000,
      totalDeductions: 0,
      totalAdvances: 0,
      venueRetainedAmount: 5000.01,
      selectedInvoiceOpen: 5000,
      payInvoiceRemainder: false,
    });
    expect(r.venueRetainedExceedsInvoice).toBe(true);
  });
});

describe("applyPaymentToInvoice — quitação", () => {
  it("pagamento parcial: status volta a approved", () => {
    const r = applyPaymentToInvoice({
      amountBase: 1000,
      ivaRate: 23,
      currentPaid: 0,
      paymentToAdd: 500,
    });
    expect(r.total).toBeCloseTo(1230, 5);
    expect(r.newPaid).toBe(500);
    expect(r.status).toBe("approved");
    expect(r.isFullyPaid).toBe(false);
  });

  it("pagamento completo: status passa a paid", () => {
    const r = applyPaymentToInvoice({
      amountBase: 1000,
      ivaRate: 23,
      currentPaid: 230,
      paymentToAdd: 1000,
    });
    expect(r.newPaid).toBe(1230);
    expect(r.status).toBe("paid");
    expect(r.isFullyPaid).toBe(true);
  });

  it("pagamento que ultrapassa por epsilon ainda quita", () => {
    const r = applyPaymentToInvoice({
      amountBase: 1000,
      ivaRate: 0,
      currentPaid: 999.999,
      paymentToAdd: 0.0005,
    });
    expect(r.status).toBe("paid");
  });

  it("dois pagamentos sequenciais (compensação + transfer) quitam fatura", () => {
    // Cenário: aluguer 5000 (sem IVA), retido 1200, restante pago pela bilheteira
    const afterCompensation = applyPaymentToInvoice({
      amountBase: 5000,
      ivaRate: 0,
      currentPaid: 0,
      paymentToAdd: 1200,
    });
    expect(afterCompensation.status).toBe("approved");
    expect(afterCompensation.newPaid).toBe(1200);

    const afterTransfer = applyPaymentToInvoice({
      amountBase: 5000,
      ivaRate: 0,
      currentPaid: afterCompensation.newPaid,
      paymentToAdd: 3800,
    });
    expect(afterTransfer.status).toBe("paid");
    expect(afterTransfer.newPaid).toBe(5000);
  });
});

describe("revertPaymentFromInvoice — reversão de fecho", () => {
  it("reverter pagamento de fatura quitada volta a approved", () => {
    const r = revertPaymentFromInvoice({
      amountBase: 5000,
      ivaRate: 0,
      currentPaid: 5000,
      paymentToRemove: 3800,
    });
    expect(r.newPaid).toBe(1200);
    expect(r.status).toBe("approved");
  });

  it("reverter os 2 pagamentos (saldo + retenção) zera o paid", () => {
    const r1 = revertPaymentFromInvoice({
      amountBase: 5000,
      ivaRate: 0,
      currentPaid: 5000,
      paymentToRemove: 3800,
    });
    const r2 = revertPaymentFromInvoice({
      amountBase: 5000,
      ivaRate: 0,
      currentPaid: r1.newPaid,
      paymentToRemove: 1200,
    });
    expect(r2.newPaid).toBe(0);
    expect(r2.status).toBe("approved");
  });

  it("reverter mais do que o pago não vai abaixo de zero", () => {
    const r = revertPaymentFromInvoice({
      amountBase: 5000,
      ivaRate: 0,
      currentPaid: 100,
      paymentToRemove: 500,
    });
    expect(r.newPaid).toBe(0);
  });
});

describe("Fluxo completo simulado (retenção + restante + quitação + reversão)", () => {
  it("aluguer 5000 / retido 1200 / opt-in restante: fatura quita e líquido cai 5000", () => {
    const open = 5000;
    const retido = 1200;

    const calc = computeSettlement({
      grossRevenue: 12000,
      totalDeductions: 800,
      totalAdvances: 0,
      venueRetainedAmount: retido,
      selectedInvoiceOpen: open,
      payInvoiceRemainder: true,
    });

    expect(calc.invoiceRemainder).toBe(3800);
    expect(calc.remainderApplied).toBe(true);
    expect(calc.netCalculated).toBe(12000 - 800 - 1200 - 3800); // 6200

    // Aplicar os 2 pagamentos
    const after1 = applyPaymentToInvoice({
      amountBase: open,
      ivaRate: 0,
      currentPaid: 0,
      paymentToAdd: retido,
    });
    const after2 = applyPaymentToInvoice({
      amountBase: open,
      ivaRate: 0,
      currentPaid: after1.newPaid,
      paymentToAdd: calc.invoiceRemainder,
    });
    expect(after2.status).toBe("paid");
    expect(after2.newPaid).toBe(5000);

    // Reverter (estorno do fecho)
    const rev1 = revertPaymentFromInvoice({
      amountBase: open,
      ivaRate: 0,
      currentPaid: after2.newPaid,
      paymentToRemove: calc.invoiceRemainder,
    });
    const rev2 = revertPaymentFromInvoice({
      amountBase: open,
      ivaRate: 0,
      currentPaid: rev1.newPaid,
      paymentToRemove: retido,
    });
    expect(rev2.newPaid).toBe(0);
    expect(rev2.status).toBe("approved");
  });
});
