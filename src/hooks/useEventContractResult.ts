/**
 * Resultado do evento na base contratual (#223) — mesmo motor do Encontro de
 * Contas, visão "Geral do evento".
 *
 * Só leitura. Usa EXACTAMENTE as mesmas queries (mesmas `queryKey`, logo o
 * react-query partilha a cache com `useEventSettlementEngine`) e os mesmos
 * totais (`computeEventSettlementTotals`) com o critério gravado no evento
 * (`useFechoBasis`). O cálculo final vive em `computeEventContractResult`.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged, fetchAllPagedQuery } from "@/lib/supabase-paging";
import { computeEventSettlementTotals } from "@/lib/event-settlement-inputs";
import { computeEventContractResult, type ContractResult } from "@/lib/event-contract-result";
import { useFechoBasis } from "@/hooks/useFechoBasis";

export interface EventContractResultState {
  contract: ContractResult | null;
  isLoading: boolean;
}

export function useEventContractResult(eventId: string): EventContractResultState {
  const { data: event, isPending: eventPending } = useQuery({
    queryKey: ["event-settlement-engine-event", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, partner_calc_basis")
        .eq("id", eventId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const basis = useFechoBasis(eventId, (event as any)?.partner_calc_basis);

  const { data: events = [], isPending: eventsPending } = useQuery({
    queryKey: ["event-settlement-engine-events", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, parent_event_id")
        .or(`id.eq.${eventId},parent_event_id.eq.${eventId}`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const allEventIds = useMemo(
    () => (events.length ? events.map((e: any) => e.id) : eventId ? [eventId] : []),
    [events, eventId],
  );
  const idsKey = allEventIds.join(",");

  const { data: transactions = [], isPending: txPending } = useQuery({
    queryKey: ["event-settlement-engine-tx", idsKey],
    enabled: allEventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await fetchAllPagedQuery(supabase
        .from("transactions")
        .select(
          "id, amount, iva_rate, type, status, event_id, event_settlement_id, is_transitory, exclude_from_result, reversed_at, is_hidden, category_id, account_categories(code)",
        )
        .in("event_id", allEventIds));
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: forecasts = [], isPending: bpPending } = useQuery({
    queryKey: ["event-settlement-engine-bp", idsKey],
    enabled: allEventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await fetchAllPagedQuery(supabase
        .from("event_forecasts")
        .select(
          "id, event_id, type, amount, iva_rate, status, is_overhead, is_transitory, exclude_from_result, master_forecast_id, transaction_id, category_id, event_settlement_id, addback_settlement_id, addback_reason, description, vat_non_recoverable",
        )
        .in("event_id", allEventIds)
        .eq("status", "approved")
        .is("version_id", null));
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ticketSales = [], isPending: tsPending } = useQuery({
    queryKey: ["event-settlement-engine-tickets", idsKey],
    enabled: allEventIds.length > 0,
    queryFn: async () => {
      const { data: zones, error: qErr1 } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .in("event_id", allEventIds);
      if (qErr1) throw qErr1;
      if (!zones?.length) return [];
      const { data: lots, error: qErr2 } = await supabase
        .from("event_ticket_lots")
        .select("id, iva_rate")
        .in("zone_id", zones.map((z: any) => z.id));
      if (qErr2) throw qErr2;
      if (!lots?.length) return [];
      const sales = await fetchAllPaged<any>((from, to) =>
        supabase
          .from("ticket_sales")
          .select("lot_id, quantity, unit_price, total_value")
          .in("lot_id", lots.map((l: any) => l.id))
          .order("id", { ascending: true })
          .range(from, to),
      );
      return (sales ?? []).map((s: any) => {
        const lot = lots.find((l: any) => l.id === s.lot_id);
        const rate = Number(lot?.iva_rate || 0);
        const gross = s.total_value != null ? Number(s.total_value) : Number(s.quantity) * Number(s.unit_price);
        return { gross, net: gross / (1 + rate / 100) };
      });
    },
  });

  const isLoading =
    !eventId || eventPending || eventsPending || txPending || bpPending || tsPending || basis.isLoading;

  const contract = useMemo(() => {
    if (isLoading) return null;
    const totals = computeEventSettlementTotals({
      events: events.length ? events : [{ id: eventId, parent_event_id: null }],
      transactions,
      forecasts,
      ticketSales,
      basis: { includeOverhead: basis.includeOverhead, expenseSource: basis.expenseSource },
    });
    return computeEventContractResult(totals, (event as any)?.partner_calc_basis);
  }, [
    isLoading,
    events,
    eventId,
    transactions,
    forecasts,
    ticketSales,
    basis.includeOverhead,
    basis.expenseSource,
    event,
  ]);

  return { contract, isLoading };
}
