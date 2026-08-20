/**
 * Cálculos puros do módulo A&B (Alimentos & Bebidas).
 *
 * Suporta dois modos de operação, independentes por tipo (bebidas/alimentos):
 *
 * ## Modo "terceirizacao" (comportamento original)
 *   O gerador opera A&B por sua conta (compra, vende, paga IVA). A casa não tem
 *   custo: recebe apenas a sua quota-parte sobre a faturação (% de repasse) +
 *   eventual fee fixo nos alimentos.
 *
 *     Faturação      = participantes × per_capita    (volume operado pelo gerador)
 *     Receita casa   = Faturação × % repasse + fee   (o que entra para a casa)
 *     Custo casa     = 0
 *     Resultado casa = Receita casa                  (sempre ≥ 0)
 *
 * ## Modo "exploracao_propria" (novo)
 *   O evento gere directamente os seus bares / restauração.
 *   Assume receitas e custos — o resultado pode ser negativo.
 *
 *     Receita casa   = participantes × per_capita_bebidas   (estimativa histórica)
 *     Custo casa     = participantes × per_capita_custo + custo_fixo
 *     Resultado casa = Receita − Custo                      (pode ser < 0)
 *
 * ## Premissa dos 3 cenários
 *   Real / Break Even / Forecast variam APENAS o nº de participantes.
 *   Os parâmetros (per capita, %, fee) são partilhados entre cenários.
 *
 * ## Edge case — participants_manual
 *   Se definido, é usado como denominador TANTO para receita como para custo,
 *   independentemente do modo.
 */

export type ABScenario = "real" | "breakeven" | "forecast";
export type ABMode = "terceirizacao" | "exploracao_propria";

export interface ABZoneInput {
  /** identificador estável (uuid ou label) */
  id: string;
  zone_label: string;
  /** participantes da zona no cenário corrente */
  participants: number;
  open_bar: boolean;
  open_food: boolean;
  /** Base de faturação/receita por pessoa (label contextual na UI conforme o modo) */
  per_capita_bebidas: number;
  /** 0–100 — apenas em modo terceirizacao */
  repasse_bebidas_pct: number;
  /** Custo por pessoa — apenas em modo exploracao_propria */
  per_capita_custo_bebidas?: number;
  /** Custo fixo da zona (staff, aluguer) — apenas em modo exploracao_propria */
  custo_fixo_bebidas?: number;
  /**
   * Facturação REAL do operador nesta zona (s/IVA), depois do fecho POS.
   * Quando NÃO-NULA manda no cálculo e substitui `participants × per_capita`.
   * `null`/`undefined` = não informada (comportamento estimado). 0 é um valor
   * legítimo (operou e não facturou nada) e é respeitado.
   * Só deve ser passada no cenário "real" — ver useEventABScenarios/EventABTab.
   */
  faturacao_real_bebidas?: number | null;
  /** Label livre para identificar o operador — opcional, sem FK em v1 */
  operador_nome?: string;
}


export interface ABFoodConfig {
  fee_alimentos: number;
  /** 0–100 — apenas em modo terceirizacao */
  repasse_alimentos_pct: number;
  per_capita_alimentos: number;
  /** Custo por pessoa — apenas em modo exploracao_propria */
  per_capita_custo_alimentos?: number;
  /** Custo fixo de alimentos — apenas em modo exploracao_propria */
  custo_fixo_alimentos?: number;
  /**
   * Facturação REAL do operador de alimentos (s/IVA), depois do fecho POS.
   * Quando NÃO-NULA manda no cálculo e substitui
   * `participantesElegiveisAlimentos × per_capita_alimentos`.
   * `null`/`undefined` = não informada. 0 é legítimo e é respeitado.
   * Só deve ser passada no cenário "real".
   */
  faturacao_real_alimentos?: number | null;
  /** Label livre para o operador de alimentos */
  operador_nome?: string;
}

export interface ABZoneResult {
  id: string;
  zone_label: string;
  participants: number;
  /** Volume total estimado (faturação do operador em terceirização; receita da casa em exploração) */
  faturacaoBebidas: number;
  /** Quota/receita da casa */
  receitaBebidas: number;
  /** Custo da casa (0 em terceirização; real em exploração própria) */
  custoCasaBebidas: number;
  /** Parte que fica para o gerador em terceirização (informativo; 0 em exploração própria) */
  parteGeradorBebidas: number;
  /** Resultado da casa = receitaBebidas − custoCasaBebidas */
  resultadoBebidas: number;
  /** @deprecated alias de parteGeradorBebidas — mantido para código legado */
  custoBebidas: number;
}

export interface ABTotals {
  zones: ABZoneResult[];

  // ── Bebidas (perspectiva da casa) ──
  faturacaoBebidas: number;
  receitaBebidas: number;
  custoCasaBebidas: number;
  parteGeradorBebidas: number;

  // ── Alimentos (perspectiva da casa) ──
  participantesElegiveisAlimentos: number;
  faturacaoAlimentos: number;
  receitaAlimentos: number;
  custoCasaAlimentos: number;
  parteGeradorAlimentos: number;

  // ── Consolidado A&B ──
  faturacaoTotal: number;
  receitaTotal: number;
  custoCasaTotal: number;
  parteGeradorTotal: number;
  /** Resultado real da casa = receitaTotal − custoCasaTotal (pode ser < 0 em exploração própria) */
  resultadoTotal: number;
  /** % — Receita / Faturação. 0 quando faturação = 0. Apenas significativo em terceirização. */
  margemPct: number;

  // ── Campos legado (deprecated) — mantidos para não quebrar consumidores ──
  /** @deprecated use custoCasaTotal */
  custoTotal: number;
  /** @deprecated use custoCasaBebidas */
  custoBebidas: number;
  /** @deprecated use custoCasaAlimentos */
  custoAlimentos: number;
  resultadoBebidas: number;
  resultadoAlimentos: number;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const num = (v: any, fb = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fb;
};

// ── computeZone ───────────────────────────────────────────────────────────────

export function computeZone(zone: ABZoneInput, mode: ABMode = "terceirizacao"): ABZoneResult {
  const participants = Math.max(0, num(zone.participants));

  // Open bar: sem cálculo de bebidas nesta zona
  if (zone.open_bar) {
    return {
      id: zone.id,
      zone_label: zone.zone_label,
      participants,
      faturacaoBebidas: 0,
      receitaBebidas: 0,
      custoCasaBebidas: 0,
      parteGeradorBebidas: 0,
      resultadoBebidas: 0,
      custoBebidas: 0,
    };
  }

  if (mode === "exploracao_propria") {
    // Exploração própria: casa fatura e suporta custos directamente.
    // participants_manual (já resolvido antes de chegar aqui) é o mesmo
    // denominador para receita e custo — ver edge case na documentação.
    const receita = participants * num(zone.per_capita_bebidas);
    const custo = participants * num(zone.per_capita_custo_bebidas) + num(zone.custo_fixo_bebidas);
    const resultado = receita - custo;
    return {
      id: zone.id,
      zone_label: zone.zone_label,
      participants,
      faturacaoBebidas: receita,      // = receita da casa (não há "faturação do operador" separada)
      receitaBebidas: receita,
      custoCasaBebidas: custo,
      parteGeradorBebidas: 0,         // não existe gerador externo
      resultadoBebidas: resultado,
      custoBebidas: 0,                // legado deprecated
    };
  }

  // Terceirização (comportamento original)
  const fat = participants * num(zone.per_capita_bebidas);
  const repasse = num(zone.repasse_bebidas_pct) / 100;
  const receita = fat * repasse;
  const parteGerador = fat - receita;
  return {
    id: zone.id,
    zone_label: zone.zone_label,
    participants,
    faturacaoBebidas: fat,
    receitaBebidas: receita,
    custoCasaBebidas: 0,
    parteGeradorBebidas: parteGerador,
    resultadoBebidas: receita,
    custoBebidas: 0,               // legado deprecated
  };
}

// ── computeTotals ─────────────────────────────────────────────────────────────

export function computeTotals(
  zones: ABZoneInput[],
  food: ABFoodConfig,
  modeBebidas: ABMode = "terceirizacao",
  modeAlimentos: ABMode = "terceirizacao",
): ABTotals {
  const zoneResults = zones.map((z) => computeZone(z, modeBebidas));

  const faturacaoBebidas    = zoneResults.reduce((s, z) => s + z.faturacaoBebidas, 0);
  const receitaBebidas      = zoneResults.reduce((s, z) => s + z.receitaBebidas, 0);
  const custoCasaBebidas    = zoneResults.reduce((s, z) => s + z.custoCasaBebidas, 0);
  const parteGeradorBebidas = zoneResults.reduce((s, z) => s + z.parteGeradorBebidas, 0);

  // Participantes elegíveis para alimentos (excluem zonas open_food)
  const participantesElegiveisAlimentos = zones
    .filter((z) => !z.open_food)
    .reduce((s, z) => s + Math.max(0, num(z.participants)), 0);

  let faturacaoAlimentos: number;
  let receitaAlimentos: number;
  let custoCasaAlimentos: number;
  let parteGeradorAlimentos: number;

  if (modeAlimentos === "exploracao_propria") {
    faturacaoAlimentos    = participantesElegiveisAlimentos * num(food.per_capita_alimentos);
    receitaAlimentos      = faturacaoAlimentos;
    custoCasaAlimentos    = participantesElegiveisAlimentos * num(food.per_capita_custo_alimentos)
                            + num(food.custo_fixo_alimentos);
    parteGeradorAlimentos = 0;
  } else {
    // Terceirização (comportamento original)
    faturacaoAlimentos    = participantesElegiveisAlimentos * num(food.per_capita_alimentos);
    const repAli          = num(food.repasse_alimentos_pct) / 100;
    receitaAlimentos      = num(food.fee_alimentos) + faturacaoAlimentos * repAli;
    custoCasaAlimentos    = 0;
    parteGeradorAlimentos = faturacaoAlimentos - faturacaoAlimentos * repAli;
  }

  const faturacaoTotal    = faturacaoBebidas + faturacaoAlimentos;
  const receitaTotal      = receitaBebidas + receitaAlimentos;
  const custoCasaTotal    = custoCasaBebidas + custoCasaAlimentos;
  const parteGeradorTotal = parteGeradorBebidas + parteGeradorAlimentos;
  const resultadoTotal    = receitaTotal - custoCasaTotal;
  const margemPct         = faturacaoTotal > 0 ? (receitaTotal / faturacaoTotal) * 100 : 0;

  return {
    zones: zoneResults,
    faturacaoBebidas,
    receitaBebidas,
    custoCasaBebidas,
    parteGeradorBebidas,
    participantesElegiveisAlimentos,
    faturacaoAlimentos,
    receitaAlimentos,
    custoCasaAlimentos,
    parteGeradorAlimentos,
    faturacaoTotal,
    receitaTotal,
    custoCasaTotal,
    parteGeradorTotal,
    resultadoTotal,
    margemPct,
    // ── legado deprecated ──
    custoTotal:         custoCasaTotal,
    custoBebidas:       0,
    custoAlimentos:     0,
    resultadoBebidas:   receitaBebidas - custoCasaBebidas,
    resultadoAlimentos: receitaAlimentos - custoCasaAlimentos,
  };
}
