import { useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabase-paging";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { resolvePercentageFromTiers, getCacheEffectiveAmount, type CacheTier, type CityCacheSettlement } from "@/lib/cache-pl-helper";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { writeForecastAmount, ForecastBelowRealizedError } from "@/lib/forecast-amount";
import { toast } from "@/hooks/use-toast";
import { mustWrite } from "@/lib/must-write";
import { computeTicketRevenueAndOccupancy, enrichCacheConfigs, filterRealCacheExpenses } from "@/lib/real-cache-calc";
import { computeTourCityCacheAmount, masterDeductionFingerprint } from "@/lib/tour-cache-sync";

/**
 * #240 (Q2): o amount das linhas cache_module vai por batch_update_event_forecasts
 * com observação fixa. Se o recálculo ficar abaixo do já pago, não grava e avisa.
 */
async function writeCacheAmount(forecastId: string, amount: number, artist: string) {
  try {
    await writeForecastAmount({ forecastId, newAmount: amount, observation: "[módulo de cachê] recálculo" });
  } catch (e) {
    if (e instanceof ForecastBelowRealizedError) {
      const eur = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
      toast({
        title: `Cachê — ${artist}: linha não actualizada`,
        description: `O recálculo (${eur(e.requested)}) fica abaixo do já pago (${eur(e.realized)}). A linha do BP mantém-se.`,
        variant: "destructive",
      });
      return;
    }
    console.error("[useSyncCacheForecasts] falha a gravar amount do cachê", e);
    toast({
      title: `Cachê — ${artist}: linha não actualizada`,
      description: (e as any)?.message ?? String(e),
      variant: "destructive",
    });
  }
}

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
  real_amount?: number | null;
  adjusted_amount?: number | null;
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
      const { data: zones, error: qErr1 } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .in("event_id", allRelevantIds);
      if (qErr1) throw qErr1;
      const zoneIds = (zones ?? []).map((z) => z.id);
      if (zoneIds.length === 0) return "no-zones";
      const { count } = await supabase
        .from("ticket_sales")
        .select("*", { count: "exact", head: true })
        .in("zone_id", zoneIds);
      // Also get a rough sum to detect price changes (paginado — #205)
      const agg = await fetchAllPaged<any>((from, to) =>
        supabase
          .from("ticket_sales")
          .select("quantity, unit_price")
          .in("zone_id", zoneIds)
          .order("id", { ascending: true })
          .range(from, to),
      );
      const total = (agg ?? []).reduce((s: number, r: any) => s + Number(r.quantity) * Number(r.unit_price), 0);
      return `${count}:${Math.round(total * 100)}`;
    },
    enabled: enabled && cacheConfigs.length > 0,
    refetchInterval: 15000,
  });

  // Fingerprint of city settlements so hash changes when an adjustment/finalization happens per city
  const cacheConfigIdsKey = useMemo(() => cacheConfigs.map((c) => c.id).sort().join(","), [cacheConfigs]);
  const { data: citySettlementsFingerprint } = useQuery({
    queryKey: ["cache-sync-city-settlements-fp", cacheConfigIdsKey, ...(childEventIds ?? [])],
    queryFn: async () => {
      if (!childEventIds || childEventIds.length === 0 || cacheConfigs.length === 0) return "no-cities";
      const { data, error: qErr3 } = await supabase
        .from("event_cache_city_settlements")
        .select("event_id, cache_config_id, is_finalized, real_amount, adjusted_amount, updated_at")
        .in("event_id", childEventIds)
        .in("cache_config_id", cacheConfigs.map((c) => c.id));
      if (qErr3) throw qErr3;
      return (data ?? [])
        .map((r: any) => `${r.event_id}:${r.cache_config_id}:${r.is_finalized}:${r.real_amount ?? ""}:${r.adjusted_amount ?? ""}:${r.updated_at}`)
        .sort()
        .join("|");
    },
    enabled: enabled && cacheConfigs.length > 0 && !!childEventIds && childEventIds.length > 0,
    refetchInterval: 10000,
  });

  // #301 (A): BP e despesas do Master nas rubricas de dedução entram na deteção de alterações.
  const deductionCatsKey = useMemo(() => [...new Set(deductions.map((d) => d.category_id))].sort().join(","), [deductions]);
  const isTourForFp = !!childEventIds && childEventIds.length > 0;
  const { data: masterFingerprint } = useQuery({
    queryKey: ["cache-sync-master-fp", eventId, deductionCatsKey],
    queryFn: async () => {
      const cats = deductionCatsKey ? deductionCatsKey.split(",") : [];
      if (cats.length === 0) return "no-deductions";
      const [fRes, tRes] = await Promise.all([
        fetchAllPagedQuery(supabase
          .from("event_forecasts")
          .select("id, category_id, amount, iva_rate, status, is_overhead, is_transitory, exclude_from_result")
          .eq("event_id", eventId).eq("type", "expense").in("category_id", cats)
          .is("cache_config_id", null).is("version_id", null).order("id")),
        fetchAllPagedQuery(supabase
          .from("transactions")
          .select("id, category_id, amount, iva_rate, status, reversed_at, is_hidden, is_transitory, exclude_from_result, parent_transaction_id, split_percentage")
          .eq("event_id", eventId).eq("type", "expense").in("category_id", cats).order("id")),
      ]);
      if (fRes.error) throw fRes.error;
      if (tRes.error) throw tRes.error;
      return masterDeductionFingerprint(fRes.data ?? [], tRes.data ?? [], cats);
    },
    enabled: enabled && isTourForFp && cacheConfigs.length > 0,
    refetchInterval: 15000,
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
        real_amount: c.real_amount,
        adjusted_amount: c.adjusted_amount,
        tiers: c.tiers,
      })),
      deductions: deductions.map((d) => `${d.cache_config_id}:${d.category_id}`).sort(),
      ticketRevenueNet: Math.round(ticketRevenueNet * 100),
      ticketRevenueGross: Math.round(ticketRevenueGross * 100),
      childEventIds: childEventIds?.sort(),
      salesFingerprint,
      citySettlementsFingerprint,
      masterFingerprint,
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
      } catch (err: any) {
        // #295: gravação recusada (RLS/trava) deixa de ficar só no console.
        console.error("Cache forecast sync error:", err);
        toast({
          title: "Cachê: o BP não foi actualizado",
          description: err?.message ?? String(err),
          variant: "destructive",
        });
      } finally {
        syncingRef.current = false;
      }
    };

    doSync();
  }, [eventId, childEventIds, cacheConfigs, deductions, forecasts, ticketRevenueNet, ticketRevenueGross, cacheCategoryId, enabled, queryClient, salesFingerprint, citySettlementsFingerprint, masterFingerprint]);
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
    .select("id, event_id, total_capacity")
    .in("event_id", childEventIds);
  const zoneIds = (zones ?? []).map((z) => z.id);

  const [lotsRes, salesRes] = zoneIds.length > 0
    ? await Promise.all([
        supabase.from("event_ticket_lots").select("*").in("zone_id", zoneIds),
        // #205: paginado — o PostgREST corta aos 1.000 registos em silêncio.
        fetchAllPaged<any>((from, to) =>
          supabase
            .from("ticket_sales")
            .select("zone_id, lot_id, quantity, unit_price")
            .in("zone_id", zoneIds)
            .order("id", { ascending: true })
            .range(from, to),
        ).then((data) => ({ data })),
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
  const hasSalesByChild: Record<string, boolean> = {};
  for (const cid of childEventIds) {
    const actual = actualRevenueByChild[cid];
    hasSalesByChild[cid] = actual.gross > 0 || actual.net > 0;
    revenueByChild[cid] = hasSalesByChild[cid] ? actual : plannedRevenueByChild[cid];
  }

  // 2. Fetch expense forecasts per child (for deduction calculation)
  const allTargetIds = [...childEventIds, masterEventId];
  const { data: existingForecasts } = await fetchAllPagedQuery(supabase
    .from("event_forecasts")
    .select("id, event_id, cache_config_id, amount, type, category_id, status, transaction_id")
    .in("event_id", allTargetIds)
    .not("cache_config_id", "is", null).is("version_id", null));

  // #301 — deduções: BP aprovado (não-cachê) + transações reais das cidades E do Master
  // (cityDeductionSources: cidade peso 1, Master 1/N, previsto + excedido por evento).
  const { data: deductionForecasts } = await fetchAllPagedQuery(supabase
    .from("event_forecasts")
    .select("id, event_id, type, category_id, amount, iva_rate, status, is_transitory, is_overhead, exclude_from_result, version_id")
    .in("event_id", allTargetIds)
    .eq("type", "expense")
    .is("cache_config_id", null).is("version_id", null));
  const { data: realTxRows, error: realTxErr } = await fetchAllPagedQuery(supabase
    .from("transactions")
    .select("id, event_id, type, category_id, amount, iva_rate, status, is_hidden, is_transitory, exclude_from_result, parent_transaction_id, split_percentage")
    .in("event_id", allTargetIds)
    .eq("type", "expense")
    .eq("is_hidden", false)
    .in("status", ["approved", "paid"]));
  if (realTxErr) throw realTxErr;
  const realExpenses = filterRealCacheExpenses(realTxRows ?? []);
  const byEvent = (rows: any[], id: string) => rows.filter((r: any) => r.event_id === id);

  // Fetch per-city settlements (override priority over master legacy fields)
  const cacheConfigIds = cacheConfigs.map((c) => c.id);
  const { data: citySettlementsRows } = cacheConfigIds.length > 0
    ? await supabase
        .from("event_cache_city_settlements")
        .select("event_id, cache_config_id, is_finalized, real_amount, adjusted_amount")
        .in("event_id", childEventIds)
        .in("cache_config_id", cacheConfigIds)
    : { data: [] as any[] };
  const citySettlementMap = new Map<string, CityCacheSettlement>();
  for (const r of (citySettlementsRows ?? [])) {
    citySettlementMap.set(`${r.event_id}:${r.cache_config_id}`, {
      is_finalized: r.is_finalized,
      real_amount: r.real_amount,
      adjusted_amount: r.adjusted_amount,
    });
  }

  // Map existing cache forecasts: key = `${event_id}:${cache_config_id}`
  const existingMap = new Map<string, { id: string; amount: number; status?: string; transaction_id?: string | null }>();
  for (const f of (existingForecasts ?? [])) {
    existingMap.set(`${f.event_id}:${f.cache_config_id}`, { id: f.id, amount: Number(f.amount), status: (f as any).status, transaction_id: (f as any).transaction_id });
  }

  let changed = false;

  // #301 — escalões e campos de prioridade lidos da base: os dois ecrãs que chamam
  // este hook passam configs diferentes (um sem tiers/ajustes); a regra não pode depender disso.
  const { data: tierRows, error: tierErr } = cacheConfigIds.length > 0
    ? await supabase.from("event_cache_tiers").select("cache_config_id, occupancy_threshold, percentage").in("cache_config_id", cacheConfigIds)
    : { data: [] as any[], error: null };
  if (tierErr) throw tierErr;
  const { data: cfgRows, error: cfgErr } = cacheConfigIds.length > 0
    ? await supabase.from("event_cache_configs").select("id, is_finalized, real_amount, adjusted_amount").in("id", cacheConfigIds)
    : { data: [] as any[], error: null };
  if (cfgErr) throw cfgErr;
  const cfgById = new Map((cfgRows ?? []).map((r: any) => [r.id, r]));
  const fullConfigs = enrichCacheConfigs(
    cacheConfigs.map((c) => ({ ...c, ...(cfgById.get(c.id) ?? {}) })),
    tierRows ?? [],
  );

  // 3. For each config × child, create/update forecast
  for (const config of fullConfigs) {
    const configDeductions = deductions.filter((d) => d.cache_config_id === config.id);

    for (const childId of childEventIds) {
      const rev = revenueByChild[childId] || { gross: 0, net: 0 };
      const citySettlement = citySettlementMap.get(`${childId}:${config.id}`) ?? null;
      // Ocupação real da cidade para o escalão; sem vendas (fallback do BP planeado) fica 100.
      const occ = hasSalesByChild[childId]
        ? computeTicketRevenueAndOccupancy(sales, lots, zones ?? [], childId).occupancyPct
        : 100;
      const amount = computeTourCityCacheAmount({
        config,
        deductions: configDeductions,
        revenue: rev,
        occupancyPct: occ,
        cityForecasts: byEvent(deductionForecasts ?? [], childId),
        cityExpenses: byEvent(realExpenses, childId),
        masterForecasts: byEvent(deductionForecasts ?? [], masterEventId),
        masterExpenses: byEvent(realExpenses, masterEventId),
        cityCount: childEventIds.length,
        citySettlement,
      });

      const key = `${childId}:${config.id}`;
      const existing = existingMap.get(key);

      // Promove a linha do BP a 'approved' quando o cachê está fixado:
      //  - settlement de cidade finalizado / com adjusted_amount, OU
      //  - config Master finalizado / ajustado, OU
      //  - já existe transação vinculada (transaction_id)
      const cityFixed = !!citySettlement && (
        citySettlement.adjusted_amount != null ||
        (citySettlement.is_finalized && citySettlement.real_amount != null)
      );
      const masterFixed = config.adjusted_amount != null || (config.is_finalized && config.real_amount != null);
      const shouldApprove = cityFixed || masterFixed || !!existing?.transaction_id;

      if (existing) {
        const currentAmount = Math.round(existing.amount * 100);
        const newAmount = Math.round(amount * 100);
        const needsAmountUpdate = currentAmount !== newAmount;
        const needsStatusUpdate = shouldApprove && existing.status !== "approved";
        if (needsAmountUpdate || needsStatusUpdate) {
          const patch: any = { description: `Cachê — ${config.artist_name}` };
          if (needsStatusUpdate) patch.status = "approved";
          // status primeiro: a regra do chão (#240) aplica-se à linha já aprovada
          await mustWrite(supabase
            .from("event_forecasts")
            .update(patch)
            .eq("id", existing.id).select("id"), "event_forecasts", { expectRows: true });
          if (needsAmountUpdate) await writeCacheAmount(existing.id, amount, config.artist_name);
          changed = true;
        }
        existingMap.delete(key);
      } else {
        await mustWrite(supabase.from("event_forecasts").insert({
          event_id: childId,
          type: "expense",
          description: `Cachê — ${config.artist_name}`,
          amount,
          iva_rate: 0,
          category_id: cacheCategoryId,
          formula_type: "cache_module",
          cache_config_id: config.id,
          status: shouldApprove ? "approved" : "draft",
        }), "event_forecasts");
        changed = true;
      }
    }
  }

  // 4. Delete orphans (old forecasts on master or removed configs/children)
  for (const [, orphan] of existingMap) {
    await mustWrite(supabase.from("event_forecasts").delete().eq("id", orphan.id).select("id"), "event_forecasts", { expectRows: true });
    changed = true;
  }

  // 5. Clean up orphan cache forecasts (formula_type='cache_module' but cache_config_id IS NULL)
  const { data: orphanCacheForecasts } = await fetchAllPagedQuery(supabase
    .from("event_forecasts")
    .select("id")
    .in("event_id", [...childEventIds, masterEventId])
    .eq("type", "expense")
    .eq("formula_type", "cache_module")
    .is("cache_config_id", null).is("version_id", null));
  for (const orphan of (orphanCacheForecasts ?? [])) {
    await mustWrite(supabase.from("event_forecasts").delete().eq("id", orphan.id).select("id"), "event_forecasts", { expectRows: true });
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
    const [salesPaged, lotsRes] = await Promise.all([
      // #205: paginado — nunca somar ticket_sales sem .range().
      fetchAllPaged<any>((from, to) =>
        supabase
          .from("ticket_sales")
          .select("lot_id, zone_id, quantity, unit_price")
          .in("zone_id", zoneIds)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      supabase.from("event_ticket_lots").select("id, iva_rate").in("zone_id", zoneIds),
    ]);
    const sales = salesPaged;
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

  const { data: existingForecasts } = await fetchAllPagedQuery(supabase
    .from("event_forecasts")
    .select("id, cache_config_id, amount")
    .eq("event_id", eventId)
    .not("cache_config_id", "is", null).is("version_id", null));

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
      const currentAmount = Math.round(Number(existing.amount) * 100);
      const newAmount = Math.round(amount * 100);
      if (currentAmount !== newAmount) {
        await mustWrite(supabase
          .from("event_forecasts")
          .update({ description: `Cachê — ${config.artist_name}` })
          .eq("id", existing.id).select("id"), "event_forecasts", { expectRows: true });
        await writeCacheAmount(existing.id, amount, config.artist_name);
        changed = true;
      }
    } else {
      await mustWrite(supabase.from("event_forecasts").insert({
        event_id: eventId,
        type: "expense",
        description: `Cachê — ${config.artist_name}`,
        amount,
        iva_rate: 0,
        category_id: cacheCategoryId,
        formula_type: "cache_module",
        cache_config_id: config.id,
        status: "draft",
      }), "event_forecasts");
      changed = true;
    }

    existingMap.delete(config.id);
  }

  for (const [, orphan] of existingMap) {
    await mustWrite(supabase.from("event_forecasts").delete().eq("id", (orphan as any).id).select("id"), "event_forecasts", { expectRows: true });
    changed = true;
  }

  // Clean up orphan cache forecasts (formula_type='cache_module' but cache_config_id IS NULL)
  const { data: simpleOrphanForecasts } = await fetchAllPagedQuery(supabase
    .from("event_forecasts")
    .select("id")
    .eq("event_id", eventId)
    .eq("type", "expense")
    .eq("formula_type", "cache_module")
    .is("cache_config_id", null).is("version_id", null));
  for (const orphan of (simpleOrphanForecasts ?? [])) {
    await mustWrite(supabase.from("event_forecasts").delete().eq("id", orphan.id).select("id"), "event_forecasts", { expectRows: true });
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
  occupancyPct: number = 100,
  citySettlement: CityCacheSettlement | null = null,
): number {
  let calculated: number;
  if (config.cache_type === "fixed") {
    calculated = Number(config.fixed_amount);
  } else {
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
    const calc = Math.max(0, baseForCalc * (pct / 100));
    const minGuaranteed = Number(config.minimum_guaranteed) || 0;
    calculated = Math.round(Math.max(minGuaranteed, calc) * 100) / 100;
  }
  // Apply override priority: city settlement > config legacy > calculated
  return Math.round(getCacheEffectiveAmount(config, calculated, citySettlement) * 100) / 100;
}
