/**
 * Carrega os dados e corre o MOTOR dos apuramentos (#146 (c)).
 *
 * Só leitura. Usa o MESMO critério de custo do Encontro de Contas
 * (`useFechoBasis`, que é o store único por evento) e os mesmos totais
 * (`computeEventSettlementTotals`). Não escreve nada, não substitui nada.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calcTotalWithIva } from "@/lib/iva";
import { isValidFechoTransaction } from "@/lib/fecho-filters";
import { normalizePartnerCalcBasis } from "@/lib/partner-calc-basis";
import { HOUSE_PARTNER_NAME } from "@/lib/house-partner";
import { computeEventSettlementTotals } from "@/lib/event-settlement-inputs";
import {
  computeSettlementEngine,
  type EngineMarkedLine,
  type EngineParticipant,
  type EngineParticipantMoney,
  type EngineResult,
} from "@/lib/event-settlement-engine";
import { fetchPartnerExtras } from "@/lib/partner-extras";
import { useFechoBasis } from "@/hooks/useFechoBasis";

export function useEventSettlementEngine(eventId: string) {
  const { data: event } = useQuery({
    queryKey: ["event-settlement-engine-event", eventId],
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

  const basis = useFechoBasis(eventId, event?.partner_calc_basis);

  const { data: events = [] } = useQuery({
    queryKey: ["event-settlement-engine-events", eventId],
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
    () => (events.length ? events.map((e: any) => e.id) : [eventId]),
    [events, eventId],
  );
  const idsKey = allEventIds.join(",");

  const { data: transactions = [] } = useQuery({
    queryKey: ["event-settlement-engine-tx", idsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, amount, iva_rate, type, status, event_id, event_settlement_id, is_transitory, exclude_from_result, reversed_at, is_hidden, category_id, account_categories(code)",
        )
        .in("event_id", allEventIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: allEventIds.length > 0,
  });

  const { data: forecasts = [] } = useQuery({
    queryKey: ["event-settlement-engine-bp", idsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select(
          "id, event_id, type, amount, iva_rate, status, is_overhead, is_transitory, exclude_from_result, master_forecast_id, transaction_id, category_id, event_settlement_id",
        )
        .in("event_id", allEventIds)
        .eq("status", "approved")
        .is("version_id", null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: allEventIds.length > 0,
  });

  const { data: ticketSales = [] } = useQuery({
    queryKey: ["event-settlement-engine-tickets", idsKey],
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .in("event_id", allEventIds);
      if (!zones?.length) return [];
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, iva_rate")
        .in("zone_id", zones.map((z: any) => z.id));
      if (!lots?.length) return [];
      const { data: sales } = await supabase
        .from("ticket_sales")
        .select("lot_id, quantity, unit_price, total_value")
        .in("lot_id", lots.map((l: any) => l.id));
      return (sales ?? []).map((s: any) => {
        const lot = lots.find((l: any) => l.id === s.lot_id);
        const rate = Number(lot?.iva_rate || 0);
        const gross = s.total_value != null ? Number(s.total_value) : Number(s.quantity) * Number(s.unit_price);
        return { gross, net: gross / (1 + rate / 100) };
      });
    },
    enabled: allEventIds.length > 0,
  });

  const { data: settlements = [], isLoading } = useQuery({
    queryKey: ["event-settlements", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_settlements")
        .select("id, name, parent_id, parent_share_pct, parent_share_basis, position, is_sealed, sealed_at")
        .eq("event_id", eventId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: participants = [] } = useQuery({
    queryKey: ["event-settlement-participants", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_settlement_participants")
        .select(
          "id, settlement_id, participant_kind, mode, profit_pct, loss_pct, expense_includes_iva, can_order, can_pay, visible_in_docs, supplier_id, event_partner_id, supplier:suppliers(name)",
        )
        .eq("event_id", eventId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: paidExpenses = [] } = useQuery({
    queryKey: ["event-settlement-engine-paid", idsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("partner_id, transactions(amount, iva_rate, is_transitory)")
        .in("event_id", allEventIds)
        .eq("status", "approved");
      if (error) throw error;
      return data ?? [];
    },
    enabled: allEventIds.length > 0,
  });

  const { data: extras = [] } = useQuery({
    queryKey: ["event-settlement-engine-extras", idsKey],
    queryFn: () => fetchPartnerExtras(allEventIds),
    enabled: allEventIds.length > 0,
  });

  const result: EngineResult | null = useMemo(() => {
    if (!settlements.length) return null;

    const totals = computeEventSettlementTotals({
      events: events.length ? events : [{ id: eventId, parent_event_id: null }],
      transactions,
      forecasts,
      ticketSales,
      basis: { includeOverhead: basis.includeOverhead, expenseSource: basis.expenseSource },
    });

    // As linhas marcadas saem do perímetro da raiz. A fonte da despesa segue o
    // critério do Fecho: realizado → transações; previsto+excedido → BP.
    const expenseKind = basis.expenseSource === "committed" ? "bp" : "tx";
    const markedLines: EngineMarkedLine[] = [
      ...(transactions as any[])
        .filter((t) => t.event_settlement_id && isValidFechoTransaction(t))
        .filter((t) => t.type === "income" || expenseKind === "tx")
        .map((t) => ({
          event_settlement_id: t.event_settlement_id,
          kind: "tx" as const,
          type: t.type as "income" | "expense",
          amount: t.amount,
          iva_rate: t.iva_rate,
        })),
      ...(forecasts as any[])
        .filter((f) => f.event_settlement_id && !f.is_overhead && !f.exclude_from_result && !f.is_transitory)
        .filter((f) => f.type === "expense" && expenseKind === "bp")
        .map((f) => ({
          event_settlement_id: f.event_settlement_id,
          kind: "bp" as const,
          type: "expense" as const,
          amount: f.amount,
          iva_rate: f.iva_rate,
        })),
    ];

    const moneyByPartner: Record<string, EngineParticipantMoney> = {};
    const bumpMoney = (key: string) => {
      moneyByPartner[key] = moneyByPartner[key] ?? {
        paidByPartner: 0,
        paidByPartnerGross: 0,
        extras: 0,
        extrasGross: 0,
      };
      return moneyByPartner[key];
    };
    (paidExpenses as any[]).forEach((pe) => {
      if (!pe.partner_id || pe.transactions?.is_transitory) return;
      const m = bumpMoney(pe.partner_id);
      const net = Number(pe.transactions?.amount || 0);
      m.paidByPartner! += net;
      m.paidByPartnerGross! += calcTotalWithIva(net, Number(pe.transactions?.iva_rate || 0));
    });
    (extras as any[]).forEach((ex) => {
      const m = bumpMoney(ex.partner_id);
      const net = Number(ex.amount || 0);
      m.extras! += net;
      // Extras manuais não têm IVA por definição — só a origem 'transacao' o tem.
      m.extrasGross! += ex.origem === "transacao" ? calcTotalWithIva(net, Number(ex.iva_rate || 0)) : net;
    });

    const engineParticipants: EngineParticipant[] = (participants as any[]).map((p) => ({
      id: p.id,
      settlement_id: p.settlement_id,
      participant_kind: p.participant_kind,
      name: p.participant_kind === "house" ? HOUSE_PARTNER_NAME : (p.supplier?.name ?? "—"),
      supplier_id: p.supplier_id ?? null,
      event_partner_id: p.event_partner_id ?? null,
      mode: p.mode,
      profit_pct: p.profit_pct,
      loss_pct: p.loss_pct,
      expense_includes_iva: p.expense_includes_iva,
    }));

    return computeSettlementEngine({
      eventBasis: normalizePartnerCalcBasis(event?.partner_calc_basis),
      eventTotals: {
        revenueNet: totals.revenueNet,
        expensesNet: totals.expensesNet,
        expensesGross: totals.expensesGross,
      },
      settlements: settlements as any,
      participants: engineParticipants,
      markedLines,
      moneyByPartner,
    });
  }, [
    settlements,
    participants,
    events,
    eventId,
    transactions,
    forecasts,
    ticketSales,
    paidExpenses,
    extras,
    basis.includeOverhead,
    basis.expenseSource,
    event?.partner_calc_basis,
  ]);

  return { result, isLoading, basis, participants, settlements };
}
