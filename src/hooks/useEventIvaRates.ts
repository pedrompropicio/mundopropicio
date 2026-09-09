/**
 * Taxas de IVA por evento, lidas da base (event_ticket_lots.iva_rate ligado ao
 * evento por zone_id -> event_ticket_zones.event_id). Nunca inferidas do país.
 *
 * Devolve também a taxa por grupo (tour): quando todos os eventos do grupo têm
 * a mesma taxa, é essa; quando há taxas diferentes, devolve null — nesse caso
 * não se converte por uma taxa média (proibido), mostra-se o bruto.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_IVA_RATE = 6;

interface LotRow {
  iva_rate: number | null;
  event_ticket_zones: { event_id: string } | null;
}

interface EventRow {
  id: string;
  parent_event_id: string | null;
}

export function useEventIvaRates() {
  const lotsQ = useQuery({
    queryKey: ["event-iva-rates"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_lots")
        .select("iva_rate, event_ticket_zones!inner(event_id)");
      if (error) throw error;
      return (data ?? []) as unknown as LotRow[];
    },
  });

  const eventsQ = useQuery({
    queryKey: ["event-iva-parents"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, parent_event_id");
      if (error) throw error;
      return (data ?? []) as unknown as EventRow[];
    },
  });

  return useMemo(() => {
    const rates = new Map<string, number>();
    for (const l of lotsQ.data ?? []) {
      const eid = l.event_ticket_zones?.event_id;
      if (!eid || l.iva_rate == null) continue;
      if (!rates.has(eid)) rates.set(eid, Number(l.iva_rate));
    }

    // taxa por grupo (tour): só quando é uniforme entre os eventos do grupo
    const perGroup = new Map<string, Set<number>>();
    for (const e of eventsQ.data ?? []) {
      const gid = e.parent_event_id ?? e.id;
      const r = rates.get(e.id);
      if (r == null) continue;
      const set = perGroup.get(gid) ?? new Set<number>();
      set.add(r);
      perGroup.set(gid, set);
    }
    const groupRates = new Map<string, number | null>();
    for (const [gid, set] of perGroup) groupRates.set(gid, set.size === 1 ? [...set][0] : null);

    /** Taxa do evento; assume o defeito quando o evento não tem lotes. */
    const rateOf = (eventId?: string | null) =>
      (eventId ? rates.get(eventId) : undefined) ?? DEFAULT_IVA_RATE;

    /** Taxa do grupo: null quando o tour mistura taxas. */
    const groupRateOf = (groupId?: string | null) => {
      if (!groupId) return DEFAULT_IVA_RATE;
      if (groupRates.has(groupId)) return groupRates.get(groupId) ?? null;
      return rates.get(groupId) ?? DEFAULT_IVA_RATE;
    };

    return {
      rates,
      groupRates,
      rateOf,
      groupRateOf,
      isLoading: lotsQ.isLoading || eventsQ.isLoading,
    };
  }, [lotsQ.data, eventsQ.data, lotsQ.isLoading, eventsQ.isLoading]);
}

/** Converte um valor BRUTO (com IVA dentro) para líquido de IVA. */
export const netOfIva = (gross: number, rate: number | null | undefined) => {
  const g = Number(gross || 0);
  if (rate == null) return g; // taxas mistas: não converter por uma taxa média
  return g / (1 + Number(rate) / 100);
};
