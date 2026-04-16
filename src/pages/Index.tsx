import { useMemo } from "react";
import {
  Calendar,
  TrendingUp,
  Ticket,
  CheckCircle2,
  ClipboardList,
  Activity,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { ResultsAnalysis } from "@/components/ResultsAnalysis";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { useAuth } from "@/contexts/AuthContext";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { Progress } from "@/components/ui/progress";

interface EnrichedEvent {
  id: string;
  name: string;
  date: string;
  status: string;
  parent_event_id: string | null;
  event_type: string;
  tickets_total: number;
  [key: string]: any;
}

interface ComputedEvent extends EnrichedEvent {
  capacity: number;
  sold: number;
  ticketRevenue: number;
  totalIncome: number;
  totalExpense: number;
  salesPercent: number;
  forecastIncome: number;
  forecastExpense: number;
  result: number;
  isParent: boolean;
  isChild: boolean;
  childCount?: number;
}

function enrichEvent(
  e: EnrichedEvent,
  capacityMap: Record<string, number>,
  salesMap: Record<string, { qty: number; revenue: number }>,
  txnMap: Record<string, { income: number; expense: number }>,
  forecastMap: Record<string, { income: number; expense: number }>,
): ComputedEvent {
  const capacity = capacityMap[e.id] || e.tickets_total || 0;
  const sold = salesMap[e.id]?.qty ?? 0;
  const ticketRevenue = salesMap[e.id]?.revenue ?? 0;
  const txnIncome = txnMap[e.id]?.income ?? 0;
  const txnExpense = txnMap[e.id]?.expense ?? 0;
  // If ticket sales exist, use them as revenue; otherwise fall back to transactions (avoid double-counting)
  const totalIncome = ticketRevenue > 0 ? ticketRevenue : txnIncome;
  return {
    ...e,
    capacity,
    sold,
    ticketRevenue,
    totalIncome,
    totalExpense: txnExpense,
    salesPercent: capacity > 0 ? (sold / capacity) * 100 : 0,
    forecastIncome: forecastMap[e.id]?.income ?? 0,
    forecastExpense: forecastMap[e.id]?.expense ?? 0,
    result: totalIncome - txnExpense,
    isParent: false,
    isChild: false,
  };
}

/** Group events: parent first (aggregating children), then children sorted by date */
function groupWithParents(items: ComputedEvent[], allEvents: EnrichedEvent[]): ComputedEvent[] {
  // Find parent IDs that have children in this list
  const childrenByParent: Record<string, ComputedEvent[]> = {};
  const standalone: ComputedEvent[] = [];
  const parentIds = new Set<string>();

  items.forEach((item) => {
    if (item.parent_event_id) {
      parentIds.add(item.parent_event_id);
      if (!childrenByParent[item.parent_event_id]) childrenByParent[item.parent_event_id] = [];
      childrenByParent[item.parent_event_id].push({ ...item, isChild: true });
    } else if (item.event_type === "multi_day") {
      // It's a parent event in the list already
      parentIds.add(item.id);
    } else {
      standalone.push(item);
    }
  });

  const result: ComputedEvent[] = [];

  // Process each parent
  parentIds.forEach((parentId) => {
    const children = childrenByParent[parentId] || [];
    // Find parent event data (may or may not be in items list)
    const parentInList = items.find((i) => i.id === parentId && !i.parent_event_id);
    const parentRaw = allEvents.find((e) => e.id === parentId);
    
    if (!parentRaw && !parentInList) return;

    // Aggregate children data into parent
    const aggCapacity = children.reduce((s, c) => s + c.capacity, 0);
    const aggSold = children.reduce((s, c) => s + c.sold, 0);
    const aggTicketRevenue = children.reduce((s, c) => s + c.ticketRevenue, 0);
    const aggIncome = children.reduce((s, c) => s + c.totalIncome, 0);
    const aggExpense = children.reduce((s, c) => s + c.totalExpense, 0);
    const aggForecastIncome = children.reduce((s, c) => s + c.forecastIncome, 0);
    const aggForecastExpense = children.reduce((s, c) => s + c.forecastExpense, 0);

    // If the parent itself has own data (from parentInList), add it
    const ownIncome = parentInList ? parentInList.totalIncome : 0;
    const ownExpense = parentInList ? parentInList.totalExpense : 0;
    const ownCapacity = parentInList ? parentInList.capacity : 0;
    const ownSold = parentInList ? parentInList.sold : 0;
    const ownTicketRevenue = parentInList ? parentInList.ticketRevenue : 0;
    const ownForecastIncome = parentInList ? parentInList.forecastIncome : 0;
    const ownForecastExpense = parentInList ? parentInList.forecastExpense : 0;

    const totalCapacity = aggCapacity + ownCapacity;
    const totalSold = aggSold + ownSold;
    const totalTicketRevenue = aggTicketRevenue + ownTicketRevenue;
    const totalIncome = aggIncome + ownIncome;
    const totalExpense = aggExpense + ownExpense;

    const base = parentInList || parentRaw!;
    const parentComputed: ComputedEvent = {
      ...base,
      capacity: totalCapacity,
      sold: totalSold,
      ticketRevenue: totalTicketRevenue,
      totalIncome,
      totalExpense,
      salesPercent: totalCapacity > 0 ? (totalSold / totalCapacity) * 100 : 0,
      forecastIncome: aggForecastIncome + ownForecastIncome,
      forecastExpense: aggForecastExpense + ownForecastExpense,
      result: totalIncome - totalExpense,
      isParent: true,
      isChild: false,
      childCount: children.length,
    };

    result.push(parentComputed);
    // Sort children by date
    children.sort((a, b) => a.date.localeCompare(b.date));
    result.push(...children);
  });

  // Add standalone events
  result.push(...standalone);

  return result;
}

export default function Dashboard() {
  const { isAdmin, isManager } = useAuth();
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
    const capacityMap: Record<string, number> = {};
    ticketZones.forEach((z: any) => {
      capacityMap[z.event_id] = (capacityMap[z.event_id] || 0) + z.total_capacity;
    });

    const salesMap: Record<string, { qty: number; revenue: number }> = {};
    ticketSales.forEach((ts: any) => {
      const eventId = ts.event_ticket_zones?.event_id;
      if (!eventId) return;
      if (!salesMap[eventId]) salesMap[eventId] = { qty: 0, revenue: 0 };
      salesMap[eventId].qty += Number(ts.quantity);
      salesMap[eventId].revenue += Number(ts.quantity) * Number(ts.unit_price);
    });

    const txnMap: Record<string, { income: number; expense: number }> = {};
    transactions.forEach((t) => {
      if (!t.event_id) return;
      if (!txnMap[t.event_id]) txnMap[t.event_id] = { income: 0, expense: 0 };
      if (t.type === "income") txnMap[t.event_id].income += Number(t.amount);
      else txnMap[t.event_id].expense += Number(t.amount);
    });

    const forecastMap: Record<string, { income: number; expense: number }> = {};
    forecasts.forEach((f: any) => {
      if (!forecastMap[f.event_id]) forecastMap[f.event_id] = { income: 0, expense: 0 };
      if (f.type === "income") forecastMap[f.event_id].income += Number(f.amount);
      else forecastMap[f.event_id].expense += Number(f.amount);
    });

    const currentYear = new Date().getFullYear();

    const allEnriched = events.map((e) => enrichEvent(e, capacityMap, salesMap, txnMap, forecastMap));

    const planningRaw = allEnriched.filter((e) => e.status === "planning");
    const planning = groupWithParents(planningRaw, events);

    const activeRaw = allEnriched.filter((e) => e.status === "active" || e.status === "confirmed");
    const active = groupWithParents(activeRaw, events);

    const completedRaw = allEnriched
      .filter((e) => e.status === "completed")
      .filter((e) => new Date(e.date).getFullYear() === currentYear);
    const completed = groupWithParents(completedRaw, events);

    // Year accumulator: only count children (or standalone), not parent aggregates to avoid double counting
    const completedLeaves = completed.filter((e) => !e.isParent);
    const yearAccum = {
      income: completedLeaves.reduce((s, e) => s + e.totalIncome, 0),
      expense: completedLeaves.reduce((s, e) => s + e.totalExpense, 0),
      result: completedLeaves.reduce((s, e) => s + e.result, 0),
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
            Em Planeamento ({computed.planning.filter((e) => !e.isChild).length})
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
                className={`glass rounded-xl p-4 transition-colors hover:bg-secondary/40 ${
                  event.isParent
                    ? "border-2 border-warning/40 bg-warning/5 col-span-full"
                    : event.isChild
                    ? "border border-warning/10 ml-4 sm:ml-6"
                    : "border border-warning/20"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex items-center gap-2">
                    {event.isChild && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className={`truncate text-sm ${event.isParent ? "font-bold" : "font-semibold"}`}>
                        {event.name}
                        {event.isParent && event.childCount ? (
                          <span className="text-xs font-normal text-muted-foreground ml-2">
                            ({event.childCount} cidade{event.childCount > 1 ? "s" : ""})
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(event.date)}
                      </p>
                    </div>
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
            Eventos Ativos ({computed.active.filter((e) => !e.isChild).length})
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
                className={`glass rounded-xl p-4 block transition-colors hover:bg-secondary/40 ${
                  event.isParent
                    ? "border-2 border-primary/40 bg-primary/5"
                    : event.isChild
                    ? "border border-primary/10 ml-6 lg:ml-10"
                    : "border border-primary/20"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0 flex items-center gap-2">
                    {event.isChild && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className={`truncate text-sm ${event.isParent ? "font-bold text-base" : "font-semibold"}`}>
                        {event.name}
                        {event.isParent && event.childCount ? (
                          <span className="text-xs font-normal text-muted-foreground ml-2">
                            ({event.childCount} cidade{event.childCount > 1 ? "s" : ""})
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(event.date)}
                        {event.isParent && <span className="ml-1 text-primary font-medium">· Turnê</span>}
                      </p>
                    </div>
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
            Concluídos {new Date().getFullYear()} ({computed.completed.filter((e) => !e.isChild).length})
          </h2>
        </div>
        {computed.completed.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Sem eventos concluídos este ano.</p>
        ) : (
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
                  <tr
                    key={event.id}
                    className={`transition-colors ${
                      event.isParent
                        ? "bg-muted/30 font-semibold"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    <td className="p-3">
                      <div className={`flex items-center gap-1.5 ${event.isChild ? "pl-4 sm:pl-6" : ""}`}>
                        {event.isChild && (
                          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        <div>
                          <Link
                            to={`/eventos/${event.id}`}
                            className={`hover:text-primary transition-colors ${
                              event.isParent ? "font-bold" : "font-medium"
                            }`}
                          >
                            {event.name}
                            {event.isParent && event.childCount ? (
                              <span className="text-xs font-normal text-muted-foreground ml-2">
                                ({event.childCount} cidade{event.childCount > 1 ? "s" : ""})
                              </span>
                            ) : null}
                          </Link>
                          <p className="text-xs text-muted-foreground sm:hidden">{formatDate(event.date)}</p>
                        </div>
                      </div>
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
        )}
      </section>

      {/* --- RESULTS ANALYSIS --- */}
      {(isAdmin || isManager) && <ResultsAnalysis />}
    </div>
  );
}
