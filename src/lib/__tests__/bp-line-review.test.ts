import { describe, it, expect } from "vitest";
import { computeBpLineReview, paidFraction } from "../event-cost-basis";

const line = (id: string, amount: number, iva = 23, extra: any = {}) => ({
  id,
  amount,
  iva_rate: iva,
  status: "approved",
  type: "expense",
  category_id: "cat",
  description: `linha ${id}`,
  is_overhead: false,
  is_transitory: false,
  exclude_from_result: false,
  version_id: null,
  ...extra,
});

const tx = (forecastId: string, amount: number, status: string, extra: any = {}) => ({
  forecast_id: forecastId,
  amount,
  iva_rate: 23,
  status,
  type: "expense",
  ...extra,
});

describe("paidFraction", () => {
  it("paid sem paid_amount conta como 100%", () => {
    expect(paidFraction({ amount: 100, iva_rate: 23, status: "paid" })).toBe(1);
  });
  it("parcial é proporcional ao bruto", () => {
    expect(paidFraction({ amount: 100, iva_rate: 23, status: "partially_paid", paid_amount: 61.5 })).toBeCloseTo(0.5, 4);
  });
  it("aprovada sem pagamento é 0%", () => {
    expect(paidFraction({ amount: 100, iva_rate: 23, status: "approved" })).toBe(0);
  });
});

describe("computeBpLineReview", () => {
  it("linha sem transação: saldo = previsto", () => {
    const [r] = computeBpLineReview({ forecasts: [line("a", 100)], transactions: [], withVat: false });
    expect(r).toMatchObject({ forecastId: "a", previsto: 100, pago: 0, aPagar: 0, saldo: 100 });
  });

  it("linha paga por inteiro não aparece", () => {
    const rows = computeBpLineReview({
      forecasts: [line("a", 100)],
      transactions: [tx("a", 100, "paid")],
      withVat: false,
    });
    expect(rows).toHaveLength(0);
  });

  it("aprovada por pagar vai para 'a pagar'", () => {
    const [r] = computeBpLineReview({
      forecasts: [line("a", 100)],
      transactions: [tx("a", 40, "approved")],
      withVat: false,
    });
    expect(r.pago).toBe(0);
    expect(r.aPagar).toBeCloseTo(40, 2);
    expect(r.saldo).toBeCloseTo(60, 2);
  });

  it("parcialmente paga parte-se entre pago e a pagar", () => {
    const [r] = computeBpLineReview({
      forecasts: [line("a", 100)],
      transactions: [tx("a", 40, "partially_paid", { paid_amount: 24.6 })],
      withVat: false,
    });
    expect(r.pago).toBeCloseTo(20, 2);
    expect(r.aPagar).toBeCloseTo(20, 2);
    expect(r.saldo).toBeCloseTo(60, 2);
  });

  it("pendente não entra no realizado, só no aviso", () => {
    const [r] = computeBpLineReview({
      forecasts: [line("a", 100)],
      transactions: [tx("a", 30, "pending")],
      withVat: false,
    });
    expect(r.pendingCount).toBe(1);
    expect(r.pendingAmount).toBeCloseTo(30, 2);
    expect(r.saldo).toBeCloseTo(100, 2);
  });

  it("flags bloqueadores ficam de fora", () => {
    const [r] = computeBpLineReview({
      forecasts: [line("a", 100)],
      transactions: [tx("a", 100, "paid", { reversed_at: "2026-09-01" })],
      withVat: false,
    });
    expect(r.saldo).toBeCloseTo(100, 2);
  });

  it("c/IVA usa o bruto de cada linha", () => {
    const [r] = computeBpLineReview({
      forecasts: [line("a", 100)],
      transactions: [tx("a", 40, "paid")],
      withVat: true,
    });
    expect(r.previsto).toBeCloseTo(123, 2);
    expect(r.pago).toBeCloseTo(49.2, 2);
    expect(r.saldo).toBeCloseTo(73.8, 2);
  });

  it("linha excedida não aparece", () => {
    const rows = computeBpLineReview({
      forecasts: [line("a", 100)],
      transactions: [tx("a", 130, "paid")],
      withVat: false,
    });
    expect(rows).toHaveLength(0);
  });

  it("ignora overhead, não-aprovadas e versões congeladas", () => {
    const rows = computeBpLineReview({
      forecasts: [
        line("oh", 100, 23, { is_overhead: true }),
        line("pend", 100, 23, { status: "pending" }),
        line("ver", 100, 23, { version_id: "v1" }),
      ],
      transactions: [],
      withVat: false,
    });
    expect(rows).toHaveLength(0);
  });
});
