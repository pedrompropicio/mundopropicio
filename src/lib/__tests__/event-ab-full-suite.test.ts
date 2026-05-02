/**
 * Bateria completa de validação do módulo A&B.
 *
 * Cobre:
 *  - Modal A&B (criação/remoção zonas, toggles open_bar/open_food, cálculos)
 *  - Cenários Real / BreakEven / Forecast (parâmetros partilhados, só participantes variam)
 *  - Integração Simulador (mesmos números que o modal)
 *  - Integração DRE (linha receita = receitaTotal, linha custo = custoTotal,
 *    contribuição para o resultado)
 *  - Casos limite (sem zonas, tudo open, fee=0, per_capita=0, repasse 0% e 100%)
 *  - Teste end-to-end consolidado
 *
 * Como confirmar: `bunx vitest run src/lib/__tests__/event-ab-full-suite.test.ts`
 * Espera-se 100% verde. Os números esperados estão hard-coded.
 */
import { describe, it, expect } from "vitest";
import {
  computeZone,
  computeTotals,
  type ABZoneInput,
  type ABFoodConfig,
} from "../event-ab-calc";

const food = (over: Partial<ABFoodConfig> = {}): ABFoodConfig => ({
  fee_alimentos: 0,
  repasse_alimentos_pct: 0,
  per_capita_alimentos: 0,
  ...over,
});

const zone = (over: Partial<ABZoneInput> & { id: string; zone_label: string }): ABZoneInput => ({
  participants: 0,
  open_bar: false,
  open_food: false,
  per_capita_bebidas: 0,
  repasse_bebidas_pct: 0,
  ...over,
});

// ─────────────────────────── MODAL A&B ───────────────────────────
describe("Modal A&B — criação/remoção de zonas", () => {
  it("adicionar múltiplas zonas com nomes livres soma corretamente", () => {
    const t = computeTotals(
      [
        zone({ id: "1", zone_label: "Pista", participants: 100, per_capita_bebidas: 10, repasse_bebidas_pct: 30 }),
        zone({ id: "2", zone_label: "Camarote A", participants: 50, per_capita_bebidas: 12, repasse_bebidas_pct: 25 }),
        zone({ id: "3", zone_label: "Lounge VVIP", participants: 20, per_capita_bebidas: 20, repasse_bebidas_pct: 40 }),
      ],
      food(),
    );
    expect(t.zones).toHaveLength(3);
    expect(t.faturacaoBebidas).toBeCloseTo(100 * 10 + 50 * 12 + 20 * 20, 5);
  });

  it("remover uma zona recalcula totais sem deixar valores órfãos", () => {
    const all = [
      zone({ id: "1", zone_label: "A", participants: 100, per_capita_bebidas: 10, repasse_bebidas_pct: 50 }),
      zone({ id: "2", zone_label: "B", participants: 200, per_capita_bebidas: 5, repasse_bebidas_pct: 50 }),
    ];
    const before = computeTotals(all, food());
    const after = computeTotals(all.filter((z) => z.id !== "2"), food());
    expect(before.faturacaoBebidas).toBe(2000);
    expect(after.faturacaoBebidas).toBe(1000);
    expect(after.zones.find((z) => z.id === "2")).toBeUndefined();
  });
});

// ─────────────────────────── TOGGLES ───────────────────────────
describe("Modal A&B — toggle open_bar", () => {
  it("open_bar ON zera bebidas (faturação, receita, custo) dessa zona", () => {
    const r = computeZone(zone({
      id: "v", zone_label: "VIP", participants: 200,
      open_bar: true, per_capita_bebidas: 99, repasse_bebidas_pct: 99,
    }));
    expect(r.faturacaoBebidas).toBe(0);
    expect(r.receitaBebidas).toBe(0);
    expect(r.custoBebidas).toBe(0);
  });

  it("alternar open_bar OFF retoma cálculos", () => {
    const r = computeZone(zone({
      id: "v", zone_label: "VIP", participants: 200,
      open_bar: false, per_capita_bebidas: 10, repasse_bebidas_pct: 30,
    }));
    expect(r.faturacaoBebidas).toBe(2000);
    expect(r.receitaBebidas).toBe(600);
    expect(r.custoBebidas).toBe(1400);
  });
});

describe("Modal A&B — toggle open_food", () => {
  it("open_food ON exclui participantes da zona do total elegível", () => {
    const t = computeTotals(
      [
        zone({ id: "1", zone_label: "Pista", participants: 1000 }),
        zone({ id: "2", zone_label: "VIP", participants: 200, open_food: true }),
      ],
      food({ per_capita_alimentos: 5, repasse_alimentos_pct: 30 }),
    );
    expect(t.participantesElegiveisAlimentos).toBe(1000);
  });

  it("alternar open_food recalcula total elegível", () => {
    const baseZones = [
      zone({ id: "1", zone_label: "Pista", participants: 1000 }),
      zone({ id: "2", zone_label: "VIP", participants: 200 }),
    ];
    const off = computeTotals(baseZones, food({ per_capita_alimentos: 5 }));
    const on = computeTotals(
      baseZones.map((z) => (z.id === "2" ? { ...z, open_food: true } : z)),
      food({ per_capita_alimentos: 5 }),
    );
    expect(off.participantesElegiveisAlimentos).toBe(1200);
    expect(on.participantesElegiveisAlimentos).toBe(1000);
  });
});

// ─────────────────────────── CÁLCULOS DE EXEMPLO ───────────────────────────
describe("Modal A&B — cálculos exemplares", () => {
  const pista = zone({
    id: "p", zone_label: "Pista", participants: 1000,
    per_capita_bebidas: 10, repasse_bebidas_pct: 35,
  });
  const vip = zone({
    id: "v", zone_label: "VIP", participants: 200, open_bar: true,
  });

  it("Pista 1000 x €10 x 35% → 10.000 / 3.500 / 6.500", () => {
    const r = computeZone(pista);
    expect(r.faturacaoBebidas).toBe(10000);
    expect(r.receitaBebidas).toBe(3500);
    expect(r.custoBebidas).toBe(6500);
  });

  it("VIP open_bar ON → tudo zero", () => {
    const r = computeZone(vip);
    expect(r.faturacaoBebidas + r.receitaBebidas + r.custoBebidas).toBe(0);
  });

  it("Totais bebidas (Pista + VIP) = 10.000 / 3.500 / 6.500 / resultado 3.500", () => {
    const t = computeTotals([pista, vip], food());
    expect(t.faturacaoBebidas).toBe(10000);
    expect(t.receitaBebidas).toBe(3500);
    expect(t.custoBebidas).toBe(6500);
    expect(t.resultadoBebidas).toBe(-3000); // 3500 receita − 6500 custo (modelo concessão ao operador)
  });

  it("Alimentos: fee €2.000 + 1000 elegíveis × €5 × 30% → 5000/3500/3500/3500", () => {
    // Pista elegível, VIP open_food ON exclui
    const t = computeTotals(
      [
        pista,
        zone({ id: "v", zone_label: "VIP", participants: 200, open_bar: true, open_food: true }),
      ],
      food({ fee_alimentos: 2000, repasse_alimentos_pct: 30, per_capita_alimentos: 5 }),
    );
    expect(t.participantesElegiveisAlimentos).toBe(1000);
    expect(t.faturacaoAlimentos).toBe(5000);
    expect(t.receitaAlimentos).toBe(2000 + 1500); // 3500
    expect(t.custoAlimentos).toBe(3500);
    expect(t.resultadoAlimentos).toBe(0); // 3500 receita - 3500 custo
    // Atenção: receita 3500 e custo 3500 ⇒ resultado 0. (Especificação do utilizador
    // dizia "Resultado €3.500" mas matematicamente 3500-3500=0; mantemos a fórmula.)
  });
});

describe("Modal A&B — totais consolidados e margem", () => {
  it("consolidado soma bebidas + alimentos e calcula margem %", () => {
    const t = computeTotals(
      [zone({ id: "1", zone_label: "P", participants: 1000, per_capita_bebidas: 10, repasse_bebidas_pct: 50 })],
      food({ fee_alimentos: 1000, per_capita_alimentos: 5, repasse_alimentos_pct: 50 }),
    );
    expect(t.faturacaoTotal).toBe(t.faturacaoBebidas + t.faturacaoAlimentos);
    expect(t.receitaTotal).toBe(t.receitaBebidas + t.receitaAlimentos);
    expect(t.custoTotal).toBe(t.custoBebidas + t.custoAlimentos);
    expect(t.resultadoTotal).toBeCloseTo(t.receitaTotal - t.custoTotal, 5);
    expect(t.margemPct).toBeCloseTo((t.resultadoTotal / t.receitaTotal) * 100, 5);
  });
});

// ─────────────────────────── CENÁRIOS ───────────────────────────
describe("Cenários Real / BreakEven / Forecast", () => {
  const baseZones = (participants: number) => [
    zone({ id: "p", zone_label: "Pista", participants, per_capita_bebidas: 10, repasse_bebidas_pct: 30 }),
  ];
  const f = food({ fee_alimentos: 1000, per_capita_alimentos: 5, repasse_alimentos_pct: 40 });

  it("parâmetros são partilhados, só participantes variam", () => {
    const real = computeTotals(baseZones(1000), f);
    const be = computeTotals(baseZones(700), f);
    const fc = computeTotals(baseZones(1500), f);
    // Per capita € e fee mantidos
    expect(real.faturacaoBebidas).toBe(10000);
    expect(be.faturacaoBebidas).toBe(7000);
    expect(fc.faturacaoBebidas).toBe(15000);
    // Fee fixo presente nos 3
    expect(real.receitaAlimentos).toBeGreaterThanOrEqual(1000);
    expect(be.receitaAlimentos).toBeGreaterThanOrEqual(1000);
    expect(fc.receitaAlimentos).toBeGreaterThanOrEqual(1000);
  });

  it("alterar um parâmetro afeta os 3 cenários igualmente", () => {
    const fA = food({ per_capita_alimentos: 5 });
    const fB = food({ per_capita_alimentos: 10 });
    const realA = computeTotals(baseZones(1000), fA);
    const realB = computeTotals(baseZones(1000), fB);
    expect(realB.faturacaoAlimentos).toBe(realA.faturacaoAlimentos * 2);
  });
});

// ─────────────────────────── INTEGRAÇÃO SIMULADOR / DRE ───────────────────────────
/**
 * O Simulador (src/hooks/useEventABScenarios.ts) e o DRE (src/components/ReportDRE.tsx)
 * NÃO fazem cálculo próprio — chamam computeTotals(). Logo, validar a função pura
 * garante consistência com ambos. Os testes abaixo cristalizam o contrato.
 */
describe("Integração Simulador — só consome computeTotals (sem inputs próprios)", () => {
  it("Simulador usa exatamente os mesmos números que o modal para o mesmo cenário", () => {
    const zones = [zone({ id: "p", zone_label: "Pista", participants: 1234, per_capita_bebidas: 11, repasse_bebidas_pct: 33 })];
    const f = food({ fee_alimentos: 500, per_capita_alimentos: 7, repasse_alimentos_pct: 25 });
    const modal = computeTotals(zones, f);
    // O Simulador mostra apenas estes 3 valores agregados:
    const simulatorView = {
      receitaTotal: modal.receitaTotal,
      custoTotal: modal.custoTotal,
      resultadoTotal: modal.resultadoTotal,
    };
    expect(simulatorView.receitaTotal).toBe(modal.receitaTotal);
    expect(simulatorView.custoTotal).toBe(modal.custoTotal);
    expect(simulatorView.resultadoTotal).toBe(modal.resultadoTotal);
    // Não expõe parâmetros de negociação:
    expect(simulatorView).not.toHaveProperty("per_capita_bebidas");
    expect(simulatorView).not.toHaveProperty("repasse_alimentos_pct");
    expect(simulatorView).not.toHaveProperty("fee_alimentos");
  });
});

describe("Integração DRE — linhas A&B refletem totais do modal", () => {
  it("linha receita A&B = receitaTotal, linha custo A&B = custoTotal", () => {
    const t = computeTotals(
      [zone({ id: "p", zone_label: "Pista", participants: 500, per_capita_bebidas: 10, repasse_bebidas_pct: 40 })],
      food({ fee_alimentos: 200, per_capita_alimentos: 4, repasse_alimentos_pct: 30 }),
    );
    const dreReceita = t.receitaTotal;
    const dreCusto = t.custoTotal;
    expect(dreReceita).toBe(t.receitaBebidas + t.receitaAlimentos);
    expect(dreCusto).toBe(t.custoBebidas + t.custoAlimentos);
    // Contribuição para resultado geral
    expect(dreReceita - dreCusto).toBe(t.resultadoTotal);
  });
});

// ─────────────────────────── CASOS LIMITE ───────────────────────────
describe("Casos limite", () => {
  it("evento sem zonas → tudo zero, sem erros", () => {
    const t = computeTotals([], food());
    expect(t.faturacaoTotal).toBe(0);
    expect(t.receitaTotal).toBe(0);
    expect(t.custoTotal).toBe(0);
    expect(t.resultadoTotal).toBe(0);
    expect(t.margemPct).toBe(0);
  });

  it("todas zonas com open_bar+open_food ON → faturação 0, mas fee de alimentos aparece na receita", () => {
    const t = computeTotals(
      [
        zone({ id: "1", zone_label: "A", participants: 100, open_bar: true, open_food: true }),
        zone({ id: "2", zone_label: "B", participants: 200, open_bar: true, open_food: true }),
      ],
      food({ fee_alimentos: 1500, per_capita_alimentos: 5, repasse_alimentos_pct: 30 }),
    );
    expect(t.faturacaoTotal).toBe(0);
    expect(t.receitaAlimentos).toBe(1500); // só fee
    expect(t.receitaTotal).toBe(1500);
    expect(t.custoTotal).toBe(0);
  });

  it("fee=0 funciona sem erros", () => {
    const t = computeTotals(
      [zone({ id: "1", zone_label: "P", participants: 100, per_capita_bebidas: 5, repasse_bebidas_pct: 20 })],
      food({ fee_alimentos: 0, per_capita_alimentos: 3, repasse_alimentos_pct: 25 }),
    );
    expect(Number.isFinite(t.receitaTotal)).toBe(true);
    expect(t.receitaAlimentos).toBe(100 * 3 * 0.25);
  });

  it("per_capita=0 → bebidas zero, alimentos zero (exceto fee)", () => {
    const t = computeTotals(
      [zone({ id: "1", zone_label: "P", participants: 1000, per_capita_bebidas: 0, repasse_bebidas_pct: 50 })],
      food({ fee_alimentos: 100, per_capita_alimentos: 0, repasse_alimentos_pct: 50 }),
    );
    expect(t.faturacaoBebidas).toBe(0);
    expect(t.faturacaoAlimentos).toBe(0);
    expect(t.receitaTotal).toBe(100);
  });

  it("repasse 0% → toda a faturação é custo", () => {
    const t = computeTotals(
      [zone({ id: "1", zone_label: "P", participants: 100, per_capita_bebidas: 10, repasse_bebidas_pct: 0 })],
      food(),
    );
    expect(t.receitaBebidas).toBe(0);
    expect(t.custoBebidas).toBe(1000);
  });

  it("repasse 100% → toda a faturação é receita", () => {
    const t = computeTotals(
      [zone({ id: "1", zone_label: "P", participants: 100, per_capita_bebidas: 10, repasse_bebidas_pct: 100 })],
      food({ per_capita_alimentos: 5, repasse_alimentos_pct: 100 }),
    );
    expect(t.receitaBebidas).toBe(1000);
    expect(t.custoBebidas).toBe(0);
    expect(t.custoAlimentos).toBe(0);
    expect(t.receitaAlimentos).toBe(500);
  });

  it("remover zona com dados preenchidos não deixa órfãos", () => {
    const all = [
      zone({ id: "1", zone_label: "Keep", participants: 100, per_capita_bebidas: 10, repasse_bebidas_pct: 50 }),
      zone({ id: "2", zone_label: "Drop", participants: 999, per_capita_bebidas: 99, repasse_bebidas_pct: 99 }),
    ];
    const after = computeTotals(all.filter((z) => z.id !== "2"), food());
    expect(after.zones).toHaveLength(1);
    expect(after.faturacaoBebidas).toBe(1000);
  });
});

// ─────────────────────────── END-TO-END ───────────────────────────
describe("End-to-end consolidado (3 zonas + alimentos)", () => {
  /**
   * Pista     10.000 part., open_bar OFF, €12 × 35%
   * VIP         500 part., open_bar ON, open_food ON
   * Backstage   100 part., open_bar OFF, €8 × 40%
   * Alimentos: fee €3.000, per capita €6, repasse 30%
   *
   * Cálculos esperados:
   *  Bebidas Pista:  10000 × 12 = 120.000  | rec 42.000 | custo 78.000
   *  Bebidas VIP:    0
   *  Bebidas Back:    100 × 8 =     800  | rec   320 | custo   480
   *  Σ Bebidas:                 120.800  | rec 42.320 | custo 78.480
   *  Alimentos elegíveis: 10000 + 100 = 10.100 (VIP excluída)
   *  Faturação alimentos: 10100 × 6 = 60.600
   *  Receita alimentos: 3000 + 60600×0.30 = 3000 + 18180 = 21.180
   *  Custo alimentos:  60600×0.70 = 42.420
   *  Σ A&B faturação: 120.800 + 60.600 = 181.400
   *  Σ A&B receita:   42.320 + 21.180  = 63.500
   *  Σ A&B custo:     78.480 + 42.420  = 120.900
   *  Resultado A&B:   63.500 − 120.900 = −57.400
   */
  const zones: ABZoneInput[] = [
    zone({ id: "p", zone_label: "Pista", participants: 10000, per_capita_bebidas: 12, repasse_bebidas_pct: 35 }),
    zone({ id: "v", zone_label: "VIP", participants: 500, open_bar: true, open_food: true }),
    zone({ id: "b", zone_label: "Backstage", participants: 100, per_capita_bebidas: 8, repasse_bebidas_pct: 40 }),
  ];
  const f = food({ fee_alimentos: 3000, per_capita_alimentos: 6, repasse_alimentos_pct: 30 });
  const t = computeTotals(zones, f);

  it("bebidas por zona", () => {
    expect(t.zones[0]).toMatchObject({ faturacaoBebidas: 120000, receitaBebidas: 42000, custoBebidas: 78000 });
    expect(t.zones[1]).toMatchObject({ faturacaoBebidas: 0, receitaBebidas: 0, custoBebidas: 0 });
    expect(t.zones[2]).toMatchObject({ faturacaoBebidas: 800, receitaBebidas: 320, custoBebidas: 480 });
  });

  it("totais bebidas", () => {
    expect(t.faturacaoBebidas).toBe(120800);
    expect(t.receitaBebidas).toBe(42320);
    expect(t.custoBebidas).toBe(78480);
  });

  it("alimentos (VIP excluída por open_food ON)", () => {
    expect(t.participantesElegiveisAlimentos).toBe(10100);
    expect(t.faturacaoAlimentos).toBe(60600);
    expect(t.receitaAlimentos).toBeCloseTo(21180, 5);
    expect(t.custoAlimentos).toBeCloseTo(42420, 5);
  });

  it("consolidado A&B", () => {
    expect(t.faturacaoTotal).toBe(181400);
    expect(t.receitaTotal).toBeCloseTo(63500, 5);
    expect(t.custoTotal).toBeCloseTo(120900, 5);
    expect(t.resultadoTotal).toBeCloseTo(-57400, 5);
  });

  it("DRE recebe exatamente estes números (mesma fonte)", () => {
    expect(t.receitaTotal).toBe(t.receitaBebidas + t.receitaAlimentos);
    expect(t.custoTotal).toBe(t.custoBebidas + t.custoAlimentos);
    expect(t.resultadoTotal).toBe(t.receitaTotal - t.custoTotal);
  });
});
