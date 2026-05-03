import { describe, it, expect } from "vitest";
import { computeZone, computeTotals } from "../event-ab-calc";

describe("event-ab-calc", () => {
  it("zona open_bar zera bebidas", () => {
    const r = computeZone({
      id: "1", zone_label: "VIP", participants: 100,
      open_bar: true, open_food: false,
      per_capita_bebidas: 15, repasse_bebidas_pct: 30,
    });
    expect(r.faturacaoBebidas).toBe(0);
    expect(r.receitaBebidas).toBe(0);
    expect(r.custoBebidas).toBe(0);
  });

  it("zona normal aplica % repasse", () => {
    const r = computeZone({
      id: "1", zone_label: "Pista", participants: 1000,
      open_bar: false, open_food: false,
      per_capita_bebidas: 10, repasse_bebidas_pct: 20,
    });
    expect(r.faturacaoBebidas).toBe(10000);
    expect(r.receitaBebidas).toBe(2000);
    expect(r.parteGeradorBebidas).toBe(8000);
    expect(r.custoBebidas).toBe(0); // modelo concessão: custo casa = 0
  });

  it("totais somam zonas e alimentos com fee fixo", () => {
    const t = computeTotals(
      [
        { id: "1", zone_label: "Pista", participants: 1000, open_bar: false, open_food: false, per_capita_bebidas: 10, repasse_bebidas_pct: 20 },
        { id: "2", zone_label: "VIP", participants: 100, open_bar: true, open_food: false, per_capita_bebidas: 15, repasse_bebidas_pct: 30 },
      ],
      { fee_alimentos: 500, repasse_alimentos_pct: 25, per_capita_alimentos: 8 },
    );
    // Bebidas: só Pista contribui
    expect(t.faturacaoBebidas).toBe(10000);
    expect(t.receitaBebidas).toBe(2000);
    // Alimentos: ambas open_food OFF, total 1100 pessoas × 8 = 8800
    expect(t.participantesElegiveisAlimentos).toBe(1100);
    expect(t.faturacaoAlimentos).toBe(8800);
    expect(t.receitaAlimentos).toBe(500 + 8800 * 0.25); // 2700
    expect(t.parteGeradorAlimentos).toBe(8800 * 0.75); // 6600
    expect(t.custoAlimentos).toBe(0);
    expect(t.faturacaoTotal).toBe(10000 + 8800);
    expect(t.receitaTotal).toBeCloseTo(2000 + 2700, 5);
    expect(t.resultadoTotal).toBeCloseTo(t.receitaTotal, 5); // custo casa = 0
  });

  it("zona open_food OFF é excluída de alimentos", () => {
    const t = computeTotals(
      [
        { id: "1", zone_label: "Pista", participants: 1000, open_bar: false, open_food: false, per_capita_bebidas: 10, repasse_bebidas_pct: 20 },
        { id: "2", zone_label: "Backstage", participants: 50, open_bar: false, open_food: true, per_capita_bebidas: 10, repasse_bebidas_pct: 20 },
      ],
      { fee_alimentos: 0, repasse_alimentos_pct: 50, per_capita_alimentos: 10 },
    );
    expect(t.participantesElegiveisAlimentos).toBe(1000);
    expect(t.faturacaoAlimentos).toBe(10000);
  });

  it("margemPct é 0 quando receita 0", () => {
    const t = computeTotals([], { fee_alimentos: 0, repasse_alimentos_pct: 0, per_capita_alimentos: 0 });
    expect(t.margemPct).toBe(0);
  });
});
