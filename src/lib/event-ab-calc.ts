/**
 * Cálculos puros do módulo A&B (Alimentos & Bebidas) por evento.
 *
 * Modelo:
 *  - BEBIDAS configuradas por zona: per_capita_bebidas + repasse_bebidas_pct + open_bar
 *  - ALIMENTOS configurados a nível global: fee_alimentos + repasse_alimentos_pct
 *    + per_capita_alimentos. Cada zona contribui (ou não) via flag open_food.
 *
 * Todos os valores são SEM IVA (responsabilidade do operador).
 *
 * Cenários (Real / Break Even / Forecast) variam APENAS no nº de participantes
 * por zona — os parâmetros (per capita, %, fee) são partilhados.
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
  receitaBebidas: number;
  custoBebidas: number;
}

export interface ABTotals {
  zones: ABZoneResult[];
  // Bebidas
  faturacaoBebidas: number;
  receitaBebidas: number;
  custoBebidas: number;
  resultadoBebidas: number;
  // Alimentos
  participantesElegiveisAlimentos: number;
  faturacaoAlimentos: number;
  receitaAlimentos: number;
  custoAlimentos: number;
  resultadoAlimentos: number;
  // Consolidado A&B
  faturacaoTotal: number;
  receitaTotal: number;
  custoTotal: number;
  resultadoTotal: number;
  /** % — 0 quando receitaTotal === 0 */
  margemPct: number;
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
