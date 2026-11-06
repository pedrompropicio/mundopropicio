// D2-d run B: opt-in unit evaluator. Legacy exports below remain byte-identical.
import { isForecastCivilDate, type ForecastMoney, type ForecastReason, type PlanningForecastResult,
  type PlanningForecastUnit, type PlanningForecastUnitResult } from "./planning-forecast-contract.ts";

/** Civil reference from an explicit instant and timezone, independent of the runtime timezone. */
export function dataCivil(agora: Date, fuso: string): string {
  if (!Number.isFinite(agora.getTime())) throw new Error("planning_invalid_instant");
  if (typeof fuso !== "string" || fuso.length === 0) throw new Error("planning_invalid_timezone");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(agora);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === name)?.value;
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  if (!isForecastCivilDate(date)) throw new Error("planning_invalid_date");
  return date;
}

function unitForecast(unit: PlanningForecastUnit) {
  const seen = new Set<string>();
  const zones = unit.zonas.filter(zone => {
    if (seen.has(zone.zone_id)) throw new Error("planning_duplicate_zone");
    seen.add(zone.zone_id);
    return true;
  }).map(zone => ({ zone, cut: forecastZone(zone) }));
  const hasLots = zones.some(({ cut }) => cut.hasLots);
  let previsao: ForecastMoney | null = null;
  if (hasLots) {
    let liquido: number | null = 0;
    for (const { zone, cut } of zones) {
      for (const lot of zone.lotes) {
        // Exactly the eligibility used by forecastZone; ignored lots cannot contaminate VAT.
        if (!Number.isFinite(lot.quantity) || !Number.isFinite(lot.price) || lot.quantity <= 0 || lot.price <= 0) continue;
        if (lot.iva_rate == null || !Number.isFinite(lot.iva_rate) || lot.iva_rate < 0 || lot.iva_rate > 100) liquido = null;
        else if (liquido !== null) liquido += lot.price / (1 + lot.iva_rate / 100) * lot.quantity * cut.factor;
      }
    }
    previsao = { bruto: zones.reduce((sum, { cut }) => sum + cut.forecast, 0), liquido };
  } else if (unit.manual !== null) {
    if (!Number.isFinite(unit.manual.bruta)) throw new Error("planning_invalid_manual");
    const vat = unit.manual.iva_rate;
    previsao = { bruto: unit.manual.bruta, liquido: vat != null && Number.isFinite(vat) && vat >= 0 && vat <= 100
      ? unit.manual.bruta / (1 + vat / 100) : null };
  }
  if (previsao !== null && (!Number.isFinite(previsao.bruto) || (previsao.liquido !== null && !Number.isFinite(previsao.liquido)))) {
    throw new Error("planning_non_finite_forecast");
  }
  return { fonte: hasLots ? "lotes" as const : unit.manual !== null ? "manual" as const : "sem_previsao" as const,
    previsao, cortes: zones.filter(({ cut }) => cut.factor < 1).map(({ cut }) => ({
      zone_id: cut.zone_id, fator: cut.factor, bruto: cents(cut.gross), limitado: cents(cut.forecast),
    })) };
}

function evaluateForecastUnit(unit: PlanningForecastUnit, referenceDate: string): PlanningForecastUnitResult {
  if (!unit.unit_id || !unit.event_id || !Number.isFinite(unit.vendido.bruto) || !Number.isFinite(unit.vendido.liquido)) {
    throw new Error("planning_invalid_unit");
  }
  const forecast = unitForecast(unit);
  const pct = "erro" in unit.pct ? null : unit.pct.valor;
  const invalidPct = "erro" in unit.pct || !Number.isFinite(pct) || pct < 0 || pct > 100
    || (!("erro" in unit.pct) && !["padrao", "evento", "sessao"].includes(unit.pct.origem));
  const invalidDate = !isForecastCivilDate(unit.data);
  const invalidTurnaround = unit.viragem_dias !== null && (!Number.isFinite(unit.viragem_dias) || unit.viragem_dias < 0);
  const alertas: string[] = [];
  if (invalidPct) alertas.push("percentagem_erro");
  if (invalidDate) alertas.push("data_invalida");
  if (invalidTurnaround) alertas.push("viragem_invalida");
  if (unit.indivisivel) alertas.push("indivisivel");
  let considerada: ForecastMoney = { ...unit.vendido };
  let motivo: ForecastReason;
  if (unit.indivisivel) motivo = "indivisivel";
  else if (invalidPct) motivo = "percentagem_erro";
  else if (invalidDate) motivo = "data_invalida";
  else if (forecast.previsao === null) motivo = "sem_previsao";
  else if (pct === 0) motivo = "percentagem_zero";
  else if (unit.data! < referenceDate) motivo = "data_passada";
  else if (unit.data === referenceDate) motivo = "hoje";
  else if (invalidTurnaround) motivo = "vendido";
  else if (unit.viragem_dias !== null && Date.parse(`${referenceDate}T00:00:00Z`)
    >= Date.parse(`${unit.data}T00:00:00Z`) - unit.viragem_dias * 86_400_000) motivo = "viragem";
  else if (forecast.previsao.bruto * (pct! / 100) <= unit.vendido.bruto) motivo = "vendido";
  else {
    motivo = "previsao";
    considerada = { bruto: forecast.previsao.bruto * (pct! / 100),
      liquido: forecast.previsao.liquido === null ? null : forecast.previsao.liquido * (pct! / 100) };
    if (considerada.liquido === null) alertas.push("iva_previsao_em_falta");
  }
  return { unit_id: unit.unit_id, data: unit.data, ...forecast, pct: invalidPct ? null : pct,
    origem: invalidPct || "erro" in unit.pct ? null : unit.pct.origem, motivo,
    vendido: { ...unit.vendido }, considerada, completo: alertas.length === 0, alertas };
}

/** Reconcile each money column from unrounded units, with deterministic cent residue. */
function reconcileForecastMoney(raw: PlanningForecastUnitResult[], details: PlanningForecastUnitResult[], field: "vendido" | "previsao" | "considerada"): ForecastMoney | null {
  const indices = raw.map((_, index) => index).filter(index => raw[index][field] !== null);
  if (indices.length === 0) return field === "previsao" ? null : { bruto: 0, liquido: 0 };
  for (const index of indices) details[index][field] = { ...raw[index][field]! };
  const total: ForecastMoney = { bruto: 0, liquido: 0 };
  for (const part of ["bruto", "liquido"] as const) {
    const known = indices.filter(index => raw[index][field]![part] !== null);
    const sum = known.reduce((value, index) => value + raw[index][field]![part]!, 0);
    if (!Number.isFinite(sum)) throw new Error("planning_non_finite_total");
    const roundedTotal = cents(sum);
    for (const index of known) details[index][field]![part] = cents(raw[index][field]![part]!);
    total[part] = known.length === indices.length ? roundedTotal : null;
    if (known.length === 0) continue;
    const target = [...known].sort((a, b) => Math.abs(raw[b][field]![part]!) - Math.abs(raw[a][field]![part]!)
      || (raw[a].unit_id < raw[b].unit_id ? -1 : raw[a].unit_id > raw[b].unit_id ? 1 : 0))[0];
    const residue = cents(roundedTotal - known.reduce((value, index) => value + details[index][field]![part]!, 0));
    details[target][field]![part] = cents(details[target][field]![part]! + residue);
  }
  return total;
}

/** Explicit disjoint units only: no tree, sales, VAT, manual or date inference. */
export function avaliarUnidades(unidades: readonly PlanningForecastUnit[], referencia: string): PlanningForecastResult {
  if (!isForecastCivilDate(referencia)) throw new Error("planning_invalid_reference_date");
  const seen = new Set<string>();
  for (const unit of unidades) {
    if (seen.has(unit.unit_id)) throw new Error("planning_duplicate_unit");
    seen.add(unit.unit_id);
  }
  const raw = unidades.map(unit => evaluateForecastUnit(unit, referencia));
  const details = raw.map(unit => ({ ...unit }));
  const vendido = reconcileForecastMoney(raw, details, "vendido")!;
  const previsao = reconcileForecastMoney(raw, details, "previsao");
  const considerada = reconcileForecastMoney(raw, details, "considerada")!;
  return { unidades: details, vendido, previsao, considerada, completo: details.every(unit => unit.completo) };
}

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