import { describe, it, expect } from "vitest";
import { priorCurveFractionAt, projectWithPriorCurve } from "@/lib/simulator-prior-curve-calc";
import { solveForecast } from "@/lib/event-simulator-coala";

const curve = Array.from({ length: 181 }, (_, d) => ({ days_before: d, cumulative_pct: Math.max(0, 100 - d * 0.5) }));

describe("#89 curva histórica", () => {
  it("fracção e projeção pela curva prior", () => {
    expect(priorCurveFractionAt(curve, 20)).toBeCloseTo(0.9);
    expect(projectWithPriorCurve(900, curve, 20)).toBe(100);
  });
  it("dia fora da janela → fallback", () => {
    expect(priorCurveFractionAt(curve, 200)).toBeNull();
    expect(projectWithPriorCurve(900, curve, 200)).toBeNull();
  });
  it("sem benchmarks ou sem vendas → fallback", () => {
    expect(projectWithPriorCurve(900, [], 20)).toBeNull();
    expect(projectWithPriorCurve(900, null, 20)).toBeNull();
    expect(projectWithPriorCurve(0, curve, 20)).toBeNull();
    expect(priorCurveFractionAt([{ days_before: 20, cumulative_pct: 0 }], 20)).toBeNull();
  });
  it("solveForecast: curva prior muda a projeção; sem curva igual ao defeito", () => {
    const d = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const sessions: any[] = [{ day_index: 0, zone_label: "Pista", real_qty: 900, real_revenue: 9000, courtesy_qty: 0, forecast_qty: 0, avg_ticket_override: null, iva_pct: 6 }];
    const info: any = { "0-Pista": { capacity: 5000, days_selling: 90, lots: [{ lot_number: 1, price: 10, quantity: 5000, sold: 900 }] } };
    const base = solveForecast(sessions, {} as any, info, d);
    const same = solveForecast(sessions, {} as any, info, d, { priorCurve: [] });
    const prior = solveForecast(sessions, {} as any, info, d, { priorCurve: curve });
    expect(same.totals?.forecastQty ?? JSON.stringify(same)).toEqual(base.totals?.forecastQty ?? JSON.stringify(base));
    expect(JSON.stringify(prior)).not.toEqual(JSON.stringify(base));
  });
});
