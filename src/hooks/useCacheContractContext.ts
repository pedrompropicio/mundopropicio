import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CacheRoleTotals { amount: number; paid: number }
export interface CacheContextCity {
  event_id: string; name: string; date: string | null; forecast_id: string; cap: number; is_absorber: boolean;
  by_role: Record<string, CacheRoleTotals>;
}
export interface CacheContextContract {
  id: string; label: string | null; gross: number; beneficiary_supplier_id: string; beneficiary_name: string | null;
  withholding_applies: boolean; withholding_rate: number | null; withholding_amount: number;
  withholding_due_date: string | null; artist_due_date: string | null; advances_amount: number; created_at: string;
  artist_mother: { id: string; amount: number; paid: number; status: string } | null;
  withholding_mother: { id: string; amount: number; paid: number; status: string } | null;
  has_payment: boolean; advance_ids: string[];
  cities: { event_id: string; quota: number; withholding: number; advances: number; artist_balance: number }[];
}
export interface CacheContextAdvance {
  id: string; amount: number; legacy: boolean; description: string | null; paid: number; by_city: Record<string, number>;
}
export interface CacheContractContext {
  root_event_id: string; max_contracts: number; master_line_warning: boolean;
  cities: CacheContextCity[]; contracts: CacheContextContract[]; free_advances: CacheContextAdvance[];
}

export const cacheContextKey = (eventId: string, artistSupplierId: string | null | undefined) =>
  ["cache_contract_context", eventId, artistSupplierId ?? ""];

/** Contexto canónico (RPC) dos contratos de cachê: cidades/tetos, contratos, adiantamentos livres e pago por papel. */
export function useCacheContractContext(eventId: string, artistSupplierId: string | null | undefined) {
  return useQuery({
    queryKey: cacheContextKey(eventId, artistSupplierId),
    enabled: !!eventId && !!artistSupplierId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cache_contract_context" as any, {
        p_event_id: eventId,
        p_artist_supplier_id: artistSupplierId,
      });
      if (error) throw error;
      return data as unknown as CacheContractContext;
    },
  });
}

export function useInvalidateCacheContracts() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["cache_contract_context"] });
    qc.invalidateQueries({ queryKey: ["cache_tx_already_booked"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["event-financials"] });
  };
}
