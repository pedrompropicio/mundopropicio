/**
 * Cálculos do Simulador formato Coala (3 cenários: Hoje · Break Even · Forecast).
 *
 * Estrutura espelha a aba "Simulador" do BP_COALA:
 *  - Matriz dia × zona com Vendas Reais + Projeção + Cortesia + Forecast
 *  - Receitas A&B com ticket médio bebida/alimento globais e % repasse
 *  - Patrocínio + Souvenir + Outros Créditos (Bonif. bebidas, Ponto vendido)
 *  - Custos por categoria L3 com colunas 2025 / Break Even / Forecast
 *  - IVA bilheteira por sessão
 *  - Resultado Geral / Evento / A&B / Souvenir e indicadores per capita
 */

export type CoalaSession = {
  day_index: number;
  zone_label: string;
  real_sales_qty: number;
  real_sales_revenue: number;
  projected_qty: number;     // projeção restante de vendas
  courtesy_qty: number;
  forecast_qty: number;      // total ambicionado pelo Forecast DVT
  prior_year_qty: number;
  prior_year_revenue: number;
  iva_pct: number;           // ex: 6
  avg_ticket_override?: number | null;
};

export type CoalaCostLine = {
  label: string;
  prior_year_amount: number;
  actual_amount?: number;     // Hoje (Edição atual) = TX pagas/aprovadas + BP s/ TX
  break_even_amount: number;
  forecast_amount: number;
  is_ab_passthrough?: boolean; // marca linhas A&B Bebida/Alimento (recalculadas)
};

export type CoalaConfig = {
  ab_drink_avg_ticket: number;
  ab_food_avg_ticket: number;
  ab_drink_passthrough_pct: number;  // % do CMV/repasse sobre receita
  ab_food_passthrough_pct: number;
  sponsorship_revenue: number;
  souvenir_revenue: number;
  souvenir_cost: number;
  bonif_bebidas: number;
  ponto_vendido: number;
  other_revenue: number;
  prior_year_tickets: number;
  prior_year_drink: number;
  prior_year_food: number;
  prior_year_sponsor: number;
  prior_year_souvenir: number;
  prior_year_other: number;
  ticket_iva_pct: number;
};

const n = (v: any, fb = 0): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fb;
};

// ---------- Lotes / capacidade (input opcional para o solver BE) ----------

export type SessionLotInfo = {
  /** chave que casa com `${day_index}-${zone_label}` em CoalaSession */
  key: string;
  /** capacidade total da zona/sessão */
  capacity: number;
  /** lotes ordenados por lot_number (ascendente) */
  lots: Array<{ lot_number: number; price: number; quantity: number; sold: number }>;
  /** dias decorridos desde a 1ª venda (mínimo 1) — usado para velocidade */
  days_selling: number;
};

export type BreakEvenBreakdownItem = {
  key: string;
  zone_label: string;
  day_index: number;
  current_qty: number;
  extra_qty: number;
  capacity_left: number;
  marginal_price: number;
  velocity: number;          // bilhetes/dia
  reason?: "no_velocity" | "capacity_full" | "no_price" | "ok";
};

export type BreakEvenSolution = {
  qtyByKey: Record<string, number>;
  /** Receita de bilheteira por sessão (real +/− alocações a preços marginais lote-a-lote). */
  revenueByKey: Record<string, number>;
  reachable: boolean;
  deficit: number;            // € que faltam para empatar (mode='deficit')
  totalExtraTickets: number;  // soma dos bilhetes extras alocados (mode='deficit')
  unfilled: number;           // € que NÃO foi possível alocar (capacidade esgotada)
  breakdown: BreakEvenBreakdownItem[];
  /** 'deficit' = falta vender; 'surplus' = já passou BE (mostra margem); 'exact' = já no ponto. */
  mode: "deficit" | "surplus" | "exact";
  /** € de margem acima do ponto BE quando mode='surplus'. */
  surplus: number;
  /** Bilhetes que poderiam ter sido removidos para zerar o resultado (mode='surplus'). */
  totalRemovedTickets: number;
};

export type BreakEvenEconomicsOverride = {
  /** Resultado base (com vendas reais) no mesmo modelo económico que a UI final. */
  baseResult?: number;
  /** Margem líquida A&B por presença usada pela UI final. */
  abMarginPerPub?: number;
};

// ---------- Forecast solver ----------

export type ForecastBreakdownItem = {
  key: string;
  zone_label: string;
  day_index: number;
  current_qty: number;
  projected_qty: number;       // projeção autom. (recente + curva final)
  forecast_qty: number;        // total final (com piso manual e teto de capacidade)
  capacity_left: number;       // capacidade restante após forecast (Infinity se sem plano)
  recent_velocity: number;     // bilhetes/dia (janela recente)
  days_to_event: number;
  capped_by_capacity: boolean;
  manual_floor_used: boolean;
  reason?: "no_velocity" | "capacity_full" | "ok";
};

export type ForecastSolution = {
  qtyByKey: Record<string, number>;       // forecast TOTAL por sessão (inclui real + extras)
  revenueByKey: Record<string, number>;   // receita por sessão (real + extras lote-a-lote)
  breakdown: ForecastBreakdownItem[];
  daysToEvent: number;                    // máx. entre todas as sessões
  hasCapacityPlan: boolean;               // true se ALGUMA zona tem capacidade definida
};

/** Multiplicador de aceleração na "reta final" (últimos N dias antes do evento) — DEFAULTS. */
export const FORECAST_FINAL_ACCEL_DEFAULT = 1.6;
export const FORECAST_FINAL_WINDOW_DAYS_DEFAULT = 30;
/** Janela recente para calcular ritmo (preferimos os últimos X dias para captar tendência). */
const FORECAST_RECENT_WINDOW_DAYS = 14;

// ---------- Por sessão (dia × zona) ----------

/** Receita líquida de IVA da sessão (real_sales_revenue vem bruto da bilheteira). */
function sessionNetRevenue(s: CoalaSession): number {
  const gross = n(s.real_sales_revenue);
  const ivaPct = n(s.iva_pct, 6);
  return ivaPct > 0 ? gross / (1 + ivaPct / 100) : gross;
}

export function sessionAvgTicket(s: CoalaSession): number {
  if (s.avg_ticket_override != null) return n(s.avg_ticket_override);
  const qty = n(s.real_sales_qty);
  if (qty <= 0) return 0;
  // TM líquido — simulador trabalha sempre s/IVA.
  return sessionNetRevenue(s) / qty;
}

export function sessionTodayQty(s: CoalaSession): number {
  return n(s.real_sales_qty);
}
export function sessionTodayRevenue(s: CoalaSession): number {
  // Simulador trabalha em valores líquidos (s/IVA). real_sales_revenue
  // vem bruto da bilheteira, por isso netamos pelo iva_pct configurado.
  return sessionNetRevenue(s);
}

function logicalZoneGroup(label: string): string {
  return (label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+[—-]\s*(sabado|domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?)\s*$/i, "")
    .trim();
}

/** Break-Even por sessão: distribuição proporcional do break-even global é tratada externamente.
 *  Esta função devolve só a quantidade adicional ao Real para atingir o forecast. */
export function sessionForecastQty(s: CoalaSession): number {
  // Forecast = max(real + projeção + cortesia, forecast_qty manual)
  const computed = n(s.real_sales_qty) + n(s.projected_qty) + n(s.courtesy_qty);
  return Math.max(computed, n(s.forecast_qty));
}

export function sessionForecastRevenue(s: CoalaSession): number {
  const tm = sessionAvgTicket(s); // já líquido
  // Receita forecast (líquida) = real líquido + (projeção × TM líquido)
  return sessionNetRevenue(s) + n(s.projected_qty) * tm;
}

// ---------- Totais por cenário ----------

export type Scenario = "today" | "breakeven" | "forecast";

export type ScenarioRevenue = {
  ticketsQty: number;       // quantidade pagantes (sem cortesias) — bilhetes únicos
  ticketsRevenue: number;
  drinkRevenue: number;
  foodRevenue: number;
  sponsorRevenue: number;
  souvenirRevenue: number;
  otherCredits: number;
  totalRevenue: number;
  // cortesias (informativo)
  courtesyQty: number;
  /** Presenças × dia (combos expandidos). Igual a ticketsQty quando não há combos. */
  attendanceQty: number;
  /** Presenças cortesias × dia. Igual a courtesyQty quando não há combos. */
  attendanceCourtesyQty: number;
};

/** Override opcional vindo do helper de combos (presenças × dia já expandidas).
 *  Quando fornecido, A&B usa estes valores e os campos `attendance*` reportam
 *  presenças × dia. Sem override, presenças = bilhetes únicos. */
export type AttendanceOverride = {
  payingAttendance: number;   // presenças pagantes × dia
  courtesyAttendance: number; // presenças cortesias × dia
};

function abForPublic(publicQty: number, cfg: CoalaConfig) {
  return {
    drink: publicQty * n(cfg.ab_drink_avg_ticket),
    food: publicQty * n(cfg.ab_food_avg_ticket),
  };
}

export function computeScenarioRevenue(
  sessions: CoalaSession[],
  cfg: CoalaConfig,
  scenario: Scenario,
  /** Quantidade total de pagantes por sessão (vindo de solver BE/Forecast). */
  qtyByKey?: Record<string, number>,
  /** Receita de bilheteira por sessão (real + extras a preços marginais reais).
   *  Quando fornecido, substitui o cálculo qty × TM. */
  revenueByKey?: Record<string, number>,
  /** Presenças × dia (combos expandidos) — alimenta A&B fallback e KPIs.
   *  Quando ausente, usa pagantes únicos (legado). */
  attendance?: AttendanceOverride,
): ScenarioRevenue {
  let ticketsQty = 0, ticketsRevenue = 0, courtesyQty = 0;

  for (const s of sessions) {
    const key = `${s.day_index}-${s.zone_label}`;
    if (scenario === "today") {
      ticketsQty += sessionTodayQty(s);
      ticketsRevenue += sessionTodayRevenue(s);
      courtesyQty += n(s.courtesy_qty);
    } else {
      // breakeven OU forecast: usa solver se fornecido; senão fallback estático.
      const realQty = sessionTodayQty(s);
      const realRev = sessionTodayRevenue(s);
      let totalQty: number;
      if (qtyByKey?.[key] != null) {
        totalQty = qtyByKey[key];
      } else if (scenario === "forecast") {
        totalQty = sessionForecastQty(s) - n(s.courtesy_qty); // pagantes
      } else {
        totalQty = realQty;
      }
      ticketsQty += totalQty;

      const exact = revenueByKey?.[key];
      if (exact != null && Number.isFinite(exact)) {
        ticketsRevenue += exact;
      } else if (scenario === "forecast" && qtyByKey?.[key] == null) {
        ticketsRevenue += sessionForecastRevenue(s);
      } else {
        const extra = Math.max(0, totalQty - realQty);
        const tm = sessionAvgTicket(s);
        ticketsRevenue += realRev + extra * tm;
      }
      courtesyQty += n(s.courtesy_qty);
    }
  }

  // Presenças × dia: usa override (combos expandidos) se fornecido,
  // senão cai para pagantes únicos (compatibilidade).
  const attendanceQty = attendance ? attendance.payingAttendance : ticketsQty;
  const attendanceCourtesyQty = attendance ? attendance.courtesyAttendance : courtesyQty;
  const publicForAB = attendanceQty + attendanceCourtesyQty;
  const ab = abForPublic(publicForAB, cfg);


  return {
    ticketsQty,
    ticketsRevenue,
    drinkRevenue: ab.drink,
    foodRevenue: ab.food,
    sponsorRevenue: n(cfg.sponsorship_revenue),
    souvenirRevenue: n(cfg.souvenir_revenue),
    otherCredits: n(cfg.bonif_bebidas) + n(cfg.ponto_vendido) + n(cfg.other_revenue),
    totalRevenue:
      ticketsRevenue + ab.drink + ab.food +
      n(cfg.sponsorship_revenue) + n(cfg.souvenir_revenue) +
      n(cfg.bonif_bebidas) + n(cfg.ponto_vendido) + n(cfg.other_revenue),
    courtesyQty,
    attendanceQty,
    attendanceCourtesyQty,
  };
}

// ---------- Custos ----------

export type ScenarioCosts = {
  eventCosts: number;        // custos de evento (não A&B / não souvenir)
  abCost: number;            // CMV A&B (Bebida + Alimento) — recalculado pelo passthrough
  souvenirCost: number;
  totalCost: number;
};

export function computeScenarioCosts(
  costLines: CoalaCostLine[],
  revenue: ScenarioRevenue,
  cfg: CoalaConfig,
  scenario: Scenario,
): ScenarioCosts {
  let eventCosts = 0;
  for (const l of costLines) {
    if (l.is_ab_passthrough) continue;
    if (scenario === "today") eventCosts += n(l.actual_amount ?? l.prior_year_amount);
    else if (scenario === "breakeven") {
      // BE >= Real por linha: o BE pressupõe que as despesas já reconhecidas
      // são piso mínimo (não se "des-gasta" o que já foi pago).
      const be = n(l.break_even_amount);
      const fallback = n(l.actual_amount) || n(l.prior_year_amount) || n(l.forecast_amount);
      eventCosts += Math.max(n(l.actual_amount), be > 0 ? be : fallback);
    }
    else {
      // Forecast >= Real por linha: idem — o Forecast é projecção FINAL,
      // o realizado é piso. Se forecast_amount ficou desactualizado, garantimos
      // monotonia.
      eventCosts += Math.max(n(l.actual_amount), n(l.forecast_amount));
    }
  }
  // Em "today" o A&B real é desconhecido → usa mesma fórmula proporcional ao público
  const abCost =
    revenue.drinkRevenue * (n(cfg.ab_drink_passthrough_pct) / 100) +
    revenue.foodRevenue * (n(cfg.ab_food_passthrough_pct) / 100);
  const souvenirCost = n(cfg.souvenir_cost);
  return {
    eventCosts,
    abCost,
    souvenirCost,
    totalCost: eventCosts + abCost + souvenirCost,
  };
}

// ---------- Resultado ----------

export type ScenarioResult = {
  general: number;
  event: number;     // ticketsRevenue + sponsor + outros - eventCosts
  ab: number;        // drink+food - abCost
  souvenir: number;  // souvenirRevenue - souvenirCost
};

export function computeScenarioResult(
  rev: ScenarioRevenue,
  cost: ScenarioCosts,
): ScenarioResult {
  const ab = rev.drinkRevenue + rev.foodRevenue - cost.abCost;
  const souvenir = rev.souvenirRevenue - cost.souvenirCost;
  const event =
    rev.ticketsRevenue + rev.sponsorRevenue + rev.otherCredits - cost.eventCosts;
  return { general: ab + souvenir + event, event, ab, souvenir };
}

// ---------- Indicadores per capita ----------

export type ScenarioKpis = {
  /** Presenças × dia (combos expandidos) — alinhado com aba "Público diário". */
  totalPublic: number;
  /** Bilhetes únicos vendidos (1 combo = 1 bilhete). */
  uniqueTickets: number;
  tmTickets: number;       // receita / bilhetes únicos (preço médio do bilhete)
  tmAB: number;            // A&B / presenças (consumo médio por pessoa-dia)
  costPerPerson: number;   // custo total / presenças
  resultPerPerson: number; // resultado / presenças
};

export function computeScenarioKpis(
  rev: ScenarioRevenue,
  cost: ScenarioCosts,
  result: ScenarioResult,
): ScenarioKpis {
  const uniqueTickets = rev.ticketsQty + rev.courtesyQty;
  const totalPublic = rev.attendanceQty + rev.attendanceCourtesyQty;
  const divTickets = uniqueTickets > 0 ? uniqueTickets : 0;
  const divAttendance = totalPublic > 0 ? totalPublic : 0;
  return {
    totalPublic,
    uniqueTickets,
    tmTickets: divTickets ? rev.ticketsRevenue / rev.ticketsQty : 0,
    tmAB: divAttendance ? (rev.drinkRevenue + rev.foodRevenue) / divAttendance : 0,
    costPerPerson: divAttendance ? cost.totalCost / divAttendance : 0,
    resultPerPerson: divAttendance ? result.general / divAttendance : 0,
  };
}

// ---------- Break-Even solver ----------

/**
 * Resolve quantos bilhetes adicionais (acima do real) é preciso vender
 * para zerar o resultado geral do cenário Break-Even.
 *
 * Regras de produto (validadas com utilizador):
 *  - Só a receita de bilheteira é a "alavanca". A&B escala proporcional
 *    ao público; Souvenir/Patrocínio/Outros são fixos.
 *  - Custos usados são os do cenário Break-Even (`break_even_amount`).
 *  - Cada sessão (dia × zona) respeita a CAPACIDADE da zona — nunca
 *    aloca acima de `total_capacity − qty_real`.
 *  - PREÇO MARGINAL: usa o preço do próximo lote disponível (vendido
 *    < quantity); se já está no último lote ou não há plano, usa o
 *    último preço definido (ou TM real como fallback).
 *  - PESO POR ZONA: proporcional ao **ritmo de venda** (qty/dia),
 *    ponderado pela margem unitária. Zona com ritmo zero não recebe
 *    esforço (não adianta projetar venda onde ninguém compra).
 *  - Distribuição é iterativa por "ondas": a cada iteração distribui
 *    o restante do défice pelas zonas elegíveis, respeita capacidade,
 *    e repete até cobrir o défice ou esgotar capacidade.
 *
 * Retorna também um breakdown detalhado para a UI mostrar o "porquê".
 */
export function solveBreakEven(
  sessions: CoalaSession[],
  costLines: CoalaCostLine[],
  cfg: CoalaConfig,
  lotInfoByKey?: Record<string, SessionLotInfo>,
  economics?: BreakEvenEconomicsOverride,
): BreakEvenSolution {
  const baseMap: Record<string, number> = {};
  for (const s of sessions) baseMap[`${s.day_index}-${s.zone_label}`] = sessionTodayQty(s);

  // Ponto de partida: cenário "Break Even" usando só o real como vendas.
  const baseRev = computeScenarioRevenue(sessions, cfg, "breakeven", baseMap);
  const baseCosts = computeScenarioCosts(costLines, baseRev, cfg, "breakeven");
  const baseRes = computeScenarioResult(baseRev, baseCosts);
  const baseGeneral = Number.isFinite(economics?.baseResult)
    ? Number(economics?.baseResult)
    : baseRes.general;

  const emptyBreakdown: BreakEvenBreakdownItem[] = sessions.map((s) => ({
    key: `${s.day_index}-${s.zone_label}`,
    zone_label: s.zone_label,
    day_index: s.day_index,
    current_qty: sessionTodayQty(s),
    extra_qty: 0,
    capacity_left: 0,
    marginal_price: 0,
    velocity: 0,
    reason: "ok",
  }));

  // Receita base por sessão (real) — preenche também as não-elegíveis.
  const baseRevByKey: Record<string, number> = {};
  for (const s of sessions) baseRevByKey[`${s.day_index}-${s.zone_label}`] = sessionTodayRevenue(s);

  // ===== JÁ NO PONTO OU PASSOU O BE =====
  // Em vez de devolver "Real" (que mascara o BE como cenário próprio), corremos
  // o solver INVERSO: quantos bilhetes a MENOS ainda zeravam o resultado.
  // O ponto BE é o threshold real (Resultado=0) e a margem positiva fica visível.
  if (baseGeneral >= -0.5 && baseGeneral <= 0.5) {
    return {
      qtyByKey: baseMap, revenueByKey: baseRevByKey, reachable: true, deficit: 0,
      totalExtraTickets: 0, unfilled: 0, breakdown: emptyBreakdown,
      mode: "exact", surplus: 0, totalRemovedTickets: 0,
    };
  }

  if (baseGeneral > 0.5) {
    const surplus = baseGeneral;

    // Margem efetiva por bilhete removido = preço do lote + A&B líquido por
    // pessoa. Isto reflete o impacto REAL no resultado: ao remover 1 bilhete,
    // a presença cai 1, A&B revenue cai (drink+food avg) e A&B cost cai pelo
    // passthrough — net A&B impact = -abMarginPerPub.
    // Para que isto se materialize, o `buildDailyFromBreakdown` na UI tem de
    // propagar `extra_qty<0` para reduzir `beAttendance` (caso contrário A&B
    // mantém-se ao real e o solver remove tickets a mais).
    const abMarginPerPubInv = Number.isFinite(economics?.abMarginPerPub)
      ? Number(economics?.abMarginPerPub)
      : n(cfg.ab_drink_avg_ticket) * (1 - n(cfg.ab_drink_passthrough_pct) / 100) +
        n(cfg.ab_food_avg_ticket) * (1 - n(cfg.ab_food_passthrough_pct) / 100);

    // Agrupa por zona para tratar combos (mesmo que modo deficit).
    const groupIndexes = new Map<string, number[]>();
    sessions.forEach((s, i) => {
      const arr = groupIndexes.get(s.zone_label) ?? [];
      arr.push(i);
      groupIndexes.set(s.zone_label, arr);
    });

    type ZoneRm = {
      idx: number;
      key: string;
      velocity: number;
      removed: number;
      removedRevenue: number;
      lastPrice: number;
      lotsSoldDesc: Array<{ price: number; left: number }>;
      fallbackPrice: number;
    };

    const zones: ZoneRm[] = [];
    sessions.forEach((s, idx) => {
      const groupIdxs = groupIndexes.get(s.zone_label) ?? [idx];
      if (groupIdxs[0] !== idx) return; // só anchor representa a zona
      const realQtyZone = groupIdxs.reduce((a, i) => a + sessionTodayQty(sessions[i]), 0);
      if (realQtyZone <= 0) return;
      const key = `${s.day_index}-${s.zone_label}`;
      const info = lotInfoByKey?.[key] ?? lotInfoByKey?.[s.zone_label];
      const days = Math.max(1, info?.days_selling ?? 1);
      const velocity = realQtyZone / days;
      const lots = (info?.lots ?? []).slice().sort((a, b) => b.lot_number - a.lot_number);
      const lotsSoldDesc = lots
        .map((l) => ({ price: n(l.price), left: Math.max(0, n(l.sold)) }))
        .filter((l) => l.left > 0);
      const tmFallback = sessionAvgTicket(s);
      const fallbackPrice = tmFallback || n(lots[lots.length - 1]?.price) || 0;
      // Se não há lotes com vendas registadas, usa avg ticket como bucket único
      // com `left = realQtyZone` para permitir remoção.
      if (!lotsSoldDesc.length && fallbackPrice > 0) {
        lotsSoldDesc.push({ price: fallbackPrice, left: realQtyZone });
      }
      zones.push({
        idx,
        key,
        velocity: velocity > 0 ? velocity : 1,
        removed: 0,
        removedRevenue: 0,
        lastPrice: lotsSoldDesc[0]?.price ?? fallbackPrice,
        lotsSoldDesc,
        fallbackPrice,
      });
    });

    // Greedy: a cada iteração escolhe a zona com maior score (velocity*margin),
    // remove um batch do topo do lote e desconta a margem real do remaining.
    let remaining = surplus;
    let safety = 200000;
    while (remaining > 0.005 && safety-- > 0) {
      let best: ZoneRm | null = null;
      let bestScore = -Infinity;
      for (const z of zones) {
        if (!z.lotsSoldDesc.length) continue;
        const margin = z.lotsSoldDesc[0].price + abMarginPerPubInv;
        if (margin <= 0) continue;
        const score = z.velocity * margin;
        if (score > bestScore) { bestScore = score; best = z; }
      }
      if (!best) break;
      const lot = best.lotsSoldDesc[0];
      const margin = lot.price + abMarginPerPubInv;
      // No modo surplus o ponto de equilíbrio pode cair "dentro" do último
      // bilhete removido. Permitimos fração no último take para que o resultado
      // financeiro feche em 0, enquanto a UI continua a arredondar o público.
      const need = remaining / margin;
      const take = Math.min(lot.left, need);
      if (take <= 0) { best.lotsSoldDesc.shift(); continue; }
      best.removed += take;
      best.removedRevenue += take * lot.price;
      best.lastPrice = lot.price;
      lot.left -= take;
      if (lot.left <= 0.000001) best.lotsSoldDesc.shift();
      remaining -= take * margin;
    }

    // Constrói qtyByKey/revenueByKey/breakdown
    const map: Record<string, number> = { ...baseMap };
    const revMap: Record<string, number> = { ...baseRevByKey };
    let totalRemoved = 0;
    const removedByZone = new Map<number, ZoneRm>();
    zones.forEach((z) => removedByZone.set(z.idx, z));

    // Heurística passe vs bilhete-dia (alinhada com useCitySimulator):
    // se a mesma zone_label aparece em >1 dia com `sessionTodayQty` idêntica,
    // tratamos como passe multi-dia → mantém anchor. Caso contrário (bilhete-dia,
    // típico de festival com vendas independentes por dia), distribui a remoção
    // do anchor pelos restantes dias proporcionalmente ao Real de cada dia.
    const isPassMultiDay = (idxs: number[]): boolean => {
      if (idxs.length <= 1) return false;
      const qtys = idxs.map((i) => sessionTodayQty(sessions[i]));
      return qtys.every((q) => q === qtys[0]);
    };

    const breakdown: BreakEvenBreakdownItem[] = sessions.map((s, idx) => {
      const key = `${s.day_index}-${s.zone_label}`;
      const groupIdxs = groupIndexes.get(s.zone_label) ?? [idx];
      const anchorIdx = groupIdxs[0];
      const z = removedByZone.get(anchorIdx);
      const real = sessionTodayQty(s);
      const realRev = sessionTodayRevenue(s);
      let myRemoved = 0;
      let myRemovedRev = 0;
      if (z && z.removed > 0) {
        if (idx === anchorIdx && isPassMultiDay(groupIdxs)) {
          // passe multi-dia: anchor leva tudo
          myRemoved = z.removed;
          myRemovedRev = z.removedRevenue;
        } else if (!isPassMultiDay(groupIdxs)) {
          // bilhete-dia: pro-rata pelo real vendido em cada dia
          const totalReal = groupIdxs.reduce((a, i) => a + sessionTodayQty(sessions[i]), 0);
          const share = totalReal > 0 ? real / totalReal : (idx === anchorIdx ? 1 : 0);
          myRemoved = z.removed * share;
          myRemovedRev = z.removedRevenue * share;
        }
      }
      if (myRemoved > 0) {
        map[key] = real - myRemoved;
        revMap[key] = realRev - myRemovedRev;
        totalRemoved += myRemoved;
      }
      return {
        key,
        zone_label: s.zone_label,
        day_index: s.day_index,
        current_qty: real,
        extra_qty: myRemoved > 0 ? -myRemoved : 0,
        capacity_left: 0,
        marginal_price: z?.lastPrice ?? 0,
        velocity: z?.velocity ?? 0,
        reason: "ok",
      };
    });

    return {
      qtyByKey: map,
      revenueByKey: revMap,
      reachable: true,
      deficit: 0,
      totalExtraTickets: 0,
      unfilled: 0,
      breakdown,
      mode: "surplus",
      surplus,
      totalRemovedTickets: totalRemoved,
    };
  }


  const deficit = -baseGeneral;

  // A&B líquido por pessoa adicional (igual em todas as sessões)
  const abMarginPerPub = Number.isFinite(economics?.abMarginPerPub)
    ? Number(economics?.abMarginPerPub)
    : n(cfg.ab_drink_avg_ticket) * (1 - n(cfg.ab_drink_passthrough_pct) / 100) +
      n(cfg.ab_food_avg_ticket) * (1 - n(cfg.ab_food_passthrough_pct) / 100);

  // Pré-cálculo por sessão
  type Slot = {
    idx: number;
    key: string;
    capLeft: number;
    velocity: number;
    margPrice: number;          // preço do próximo bilhete a vender
    margin: number;             // preço + A&B líquido
    weight: number;             // velocidade × margem
    eligible: boolean;
    reason: BreakEvenBreakdownItem["reason"];
    // estado mutável
    extra: number;
    extraRevenue: number;       // soma (extras × preço marginal real, lote-a-lote)
    // cópia mutável dos lotes para "consumir"
    lotsRemaining: Array<{ price: number; left: number }>;
    fallbackPrice: number;
  };

  // Agrupa sessões por zone_label. Para zonas que aparecem em vários dias
  // (típico de zonas combo/passe sem session_id, onde o sync cria 1 linha
  // por dia mas a capacidade e as vendas são partilhadas), tratamos como
  // UMA única zona lógica para o solver — caso contrário a zona inflaria
  // o peso do dia em que as vendas reais ficaram concentradas.
  const groupIndexes = new Map<string, number[]>();
  sessions.forEach((s, i) => {
    const arr = groupIndexes.get(s.zone_label) ?? [];
    arr.push(i);
    groupIndexes.set(s.zone_label, arr);
  });

  const slots: Slot[] = sessions.map((s, idx) => {
    const key = `${s.day_index}-${s.zone_label}`;
    // Tenta a chave composta E também só pelo nome da zona (UI passa indexado por zona).
    const info = lotInfoByKey?.[key] ?? lotInfoByKey?.[s.zone_label];
    const groupIdxs = groupIndexes.get(s.zone_label) ?? [idx];
    const isAnchor = groupIdxs[0] === idx;
    // realQty agregado por zona (todas as duplicatas) para evitar viés
    // no dia em que o sync concentrou as vendas reais.
    const realQtyZone = groupIdxs.reduce((a, i) => a + sessionTodayQty(sessions[i]), 0);
    const realQty = sessionTodayQty(s);

    // Capacidade da zona: única, mesmo aparecendo em vários dias.
    const hasCapacity = (info?.capacity ?? 0) > 0;
    const capLeft = isAnchor
      ? (hasCapacity ? Math.max(0, (info!.capacity) - realQtyZone) : Number.POSITIVE_INFINITY)
      : 0; // não-anchors não recebem alocação — o anchor representa a zona inteira

    // Peso = potencial real de venda. Usa realQtyZone para refletir a venda
    // total da zona (não só a do dia em que o sync depositou as vendas).
    const days = Math.max(1, info?.days_selling ?? 1);
    const realVelocity = days > 1
      ? realQtyZone / days
      : realQtyZone / Math.max(1, Math.min(30, days)); // janela mín. de 30d quando só há 1 dia
    const proxyVelocity = n(s.projected_qty) + n(s.forecast_qty);
    const velocity = isAnchor ? (realVelocity > 0 ? realVelocity : proxyVelocity) : 0;

    // Lotes ordenados; "left" = quantity − vendido
    const lots = (info?.lots ?? []).slice().sort((a, b) => a.lot_number - b.lot_number);
    let lotsRemaining = lots.map((l) => ({ price: n(l.price), left: Math.max(0, n(l.quantity) - n(l.sold)) }));
    const nextLot = lotsRemaining.find((l) => l.left > 0);
    const lastDefinedPrice = lots.length ? n(lots[lots.length - 1].price) : 0;
    // Fallback: preço do PRÓXIMO lote disponível → último preço definido no BP
    // (= preço do último bilhete vendido quando tudo está esgotado) → TM real.
    const fallbackPrice = lastDefinedPrice || sessionAvgTicket(s);
    const margPrice = nextLot?.price ?? fallbackPrice;

    let eligible = true;
    let reason: BreakEvenBreakdownItem["reason"] = "ok";
    if (hasCapacity && capLeft <= 0) { eligible = false; reason = "capacity_full"; }
    else if (velocity <= 0) { eligible = false; reason = "no_velocity"; }
    else if (margPrice <= 0) { eligible = false; reason = "no_price"; }

    const margin = Math.max(0, margPrice + abMarginPerPub);
    const weight = velocity * margin;

    return {
      idx, key, capLeft, velocity, margPrice, margin, weight,
      eligible, reason, extra: 0, extraRevenue: 0, lotsRemaining, fallbackPrice,
    };
  });

  // Se nenhuma zona é elegível, devolve sem solução
  const eligibleSlots = slots.filter((sl) => sl.eligible);
  if (!eligibleSlots.length) {
    return {
      qtyByKey: baseMap, revenueByKey: baseRevByKey, reachable: false, deficit,
      totalExtraTickets: 0, unfilled: deficit,
      breakdown: slots.map((sl) => ({
        key: sl.key, zone_label: sessions[sl.idx].zone_label, day_index: sessions[sl.idx].day_index,
        current_qty: sessionTodayQty(sessions[sl.idx]), extra_qty: 0,
        capacity_left: Number.isFinite(sl.capLeft) ? sl.capLeft : 0,
        marginal_price: sl.margPrice, velocity: sl.velocity, reason: sl.reason,
      })),
      mode: "deficit", surplus: 0, totalRemovedTickets: 0,
    };
  }

  // Distribuição iterativa por ondas — para lidar com capacidade limitada e
  // mudança de preço entre lotes.
  let remainingDeficit = deficit;
  const MAX_WAVES = 50;
  for (let wave = 0; wave < MAX_WAVES && remainingDeficit > 0.005; wave++) {
    const active = slots
      .filter((sl) => sl.eligible && sl.capLeft > 0 && sl.weight > 0)
      .sort((a, b) => b.weight - a.weight);
    if (!active.length) break;
    const sumW = active.reduce((a, sl) => a + sl.weight, 0);
    let progressed = false;

    for (const sl of active) {
      if (remainingDeficit <= 0.005) break;
      const share = remainingDeficit * (sl.weight / sumW);
      // Alocação por slot. Usamos round (não ceil) para evitar overshoot
      // cumulativo quando muitos slots arredondam em paralelo. Limitamos
      // adicionalmente ao défice GLOBAL restante para não saltar muito
      // acima de zero. Quando o ideal é < 0.5, alocamos 0 — o anchor com
      // maior peso fica responsável por fechar o último bilhete (1) numa
      // próxima onda guiada pelo limite global.
      const idealByShare = share / sl.margin;
      const idealByGlobal = remainingDeficit / sl.margin;
      let toAlloc = Math.min(Math.round(idealByShare), Math.round(idealByGlobal));
      // Garantir progresso da última iteração: se o défice ainda excede
      // metade da margem da zona com maior peso, força 1 bilhete nesse
      // slot (é o que mais aproxima de zero).
      if (toAlloc <= 0 && sl === active[0] && remainingDeficit > sl.margin / 2) {
        toAlloc = 1;
      }
      if (toAlloc <= 0) continue;
      toAlloc = Math.min(toAlloc, sl.capLeft);
      // Limita ao stock do próximo lote (depois recalculamos preço marginal)
      const lot = sl.lotsRemaining.find((l) => l.left > 0);
      if (lot) toAlloc = Math.min(toAlloc, lot.left);
      if (toAlloc <= 0) { sl.eligible = false; sl.reason = "capacity_full"; continue; }

      sl.extra += toAlloc;
      sl.extraRevenue += toAlloc * sl.margPrice; // receita pura de bilheteira (sem A&B)
      sl.capLeft -= toAlloc;
      if (lot) lot.left -= toAlloc;
      remainingDeficit -= toAlloc * sl.margin;
      progressed = true;

      // Recalcula preço marginal para próxima onda
      const nextLot = sl.lotsRemaining.find((l) => l.left > 0);
      sl.margPrice = nextLot?.price ?? sl.fallbackPrice;
      sl.margin = Math.max(0, sl.margPrice + abMarginPerPub);
      sl.weight = sl.velocity * sl.margin;
      if (sl.capLeft <= 0) { sl.eligible = false; sl.reason = "capacity_full"; }
    }
    if (!progressed) break;
  }

  const map: Record<string, number> = { ...baseMap };
  const revMap: Record<string, number> = { ...baseRevByKey };
  let totalExtra = 0;
  const breakdown: BreakEvenBreakdownItem[] = slots.map((sl) => {
    map[sl.key] = sessionTodayQty(sessions[sl.idx]) + sl.extra;
    revMap[sl.key] = sessionTodayRevenue(sessions[sl.idx]) + sl.extraRevenue;
    totalExtra += sl.extra;
    return {
      key: sl.key,
      zone_label: sessions[sl.idx].zone_label,
      day_index: sessions[sl.idx].day_index,
      current_qty: sessionTodayQty(sessions[sl.idx]),
      extra_qty: sl.extra,
      capacity_left: Number.isFinite(sl.capLeft) ? sl.capLeft : 0,
      marginal_price: sl.margPrice,
      velocity: sl.velocity,
      reason: sl.reason,
    };
  });

  return {
    qtyByKey: map,
    revenueByKey: revMap,
    reachable: remainingDeficit <= 0.5,
    deficit,
    totalExtraTickets: totalExtra,
    unfilled: Math.max(0, remainingDeficit),
    breakdown,
    mode: "deficit",
    surplus: 0,
    totalRemovedTickets: 0,
  };
}

// ---------- Forecast solver ----------

/**
 * Projecao de vendas ate ao dia do evento, por sessao (dia x zona).
 * Modelo HIBRIDO: ritmo recente extrapolado + aceleracao na reta final;
 * capacidade rigida; manual como piso minimo; receita lote-a-lote.
 * Cada zona/produto projeta o seu PROPRIO ritmo (apetite por produto).
 */
export function solveForecast(
  sessions: CoalaSession[],
  cfg: CoalaConfig,
  lotInfoByKey?: Record<string, SessionLotInfo>,
  eventDate?: string | null,
  opts?: { finalAccel?: number; finalWindowDays?: number },
): ForecastSolution {
  const finalAccel = Number.isFinite(opts?.finalAccel) && (opts!.finalAccel as number) > 0
    ? (opts!.finalAccel as number)
    : FORECAST_FINAL_ACCEL_DEFAULT;
  const finalWindowDays = Number.isFinite(opts?.finalWindowDays) && (opts!.finalWindowDays as number) > 0
    ? Math.round(opts!.finalWindowDays as number)
    : FORECAST_FINAL_WINDOW_DAYS_DEFAULT;

  const todayStr = new Date().toISOString().slice(0, 10);
  let daysToEvent = 30;
  if (eventDate) {
    const ms = new Date(eventDate).getTime() - new Date(todayStr).getTime();
    daysToEvent = Math.max(1, Math.round(ms / 86400000));
  }
  const finalWindow = Math.min(finalWindowDays, daysToEvent);
  const baseWindow = Math.max(0, daysToEvent - finalWindowDays);

  const qtyByKey: Record<string, number> = {};
  const revenueByKey: Record<string, number> = {};
  const breakdown: ForecastBreakdownItem[] = [];
  let hasCapacityPlan = false;

  // Agrupa por zone_label: a capacidade e o ritmo de venda da zona são
  // únicos mesmo quando o sync cria 1 linha por dia (caso típico das zonas
  // combo/passe). Sem este agrupamento o forecast inflaria o dia em que
  // o sync depositou as vendas reais (ex: sábado).
  const groupIndexes = new Map<string, number[]>();
  sessions.forEach((s, i) => {
    const arr = groupIndexes.get(s.zone_label) ?? [];
    arr.push(i);
    groupIndexes.set(s.zone_label, arr);
  });

  for (const s of sessions) {
    const key = `${s.day_index}-${s.zone_label}`;
    const info = lotInfoByKey?.[key] ?? lotInfoByKey?.[s.zone_label];
    const groupIdxs = groupIndexes.get(s.zone_label) ?? [];
    const isAnchor = groupIdxs[0] === sessions.indexOf(s);
    const realQty = sessionTodayQty(s);
    const realRev = sessionTodayRevenue(s);
    const realQtyZone = groupIdxs.reduce((a, i) => a + sessionTodayQty(sessions[i]), 0);
    const courtesy = n(s.courtesy_qty);
    const manualFloor = Math.max(0, n(s.forecast_qty) - courtesy);

    const hasCapacity = (info?.capacity ?? 0) > 0;
    if (hasCapacity) hasCapacityPlan = true;
    // Capacidade da zona é única — só o anchor "abre" a capacidade.
    const capLeft = isAnchor
      ? (hasCapacity ? Math.max(0, info!.capacity - realQtyZone) : Number.POSITIVE_INFINITY)
      : 0;

    const daysSelling = Math.max(1, info?.days_selling ?? 1);
    // Para histórico de 1 dia (importação Fever em batch) usamos uma janela
    // mínima de 30 dias — caso contrário a velocidade fica artificialmente
    // alta (todas as vendas num único dia) e o forecast explode.
    const velocityWindow = daysSelling > 1 ? daysSelling : Math.max(30, FORECAST_RECENT_WINDOW_DAYS);
    // Velocidade da ZONA (todas as duplicatas), atribuída ao anchor.
    const recentVelocity = isAnchor ? realQtyZone / velocityWindow : 0;

    const baseProjection = recentVelocity * baseWindow;
    const finalProjection = recentVelocity * finalAccel * finalWindow;
    let projectedQty = Math.round(baseProjection + finalProjection);

    let cappedByCapacity = false;
    if (Number.isFinite(capLeft) && projectedQty > capLeft) {
      projectedQty = Math.floor(capLeft);
      cappedByCapacity = true;
    }

    let manualUsed = false;
    if (manualFloor > realQty) {
      const manualExtra = manualFloor - realQty;
      const cappedManual = Number.isFinite(capLeft) ? Math.min(manualExtra, Math.floor(capLeft)) : manualExtra;
      if (cappedManual > projectedQty) {
        projectedQty = cappedManual;
        manualUsed = true;
      }
    }

    let extraRevenue = 0;
    let remaining = projectedQty;
    const lots = (info?.lots ?? []).slice().sort((a, b) => a.lot_number - b.lot_number);
    const lotsRemaining = lots.map((l) => ({
      price: n(l.price),
      left: Math.max(0, n(l.quantity) - n(l.sold)),
    }));
    const lastDefinedPrice = lots.length ? n(lots[lots.length - 1].price) : 0;
    const fallbackPrice = lastDefinedPrice || sessionAvgTicket(s);

    while (remaining > 0) {
      const lot = lotsRemaining.find((l) => l.left > 0);
      const price = lot?.price ?? fallbackPrice;
      if (price <= 0) break;
      const take = lot ? Math.min(remaining, lot.left) : remaining;
      extraRevenue += take * price;
      if (lot) lot.left -= take;
      remaining -= take;
      if (!lot) break;
    }

    let reason: ForecastBreakdownItem["reason"] = "ok";
    if (recentVelocity <= 0 && !manualUsed) reason = "no_velocity";
    else if (cappedByCapacity && capLeft <= 0) reason = "capacity_full";

    qtyByKey[key] = realQty + projectedQty;
    revenueByKey[key] = realRev + extraRevenue;

    breakdown.push({
      key,
      zone_label: s.zone_label,
      day_index: s.day_index,
      current_qty: realQty,
      projected_qty: projectedQty,
      forecast_qty: realQty + projectedQty,
      capacity_left: Number.isFinite(capLeft) ? Math.max(0, capLeft - projectedQty) : Number.POSITIVE_INFINITY,
      recent_velocity: recentVelocity,
      days_to_event: daysToEvent,
      capped_by_capacity: cappedByCapacity,
      manual_floor_used: manualUsed,
      reason,
    });
  }

  return { qtyByKey, revenueByKey, breakdown, daysToEvent, hasCapacityPlan };
}

// ---------- IVA por sessão ----------

export type IvaRow = {
  label: string;
  gross: number;     // faturamento bruto
  iva: number;
  net: number;
  share: number;     // representatividade no total líquido
};

/**
 * Tabela de IVA por sessão.
 * - Cenário "today": usa `real_sales_revenue` (bruto, com IVA) por sessão.
 * - Cenários "breakeven"/"forecast": recebe `netRevenueByKey` (sem IVA, vindo
 *   do solver — o simulador trabalha sempre em líquido) e re-bruta por
 *   sessão usando `iva_pct` para apresentar Bruto / IVA / Líquido projetados.
 */
export function computeIvaTable(
  sessions: CoalaSession[],
  netRevenueByKey?: Record<string, number>,
): IvaRow[] {
  const rows = sessions.map((s) => {
    const key = `${s.day_index}-${s.zone_label}`;
    const ivaPct = n(s.iva_pct, 6);
    let gross: number;
    let net: number;
    if (netRevenueByKey && netRevenueByKey[key] != null && Number.isFinite(netRevenueByKey[key])) {
      net = netRevenueByKey[key];
      gross = ivaPct > 0 ? net * (1 + ivaPct / 100) : net;
    } else {
      gross = n(s.real_sales_revenue); // bruto original da bilheteira
      net = ivaPct > 0 ? gross / (1 + ivaPct / 100) : gross;
    }
    const iva = gross - net;
    return { label: `Dia ${String(s.day_index + 1).padStart(2, "0")} — ${s.zone_label}`, gross, iva, net, share: 0 };
  });
  const totalNet = rows.reduce((a, r) => a + r.net, 0) || 1;
  return rows.map((r) => ({ ...r, share: r.net / totalNet }));
}
