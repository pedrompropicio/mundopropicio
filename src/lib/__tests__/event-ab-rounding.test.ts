/**
 * Testes de arredondamento e estabilidade numérica do módulo A&B.
 *
 * Verifica que combinações com casas decimais "feias" (ex.: 33.33%, €7.77)
 * não acumulam drift superior ao tolerância padrão (0.01€).
 */
import { describe, it, expect } from "vitest";
import { computeTotals } from "@/lib/event-ab-calc";
import { closeTo, withZone, ZONE_PISTA, ZONE_VIP, ZONE_BACKSTAGE, FOOD_DEFAULT } from "./event-ab-fixtures";

describe("A&B — arredondamentos e drift", () => {
  it("repasse 33.33% sobre 9999 participantes com per capita 7.77€", () => {
    const z = withZone(ZONE_PISTA, {
      participants: 9999,
      per_capita_bebidas: 7.77,
      repasse_bebidas_pct: 33.33,
    });
    const t = computeTotals([z], FOOD_DEFAULT);
    const fat = 9999 * 7.77;
    expect(closeTo(t.faturacaoBebidas, fat)).toBe(true);
    expect(closeTo(t.receitaBebidas, fat * 0.3333)).toBe(true);
    expect(closeTo(t.parteGeradorBebidas, fat * (1 - 0.3333))).toBe(true);
    // Receita casa + Parte gerador devem reconstituir a faturação
    expect(closeTo(t.receitaBebidas + t.parteGeradorBebidas, fat)).toBe(true);
  });

  it("soma de zonas com floats não acumula erro > 0.01€", () => {
    const zones = [
      withZone(ZONE_PISTA, { participants: 7777, per_capita_bebidas: 11.11, repasse_bebidas_pct: 27.5 }),
      withZone(ZONE_BACKSTAGE, { participants: 333, per_capita_bebidas: 9.99, repasse_bebidas_pct: 41.7 }),
    ];
    const t = computeTotals(zones, FOOD_DEFAULT);
    const fatManual =
      7777 * 11.11 + 333 * 9.99;
    expect(closeTo(t.faturacaoBebidas, fatManual)).toBe(true);
    expect(closeTo(t.receitaBebidas + t.parteGeradorBebidas, t.faturacaoBebidas)).toBe(true);
  });

  it("alimentos: receita = fee + faturacao*repasse com decimais", () => {
    const food = { fee_alimentos: 1234.56, repasse_alimentos_pct: 27.5, per_capita_alimentos: 5.55 };
    const t = computeTotals([ZONE_PISTA, ZONE_VIP], food);
    // VIP open_food=true → não conta. Pista: 10000 part.
    const fatAli = 10000 * 5.55;
    const expected = 1234.56 + fatAli * 0.275;
    expect(closeTo(t.receitaAlimentos, expected)).toBe(true);
    expect(closeTo(t.parteGeradorAlimentos, fatAli * (1 - 0.275))).toBe(true);
  });

  it("totais consolidados são consistentes (resultado = receita; custo casa = 0)", () => {
    const t = computeTotals([ZONE_PISTA, ZONE_VIP, ZONE_BACKSTAGE], FOOD_DEFAULT);
    expect(closeTo(t.resultadoTotal, t.receitaTotal)).toBe(true);
    expect(closeTo(t.receitaTotal, t.receitaBebidas + t.receitaAlimentos)).toBe(true);
    expect(t.custoTotal).toBe(0);
  });
});
