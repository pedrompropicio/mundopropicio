import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface CacheConfig {
  id: string;
  event_id: string;
  artist_name: string;
  cache_type: string;
  fixed_amount: number;
  percentage: number;
  fixed_deduction_percentage: number;
  cache_revenue_basis?: string;
  minimum_guaranteed?: number;
  is_finalized?: boolean;
}

interface SyncParams {
  eventId: string;
  cacheConfigs: CacheConfig[];
  deductions: { cache_config_id: string; category_id: string }[];
  forecasts: { id: string; type: string; category_id: string | null; amount: number; cache_config_id?: string | null }[];
  ticketRevenueNet: number;
  ticketRevenueGross: number;
  cacheCategoryId: string | null;
  enabled: boolean;
}

/**
 * Syncs cache configs to real forecast rows in event_forecasts.
 * Each cache config gets a corresponding forecast with formula_type='cache_module'.
 * If is_finalized, the forecast amount is NOT updated.
 */
export function useSyncCacheForecasts({
  eventId,
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
  // Track last synced state to avoid unnecessary updates
  const lastSyncHash = useRef("");

  useEffect(() => {
    if (!enabled || !cacheCategoryId || cacheConfigs.length === 0 || syncingRef.current) return;

    // Build a hash of relevant state to detect changes
    const hash = JSON.stringify({
      configs: cacheConfigs.map((c) => ({
        id: c.id,
        artist_name: c.artist_name,
        cache_type: c.cache_type,
        fixed_amount: c.fixed_amount,
        percentage: c.percentage,
        fixed_deduction_percentage: c.fixed_deduction_percentage,
        cache_revenue_basis: c.cache_revenue_basis,
        minimum_guaranteed: c.minimum_guaranteed,
        is_finalized: c.is_finalized,
      })),
      deductions: deductions.map((d) => `${d.cache_config_id}:${d.category_id}`).sort(),
      ticketRevenueNet: Math.round(ticketRevenueNet * 100),
      ticketRevenueGross: Math.round(ticketRevenueGross * 100),
      // Only include non-cache expense forecasts for deduction calc
      expenseForecasts: forecasts
        .filter((f) => f.type === "expense" && !f.cache_config_id)
        .map((f) => `${f.category_id}:${Math.round(Number(f.amount) * 100)}`)
        .sort(),
    });

    if (hash === lastSyncHash.current) return;

    const doSync = async () => {
      syncingRef.current = true;
      try {
        // Get existing cache forecasts for this event
        const { data: existingForecasts } = await supabase
          .from("event_forecasts")
          .select("id, cache_config_id, amount")
          .eq("event_id", eventId)
          .not("cache_config_id", "is", null);

        const existingMap = new Map(
          (existingForecasts ?? []).map((f: any) => [f.cache_config_id, f])
        );

        // Non-cache expense forecasts for deduction calculation
        const nonCacheExpenses = forecasts.filter(
          (f) => f.type === "expense" && !f.cache_config_id
        );

        let changed = false;

        for (const config of cacheConfigs) {
          const existing = existingMap.get(config.id);
          const amount = calculateCacheAmount(
            config,
            deductions.filter((d) => d.cache_config_id === config.id),
            ticketRevenueNet,
            ticketRevenueGross,
            nonCacheExpenses
          );

          if (existing) {
            // Update only if not finalized and amount changed
            if (!config.is_finalized) {
              const currentAmount = Math.round(Number(existing.amount) * 100);
              const newAmount = Math.round(amount * 100);
              if (currentAmount !== newAmount) {
                await supabase
                  .from("event_forecasts")
                  .update({
                    amount,
                    description: `Cachê — ${config.artist_name}`,
                  })
                  .eq("id", existing.id);
                changed = true;
              }
            }
          } else {
            // Create new forecast
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

          // Remove from map to track orphans
          existingMap.delete(config.id);
        }

        // Delete orphan forecasts (configs that were removed)
        for (const [, orphan] of existingMap) {
          await supabase.from("event_forecasts").delete().eq("id", (orphan as any).id);
          changed = true;
        }

        lastSyncHash.current = hash;

        if (changed) {
          queryClient.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
        }
      } catch (err) {
        console.error("Cache forecast sync error:", err);
      } finally {
        syncingRef.current = false;
      }
    };

    doSync();
  }, [eventId, cacheConfigs, deductions, forecasts, ticketRevenueNet, ticketRevenueGross, cacheCategoryId, enabled, queryClient]);
}

function calculateCacheAmount(
  config: CacheConfig,
  configDeductions: { cache_config_id: string; category_id: string }[],
  ticketRevenueNet: number,
  ticketRevenueGross: number,
  expenseForecasts: { type: string; category_id: string | null; amount: number }[]
): number {
  if (config.cache_type === "fixed") {
    return Number(config.fixed_amount);
  }

  const basis =
    config.cache_revenue_basis === "gross" ? ticketRevenueGross : ticketRevenueNet;

  const deductionCategoryIds = new Set(configDeductions.map((d) => d.category_id));

  const categoryDeductionAmount = expenseForecasts
    .filter((f) => f.type === "expense" && deductionCategoryIds.has(f.category_id ?? ""))
    .reduce((s, f) => s + Number(f.amount), 0);

  const fixedPctDeduction =
    basis * ((Number(config.fixed_deduction_percentage) || 0) / 100);
  const totalDeduction = categoryDeductionAmount + fixedPctDeduction;
  const baseForCalc = basis - totalDeduction;
  const pct = Number(config.percentage) || 0;
  const calculated = Math.max(0, baseForCalc * (pct / 100));
  const minGuaranteed = Number(config.minimum_guaranteed) || 0;
  return Math.max(minGuaranteed, calculated);
}
