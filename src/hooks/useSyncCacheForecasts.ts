import { useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { resolvePercentageFromTiers, type CacheTier } from "@/lib/cache-pl-helper";

interface CacheConfig {
  id: string;
  event_id: string;
  artist_name: string;
  cache_type: string;
  fixed_amount: number;
  percentage: number;
  fixed_deduction_percentage: number;
  cache_revenue_basis?: string;
  cache_deduction_basis?: string;
  minimum_guaranteed?: number;
  is_finalized?: boolean;
  tiers?: CacheTier[];
}

interface SyncParams {
  eventId: string;
  /** For tours: child event IDs. When present, forecasts are created per child, not on the master. */
  childEventIds?: string[];
  cacheConfigs: CacheConfig[];
  deductions: { cache_config_id: string; category_id: string }[];
  forecasts: { id: string; type: string; category_id: string | null; amount: number; iva_rate: number; cache_config_id?: string | null }[];
  /** Only used for simple events (non-tour) */
  ticketRevenueNet: number;
  ticketRevenueGross: number;
  cacheCategoryId: string | null;
  enabled: boolean;
}

/**
 * Syncs cache configs to real forecast rows in event_forecasts.
 * For tours (childEventIds present): creates separate forecasts per child event,
 * each calculated from the child's own ticket revenue.
 * For simple events: creates forecasts on the event itself.
 */
export function useSyncCacheForecasts({
  eventId,
  childEventIds,
  cacheConfigs,
  deductions,
  forecasts,
  ticketRevenueNet,
  ticketRevenueGross,
  cacheCategoryId,
  enabled,
}: SyncParams) {
  const queryClient = useQueryClient();
  const syncingRef = useRef(false);
  const lastSyncHash = useRef("");

  // Fetch a lightweight sales fingerprint so hash changes when sales change
  const allRelevantIds = useMemo(
    () => childEventIds && childEventIds.length > 0 ? childEventIds : [eventId],
    [eventId, childEventIds]
  );
  const { data: salesFingerprint } = useQuery({
    queryKey: ["cache-sync-sales-fingerprint", ...allRelevantIds],
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .in("event_id", allRelevantIds);
      const zoneIds = (zones ?? []).map((z) => z.id);
      if (zoneIds.length === 0) return "no-zones";
      const { count } = await supabase
        .from("ticket_sales")
        .select("*", { count: "exact", head: true })
        .in("zone_id", zoneIds);
      // Also get a rough sum to detect price changes
      const { data: agg } = await supabase
        .from("ticket_sales")
        .select("quantity, unit_price")
        .in("zone_id", zoneIds);
      const total = (agg ?? []).reduce((s: number, r: any) => s + Number(r.quantity) * Number(r.unit_price), 0);
      return `${count}:${Math.round(total * 100)}`;
    },
    enabled: enabled && cacheConfigs.length > 0,
  });

  useEffect(() => {
    if (!enabled || !cacheCategoryId || cacheConfigs.length === 0 || syncingRef.current) return;

    const isTour = childEventIds && childEventIds.length > 0;

    const hash = JSON.stringify({
      configs: cacheConfigs.map((c) => ({
        id: c.id,
        artist_name: c.artist_name,
        cache_type: c.cache_type,
        fixed_amount: c.fixed_amount,
        percentage: c.percentage,
        fixed_deduction_percentage: c.fixed_deduction_percentage,
        cache_revenue_basis: c.cache_revenue_basis,
        cache_deduction_basis: c.cache_deduction_basis,
        minimum_guaranteed: c.minimum_guaranteed,
        is_finalized: c.is_finalized,
        tiers: c.tiers,
      })),
      deductions: deductions.map((d) => `${d.cache_config_id}:${d.category_id}`).sort(),
      ticketRevenueNet: Math.round(ticketRevenueNet * 100),
      ticketRevenueGross: Math.round(ticketRevenueGross * 100),
      childEventIds: childEventIds?.sort(),
      salesFingerprint,
      expenseForecasts: forecasts
        .filter((f) => f.type === "expense" && !f.cache_config_id)
        .map((f) => `${f.category_id}:${Math.round(Number(f.amount) * 100)}:${f.iva_rate}`)
        .sort(),
    });

    if (hash === lastSyncHash.current) return;

    const doSync = async () => {
      syncingRef.current = true;
      try {
        if (isTour) {
          await syncTourCacheForecasts(
            eventId,
            childEventIds,
            cacheConfigs,
            deductions,
            cacheCategoryId,
            queryClient,
          );
        } else {
          await syncSimpleCacheForecasts(
            eventId,
            cacheConfigs,
            deductions,
            forecasts,
            ticketRevenueNet,
            ticketRevenueGross,
            cacheCategoryId,
            queryClient,
          );
        }
        lastSyncHash.current = hash;
      } catch (err) {
        console.error("Cache forecast sync error:", err);
      } finally {
        syncingRef.current = false;
      }
    };

    doSync();
  }, [eventId, childEventIds, cacheConfigs, deductions, forecasts, ticketRevenueNet, ticketRevenueGross, cacheCategoryId, enabled, queryClient]);
}

/**
 * For tours: create one forecast per (cache_config × child_event),
 * each using the child's own ticket revenue.
 */
async function syncTourCacheForecasts(
  masterEventId: string,
  childEventIds: string[],
  cacheConfigs: CacheConfig[],
  deductions: { cache_config_id: string; category_id: string }[],
  cacheCategoryId: string,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  // 1. Fetch ticket data for all children to calculate per-child revenue
  const { data: zones } = await supabase
    .from("event_ticket_zones")
    .select("id, event_id")
    .in("event_id", childEventIds);
  const zoneIds = (zones ?? []).map((z) => z.id);

  const [lotsRes, salesRes] = zoneIds.length > 0
    ? await Promise.all([
        supabase.from("event_ticket_lots").select("*").in("zone_id", zoneIds),
        supabase.from("ticket_sales").select("zone_id, lot_id, quantity, unit_price").in("zone_id", zoneIds),
      ])
    : [{ data: [] }, { data: [] }];
  const lots = lotsRes.data ?? [];
  const sales = salesRes.data ?? [];

  // Build IVA rate map from lots
  const lotIvaMap = new Map<string, number>();
  for (const l of lots) {
    lotIvaMap.set(l.id, Number((l as any).iva_rate ?? 6));
  }

  // Build per-child revenue map from LOTS (planned)
  const zoneToEvent = new Map((zones ?? []).map((z) => [z.id, z.event_id]));
  const plannedRevenueByChild: Record<string, { gross: number; net: number }> = {};
  const actualRevenueByChild: Record<string, { gross: number; net: number }> = {};
  for (const cid of childEventIds) {
    plannedRevenueByChild[cid] = { gross: 0, net: 0 };
    actualRevenueByChild[cid] = { gross: 0, net: 0 };
  }
  for (const l of lots) {
    const eid = zoneToEvent.get(l.zone_id);
    if (!eid || !plannedRevenueByChild[eid]) continue;
    const price = Number(l.price);
    const qty = Number(l.quantity);
    const ivaRate = Number((l as any).iva_rate ?? 6);
    plannedRevenueByChild[eid].gross += qty * price;
    plannedRevenueByChild[eid].net += qty * (price / (1 + ivaRate / 100));
  }

  // Build per-child revenue from ACTUAL SALES
  for (const s of sales) {
    const eid = zoneToEvent.get(s.zone_id);
    if (!eid || !actualRevenueByChild[eid]) continue;
    const qty = Number(s.quantity);
    const price = Number(s.unit_price);
    const ivaRate = lotIvaMap.get(s.lot_id) ?? 6;
    actualRevenueByChild[eid].gross += qty * price;
    actualRevenueByChild[eid].net += qty * (price / (1 + ivaRate / 100));
  }

  // Use actual sales when available, fall back to planned
  const revenueByChild: Record<string, { gross: number; net: number }> = {};
  for (const cid of childEventIds) {
    const actual = actualRevenueByChild[cid];
    revenueByChild[cid] = (actual.gross > 0 || actual.net > 0) ? actual : plannedRevenueByChild[cid];
  }

  // 2. Fetch expense forecasts per child (for deduction calculation)
  const allTargetIds = [...childEventIds, masterEventId];
  const { data: existingForecasts } = await supabase
    .from("event_forecasts")
    .select("id, event_id, cache_config_id, amount, type, category_id")
    .in("event_id", allTargetIds)
    .not("cache_config_id", "is", null);

  // Also fetch non-cache expense forecasts per child for deduction calc
  const { data: childExpenseForecasts } = await supabase
    .from("event_forecasts")
    .select("event_id, type, category_id, amount, iva_rate, cache_config_id")
    .in("event_id", childEventIds)
    .eq("type", "expense")
    .is("cache_config_id", null);

  const expensesByChild: Record<string, { type: string; category_id: string | null; amount: number; iva_rate?: number }[]> = {};
  for (const cid of childEventIds) expensesByChild[cid] = [];
  for (const f of (childExpenseForecasts ?? [])) {
    if (expensesByChild[f.event_id]) {
      expensesByChild[f.event_id].push({ type: f.type, category_id: f.category_id, amount: Number(f.amount), iva_rate: Number(f.iva_rate ?? 0) });
    }
  }

  // Map existing cache forecasts: key = `${event_id}:${cache_config_id}`
  const existingMap = new Map<string, { id: string; amount: number }>();
  for (const f of (existingForecasts ?? [])) {
    existingMap.set(`${f.event_id}:${f.cache_config_id}`, { id: f.id, amount: Number(f.amount) });
  }

  let changed = false;

  // 3. For each config × child, create/update forecast
  for (const config of cacheConfigs) {
    const configDeductions = deductions.filter((d) => d.cache_config_id === config.id);

    for (const childId of childEventIds) {
      const rev = revenueByChild[childId] || { gross: 0, net: 0 };
      const childExpenses = expensesByChild[childId] || [];
      const amount = calculateCacheAmount(config, configDeductions, rev.net, rev.gross, childExpenses);

      const key = `${childId}:${config.id}`;
      const existing = existingMap.get(key);

      if (existing) {
        if (!config.is_finalized) {
          const currentAmount = Math.round(existing.amount * 100);
          const newAmount = Math.round(amount * 100);
          if (currentAmount !== newAmount) {
            await supabase
              .from("event_forecasts")
              .update({ amount, description: `Cachê — ${config.artist_name}` })
              .eq("id", existing.id);
            changed = true;
          }
        }
        existingMap.delete(key);
      } else {
        await supabase.from("event_forecasts").insert({
          event_id: childId,
          type: "expense",
          description: `Cachê — ${config.artist_name}`,
          amount,
          iva_rate: 0,
          category_id: cacheCategoryId,
          formula_type: "cache_module",
          cache_config_id: config.id,
          status: "draft",
        });
        changed = true;
      }
    }
  }

  // 4. Delete orphans (old forecasts on master or removed configs/children)
  for (const [, orphan] of existingMap) {
    await supabase.from("event_forecasts").delete().eq("id", orphan.id);
    changed = true;
  }

  if (changed) {
    // Invalidate all affected events
    for (const eid of allTargetIds) {
      queryClient.invalidateQueries({ queryKey: ["event_forecasts", eid] });
    }
  }
}

/**
 * For simple (non-tour) events: create forecasts directly on the event.
 * Fetches actual ticket_sales and uses them when available instead of planned revenue.
 */
async function syncSimpleCacheForecasts(
  eventId: string,
  cacheConfigs: CacheConfig[],
  deductions: { cache_config_id: string; category_id: string }[],
  forecasts: { id: string; type: string; category_id: string | null; amount: number; iva_rate: number; cache_config_id?: string | null }[],
  ticketRevenueNet: number,
  ticketRevenueGross: number,
  cacheCategoryId: string,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  // Fetch actual ticket sales to prefer over planned revenue
  const { data: zones } = await supabase
    .from("event_ticket_zones")
    .select("id")
    .eq("event_id", eventId);
  const zoneIds = (zones ?? []).map((z) => z.id);

  let effectiveNet = ticketRevenueNet;
  let effectiveGross = ticketRevenueGross;

  if (zoneIds.length > 0) {
    const [salesRes, lotsRes] = await Promise.all([
      supabase.from("ticket_sales").select("lot_id, zone_id, quantity, unit_price").in("zone_id", zoneIds),
      supabase.from("event_ticket_lots").select("id, iva_rate").in("zone_id", zoneIds),
    ]);
    const sales = salesRes.data ?? [];
    const lots = lotsRes.data ?? [];

    if (sales.length > 0) {
      const lotIvaMap = new Map<string, number>();
      for (const l of lots) {
        lotIvaMap.set(l.id, Number((l as any).iva_rate ?? 6));
      }
      let actualGross = 0;
      let actualNet = 0;
      for (const s of sales) {
        const qty = Number(s.quantity);
        const price = Number(s.unit_price);
        const ivaRate = lotIvaMap.get(s.lot_id) ?? 6;
        actualGross += qty * price;
        actualNet += qty * (price / (1 + ivaRate / 100));
      }
      effectiveNet = actualNet;
      effectiveGross = actualGross;
    }
  }

  const { data: existingForecasts } = await supabase
    .from("event_forecasts")
    .select("id, cache_config_id, amount")
    .eq("event_id", eventId)
    .not("cache_config_id", "is", null);

  const existingMap = new Map(
    (existingForecasts ?? []).map((f: any) => [f.cache_config_id, f])
  );

  const nonCacheExpenses = forecasts.filter(
    (f) => f.type === "expense" && !f.cache_config_id
  );

  let changed = false;

  for (const config of cacheConfigs) {
    const existing = existingMap.get(config.id);
    const amount = calculateCacheAmount(
      config,
      deductions.filter((d) => d.cache_config_id === config.id),
      effectiveNet,
      effectiveGross,
      nonCacheExpenses
    );

    if (existing) {
      if (!config.is_finalized) {
        const currentAmount = Math.round(Number(existing.amount) * 100);
        const newAmount = Math.round(amount * 100);
        if (currentAmount !== newAmount) {
          await supabase
            .from("event_forecasts")
            .update({ amount, description: `Cachê — ${config.artist_name}` })
            .eq("id", existing.id);
          changed = true;
        }
      }
    } else {
      await supabase.from("event_forecasts").insert({
        event_id: eventId,
        type: "expense",
        description: `Cachê — ${config.artist_name}`,
        amount,
        iva_rate: 0,
        category_id: cacheCategoryId,
        formula_type: "cache_module",
        cache_config_id: config.id,
        status: "draft",
      });
      changed = true;
    }

    existingMap.delete(config.id);
  }

  for (const [, orphan] of existingMap) {
    await supabase.from("event_forecasts").delete().eq("id", (orphan as any).id);
    changed = true;
  }

  if (changed) {
    queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
  }
}

function calculateCacheAmount(
  config: CacheConfig,
  configDeductions: { cache_config_id: string; category_id: string }[],
  ticketRevenueNet: number,
  ticketRevenueGross: number,
  expenseForecasts: { type: string; category_id: string | null; amount: number; iva_rate?: number }[],
  occupancyPct: number = 100
): number {
  if (config.cache_type === "fixed") {
    return Number(config.fixed_amount);
  }

  const basis =
    config.cache_revenue_basis === "gross" ? ticketRevenueGross : ticketRevenueNet;

  const deductionCategoryIds = new Set(configDeductions.map((d) => d.category_id));
  const deductionBasisGross = config.cache_deduction_basis === "gross";

  const categoryDeductionAmount = expenseForecasts
    .filter((f) => f.type === "expense" && deductionCategoryIds.has(f.category_id ?? ""))
    .reduce((s, f) => {
      const base = Number(f.amount);
      if (deductionBasisGross) {
        const rate = Number(f.iva_rate ?? 0);
        return s + base * (1 + rate / 100);
      }
      return s + base;
    }, 0);

  const fixedPctDeduction =
    basis * ((Number(config.fixed_deduction_percentage) || 0) / 100);
  const totalDeduction = categoryDeductionAmount + fixedPctDeduction;
  const baseForCalc = basis - totalDeduction;
  const pct = resolvePercentageFromTiers(config, occupancyPct);
  const calculated = Math.max(0, baseForCalc * (pct / 100));
  const minGuaranteed = Number(config.minimum_guaranteed) || 0;
  return Math.round(Math.max(minGuaranteed, calculated));
}
