/** P5c: one pure gross planning forecast shared by edge and ticket-office dialog. */
export interface PlanningLot { quantity: number; price: number }
export interface PlanningZone { zone_id: string; total_capacity: number | null; lotes: PlanningLot[] }
export interface CoverageScenario {
  modo: "real" | "previsao";
  percentagem: number;
  receita_manual_bruta: number | null;
  viragem_real_dias: number | null;
}
export interface PlanningEvent {
  event_id: string; nivel: number; nome: string; previsto_original: number | null;
  cenario: CoverageScenario | null; zonas: PlanningZone[];
}
export const REAL_SCENARIO: CoverageScenario = {
  modo: "real", percentagem: 0, receita_manual_bruta: null, viragem_real_dias: null,
};
export const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function forecastZone(zone: PlanningZone) {
  const lots = zone.lotes.filter(l => Number.isFinite(l.quantity) && Number.isFinite(l.price) && l.quantity > 0 && l.price > 0);
  const quantity = lots.reduce((s, l) => s + l.quantity, 0);
  const gross = lots.reduce((s, l) => s + l.quantity * l.price, 0);
  const factor = zone.total_capacity != null && zone.total_capacity > 0 && quantity > zone.total_capacity
    ? zone.total_capacity / quantity : 1;
  return { zone_id: zone.zone_id, quantity, gross, forecast: gross * factor, factor, hasLots: lots.length > 0 };
}

export function forecastEvent(zones: PlanningZone[], manual: number | null) {
  const seen = new Set<string>();
  const computed = zones.filter(z => { if (seen.has(z.zone_id)) return false; seen.add(z.zone_id); return true; }).map(forecastZone);
  const hasLots = computed.some(z => z.hasLots);
  const value = hasLots ? computed.reduce((s, z) => s + z.forecast, 0) : manual;
  return { source: hasLots ? "lotes" as const : manual != null ? "manual" as const : "sem_previsao" as const,
    value, zones: computed };
}

export function scenarioIsForecast(scenario: CoverageScenario, referenceDate: string, firstDay: string | null) {
  if (scenario.modo !== "previsao" || scenario.percentagem === 0) return false;
  if (scenario.viragem_real_dias == null || !firstDay) return true;
  const start = Date.parse(`${firstDay}T00:00:00Z`);
  const ref = Date.parse(`${referenceDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(ref)) throw new Error("planning_invalid_date");
  return ref < start - scenario.viragem_real_dias * 86_400_000;
}

/** Descendants without their own scenario inherit root mode/%/turnaround.
 * Manual revenue belongs to its event, never copied to every child. No sales apportionment.
 */
export function forecastRoot(events: PlanningEvent[], rootId: string, salesByEvent: Record<string, number>, referenceDate: string, firstDay: string | null) {
  const rootScenario = events.find(e => e.event_id === rootId)?.cenario ?? REAL_SCENARIO;
  const seen = new Set<string>();
  const details = events.filter(e => { if (seen.has(e.event_id)) return false; seen.add(e.event_id); return true; }).map(e => {
    const scenario = e.cenario ?? { ...rootScenario, receita_manual_bruta: null };
    const forecast = forecastEvent(e.zonas, scenario.receita_manual_bruta);
    const sales = salesByEvent[e.event_id] ?? 0;
    const active = scenarioIsForecast(scenario, referenceDate, firstDay);
    const considered = active && forecast.value != null ? Math.max(sales, forecast.value * scenario.percentagem / 100) : sales;
    return { event_id: e.event_id, nome: e.nome, previsto_original: e.previsto_original,
      cenario: scenario, herdado: e.cenario == null && e.event_id !== rootId,
      fonte: forecast.source, previsao_bruta: forecast.value == null ? null : cents(forecast.value),
      vendas_bruto: cents(sales), receita_considerada: cents(considered), previsao_ativa: active,
      cortes: forecast.zones.filter(z => z.factor < 1).map(z => ({ zone_id: z.zone_id, fator: z.factor, bruto: cents(z.gross), limitado: cents(z.forecast) })),
      rawForecast: forecast.value, rawConsidered: considered };
  });
  return { ativo: details.some(e => e.previsao_ativa),
    previsao_bruta: details.some(e => e.rawForecast != null) ? cents(details.reduce((s, e) => s + (e.rawForecast ?? 0), 0)) : null,
    receita_considerada: cents(details.reduce((s, e) => s + e.rawConsidered, 0)),
    eventos: details.map(({ rawForecast, rawConsidered, ...e }) => e) };
}

export function revenueCoverage(current: { com_sem_linha: number; sem_linha_cobre_bp: number }, considered: number, minimumOut: number | null) {
  const potential = minimumOut == null ? null : cents(Math.max(0, considered - minimumOut));
  return { receita_considerada_total: cents(considered), potencial_total: potential,
    necessidade_com_receita: potential == null ? null : {
      com_sem_linha: cents(Math.max(0, current.com_sem_linha - potential)),
      sem_linha_cobre_bp: cents(Math.max(0, current.sem_linha_cobre_bp - potential)),
    } };
}