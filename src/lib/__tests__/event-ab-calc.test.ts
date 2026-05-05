import { describe, it, expect } from "vitest";
import { computeZone, computeTotals } from "@/lib/event-ab-calc";
import {
  ALL_ZONES, FOOD_DEFAULT, ZONE_PISTA, ZONE_VIP, ZONE_BACKSTAGE,
  ZONE_PISTA_EXPLORACAO, FOOD_EXPLORACAO, ZONE_APENAS_CUSTO_FIXO,
  round2, closeTo, withZone,
} from "./event-ab-fixtures";

// ── Testes originais — modo terceirizacao ─────────────────────────────────────

describe("computeZone — terceirizacao", () => {
  it("Pista: faturação e receita correctas", () => {
    const r = computeZone(ZONE_PISTA, "terceirizacao");
    expect(round2(r.faturacaoBebidas)).toBe(120000);   // 10000 × 12
    expect(round2(r.receitaBebidas)).toBe(42000);       // 120000 × 35%
    expect(r.custoCasaBebidas).toBe(0);
    expect(round2(r.parteGeradorBebidas)).toBe(78000);
    expect(round2(r.resultadoBebidas)).toBe(42000);
  });

  it("VIP open_bar: tudo zero", () => {
    const r = computeZone(ZONE_VIP, "terceirizacao");
    expect(r.faturacaoBebidas).toBe(0);
    expect(r.receitaBebidas).toBe(0);
    expect(r.custoCasaBebidas).toBe(0);
  });

  it("Backstage: repasse 40%", () => {
    const r = computeZone(ZONE_BACKSTAGE, "terceirizacao");
    expect(round2(r.faturacaoBebidas)).toBe(800);      // 100 × 8
    expect(round2(r.receitaBebidas)).toBe(320);        // 800 × 40%
    expect(r.custoCasaBebidas).toBe(0);
  });
});

describe("computeTotals — terceirizacao", () => {
  it("totais correctos com 3 zonas + alimentos", () => {
    const t = computeTotals(ALL_ZONES, FOOD_DEFAULT, "terceirizacao", "terceirizacao");
    // Bebidas: Pista(42000) + VIP(0) + Backstage(320) = 42320
    expect(round2(t.receitaBebidas)).toBe(42320);
    expect(t.custoCasaBebidas).toBe(0);
    // Alimentos: elegíveis = 10000 + 100 = 10100 (VIP open_food excluído)
    //   faturação = 10100 × 6 = 60600; receita = 3000 + 60600 × 30% = 3000 + 18180 = 21180
    expect(t.participantesElegiveisAlimentos).toBe(10100);
    expect(round2(t.receitaAlimentos)).toBe(21180);
    expect(t.custoCasaAlimentos).toBe(0);
    // Resultado = receita total (custo = 0)
    expect(closeTo(t.resultadoTotal, t.receitaTotal)).toBe(true);
    // Legado backward compat
    expect(t.custoTotal).toBe(0);
  });

  it("legado custoTotal === custoCasaTotal", () => {
    const t = computeTotals(ALL_ZONES, FOOD_DEFAULT);
    expect(t.custoTotal).toBe(t.custoCasaTotal);
  });
});

// ── Testes v2 — modo exploracao_propria ──────────────────────────────────────

describe("computeZone — exploracao_propria", () => {
  it("(a) resultado pode ser negativo com custo > receita", () => {
    const zonaDeficit = withZone(ZONE_PISTA, {
      per_capita_bebidas: 3,           // receita: 10000 × 3 = 30000
      per_capita_custo_bebidas: 5,     // custo variável: 10000 × 5 = 50000
      custo_fixo_bebidas: 2000,        // custo fixo: 2000
    });
    const r = computeZone(zonaDeficit, "exploracao_propria");
    expect(round2(r.receitaBebidas)).toBe(30000);
    expect(round2(r.custoCasaBebidas)).toBe(52000);    // 50000 + 2000
    expect(round2(r.resultadoBebidas)).toBe(-22000);   // negativo ✓
    expect(r.parteGeradorBebidas).toBe(0);             // sem gerador externo
  });

  it("open_bar ignora o modo e devolve zeros", () => {
    const r = computeZone(ZONE_VIP, "exploracao_propria");
    expect(r.faturacaoBebidas).toBe(0);
    expect(r.custoCasaBebidas).toBe(0);
    expect(r.resultadoBebidas).toBe(0);
  });

  it("Pista exploração: receita e custo correctos", () => {
    const r = computeZone(ZONE_PISTA_EXPLORACAO, "exploracao_propria");
    // receita = 10000 × 12 = 120000
    expect(round2(r.receitaBebidas)).toBe(120000);
    // custo = 10000 × 5 + 2000 = 52000
    expect(round2(r.custoCasaBebidas)).toBe(52000);
    expect(round2(r.resultadoBebidas)).toBe(68000);
  });
});

describe("computeTotals — modos mistos", () => {
  it("(b) bebidas exploração + alimentos terceirização no mesmo evento", () => {
    const t = computeTotals(
      [ZONE_PISTA_EXPLORACAO, ZONE_VIP, ZONE_BACKSTAGE],
      FOOD_DEFAULT,
      "exploracao_propria",
      "terceirizacao",
    );
    // Bebidas exploração: Pista(68000) + VIP(0, open_bar) + Backstage(sem custo_fixo/custo: 100×8=800 receita, custo=0)
    expect(round2(t.receitaBebidas)).toBe(120800);  // 120000 + 0 + 800
    expect(round2(t.custoCasaBebidas)).toBe(52000); // só Pista tem custo
    // Alimentos terceirização: sem custo para a casa
    expect(t.custoCasaAlimentos).toBe(0);
    expect(round2(t.receitaAlimentos)).toBe(21180);
    // Resultado total = (120800 + 21180) - 52000 = 89980
    expect(round2(t.resultadoTotal)).toBe(89980);
  });

  it("(b) ambos exploração própria: custos somam correctamente", () => {
    const t = computeTotals(
      [ZONE_PISTA_EXPLORACAO],
      FOOD_EXPLORACAO,
      "exploracao_propria",
      "exploracao_propria",
    );
    // Bebidas: receita=120000, custo=52000
    // Alimentos: participantes=10000 (Pista, sem open_food)
    //   receita = 10000 × 8 = 80000
    //   custo   = 10000 × 4 + 5000 = 45000
    expect(round2(t.receitaAlimentos)).toBe(80000);
    expect(round2(t.custoCasaAlimentos)).toBe(45000);
    expect(round2(t.custoCasaTotal)).toBe(52000 + 45000);
    expect(round2(t.resultadoTotal)).toBe((120000 + 80000) - (52000 + 45000));
  });
});

describe("computeTotals — edge cases", () => {
  it("(c) custo fixo sem participantes: resultado = −custo_fixo", () => {
    const t = computeTotals(
      [ZONE_APENAS_CUSTO_FIXO],
      { fee_alimentos: 0, repasse_alimentos_pct: 0, per_capita_alimentos: 0,
        per_capita_custo_alimentos: 0, custo_fixo_alimentos: 0 },
      "exploracao_propria",
      "terceirizacao",
    );
    // participants=0, per_capita_bebidas=10 → receita=0
    // custo = 0×3 + 1500 = 1500
    expect(t.receitaBebidas).toBe(0);
    expect(t.custoCasaBebidas).toBe(1500);
    expect(t.resultadoTotal).toBe(-1500);
  });

  it("defaults (sem modo explícito) comportam-se como terceirizacao", () => {
    const t1 = computeTotals(ALL_ZONES, FOOD_DEFAULT);
    const t2 = computeTotals(ALL_ZONES, FOOD_DEFAULT, "terceirizacao", "terceirizacao");
    expect(t1.receitaTotal).toBe(t2.receitaTotal);
    expect(t1.custoCasaTotal).toBe(t2.custoCasaTotal);
    expect(t1.resultadoTotal).toBe(t2.resultadoTotal);
  });
});
