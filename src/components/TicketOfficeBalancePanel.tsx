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
  const { data: ticketSales = [] } = useQuery({
    queryKey: ["ticket_sales_for_office", officeId, eventIds],
    enabled: eventIds.length > 0,
    queryFn: async () => {
      const { data: zones, error: zErr } = await supabase
        .from("event_ticket_zones")
        .select("id, event_id")
        .in("event_id", eventIds);
      if (zErr) throw zErr;
      if (!zones || zones.length === 0) return [];

      const zoneIds = zones.map((z: any) => z.id);
      const { data: sales, error: sErr } = await supabase
        .from("ticket_sales")
        .select("zone_id, quantity, unit_price, total_value, financial_account_id")
        .in("zone_id", zoneIds);
      if (sErr) throw sErr;

      const zoneEventMap = Object.fromEntries(zones.map((z: any) => [z.id, z.event_id]));
      return (sales || []).map((s: any) => ({
        ...s,
        event_id: zoneEventMap[s.zone_id],
      }));
    },
  });

  // Get transactions on the financial account
  const { data: accountTxns = [] } = useQuery({
    queryKey: ["ticket_office_account_txns", officeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("account_id, type, amount, paid_amount, status, event_id, description, reversed_at, is_hidden")
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
      if (t.type === "expense" && t.event_id && eventMap[t.event_id]) {
        eventMap[t.event_id].directExpenses += Number(t.paid_amount || 0);
      }
    });

    pendingAdvances.forEach((a: any) => {
      if (isOpenTicketOfficeAdvance(a) && eventMap[a.event_id]) {
        eventMap[a.event_id].advances += Number(a.amount || 0);
      }
    });

    const totalTransfersOut = accountTxns
      .filter((t: any) => isCountedTicketOfficeTxn(t, officeId) && (t.type === "transfer" || (t.type === "expense" && !t.event_id)))
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
    if (retentionPct != null && Number.isFinite(retentionPct)) {
      const openSales = Object.entries(eventMap)
        .filter(([id]) => !settledEventIds.has(id))
        .reduce((s, [, e]) => s + e.sales, 0);
      expectedBalance = (retentionPct / 100) * openSales;
      deviation = globalBalance - expectedBalance;
      deviationWarn = Math.abs(deviation) > Math.abs(expectedBalance) * 0.05;
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
          Vendas − despesas diretas − transferências (adiantamentos já saíram)
        </p>
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
