/**
 * Cálculos puros do módulo A&B (Alimentos & Bebidas) — modelo de CONCESSÃO.
 *
 * O gerador opera A&B por sua conta (compra, vende, paga IVA). A casa não tem
 * custo: recebe apenas a sua quota-parte sobre a faturação (% de repasse) +
 * eventual fee fixo nos alimentos.
 *
 *   Faturação      = participantes × per_capita    (volume operado pelo gerador)
 *   Receita casa   = Faturação × % repasse + fee   (o que entra para a casa)
 *   Parte gerador  = Faturação − Receita casa      (informativo; não é custo da casa)
 *   Custo casa     = 0                             (operação por conta do gerador)
 *   Resultado casa = Receita casa                  (sempre ≥ 0)
 *   Margem         = Receita casa / Faturação      (% que a casa fica)
 *
 * Cenários (Real / BE / Forecast) variam APENAS no nº de participantes — os
 * parâmetros (per capita, %, fee) são partilhados.
 */

export type ABScenario = "real" | "breakeven" | "forecast";

export interface ABZoneInput {
  /** identificador estável (uuid ou label) */
  id: string;
  zone_label: string;
  /** participantes da zona no cenário corrente */
  participants: number;
  open_bar: boolean;
  open_food: boolean;
  per_capita_bebidas: number;
  /** 0–100 */
  repasse_bebidas_pct: number;
}

export interface ABFoodConfig {
  fee_alimentos: number;
  /** 0–100 */
  repasse_alimentos_pct: number;
  per_capita_alimentos: number;
}

export interface ABZoneResult {
  id: string;
  zone_label: string;
  participants: number;
  faturacaoBebidas: number;
  /** Quota da casa = faturação × repasse. */
  receitaBebidas: number;
  /** Parte que fica para o gerador (informativo). */
  parteGeradorBebidas: number;
}

export interface ABTotals {
  zones: ABZoneResult[];
  // Bebidas (perspectiva da casa)
  faturacaoBebidas: number;
  receitaBebidas: number;
  parteGeradorBebidas: number;
  // Alimentos (perspectiva da casa)
  participantesElegiveisAlimentos: number;
  faturacaoAlimentos: number;
  receitaAlimentos: number;
  parteGeradorAlimentos: number;
  // Consolidado A&B (perspectiva da casa — sempre ≥ 0)
  faturacaoTotal: number;
  receitaTotal: number;
  parteGeradorTotal: number;
  /** Resultado da casa = Receita (custo da casa = 0). */
  resultadoTotal: number;
  /** % — Receita / Faturação. 0 quando faturação = 0. */
  margemPct: number;

  // Compat legado (deprecated, mantidos para não quebrar consumidores)
  custoBebidas: number;
  custoAlimentos: number;
  custoTotal: number;
  resultadoBebidas: number;
  resultadoAlimentos: number;
}

const num = (v: any, fb = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fb;
};

export function computeZone(zone: ABZoneInput): ABZoneResult {
  const participants = Math.max(0, num(zone.participants));
  if (zone.open_bar) {
    return {
      id: zone.id,
      zone_label: zone.zone_label,
      participants,
      faturacaoBebidas: 0,
      receitaBebidas: 0,
      custoBebidas: 0,
    };
  }
  const fat = participants * num(zone.per_capita_bebidas);
  const repasse = num(zone.repasse_bebidas_pct) / 100;
  return {
    id: zone.id,
    zone_label: zone.zone_label,
    participants,
    faturacaoBebidas: fat,
    receitaBebidas: fat * repasse,
    custoBebidas: fat * (1 - repasse),
  };
}

export function computeTotals(zones: ABZoneInput[], food: ABFoodConfig): ABTotals {
  const zoneResults = zones.map(computeZone);

  const faturacaoBebidas = zoneResults.reduce((s, z) => s + z.faturacaoBebidas, 0);
  const receitaBebidas = zoneResults.reduce((s, z) => s + z.receitaBebidas, 0);
  const custoBebidas = zoneResults.reduce((s, z) => s + z.custoBebidas, 0);

  const participantesElegiveisAlimentos = zones
    .filter((z) => !z.open_food)
    .reduce((s, z) => s + Math.max(0, num(z.participants)), 0);

  const faturacaoAlimentos = participantesElegiveisAlimentos * num(food.per_capita_alimentos);
  const repAli = num(food.repasse_alimentos_pct) / 100;
  const receitaAlimentos = num(food.fee_alimentos) + faturacaoAlimentos * repAli;
  const custoAlimentos = faturacaoAlimentos * (1 - repAli);

  const faturacaoTotal = faturacaoBebidas + faturacaoAlimentos;
  const receitaTotal = receitaBebidas + receitaAlimentos;
  const custoTotal = custoBebidas + custoAlimentos;
  const resultadoTotal = receitaTotal - custoTotal;
  const margemPct = receitaTotal > 0 ? (resultadoTotal / receitaTotal) * 100 : 0;

  return {
    zones: zoneResults,
    faturacaoBebidas,
    receitaBebidas,
    custoBebidas,
    resultadoBebidas: receitaBebidas - custoBebidas,
    participantesElegiveisAlimentos,
    faturacaoAlimentos,
    receitaAlimentos,
    custoAlimentos,
    resultadoAlimentos: receitaAlimentos - custoAlimentos,
    faturacaoTotal,
    receitaTotal,
    custoTotal,
    resultadoTotal,
    margemPct,
  };
}
