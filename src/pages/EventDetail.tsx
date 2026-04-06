import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, TrendingUp, TrendingDown, Wallet, Ticket, CheckCircle2, RotateCcw, Calendar, Layers, Route, Pencil, Copy, Trash2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { StatCard } from "@/components/StatCard";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { EventForecast } from "@/components/EventForecast";
import { EventTicketing } from "@/components/EventTicketing";
import { EventCacheConfig } from "@/components/EventCacheConfig";
import { EventPartnersTab } from "@/components/EventPartnersTab";
import { EventClosingCosts } from "@/components/EventClosingCosts";

import { EventEditModal } from "@/components/EventEditModal";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

function CopyFromSelector({ label, currentId, subEvents, onCopy }: {
  label: string;
  currentId: string;
  subEvents: any[];
  onCopy: (sourceId: string) => Promise<void>;
}) {
  const [copying, setCopying] = useState(false);
  const others = subEvents.filter((s: any) => s.id !== currentId);
  if (others.length === 0) return null;

  const handleCopy = async (sourceId: string) => {
    if (!window.confirm("Isto irá copiar os dados para esta data. Deseja continuar?")) return;
    setCopying(true);
    try {
      await onCopy(sourceId);
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Copy className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{label}:</span>
        {others.map((sub: any) => (
          <button
            key={sub.id}
            onClick={() => handleCopy(sub.id)}
            disabled={copying}
            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            {sub.name} ({formatDate(sub.date)})
          </button>
        ))}
      </div>
    </div>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isManager } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSubEvent, setSelectedSubEvent] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; description: string; action: () => void; variant?: "destructive" | "default" } | null>(null);
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
      const { data, error } = await (supabase
        .from("events")
        .select("*") as any)
        .eq("parent_event_id", id!)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
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

  // Fetch ticket sales revenue for the event(s)
  const { data: ticketSalesRevenue = 0 } = useQuery({
    queryKey: ["event_ticket_revenue", id, selectedSubEvent, subEvents.map((s: any) => s.id).join(",")],
    queryFn: async () => {
      // Get zones for all relevant event IDs
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .in("event_id", allEventIds);
      if (!zones || zones.length === 0) return 0;

      const zoneIds = zones.map(z => z.id);
      // Get lots for those zones to know IVA rates
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, iva_rate")
        .in("zone_id", zoneIds);

      // Get all ticket sales
      const { data: sales } = await supabase
        .from("ticket_sales")
        .select("lot_id, quantity, unit_price")
        .in("lot_id", lots?.map(l => l.id) || []);

      if (!sales || sales.length === 0) return 0;

      // Build lot IVA map
      const lotIvaMap = new Map<string, number>();
      lots?.forEach(l => lotIvaMap.set(l.id, l.iva_rate || 6));

      // Calculate gross revenue from ticket sales
      return sales.reduce((sum, s) => sum + (s.quantity * Number(s.unit_price)), 0);
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

  const deleteEventMutation = useMutation({
    mutationFn: async () => {
      // Delete related data first
      await supabase.from("event_dates").delete().eq("event_id", id!);
      await supabase.from("event_forecasts").delete().eq("event_id", id!);
      await supabase.from("event_cache_configs").delete().eq("event_id", id!);
      // Delete ticket lots via zones
      const { data: zones } = await supabase.from("event_ticket_zones").select("id").eq("event_id", id!);
      if (zones && zones.length > 0) {
        const zoneIds = zones.map(z => z.id);
        await supabase.from("event_ticket_lots").delete().in("zone_id", zoneIds);
        await supabase.from("ticket_sales").delete().in("zone_id", zoneIds);
      }
      await supabase.from("event_ticket_zones").delete().eq("event_id", id!);
      // Delete the event itself
      const { error } = await supabase.from("events").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events_full"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({ title: "Evento eliminado com sucesso!" });
      navigate("/eventos");
    },
    onError: (err: any) => {
      toast({ title: "Erro ao eliminar", description: err.message, variant: "destructive" });
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
  const transactionIncome = incomeTransactions.reduce((s, t) => s + Number(t.amount), 0);
  // If ticket sales exist, use them as revenue source; otherwise fall back to transactions
  const hasTicketSales = ticketSalesRevenue > 0;
  const totalIncome = hasTicketSales ? ticketSalesRevenue : transactionIncome;
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
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
            event.pl_mode === "active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
          }`}>
            BP {event.pl_mode === "active" ? "Ativo" : "Passivo"}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar
            </button>
            {(isAdmin || isManager) && (event.status === "planning" || event.status === "confirmed") && (
              <button
                onClick={() => setConfirmAction({
                  title: "Ativar Evento",
                  description: "Ativar este evento? O evento ficará disponível para receber transações.",
                  action: () => changeStatusMutation.mutate("active"),
                })}
                disabled={changeStatusMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Ativar Evento
              </button>
            )}
            {(isAdmin || isManager) && event.status === "active" && (
              <button
                onClick={() => setConfirmAction({
                  title: "Concluir Evento",
                  description: "Concluir este evento? As transações ficarão bloqueadas para alterações.",
                  action: () => changeStatusMutation.mutate("completed"),
                })}
                disabled={changeStatusMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Concluir Evento
              </button>
            )}
            {isAdmin && isCompleted && (
              <button
                onClick={() => setConfirmAction({
                  title: "Reativar Evento",
                  description: "Reativar este evento? As transações voltarão a poder ser alteradas.",
                  action: () => changeStatusMutation.mutate("active"),
                })}
                disabled={changeStatusMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-warning/15 text-warning hover:bg-warning/25 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reativar Evento
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setConfirmAction({
                  title: "⚠️ Eliminar Evento",
                  description: `Tem a certeza que deseja eliminar "${event.name}"? Esta ação é irreversível e eliminará todos os dados associados (previsões, bilhetes, cachês, transações associadas).`,
                  action: () => deleteEventMutation.mutate(),
                  variant: "destructive",
                })}
                disabled={deleteEventMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> {deleteEventMutation.isPending ? "A eliminar…" : "Eliminar"}
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
              ℹ️ Transações do evento-pai são custos partilhados (rateio igual por {subEventCount} datas nos relatórios DRE/BP).
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
          subtitle={hasTicketSales ? "Via bilheteira" : (transactionIncome > 0 ? "Via transações" : undefined)}
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

      {showEditModal && (
        <EventEditModal event={event} onClose={() => setShowEditModal(false)} />
      )}

      {/* Main tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Resumo</TabsTrigger>
          <TabsTrigger value="ticketing">Bilheteira</TabsTrigger>
          <TabsTrigger value="cache">Cachê</TabsTrigger>
          <TabsTrigger value="forecast">Business Plan</TabsTrigger>
          {!event?.parent_event_id && !selectedSubEvent && <TabsTrigger value="partners">Sócios</TabsTrigger>}
          <TabsTrigger value="closing-costs">Fecho</TabsTrigger>
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
          {eventType === "multi_day" && !selectedSubEvent ? (
            <div className="glass rounded-xl p-8 text-center space-y-2">
              <Ticket className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">Selecione uma data da turnê acima para configurar a bilheteira.</p>
              <p className="text-xs text-muted-foreground">A bilheteira é configurada individualmente para cada data.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {eventType === "multi_day" && selectedSubEvent && subEvents.length > 1 && (
                <CopyFromSelector
                  label="Copiar bilheteira de"
                  currentId={selectedSubEvent}
                  subEvents={subEvents}
                  onCopy={async (sourceId: string) => {
                    // Copy zones and lots from source to target
                    const { data: sourceZones } = await supabase
                      .from("event_ticket_zones")
                      .select("*")
                      .eq("event_id", sourceId);
                    if (!sourceZones || sourceZones.length === 0) {
                      toast({ title: "A data de origem não tem bilheteira configurada", variant: "destructive" });
                      return;
                    }
                    for (const zone of sourceZones) {
                      const { data: newZone } = await supabase
                        .from("event_ticket_zones")
                        .insert({ event_id: selectedSubEvent, name: zone.name, total_capacity: zone.total_capacity })
                        .select("id")
                        .single();
                      if (!newZone) continue;
                      const { data: lots } = await supabase
                        .from("event_ticket_lots")
                        .select("*")
                        .eq("zone_id", zone.id)
                        .order("lot_number");
                      if (lots && lots.length > 0) {
                        await supabase.from("event_ticket_lots").insert(
                          lots.map(l => ({ zone_id: newZone.id, name: l.name, quantity: l.quantity, price: l.price, lot_number: l.lot_number }))
                        );
                      }
                    }
                    queryClient.invalidateQueries({ queryKey: ["event_ticket_zones", selectedSubEvent] });
                    queryClient.invalidateQueries({ queryKey: ["event_ticket_lots", selectedSubEvent] });
                    toast({ title: "Bilheteira copiada com sucesso!" });
                  }}
                />
              )}
              <EventTicketing eventId={selectedSubEvent || event.id} eventDateId={selectedSubEvent && eventType === "multi_day" ? selectedSubEvent : null} eventStatus={event.status} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="cache">
          <EventCacheConfig
            eventId={selectedSubEvent || event.id}
            childEventIds={!selectedSubEvent && eventType === "multi_day" ? subEvents.map((s: any) => s.id) : undefined}
          />
        </TabsContent>

        <TabsContent value="forecast">
          {eventType === "multi_day" && !selectedSubEvent && !event?.parent_event_id ? (
            <div className="space-y-4">
              <EventForecast eventId={event.id} eventDate={event.date} eventName={event.name} expenseOnly eventStatus={event.status} childEventIds={subEvents.map((s: any) => s.id)} />
            </div>
          ) : (
            <div className="space-y-4">
              {eventType === "multi_day" && selectedSubEvent && subEvents.length > 1 && (
                <CopyFromSelector
                  label="Copiar BP de"
                  currentId={selectedSubEvent}
                  subEvents={subEvents}
                  onCopy={async (sourceId: string) => {
                    const { data: sourceForecasts } = await supabase
                      .from("event_forecasts")
                      .select("*")
                      .eq("event_id", sourceId);
                    if (!sourceForecasts || sourceForecasts.length === 0) {
                      toast({ title: "A data de origem não tem previsões no BP", variant: "destructive" });
                      return;
                    }
                    await supabase.from("event_forecasts").insert(
                      sourceForecasts.map(f => ({
                        event_id: selectedSubEvent,
                        type: f.type,
                        description: f.description,
                        amount: f.amount,
                        iva_rate: f.iva_rate,
                        category_id: f.category_id,
                        notes: f.notes,
                        specification: f.specification,
                        status: "draft",
                      }))
                    );
                    queryClient.invalidateQueries({ queryKey: ["event_forecasts", selectedSubEvent] });
                    toast({ title: "BP copiado com sucesso!" });
                  }}
                />
              )}
              <EventForecast eventId={selectedSubEvent || event.id} eventDate={selectedSubEvent ? (subEvents.find((s: any) => s.id === selectedSubEvent)?.date || event.date) : event.date} eventName={selectedSubEvent ? (subEvents.find((s: any) => s.id === selectedSubEvent)?.name || event.name) : event.name} childEventIds={!selectedSubEvent && eventType === "multi_day" ? subEvents.map((s: any) => s.id) : undefined} parentEventId={(selectedSubEvent && eventType === "multi_day" ? id : undefined) || (event?.parent_event_id ? event.parent_event_id : undefined)} eventStatus={event.status} />
            </div>
          )}
        </TabsContent>

        {!event?.parent_event_id && !selectedSubEvent && (
          <TabsContent value="partners">
            <EventPartnersTab eventId={event.id} eventStatus={event.status} />
          </TabsContent>
        )}

        <TabsContent value="closing-costs">
          <EventClosingCosts eventId={selectedSubEvent || event.id} eventStatus={event.status} />
        </TabsContent>

      </Tabs>

      {/* Confirmation dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { confirmAction?.action(); setConfirmAction(null); }}
              className={confirmAction?.variant === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
