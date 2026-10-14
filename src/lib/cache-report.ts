/**
 * Relatório "Cachê do Artista" — regras puras (adenda D-ERP265, 14/10/2026).
 * Usa o MESMO núcleo da aba Cachê: computeCacheTabAmount / getCacheEffectiveAmount
 * sobre os RealCacheResult de useRealCacheCalculation. Nenhuma fórmula nova.
 */
import { formatDatePT } from "@/lib/utils";
import { computeCacheTabAmount } from "@/lib/cache-tab-total";
import { getCacheEffectiveAmount } from "@/lib/cache-pl-helper";
import { resolveCacheScope, type CacheScope } from "@/lib/cache-scope";
import type { RealCacheResult } from "@/lib/real-cache-calc";

export interface ReportEvent {
  id: string;
  name: string;
  date: string | null;
  parent_event_id: string | null;
}

export type SelectorOption =
  | { kind: "tour"; value: string; eventId: string; label: string; indent: false }
  | { kind: "city"; value: string; eventId: string; label: string; indent: true }
  | { kind: "single"; value: string; eventId: string; label: string; indent: false };

/** Data de evento dd/mm/aaaa sem passar por fuso. */
export const formatEventDate = (d?: string | null) => formatDatePT(d ?? null);

/**
 * Seletor agrupado: filhos identificam-se SÓ por parent_event_id (nunca event_type).
 * Ordem de entrada preservada (a query ordena por data desc); cidades por data asc.
 */
export function groupEventsForCacheSelector(events: ReportEvent[], cityNames: Record<string, string> = {}): SelectorOption[] {
  const byParent = new Map<string, ReportEvent[]>();
  for (const e of events) {
    if (!e.parent_event_id) continue;
    const arr = byParent.get(e.parent_event_id) ?? [];
    arr.push(e);
    byParent.set(e.parent_event_id, arr);
  }
  const ids = new Set(events.map((e) => e.id));
  const out: SelectorOption[] = [];
  for (const e of events) {
    // Filho cujo pai está na lista aparece debaixo do pai; órfão aparece solto.
    if (e.parent_event_id && ids.has(e.parent_event_id)) continue;
    const kids = byParent.get(e.id);
    if (kids && kids.length > 0) {
      out.push({ kind: "tour", value: `tour:${e.id}`, eventId: e.id, label: `${e.name} — todas as cidades`, indent: false });
      const sorted = [...kids].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
      for (const k of sorted) {
        const city = cityNames[k.id];
        out.push({
          kind: "city", value: k.id, eventId: k.id, indent: true,
          label: `${k.name} — ${formatEventDate(k.date)}${city ? ` · ${city}` : ""}`,
        });
      }
    } else {
      out.push({ kind: "single", value: e.id, eventId: e.id, label: `${e.name} — ${formatEventDate(e.date)}`, indent: false });
    }
  }
  return out;
}

/** Bloco de cálculo: quem tem a configuração e que cidades entram. */
export interface ReportBlockSpec {
  /** Evento dono da configuração (Master ou evento simples/cidade). */
  holderId: string;
  /** Cidades do Master (vazio em evento simples). */
  childIds: string[];
  /** Mostrar só esta cidade (cidade escolhida com âmbito "master"). */
  onlyCityId?: string;
}

/**
 * Resolve o âmbito D-ERP265 para a escolha do seletor.
 * configCounts: nº de event_cache_configs por event_id (Master, cidades).
 */
export function resolveReportBlocks(args: {
  selection: { kind: "tour" | "city" | "single"; eventId: string };
  events: ReportEvent[];
  configCounts: Record<string, number>;
}): { scope: CacheScope; blocks: ReportBlockSpec[] } {
  const { selection, events, configCounts } = args;
  const ev = events.find((e) => e.id === selection.eventId);
  const parentId = ev?.parent_event_id ?? null;
  const childrenOf = (id: string) =>
    events.filter((e) => e.parent_event_id === id)
      .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")))
      .map((e) => e.id);

  if (parentId) {
    const siblings = childrenOf(parentId);
    const scope = resolveCacheScope({ parentEventId: parentId, parentConfigCount: configCounts[parentId] ?? 0, childrenWithConfigCount: 0 });
    if (scope === "master") return { scope, blocks: [{ holderId: parentId, childIds: siblings, onlyCityId: selection.eventId }] };
    return { scope, blocks: [{ holderId: selection.eventId, childIds: [] }] };
  }
  const kids = childrenOf(selection.eventId);
  const withCfg = kids.filter((k) => (configCounts[k] ?? 0) > 0);
  const scope = resolveCacheScope({ parentEventId: null, parentConfigCount: 0, childrenWithConfigCount: withCfg.length });
  if (scope === "children") return { scope, blocks: kids.map((k) => ({ holderId: k, childIds: [] })) };
  return { scope, blocks: [{ holderId: selection.eventId, childIds: kids }] };
}

export interface CityCacheRow {
  cityId: string;
  result: RealCacheResult | null;
  settlement: any | null;
  /** Cachê efetivo da cidade (settlement > config > calculado). */
  amount: number;
  extras: any[];
  extrasTotal: number;
}

export interface ArtistCacheReport {
  config: any;
  isVariable: boolean;
  cities: CityCacheRow[];
  /** Cachê bruto = computeCacheTabAmount (ou só a cidade escolhida). */
  grossTotal: number;
  extras: any[];
  extrasTotal: number;
  netTotal: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildArtistCacheReport(args: {
  config: any;
  spec: ReportBlockSpec;
  realResult: RealCacheResult | null | undefined;
  resultsByCity: Record<string, RealCacheResult[]>;
  citySettlements: any[];
  extras: any[];
}): ArtistCacheReport {
  const { config, spec } = args;
  const isVariable = config.cache_type === "variable";
  const cfgExtras = args.extras.filter((e) => e.cache_config_id === config.id);
  const sumEx = (xs: any[]) => r2(xs.reduce((s, e) => s + Number(e.amount || 0), 0));
  const tour = spec.childIds.length > 0;

  const cityRow = (cityId: string): CityCacheRow => {
    const result = args.resultsByCity[cityId]?.find((r) => r.configId === config.id) ?? null;
    const settlement = args.citySettlements.find((s) => s.cache_config_id === config.id && s.event_id === cityId) ?? null;
    const ex = cfgExtras.filter((e) => e.event_id === cityId);
    return { cityId, result, settlement, amount: getCacheEffectiveAmount(config, result?.finalAmount ?? 0, settlement), extras: ex, extrasTotal: sumEx(ex) };
  };

  let cities: CityCacheRow[] = [];
  let grossTotal: number;
  let extras: any[];
  if (tour && isVariable) {
    cities = spec.childIds.map(cityRow);
    if (spec.onlyCityId) {
      cities = cities.filter((c) => c.cityId === spec.onlyCityId);
      grossTotal = r2(cities[0]?.amount ?? 0);
      extras = cities[0]?.extras ?? [];
    } else {
      grossTotal = computeCacheTabAmount({ config, resultsByCity: args.resultsByCity, childEventIds: spec.childIds, citySettlements: args.citySettlements });
      extras = cfgExtras;
    }
  } else {
    grossTotal = computeCacheTabAmount({ config, realResult: args.realResult ?? null });
    if (isVariable) cities = [{ cityId: spec.holderId, result: args.realResult ?? null, settlement: null, amount: grossTotal, extras: cfgExtras, extrasTotal: sumEx(cfgExtras) }];
    extras = cfgExtras;
  }
  const extrasTotal = sumEx(extras);
  return { config, isVariable, cities, grossTotal, extras, extrasTotal, netTotal: r2(grossTotal - extrasTotal) };
}
