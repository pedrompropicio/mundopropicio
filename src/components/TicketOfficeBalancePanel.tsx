import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { AlertCircle, CheckCircle2, Store, TrendingUp, TrendingDown, ArrowRight, Receipt, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { TicketOfficeSettlementModal } from "@/components/TicketOfficeSettlementModal";
import {
  computeTicketOfficeBalance,
  isCountedTicketOfficeTxn,
  isOpenTicketOfficeAdvance,
  INTERNAL_TRANSFER_CATEGORY_ID,
} from "@/lib/ticket-office-balance";
import { ticketSaleRevenue } from "@/lib/ticket-sales-revenue";


interface Props {
  officeId: string; // This is now the financial_account_id directly
  officeName: string;
}

export function TicketOfficeBalancePanel({ officeId, officeName }: Props) {
  const { isAdmin, hasPermission } = useAuth();
  const canManage = isAdmin || hasPermission("manage_accounts");
  const [settlementModal, setSettlementModal] = useState<{ open: boolean; eventId?: string }>({ open: false });

  // Get all assignments for this office (financial_account_id)
  const { data: assignments = [] } = useQuery({
    queryKey: ["ticket_office_assignments", officeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_office_assignments")
        .select("*, events(id, name, status)")
        .eq("financial_account_id", officeId);
      if (error) throw error;
      return data;
    },
  });

  // Get ticket sales for events assigned to this office
  const eventIds = assignments.map((a: any) => a.event_id);
  // Vendas somadas na base de dados (RPC get_ticket_office_sales) — o PostgREST corta
  // em 1.000 linhas e a Ticketline tem >4.000 registos (issue #129).
  const { data: ticketSales = [] } = useQuery({
    queryKey: ["ticket_office_sales_rpc", officeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_ticket_office_sales", {
        p_account_id: officeId,
      });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        event_id: r.event_id,
        financial_account_id: officeId,
        quantity: Number(r.quantity || 0),
        unit_price: 0,
        total_value: Number(r.revenue || 0),
      }));
    },
  });

  // Get transactions on the financial account
  const { data: accountTxns = [] } = useQuery({
    queryKey: ["ticket_office_account_txns", officeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("account_id, type, amount, paid_amount, status, event_id, description, reversed_at, is_hidden, category_id")
        .eq("account_id", officeId);
      if (error) throw error;
      return data;
    },
  });

  // Pending advances (already transferred to bank, will be deducted in event settlement)
  const { data: pendingAdvances = [] } = useQuery({
    queryKey: ["ticket_office_pending_advances", officeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("event_ticket_office_advances")
        .select("event_id, amount, transaction_id, settlement_id")
        .eq("financial_account_id", officeId)
        .is("settlement_id", null);
      if (error) throw error;
      return data || [];
    },
  });

  // Regra de retenção da bilheteira (opcional)
  const { data: office } = useQuery({
    queryKey: ["ticket_office_retention", officeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("financial_accounts")
        .select("id, advance_retention_pct")
        .eq("id", officeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fechos confirmados (para saber que eventos já foram fechados)
  const { data: confirmedSettlements = [] } = useQuery({
    queryKey: ["ticket_office_confirmed_settlements", officeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ticket_office_settlements")
        .select("event_id, status")
        .eq("financial_account_id", officeId)
        .eq("status", "confirmed");
      if (error) throw error;
      return data || [];
    },
  });

  const summary = useMemo(() => {
    const assignedEventIds = assignments.filter((a: any) => a.events).map((a: any) => a.event_id);
    const { total, byEvent } = computeTicketOfficeBalance({
      officeId,
      assignedEventIds,
      sales: ticketSales as any[],
      transactions: accountTxns as any[],
      advances: pendingAdvances as any[],
    });

    const eventMap: Record<string, { name: string; status: string; sales: number; directExpenses: number; advances: number; isConciliated: boolean }> = {};
    assignments.forEach((a: any) => {
      if (a.events) {
        eventMap[a.event_id] = {
          name: a.events.name,
          status: a.events.status,
          sales: 0,
          directExpenses: 0,
          advances: 0,
          isConciliated: a.is_conciliated,
        };
      }
    });

    ticketSales
      .filter((s: any) => s.financial_account_id === officeId)
      .forEach((s: any) => {
        if (eventMap[s.event_id]) {
          eventMap[s.event_id].sales += ticketSaleRevenue(s);
        }
      });

    accountTxns.forEach((t: any) => {
      if (!isCountedTicketOfficeTxn(t, officeId)) return;
      // A perna de saída da transferência do fecho é uma expense com event_id na
      // rubrica 10.3 — conta no tile "Transferências", NUNCA nas despesas diretas.
      if (
        t.type === "expense" &&
        t.category_id !== INTERNAL_TRANSFER_CATEGORY_ID &&
        t.event_id &&
        eventMap[t.event_id]
      ) {
        eventMap[t.event_id].directExpenses += Number(t.paid_amount || 0);
      }
    });

    pendingAdvances.forEach((a: any) => {
      if (isOpenTicketOfficeAdvance(a) && eventMap[a.event_id]) {
        eventMap[a.event_id].advances += Number(a.amount || 0);
      }
    });

    // Transferências são despesas na rubrica 10.3 (par expense + income) — não
    // existe transação de tipo 'transfer'. Indicador de leitura, fora da fórmula do saldo.
    const totalTransfersOut = accountTxns
      .filter(
        (t: any) =>
          isCountedTicketOfficeTxn(t, officeId) &&
          t.type === "expense" &&
          t.category_id === INTERNAL_TRANSFER_CATEGORY_ID,
      )
      .reduce((sum: number, t: any) => sum + Number(t.paid_amount || 0), 0);

    const totalSales = Object.values(eventMap).reduce((s, e) => s + e.sales, 0);
    const totalDirectExpenses = Object.values(eventMap).reduce((s, e) => s + e.directExpenses, 0);
    const totalAdvancesPending = Object.values(eventMap).reduce((s, e) => s + e.advances, 0);
    const globalBalance = total;

    const activeEvents = Object.values(eventMap).filter((e) => e.status !== "completed");
    const hasInconsistency = activeEvents.length === 0 && Math.abs(globalBalance) > 0.01;

    // Saldo esperado pela regra de retenção
    const retentionPct = office?.advance_retention_pct != null ? Number(office.advance_retention_pct) : null;
    const settledEventIds = new Set((confirmedSettlements as any[]).map((s: any) => s.event_id));
    let expectedBalance: number | null = null;
    let deviation: number | null = null;
    let deviationWarn = false;
    let deviationMsg = "";
    if (retentionPct != null && Number.isFinite(retentionPct)) {
      const openSales = Object.entries(eventMap)
        .filter(([id]) => !settledEventIds.has(id))
        .reduce((s, [, e]) => s + e.sales, 0);
      expectedBalance = (retentionPct / 100) * openSales;
      deviation = globalBalance - expectedBalance;
      if (Math.abs(expectedBalance) < 0.01) {
        deviationWarn = Math.abs(deviation) > 0.01;
        deviationMsg = "Sem eventos em aberto — o saldo devia estar a zero.";
      } else {
        deviationWarn = Math.abs(deviation) > Math.abs(expectedBalance) * 0.05;
        deviationMsg = "Desvio acima de 5% — vendas por importar ou repasse por lançar";
      }
    }


    return {
      events: Object.entries(eventMap).map(([id, data]) => ({
        id,
        ...data,
        balance: byEvent[id] ?? 0,
      })),
      totalSales,
      totalDirectExpenses,
      totalTransfersOut,
      totalAdvancesPending,
      globalBalance,
      hasInconsistency,
      retentionPct,
      expectedBalance,
      deviation,
      deviationWarn,
      deviationMsg,
    };
  }, [assignments, ticketSales, accountTxns, pendingAdvances, officeId, office, confirmedSettlements]);


  if (assignments.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-muted-foreground">
        Sem eventos associados
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-secondary/40 p-2 text-center">
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3" /> Vendas</p>
          <p className="text-sm font-mono font-semibold text-emerald-500">{formatCurrency(summary.totalSales)}</p>
        </div>
        <div className="rounded-lg bg-secondary/40 p-2 text-center">
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><TrendingDown className="h-3 w-3" /> Desp. Diretas</p>
          <p className="text-sm font-mono font-semibold text-amber-500">{formatCurrency(summary.totalDirectExpenses)}</p>
        </div>
        <div className="rounded-lg bg-secondary/40 p-2 text-center">
          <p className="text-[10px] text-muted-foreground">Adiantamentos</p>
          <p className="text-sm font-mono font-semibold text-amber-500">{formatCurrency(summary.totalAdvancesPending)}</p>
        </div>
        <div className="rounded-lg bg-secondary/40 p-2 text-center">
          <p className="text-[10px] text-muted-foreground">Transferências</p>
          <p className="text-sm font-mono font-semibold">{formatCurrency(summary.totalTransfersOut)}</p>
        </div>
      </div>

      <div className={`rounded-lg p-3 text-center ${summary.hasInconsistency ? "bg-destructive/10 border border-destructive/30" : "bg-secondary/40"}`}>
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">Retido na Bilheteira <HelpTooltip text={helpTexts.ticketOfficeBalance} size={12} /></p>
        <p className={`text-lg font-mono font-bold ${summary.globalBalance >= 0 ? "text-emerald-500" : "text-red-400"}`}>
          {formatCurrency(summary.globalBalance)}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Vendas − despesas − transferências − adiantamentos em aberto
        </p>
        {summary.retentionPct != null && (
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/40 pt-2">
            <div>
              <p className="text-[10px] text-muted-foreground">Saldo esperado ({summary.retentionPct}%)</p>
              <p className="text-sm font-mono font-semibold">{formatCurrency(summary.expectedBalance ?? 0)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Desvio</p>
              <p className={`text-sm font-mono font-semibold ${summary.deviationWarn ? "text-amber-500" : "text-muted-foreground"}`}>
                {formatCurrency(summary.deviation ?? 0)}
              </p>
            </div>
            {summary.deviationWarn && (
              <p className="col-span-2 flex items-center justify-center gap-1 text-[10px] text-amber-500">
                <AlertCircle className="h-3 w-3" /> {summary.deviationMsg}
              </p>
            )}
          </div>
        )}

        {summary.hasInconsistency && (
          <p className="flex items-center justify-center gap-1 text-[10px] text-destructive mt-1">
            <AlertCircle className="h-3 w-3" /> Sem eventos em venda — saldo deveria ser zero
          </p>
        )}
      </div>

      {summary.events.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo por Evento</h4>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2"
                onClick={() => setSettlementModal({ open: true })}
              >
                <Plus className="h-3 w-3 mr-1" /> Novo Fecho
              </Button>
            )}
          </div>
          <div className="space-y-1">
            {summary.events.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/30 transition-colors group"
              >
                <Link to={`/eventos/${ev.id}`} className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs truncate">{ev.name}</span>
                  {ev.isConciliated && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
                </Link>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-medium ${ev.balance > 0 ? "text-emerald-500" : ev.balance < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                    {formatCurrency(ev.balance)}
                  </span>
                  {canManage && Math.abs(ev.balance) > 0.01 && (
                    <button
                      onClick={() => setSettlementModal({ open: true, eventId: ev.id })}
                      className="rounded-md p-1 text-muted-foreground hover:bg-primary/15 hover:text-primary transition-colors"
                      title="Fechar evento nesta bilheteira"
                    >
                      <Receipt className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <Link to={`/eventos/${ev.id}`}>
                    <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {settlementModal.open && (
        <TicketOfficeSettlementModal
          open={settlementModal.open}
          onClose={() => setSettlementModal({ open: false })}
          officeId={officeId}
          officeName={officeName}
          defaultEventId={settlementModal.eventId}
        />
      )}
    </div>
  );
}
