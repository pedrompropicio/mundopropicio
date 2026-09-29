import { describe, it, expect } from "vitest";
import { computeBpFormula, describeBpFormula } from "../bp-formula";

const sales = [
  { zone_id: "A", quantity: 100, unit_price: 50, total_value: 5000, iva_rate: 6 }, // ticketline
  { zone_id: "B", quantity: 10, unit_price: 106, total_value: null, iva_rate: 6 }, // outra fonte
  { zone_id: "A", quantity: 5, unit_price: 0, total_value: 0, iva_rate: 6 }, // 0 € — não é convite nem vendido
];

describe("computeBpFormula — % da receita", () => {
  it("soma duas fontes, base bruta", () => {
    const r = computeBpFormula({ formulaType: "pct_ticket_revenue", params: { rate: 2, basis: "gross", zone_ids: null }, sales, courtesies: [], realized: true });
    expect(r.amount).toBe(123.2); // 2% × 6.160
  });
  it("base líquida tira o IVA linha a linha pelo lote", () => {
    const r = computeBpFormula({ formulaType: "pct_ticket_revenue", params: { rate: 2, basis: "net", zone_ids: null }, sales, courtesies: [], realized: true });
    // 5000/1,06 = 4716,98 ; 1060/1,06 = 1000 → 5716,98 × 2%
    expect(r.amount).toBe(114.34);
  });
  it("filtra zonas", () => {
    const r = computeBpFormula({ formulaType: "pct_ticket_revenue", params: { rate: 10, basis: "gross", zone_ids: ["B"] }, sales, courtesies: [], realized: true });
    expect(r.amount).toBe(106);
  });
  it("aplica mínimo e máximo", () => {
    const lo = computeBpFormula({ formulaType: "pct_ticket_revenue", params: { rate: 1, basis: "gross", zone_ids: null, min: 500 }, sales, courtesies: [], realized: true });
    expect(lo.amount).toBe(500);
    expect(lo.composition.clamped).toBe("min");
    const hi = computeBpFormula({ formulaType: "pct_ticket_revenue", params: { rate: 50, basis: "gross", zone_ids: null, max: 1000 }, sales, courtesies: [], realized: true });
    expect(hi.amount).toBe(1000);
  });
  it("antes do evento usa o simulador (evento todo)", () => {
    const r = computeBpFormula({ formulaType: "pct_ticket_revenue", params: { rate: 2, basis: "gross", zone_ids: null }, sales, courtesies: [], realized: false, liveForecast: { gross: 10000, net: 9433.96, totalQty: 200 } });
    expect(r.amount).toBe(200);
    expect(r.composition.source).toBe("simulador");
  });
});

describe("computeBpFormula — custo por pessoa", () => {
  const courtesies = [
    { zone_id: "A", event_date_id: "d1", scenario: "forecast", quantity: 20 },
    { zone_id: "A", event_date_id: "d1", scenario: "real", quantity: 15 },
    { zone_id: "B", event_date_id: "d1", scenario: "forecast", quantity: 5 },
    { zone_id: "B", event_date_id: "d1", scenario: "breakeven", quantity: 999 },
  ];
  const params = { unit_amount: 2, include_courtesies: true, zone_ids: null };

  it("antes do evento usa os convites previstos", () => {
    const r = computeBpFormula({ formulaType: "per_head", params, sales, courtesies, realized: false });
    expect(r.composition.courtesies).toBe(25);
    expect(r.composition.sold).toBe(110);
    expect(r.amount).toBe(270);
    expect(r.composition.pendingFinalCourtesies).toBe(false);
  });
  it("depois do evento usa os finais", () => {
    const r = computeBpFormula({ formulaType: "per_head", params: { ...params, zone_ids: ["A"] }, sales, courtesies, realized: true });
    expect(r.composition.courtesies).toBe(15);
    expect(r.composition.pendingFinalCourtesies).toBe(false);
  });
  it("final vazio depois do evento → previsto + aviso", () => {
    const r = computeBpFormula({ formulaType: "per_head", params, sales, courtesies, realized: true });
    expect(r.composition.courtesies).toBe(20); // 15 final A + 5 previsto B
    expect(r.composition.pendingFinalCourtesies).toBe(true);
    expect(describeBpFormula(r)).toContain("convites finais por preencher");
  });
});
