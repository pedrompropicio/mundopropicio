import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { AlertCircle, CheckCircle2, Store, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  officeId: string;
  officeName: string;
  financialAccountId: string | null;
}

export function TicketOfficeBalancePanel({ officeId, officeName, financialAccountId }: Props) {
  // Get all assignments for this office
  const { data: assignments = [] } = useQuery({
    queryKey: ["ticket_office_assignments", officeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_office_assignments")
        .select("*, events(id, name, status)")
        .eq("ticket_office_id", officeId);
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
      // Get zones for these events
      const { data: zones, error: zErr } = await supabase
        .from("event_ticket_zones")
        .select("id, event_id")
        .in("event_id", eventIds);
      if (zErr) throw zErr;
      if (!zones || zones.length === 0) return [];

      const zoneIds = zones.map((z: any) => z.id);
      const { data: sales, error: sErr } = await supabase
        .from("ticket_sales")
        .select("zone_id, quantity, unit_price, ticket_office_id")
        .in("zone_id", zoneIds);
      if (sErr) throw sErr;

      // Enrich with event_id
      const zoneEventMap = Object.fromEntries(zones.map((z: any) => [z.id, z.event_id]));
      return (sales || []).map((s: any) => ({
        ...s,
        event_id: zoneEventMap[s.zone_id],
      }));
    },
  });

  // Get transactions on the financial account (transfers out, direct expenses)
  const { data: accountTxns = [] } = useQuery({
    queryKey: ["ticket_office_account_txns", financialAccountId],
    enabled: !!financialAccountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("type, amount, event_id, description")
        .eq("account_id", financialAccountId!);
      if (error) throw error;
      return data;
    },
  });

  const summary = useMemo(() => {
    // Per-event breakdown
    const eventMap: Record<string, { name: string; status: string; sales: number; directExpenses: number; isConciliated: boolean }> = {};
    assignments.forEach((a: any) => {
      if (a.events) {
        eventMap[a.event_id] = {
          name: a.events.name,
          status: a.events.status,
          sales: 0,
          directExpenses: 0,
          isConciliated: a.is_conciliated,
        };
      }
    });

    // Sum sales per event (only from this office)
    ticketSales
      .filter((s: any) => !s.ticket_office_id || s.ticket_office_id === officeId)
      .forEach((s: any) => {
        if (eventMap[s.event_id]) {
          eventMap[s.event_id].sales += s.quantity * Number(s.unit_price);
        }
      });

    // Sum direct expenses per event from account
    accountTxns.forEach((t: any) => {
      if (t.type === "expense" && t.event_id && eventMap[t.event_id]) {
        eventMap[t.event_id].directExpenses += Number(t.amount);
      }
    });

    // Total transfers out (expenses without event_id or category 10.3)
    const totalTransfersOut = accountTxns
      .filter((t: any) => t.type === "expense" && !t.event_id)
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    // Income on the account (transfers in - shouldn't normally happen but just in case)
    const totalIncome = accountTxns
      .filter((t: any) => t.type === "income")
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    const totalSales = Object.values(eventMap).reduce((s, e) => s + e.sales, 0);
    const totalDirectExpenses = Object.values(eventMap).reduce((s, e) => s + e.directExpenses, 0);
    const globalBalance = totalSales - totalDirectExpenses - totalTransfersOut + totalIncome;

    const activeEvents = Object.values(eventMap).filter((e) => e.status !== "completed");
    const hasInconsistency = activeEvents.length === 0 && Math.abs(globalBalance) > 0.01;

    return {
      events: Object.entries(eventMap).map(([id, data]) => ({ id, ...data, balance: data.sales - data.directExpenses })),
      totalSales,
      totalDirectExpenses,
      totalTransfersOut,
      globalBalance,
      hasInconsistency,
    };
  }, [assignments, ticketSales, accountTxns, officeId]);

  if (assignments.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-muted-foreground">
        Sem eventos associados
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Global summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-secondary/40 p-2 text-center">
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3" /> Vendas</p>
          <p className="text-sm font-mono font-semibold text-emerald-500">{formatCurrency(summary.totalSales)}</p>
        </div>
        <div className="rounded-lg bg-secondary/40 p-2 text-center">
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><TrendingDown className="h-3 w-3" /> Desp. Diretas</p>
          <p className="text-sm font-mono font-semibold text-amber-500">{formatCurrency(summary.totalDirectExpenses)}</p>
        </div>
        <div className="rounded-lg bg-secondary/40 p-2 text-center">
          <p className="text-[10px] text-muted-foreground">Transferências</p>
          <p className="text-sm font-mono font-semibold">{formatCurrency(summary.totalTransfersOut)}</p>
        </div>
      </div>

      {/* Global balance */}
      <div className={`rounded-lg p-3 text-center ${summary.hasInconsistency ? "bg-destructive/10 border border-destructive/30" : "bg-secondary/40"}`}>
        <p className="text-xs text-muted-foreground">Saldo Disponível na Bilheteira</p>
        <p className={`text-lg font-mono font-bold ${summary.globalBalance >= 0 ? "text-emerald-500" : "text-red-400"}`}>
          {formatCurrency(summary.globalBalance)}
        </p>
        {summary.hasInconsistency && (
          <p className="flex items-center justify-center gap-1 text-[10px] text-destructive mt-1">
            <AlertCircle className="h-3 w-3" /> Sem eventos em venda — saldo deveria ser zero
          </p>
        )}
      </div>

      {/* Per-event breakdown */}
      {summary.events.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Saldo por Evento</h4>
          <div className="space-y-1">
            {summary.events.map((ev) => (
              <Link
                key={ev.id}
                to={`/eventos/${ev.id}`}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/30 transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs truncate">{ev.name}</span>
                  {ev.isConciliated && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-medium ${ev.balance > 0 ? "text-emerald-500" : ev.balance < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                    {formatCurrency(ev.balance)}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
