import { useMemo } from "react";
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  Ticket,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Activity,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { Progress } from "@/components/ui/progress";

export default function Dashboard() {
  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["dashboard_events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [], isLoading: loadingTxns } = useQuery({
    queryKey: ["dashboard_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, events(name)")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketSales = [] } = useQuery({
    queryKey: ["dashboard_ticket_sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("*, event_ticket_zones(event_id)");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketZones = [] } = useQuery({
    queryKey: ["dashboard_ticket_zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("event_id, total_capacity");
      if (error) throw error;
      return data;
    },
  });

  const { data: forecasts = [] } = useQuery({
    queryKey: ["dashboard_forecasts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  const isLoading = loadingEvents || loadingTxns;

  const computed = useMemo(() => {
    // Capacity per event from ticket zones
    const capacityMap: Record<string, number> = {};
    ticketZones.forEach((z: any) => {
      capacityMap[z.event_id] = (capacityMap[z.event_id] || 0) + z.total_capacity;
    });

    // Ticket sales per event
    const salesMap: Record<string, { qty: number; revenue: number }> = {};
    ticketSales.forEach((ts: any) => {
      const eventId = ts.event_ticket_zones?.event_id;
      if (!eventId) return;
      if (!salesMap[eventId]) salesMap[eventId] = { qty: 0, revenue: 0 };
      salesMap[eventId].qty += Number(ts.quantity);
      salesMap[eventId].revenue += Number(ts.quantity) * Number(ts.unit_price);
    });

    // Transactions per event
    const txnMap: Record<string, { income: number; expense: number }> = {};
    transactions.forEach((t) => {
      if (!t.event_id) return;
      if (!txnMap[t.event_id]) txnMap[t.event_id] = { income: 0, expense: 0 };
      if (t.type === "income") txnMap[t.event_id].income += Number(t.amount);
      else txnMap[t.event_id].expense += Number(t.amount);
    });

    // Forecasts per event
    const forecastMap: Record<string, { income: number; expense: number }> = {};
    forecasts.forEach((f: any) => {
      if (!forecastMap[f.event_id]) forecastMap[f.event_id] = { income: 0, expense: 0 };
      if (f.type === "income") forecastMap[f.event_id].income += Number(f.amount);
      else forecastMap[f.event_id].expense += Number(f.amount);
    });

    const currentYear = new Date().getFullYear();

    const planning = events
      .filter((e) => e.status === "planning")
      .map((e) => ({
        ...e,
        capacity: capacityMap[e.id] || e.tickets_total || 0,
        forecastIncome: forecastMap[e.id]?.income ?? 0,
        forecastExpense: forecastMap[e.id]?.expense ?? 0,
      }));

    const active = events
      .filter((e) => e.status === "active" || e.status === "confirmed")
      .map((e) => {
        const capacity = capacityMap[e.id] || e.tickets_total || 0;
        const sold = salesMap[e.id]?.qty ?? 0;
        const ticketRevenue = salesMap[e.id]?.revenue ?? 0;
        const txnIncome = txnMap[e.id]?.income ?? 0;
        const txnExpense = txnMap[e.id]?.expense ?? 0;
        return {
          ...e,
          capacity,
          sold,
          ticketRevenue,
          totalIncome: txnIncome + ticketRevenue,
          totalExpense: txnExpense,
          salesPercent: capacity > 0 ? (sold / capacity) * 100 : 0,
        };
      });

    const completed = events
      .filter((e) => e.status === "completed")
      .map((e) => {
        const ticketRevenue = salesMap[e.id]?.revenue ?? 0;
        const txnIncome = txnMap[e.id]?.income ?? 0;
        const txnExpense = txnMap[e.id]?.expense ?? 0;
        const totalIncome = txnIncome + ticketRevenue;
        return {
          ...e,
          totalIncome,
          totalExpense: txnExpense,
          result: totalIncome - txnExpense,
        };
      })
      .filter((e) => new Date(e.date).getFullYear() === currentYear);

    const yearAccum = {
      income: completed.reduce((s, e) => s + e.totalIncome, 0),
      expense: completed.reduce((s, e) => s + e.totalExpense, 0),
      result: completed.reduce((s, e) => s + e.result, 0),
    };

    return { planning, active, completed, yearAccum };
  }, [events, transactions, ticketSales, ticketZones, forecasts]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl flex items-center gap-2">
            Dashboard <HelpTooltip text={helpTexts.dashboard} />
          </h1>
        </div>
        <p className="py-8 text-center text-muted-foreground">A carregar dados…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl flex items-center gap-2">
          Dashboard <HelpTooltip text={helpTexts.dashboard} />
        </h1>
        <p className="text-sm text-muted-foreground">Visão executiva dos eventos</p>
      </div>

      {/* --- PLANNING --- */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="h-5 w-5 text-warning" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Em Planeamento ({computed.planning.length})
          </h2>
        </div>
        {computed.planning.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Sem eventos em planeamento.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {computed.planning.map((event) => (
              <Link
                key={event.id}
                to={`/eventos/${event.id}`}
                className="glass rounded-xl p-4 border border-warning/20 transition-colors hover:bg-secondary/40"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{event.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(event.date)}
                    </p>
                  </div>
                  <EventStatusBadge status={event.status as any} />
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                  {event.capacity > 0 && (
                    <span className="flex items-center gap-1">
                      <Ticket className="h-3 w-3" />
                      {event.capacity.toLocaleString()} lugares
                    </span>
                  )}
                  {event.forecastExpense > 0 && (
                    <span>BP: {formatCurrency(event.forecastExpense)}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* --- ACTIVE --- */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Eventos Ativos ({computed.active.length})
          </h2>
        </div>
        {computed.active.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Sem eventos ativos.</p>
        ) : (
          <div className="space-y-3">
            {computed.active.map((event) => (
              <Link
                key={event.id}
                to={`/eventos/${event.id}`}
                className="glass rounded-xl p-4 border border-primary/20 block transition-colors hover:bg-secondary/40"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{event.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(event.date)}
                    </p>
                  </div>
                  <EventStatusBadge status={event.status as any} />
                </div>

                {/* Ticket sales progress */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Ticket className="h-3 w-3" /> Vendas de Bilhetes
                    </span>
                    <span className="font-medium">
                      {event.sold.toLocaleString()} / {event.capacity.toLocaleString()}
                      <span className="text-muted-foreground ml-1">
                        ({event.salesPercent.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                  <Progress value={Math.min(event.salesPercent, 100)} className="h-2.5" />
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <TrendingUp className="h-3 w-3 text-success" />
                      Receita Bilheteira
                    </span>
                    <span className="font-mono font-semibold text-success">
                      {formatCurrency(event.ticketRevenue)}
                    </span>
                  </div>
                </div>

                {/* Financials summary */}
                {(event.totalIncome > 0 || event.totalExpense > 0) && (
                  <div className="flex items-center gap-4 text-xs mt-3 pt-2 border-t border-border/30">
                    <span>
                      <span className="text-muted-foreground">Receitas: </span>
                      <span className="font-mono font-medium text-success">{formatCurrency(event.totalIncome)}</span>
                    </span>
                    <span>
                      <span className="text-muted-foreground">Despesas: </span>
                      <span className="font-mono font-medium text-warning">{formatCurrency(event.totalExpense)}</span>
                    </span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* --- COMPLETED --- */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Concluídos {new Date().getFullYear()} ({computed.completed.length})
          </h2>
        </div>
        {computed.completed.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Sem eventos concluídos este ano.</p>
        ) : (
          <>
            <div className="overflow-x-auto glass rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="p-3 text-left font-medium">Evento</th>
                    <th className="p-3 text-left font-medium hidden sm:table-cell">Data</th>
                    <th className="p-3 text-right font-medium">Receitas</th>
                    <th className="p-3 text-right font-medium">Despesas</th>
                    <th className="p-3 text-right font-medium">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {computed.completed.map((event) => (
                    <tr key={event.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <Link to={`/eventos/${event.id}`} className="font-medium hover:text-primary transition-colors">
                          {event.name}
                        </Link>
                        <p className="text-xs text-muted-foreground sm:hidden">{formatDate(event.date)}</p>
                      </td>
                      <td className="p-3 text-muted-foreground hidden sm:table-cell">{formatDate(event.date)}</td>
                      <td className="p-3 text-right font-mono text-success">{formatCurrency(event.totalIncome)}</td>
                      <td className="p-3 text-right font-mono text-warning">{formatCurrency(event.totalExpense)}</td>
                      <td className={`p-3 text-right font-mono font-semibold ${event.result >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(event.result)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border/60 bg-muted/20 font-semibold text-xs uppercase">
                    <td className="p-3" colSpan={2}>Acumulado {new Date().getFullYear()}</td>
                    <td className="p-3 text-right font-mono text-success">{formatCurrency(computed.yearAccum.income)}</td>
                    <td className="p-3 text-right font-mono text-warning">{formatCurrency(computed.yearAccum.expense)}</td>
                    <td className={`p-3 text-right font-mono ${computed.yearAccum.result >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(computed.yearAccum.result)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
