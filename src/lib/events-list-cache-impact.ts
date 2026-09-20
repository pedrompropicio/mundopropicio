/**
 * CACHÊ EFETIVO EM LOTE para a grelha de eventos (/eventos).
 *
 * Mesma regra do card de Custos da capa (`useEventCacheImpact` no âmbito
 * "Visão Global"), mas com um número FIXO de consultas para toda a lista —
 * nunca uma cascata por evento. O cálculo em si vive em
 * `src/lib/real-cache-calc.ts` e é partilhado com o hook.
 *
 * Âmbito: Visão Global (turnê inteira). Em turnê soma o efetivo cidade a
 * cidade; em evento simples usa os configs do próprio evento.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import {
  computeRealCacheResults,
  computeTicketRevenueAndOccupancy,
  enrichCacheConfigs,
  filterRealCacheExpenses,
  getCacheEffectiveAmount,
} from "@/lib/real-cache-calc";

export interface CacheImpactSpec {
  /** Evento raiz (linha da grelha) — os configs de cachê vivem aqui. */
  id: string;
  /** Sub-eventos (cidades) da turnê; vazio em evento simples. */
  childIds: string[];
  /** `events.status` — o cálculo real só corre em active/completed. */
  status?: string | null;
}

/**
 * @param specs       linhas da grelha
 * @param allTransactions transações já lidas pela grelha (evita nova query);
 *                        precisa de `parent_transaction_id` e `split_percentage`.
 */
export async function fetchEventsListCacheImpact(
  specs: CacheImpactSpec[],
  allTransactions: any[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const s of specs) out[s.id] = 0;

  const active = specs.filter((s) => s.status === "active" || s.status === "completed");
  if (active.length === 0) return out;

  const rootIds = active.map((s) => s.id);
  const { data: configsRaw, error: cfgErr } = await supabase
    .from("event_cache_configs" as any)
    .select("*")
    .in("event_id", rootIds);
  if (cfgErr) throw cfgErr;
  const configs = (configsRaw ?? []) as any[];
  if (configs.length === 0) return out;

  const configIds = configs.map((c: any) => c.id);
  const withConfigs = new Set(configs.map((c: any) => c.event_id as string));
  const relevant = active.filter((s) => withConfigs.has(s.id));
  const relevantIds = Array.from(
    new Set(relevant.flatMap((s) => [s.id, ...s.childIds]).filter(Boolean)),
  );

  const [tiersRes, dedRes, cityRes, catRes, zonesRes] = await Promise.all([
    fetchAllPagedQuery(supabase.from("event_cache_tiers").select("*").in("cache_config_id", configIds)),
    fetchAllPagedQuery(supabase.from("event_cache_deductions" as any).select("*").in("cache_config_id", configIds)),
    fetchAllPagedQuery(supabase
      .from("event_cache_city_settlements" as any)
      .select("*")
      .in("cache_config_id", configIds)),
    fetchAllPagedQuery(supabase
      .from("account_categories")
      .select("id, code, name, type, parent_id, is_active")
      .eq("is_active", true)),
    fetchAllPagedQuery(supabase
      .from("event_ticket_zones")
      .select("id, event_id, total_capacity")
      .in("event_id", relevantIds)),
  ]);
  for (const r of [tiersRes, dedRes, cityRes, catRes, zonesRes]) {
    if (r.error) throw r.error;
  }

  const zones = (zonesRes.data ?? []) as any[];
  const zoneIds = zones.map((z: any) => z.id);
  const [salesRes, lotsRes] = zoneIds.length
    ? await Promise.all([
        fetchAllPagedQuery(supabase.from("ticket_sales" as any).select("*").in("zone_id", zoneIds)),
        fetchAllPagedQuery(supabase.from("event_ticket_lots").select("*").in("zone_id", zoneIds)),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (salesRes.error) throw salesRes.error;
  if (lotsRes.error) throw lotsRes.error;

  const sales = (salesRes.data ?? []) as any[];
  const lots = (lotsRes.data ?? []) as any[];
  const tiers = (tiersRes.data ?? []) as any[];
  const deductions = (dedRes.data ?? []) as any[];
  const citySettlements = (cityRes.data ?? []) as any[];
  const categories = (catRes.data ?? []) as any[];

  const categoryMap = new Map<string, { code: string; name: string }>();
  for (const c of categories) categoryMap.set(c.id, { code: c.code, name: c.name });
  const cacheCategoryId =
    categories.find((c: any) => c.code === "2.1.01" && c.type === "expense")?.id ?? null;

  const realExpenses = filterRealCacheExpenses(allTransactions);

  // Zonas / vendas por evento — recorte local, sem novas queries.
  const zonesByEvent = new Map<string, any[]>();
  for (const z of zones) {
    const arr = zonesByEvent.get(z.event_id);
    if (arr) arr.push(z);
    else zonesByEvent.set(z.event_id, [z]);
  }

  for (const spec of relevant) {
    const evConfigs = enrichCacheConfigs(
      configs.filter((c: any) => c.event_id === spec.id),
      tiers,
    );
    if (evConfigs.length === 0) continue;

    const isTour = spec.childIds.length > 0;
    const scopeIds = isTour ? [spec.id, ...spec.childIds] : [spec.id];
    const scopeZones = scopeIds.flatMap((id) => zonesByEvent.get(id) ?? []);
    const scopeZoneIds = new Set(scopeZones.map((z: any) => z.id));
    const scopeSales = sales.filter((s: any) => scopeZoneIds.has(s.zone_id));

    let calculated = 0;
    if (isTour) {
      for (const childId of spec.childIds) {
        const r = computeTicketRevenueAndOccupancy(scopeSales, lots, scopeZones, childId);
        const cityResults = computeRealCacheResults({
          configs: evConfigs,
          deductions,
          categoryMap,
          expenses: realExpenses.filter((t: any) => t.event_id === childId),
          revenue: r.revenue,
          occupancyPct: r.occupancyPct,
        });
        for (const config of evConfigs) {
          const res = cityResults.find((x) => x.configId === config.id);
          const cs =
            citySettlements.find(
              (s: any) => s.cache_config_id === config.id && s.event_id === childId,
            ) ?? null;
          calculated += getCacheEffectiveAmount(config, res?.finalAmount ?? 0, cs);
        }
      }
    } else {
      const r = computeTicketRevenueAndOccupancy(scopeSales, lots, scopeZones);
      const results = computeRealCacheResults({
        configs: evConfigs,
        deductions,
        categoryMap,
        expenses: realExpenses.filter((t: any) => scopeIds.includes(t.event_id)),
        revenue: r.revenue,
        occupancyPct: r.occupancyPct,
      });
      for (const config of evConfigs) {
        const res = results.find((x) => x.configId === config.id);
        calculated += getCacheEffectiveAmount(config, res?.finalAmount ?? 0, null);
      }
    }

    // Cachê já lançado em transações (2.1.01) — evita dupla contagem.
    let paid = 0;
    if (cacheCategoryId) {
      paid = allTransactions
        .filter(
          (t: any) =>
            scopeIds.includes(t.event_id) &&
            t.type === "expense" &&
            t.category_id === cacheCategoryId &&
            (t.status === "approved" || t.status === "paid") &&
            !t.is_transitory &&
            t.is_hidden !== true &&
            !(t.parent_transaction_id && t.split_percentage !== null),
        )
        .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    }

    out[spec.id] = Math.max(0, calculated - paid);
  }

  return out;
}
