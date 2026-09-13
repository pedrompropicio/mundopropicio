/**
 * Fechamentos de um evento (ou Master + Splits) carregados UMA vez, para saber
 * quais são as raízes — base da regra do perímetro da raiz (D25 adenda g3).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EventSettlementLite {
  id: string;
  event_id: string;
  parent_id: string | null;
  name: string;
}

export interface RootSettlementsInfo {
  settlements: EventSettlementLite[];
  /** ids dos fechamentos raiz (parent_id null) dos eventos em causa */
  rootIds: Set<string>;
  nameById: Record<string, string>;
}

export async function fetchRootSettlements(eventIds: string[]): Promise<RootSettlementsInfo> {
  if (eventIds.length === 0) return { settlements: [], rootIds: new Set(), nameById: {} };
  const { data, error } = await supabase
    .from("event_settlements")
    .select("id, event_id, parent_id, name")
    .in("event_id", eventIds);
  if (error) throw error;
  const settlements = (data ?? []) as unknown as EventSettlementLite[];
  return {
    settlements,
    rootIds: new Set(settlements.filter((s) => !s.parent_id).map((s) => s.id)),
    nameById: Object.fromEntries(settlements.map((s) => [s.id, s.name])),
  };
}

export function useEventRootSettlements(eventIds: string[]) {
  const ids = Array.from(new Set(eventIds.filter(Boolean)));
  const key = ids.slice().sort().join(",");
  return useQuery({
    queryKey: ["event-root-settlements", key],
    queryFn: () => fetchRootSettlements(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
}
