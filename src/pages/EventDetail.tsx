import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, TrendingUp, TrendingDown, Wallet, Ticket, CheckCircle2, RotateCcw, Calendar, Layers, Route } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { StatCard } from "@/components/StatCard";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { EventForecast } from "@/components/EventForecast";
import { EventTicketing } from "@/components/EventTicketing";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

const PIE_COLORS = [
  "hsl(262 80% 60%)",
  "hsl(170 70% 45%)",
  "hsl(38 90% 55%)",
  "hsl(0 72% 55%)",
  "hsl(210 70% 55%)",
  "hsl(300 60% 55%)",
];

const eventTypeLabels: Record<string, string> = {
  simple: "Evento Simples",
  festival: "Festival",
  multi_day: "Múltiplos Dias / Turnê",
};

export default function EventDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSubEvent, setSelectedSubEvent] = useState<string | null>(null);

  const { data: event, isLoading: loadingEvent } = useQuery({
    queryKey: ["event_detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const eventType = event?.event_type || "simple";

  // Fetch sub-events for multi-day
  const { data: subEvents = [] } = useQuery({
    queryKey: ["sub_events", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("parent_event_id" as any, id!)
        .order("date", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id && eventType === "multi_day",
  });

  // Fetch festival dates
  const { data: festivalDates = [] } = useQuery({
    queryKey: ["festival_dates", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_dates" as any)
        .select("*")
        .eq("event_id", id!)
        .order("date", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id && eventType === "festival",
  });

  // Determine which event IDs to use for transactions
  const allEventIds = eventType === "multi_day" && !selectedSubEvent
    ? [id!, ...subEvents.map((s: any) => s.id)]
    : selectedSubEvent
      ? [selectedSubEvent]
      : [id!];

  const { data: eventTransactions = [] } = useQuery({
    queryKey: ["event_transactions", id, selectedSubEvent, subEvents.map((s: any) => s.id).join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, account_categories(code, name)")
        .in("event_id", allEventIds)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const changeStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("events")
        .update({ status: newStatus })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: (_, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ["event_detail", id] });
      queryClient.invalidateQueries({ queryKey: ["events_full"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({ title: newStatus === "completed" ? "Evento concluído!" : "Evento reativado!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  if (loadingEvent) {
    return <p className="py-20 text-center text-muted-foreground">A carregar evento…</p>;
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p>Evento não encontrado.</p>
        <Link to="/eventos" className="mt-2 text-primary hover:underline">Voltar</Link>
      </div>
    );
  }

  const isCompleted = event.status === "completed";

  const incomeTransactions = eventTransactions.filter((t) => t.type === "income");
  const expenseTransactions = eventTransactions.filter((t) => t.type === "expense");
  const totalIncome = incomeTransactions.reduce((s, t) => s + Number(t.amount), 0);
  const totalExpenses = expenseTransactions.reduce((s, t) => s + Number(t.amount), 0);
  const profit = totalIncome - totalExpenses;

  // For multi-day with shared costs (parent transactions), calculate proration
  const isGlobalView = eventType === "multi_day" && !selectedSubEvent;
  const subEventCount = subEvents.length || 1;

  // Pie data by category
  const expenseByCategory = expenseTransactions.reduce<Record<string, { name: string; value: number }>>((acc, t) => {
    const catName = t.account_categories ? `${t.account_categories.code} - ${t.account_categories.name}` : "Sem categoria";
    if (!acc[catName]) acc[catName] = { name: catName, value: 0 };
    acc[catName].value += Number(t.amount);
    return acc;
  }, {});
  const pieData = Object.values(expenseByCategory);

  const statusLabels: Record<string, string> = {
    pending: "Aguardando",
    approved: "A Pagar",
    paid: "Pago",
    overdue: "Atrasado",
  };

  const EventTypeIcon = eventType === "festival" ? Layers : eventType === "multi_day" ? Route : Calendar;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/eventos" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" /> Voltar aos eventos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">{event.name}</h1>
          <EventStatusBadge status={event.status as any} />
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <EventTypeIcon className="h-3 w-3" />
            {eventTypeLabels[eventType]}
          </span>
          <div className="ml-auto flex gap-2">
            {isAdmin && event.status === "active" && (
              <button
                onClick={() => {
                  if (confirm("Concluir este evento? As transações ficarão bloqueadas para alterações.")) {
                    changeStatusMutation.mutate("completed");
                  }
                }}
                disabled={changeStatusMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Concluir Evento
              </button>
            )}
            {isAdmin && isCompleted && (
              <button
                onClick={() => {
                  if (confirm("Reativar este evento? As transações voltarão a poder ser alteradas.")) {
                    changeStatusMutation.mutate("active");
                  }
                }}
                disabled={changeStatusMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-warning/15 text-warning hover:bg-warning/25 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reativar Evento
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{event.location} · {formatDate(event.date)}</p>

        {/* Festival dates display */}
        {eventType === "festival" && festivalDates.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-full bg-purple-500/15 text-purple-400 px-2.5 py-0.5 text-xs font-medium">
              {formatDate(event.date)}
            </span>
            {festivalDates.map((fd: any) => (
              <span key={fd.id} className="inline-flex items-center rounded-full bg-purple-500/15 text-purple-400 px-2.5 py-0.5 text-xs font-medium">
                {formatDate(fd.date)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Multi-day sub-event selector */}
      {eventType === "multi_day" && subEvents.length > 0 && (
        <div className="glass rounded-xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Datas da Turnê</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedSubEvent(null)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                !selectedSubEvent
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              Visão Global
            </button>
            {subEvents.map((sub: any) => (
              <button
                key={sub.id}
                onClick={() => setSelectedSubEvent(sub.id)}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                  selectedSubEvent === sub.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="block">{sub.name}</span>
                <span className="block text-[10px] opacity-70">{formatDate(sub.date)} {sub.location ? `· ${sub.location}` : ""}</span>
              </button>
            ))}
          </div>
          {isGlobalView && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              ℹ️ Transações do evento-pai são custos partilhados (rateio igual por {subEventCount} datas nos relatórios DRE/P&L).
            </p>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={isGlobalView ? "Receitas (Global)" : "Receitas"}
          value={formatCurrency(totalIncome)}
          icon={TrendingUp}
          variant="accent"
        />
        <StatCard
          title={isGlobalView ? "Despesas (Global)" : "Despesas"}
          value={formatCurrency(totalExpenses)}
          icon={TrendingDown}
          variant="warning"
        />
        <StatCard
          title="Lucro"
          value={formatCurrency(profit)}
          icon={Wallet}
          variant="primary"
          subtitle={totalIncome > 0 ? `Margem: ${((profit / totalIncome) * 100).toFixed(1)}%` : undefined}
        />
        <StatCard
          title="Bilhetes"
          value={`${event.tickets_sold.toLocaleString()}`}
          icon={Ticket}
          subtitle={event.tickets_total > 0 ? `de ${event.tickets_total.toLocaleString()} (${((event.tickets_sold / event.tickets_total) * 100).toFixed(0)}%)` : undefined}
        />
      </div>

      {/* Main tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Resumo</TabsTrigger>
          <TabsTrigger value="ticketing">Bilheteira</TabsTrigger>
          <TabsTrigger value="forecast">P&L Previsão</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {/* Pie chart + transactions */}
          <div className="grid gap-6 lg:grid-cols-5">
            {pieData.length > 0 && (
              <div className="glass rounded-xl p-5 lg:col-span-2">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Despesas por Categoria</h2>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(225 15% 10%)", border: "1px solid hsl(225 12% 16%)", borderRadius: 8, fontSize: 12 }} formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-1.5">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-muted-foreground">{d.name}</span>
                      </div>
                      <span className="font-mono font-medium">{formatCurrency(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transactions list */}
            <div className={`glass rounded-xl p-5 ${pieData.length > 0 ? "lg:col-span-3" : "lg:col-span-5"}`}>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {isGlobalView ? "Transações (Todas as Datas)" : "Transações do Evento"}
              </h2>
              {eventTransactions.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">Sem transações registadas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="pb-3 text-left font-medium">Descrição</th>
                        <th className="hidden pb-3 text-left font-medium sm:table-cell">Categoria</th>
                        {isGlobalView && <th className="hidden pb-3 text-left font-medium md:table-cell">Origem</th>}
                        <th className="pb-3 text-left font-medium">Estado</th>
                        <th className="pb-3 text-right font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {eventTransactions.map((t) => {
                        const isSharedCost = isGlobalView && t.event_id === id;
                        const subName = isGlobalView
                          ? t.event_id === id
                            ? "Rateio"
                            : subEvents.find((s: any) => s.id === t.event_id)?.name || "—"
                          : null;
                        return (
                          <tr key={t.id} className={isSharedCost ? "bg-amber-500/5" : ""}>
                            <td className="py-3 pr-4">
                              <p className="font-medium">{t.description}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                              {isSharedCost && (
                                <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-400 px-1.5 py-0.5 text-[10px] font-medium mt-0.5">
                                  Custo partilhado ({subEventCount} datas)
                                </span>
                              )}
                            </td>
                            <td className="hidden py-3 pr-4 text-muted-foreground sm:table-cell">
                              {t.account_categories ? `${t.account_categories.code} - ${t.account_categories.name}` : "—"}
                            </td>
                            {isGlobalView && (
                              <td className="hidden py-3 pr-4 text-xs text-muted-foreground md:table-cell">{subName}</td>
                            )}
                            <td className="py-3 pr-4">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                t.status === "paid" ? "bg-success/15 text-success" : t.status === "pending" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"
                              }`}>
                                {statusLabels[t.status] || t.status}
                              </span>
                            </td>
                            <td className={`py-3 text-right font-mono font-semibold ${t.type === "income" ? "text-success" : "text-warning"}`}>
                              {t.type === "income" ? "+" : "-"}{formatCurrency(Number(t.amount))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ticketing">
          <EventTicketing eventId={event.id} />
        </TabsContent>

        <TabsContent value="forecast">
          <EventForecast eventId={selectedSubEvent || event.id} eventDate={event.date} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
