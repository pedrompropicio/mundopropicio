import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { useState } from "react";
import { moveToTrash } from "@/lib/trash";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, TrendingUp, TrendingDown, Wallet, Ticket, CheckCircle2, RotateCcw, Calendar, Layers, Route, Pencil, Copy, Trash2, Lock, LockOpen, AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { StatCard } from "@/components/StatCard";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { EventForecast } from "@/components/EventForecast";
import { EventTicketing } from "@/components/EventTicketing";
import { EventCacheConfig } from "@/components/EventCacheConfig";
import { EventPartnersTab } from "@/components/EventPartnersTab";
import { EventClosingCosts } from "@/components/EventClosingCosts";
import { EventSessionsManager } from "@/components/EventSessionsManager";
import { PartnerAccessManager } from "@/components/PartnerAccessManager";
import { PartnerPaidExpensesPanel } from "@/components/PartnerPaidExpensesPanel";
import { PartnerSettlementTab } from "@/components/PartnerSettlementTab";

import { EventEditModal } from "@/components/EventEditModal";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { buildSessionCopyMap } from "@/lib/session-copy";
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
  master: "Turnê",
  split: "Sub-evento",
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
    } catch (error: any) {
      toast({
        title: "Erro ao copiar",
        description: error?.message || "Não foi possível concluir a cópia.",
        variant: "destructive",
      });
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
  const { isAdmin, isManager, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSubEvent, setSelectedSubEvent] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; description: string; action: () => void; variant?: "destructive" | "default" } | null>(null);
  const [editingSubName, setEditingSubName] = useState<string | null>(null);
  const [editSubNameValue, setEditSubNameValue] = useState("");
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
  const isMultiEvent = eventType === "multi_day" || eventType === "master";

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
    enabled: !!id && isMultiEvent,
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

  // Fetch sessions for the active event (or sub-event)
  const activeEventId = selectedSubEvent || id!;
  const { data: eventSessions = [] } = useQuery({
    queryKey: ["event_sessions", activeEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sessions" as any)
        .select("*")
        .eq("event_id", activeEventId)
        .order("date", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!activeEventId,
  });

  // Determine which event IDs to use for transactions
  const transactionEventIds = isMultiEvent && !selectedSubEvent
    ? [id!, ...subEvents.map((s: any) => s.id)]
    : selectedSubEvent
      ? [selectedSubEvent]
      : [id!];


  const { data: eventTransactions = [] } = useQuery({
    queryKey: ["event_transactions", id, selectedSubEvent, subEvents.map((s: any) => s.id).join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, account_categories(code, name), suppliers(name)")
        .in("event_id", transactionEventIds);
      if (error) throw error;
      let rows = data ?? [];

      // On the Master/tour cover (no sub-event selected), replace split children
      // with their Master transaction so we show only one consolidated line per rateio.
      if (isMultiEvent && !selectedSubEvent) {
        const childRows = rows.filter((r: any) => r.parent_transaction_id);
        const masterIds = [...new Set(childRows.map((r: any) => r.parent_transaction_id))];
        if (masterIds.length > 0) {
          const { data: masters } = await supabase
            .from("transactions")
            .select("*, account_categories(code, name), suppliers(name)")
            .in("id", masterIds);
          const nonChildren = rows.filter((r: any) => !r.parent_transaction_id);
          rows = [...nonChildren, ...(masters ?? [])];
        }
      }

      const dateKey = (v?: string | null) => (v ? String(v).slice(0, 10) : "");
      return [...rows].sort((a: any, b: any) => {
        const aCat = a.account_categories?.code ?? "";
        const bCat = b.account_categories?.code ?? "";
        if (aCat !== bCat) return aCat.localeCompare(bCat, "pt", { numeric: true, sensitivity: "base" });

        const aSup = a.suppliers?.name ?? "";
        const bSup = b.suppliers?.name ?? "";
        if (aSup !== bSup) return aSup.localeCompare(bSup, "pt", { sensitivity: "base" });

        const aDate = dateKey(a.date);
        const bDate = dateKey(b.date);
        if (aDate !== bDate) return bDate.localeCompare(aDate);

        const aDue = dateKey(a.due_date);
        const bDue = dateKey(b.due_date);
        if (aDue !== bDue) return bDue.localeCompare(aDue);

        const aPay = dateKey(a.payment_date);
        const bPay = dateKey(b.payment_date);
        return bPay.localeCompare(aPay);
      });
    },
    enabled: !!id,
  });

  // Fetch ticket sales revenue for the event(s)
  const { data: ticketSalesRevenue = 0 } = useQuery({
    queryKey: ["event_ticket_revenue", id, selectedSubEvent, transactionEventIds.join(",")],
    queryFn: async () => {
      // Get zones for all relevant event IDs
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .in("event_id", transactionEventIds);
      if (!zones || zones.length === 0) return 0;

      const zoneIds = zones.map(z => z.id);
      // Get lots for those zones
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id")
        .in("zone_id", zoneIds);

      if (!lots || lots.length === 0) return 0;

      // Get all ticket sales
      const { data: sales } = await supabase
        .from("ticket_sales")
        .select("lot_id, quantity, unit_price")
        .in("lot_id", lots.map(l => l.id));

      if (!sales || sales.length === 0) return 0;

      // Calculate gross revenue from ticket sales
      return sales.reduce((sum, s) => sum + (s.quantity * Number(s.unit_price)), 0);
    },
    enabled: !!id,
  });

  const renameSubEventMutation = useMutation({
    mutationFn: async ({ subId, newName }: { subId: string; newName: string }) => {
      const { error } = await supabase.from("events").update({ name: newName }).eq("id", subId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sub_events", id] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["events_full"] });
      setEditingSubName(null);
      toast({ title: "Nome atualizado com sucesso" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao renomear", description: err.message, variant: "destructive" });
    },
  });

  const changeStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("events")
        .update({ status: newStatus })
        .eq("id", id!);
      if (error) throw error;

      // If this is a parent (multi_day) event, propagate status to all child events
      if (isMultiEvent && subEvents.length > 0) {
        const childIds = subEvents.map((s: any) => s.id);
        const { error: childError } = await (supabase
          .from("events")
          .update({ status: newStatus }) as any)
          .in("id", childIds);
        if (childError) throw childError;
      }
    },
    onSuccess: (_, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ["event_detail", id] });
      queryClient.invalidateQueries({ queryKey: ["events_full"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      // Invalidate sub-event detail pages too
      if (isMultiEvent && subEvents.length > 0) {
        subEvents.forEach((s: any) => {
          queryClient.invalidateQueries({ queryKey: ["event_detail", s.id] });
        });
      }
      toast({ title: newStatus === "completed" ? "Evento concluído!" : "Evento reativado!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async () => {
      // Fetch event data for trash
      const { data: eventData } = await supabase.from("events").select("*").eq("id", id!).single();
      const { data: eventDates } = await supabase.from("event_dates").select("*").eq("event_id", id!);
      const { data: forecasts } = await supabase.from("event_forecasts").select("*").eq("event_id", id!);

      if (eventData) {
        await moveToTrash({
          entity_type: "event",
          entity_id: id!,
          entity_data: eventData,
          related_data: {
            event_dates: eventDates || [],
            event_forecasts: forecasts || [],
          },
          deleted_by: user?.email || "sistema",
        });
      }

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

  const copyTicketingFromSubEvent = async (sourceId: string) => {
    if (!selectedSubEvent) return;

    const [sourceZonesResult, sourceSessionsResult, targetSessionsResult] = await Promise.all([
      supabase
        .from("event_ticket_zones")
        .select("id, name, total_capacity, session_id")
        .eq("event_id", sourceId)
        .order("created_at"),
      supabase
        .from("event_sessions" as any)
        .select("id, label, start_time, sort_order")
        .eq("event_id", sourceId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("event_sessions" as any)
        .select("id, label, start_time, sort_order")
        .eq("event_id", selectedSubEvent)
        .order("sort_order", { ascending: true }),
    ]);

    if (sourceZonesResult.error) throw sourceZonesResult.error;
    if (sourceSessionsResult.error) throw sourceSessionsResult.error;
    if (targetSessionsResult.error) throw targetSessionsResult.error;

    const sourceZones = sourceZonesResult.data ?? [];
    const sourceSessions = (sourceSessionsResult.data ?? []) as any[];
    const targetSessions = (targetSessionsResult.data ?? []) as any[];

    if (sourceZones.length === 0) {
      toast({ title: "A data de origem não tem bilheteira configurada", variant: "destructive" });
      return;
    }

    const sessionMap = buildSessionCopyMap(sourceSessions, targetSessions);
    const hasSessionBoundZones = sourceZones.some((zone) => !!zone.session_id);

    if (hasSessionBoundZones && targetSessions.length === 0) {
      throw new Error("Crie as sessões da data de destino antes de copiar a bilheteira.");
    }

    const hasUnmappedZones = sourceZones.some((zone) => zone.session_id && !sessionMap.has(zone.session_id));
    if (hasUnmappedZones) {
      throw new Error("Nem todas as sessões da origem encontraram correspondência na data de destino.");
    }

    for (const zone of sourceZones) {
      const targetSessionId = zone.session_id ? sessionMap.get(zone.session_id) ?? null : null;
      const { data: newZone, error: newZoneError } = await supabase
        .from("event_ticket_zones")
        .insert({
          event_id: selectedSubEvent,
          session_id: targetSessionId,
          name: zone.name,
          total_capacity: zone.total_capacity,
        })
        .select("id")
        .single();

      if (newZoneError) throw newZoneError;
      if (!newZone) continue;

      const { data: lots, error: lotsError } = await supabase
        .from("event_ticket_lots")
        .select("name, quantity, price, lot_number, iva_rate")
        .eq("zone_id", zone.id)
        .order("lot_number");

      if (lotsError) throw lotsError;

      if (lots && lots.length > 0) {
        const { error: insertLotsError } = await supabase.from("event_ticket_lots").insert(
          lots.map((lot) => ({
            zone_id: newZone.id,
            name: lot.name,
            quantity: lot.quantity,
            price: lot.price,
            lot_number: lot.lot_number,
            iva_rate: lot.iva_rate,
          })),
        );

        if (insertLotsError) throw insertLotsError;
      }
    }

    queryClient.invalidateQueries({ queryKey: ["event_ticket_zones", selectedSubEvent] });
    queryClient.invalidateQueries({ queryKey: ["event_ticket_lots", selectedSubEvent] });
    toast({ title: "Bilheteira copiada com sucesso!" });
  };

  // For multi-day with shared costs (parent transactions), calculate proration
  const isGlobalView = isMultiEvent && !selectedSubEvent;
  const subEventCount = subEvents.length || 1;

  // Pie data by category
  const expenseByCategory = expenseTransactions.reduce<Record<string, { name: string; value: number }>>((acc, t) => {
    const catName = t.account_categories ? `${t.account_categories.code} ${t.account_categories.name}` : "Sem categoria";
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

  const EventTypeIcon = eventType === "festival" ? Layers : isMultiEvent ? Route : Calendar;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/eventos" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" /> Voltar aos eventos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl flex items-center gap-2">{event.name} <HelpTooltip text={helpTexts.eventDetail} /></h1>
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
            {(isAdmin || isManager) && !isCompleted && (
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>
            )}
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
                  description: "Concluir este evento? Todas as alterações ficarão bloqueadas. Apenas um administrador poderá reabrir o evento.",
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
                  title: "🔓 Reabrir Evento",
                  description: "Reabrir este evento? Todas as alterações voltarão a ser permitidas (bilheteira, BP, cachê, sócios, transações, etc.).",
                  action: () => changeStatusMutation.mutate("active"),
                })}
                disabled={changeStatusMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-warning/15 text-warning hover:bg-warning/25 transition-colors disabled:opacity-50"
              >
                <LockOpen className="h-3.5 w-3.5" /> Reabrir Evento
              </button>
            )}
            {isAdmin && !isCompleted && (
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

      {/* Post-event completion alert */}
      {(isAdmin || isManager) && event.status === "active" && (() => {
        const today = new Date().toISOString().slice(0, 10);
        const eventDate = event.date;
        // For tours, check the latest child date
        const latestDate = subEvents.length > 0
          ? subEvents.reduce((max: string, s: any) => s.date > max ? s.date : max, eventDate)
          : eventDate;
        if (today > latestDate) {
          return (
            <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-warning">Este evento já foi realizado</p>
                <p className="text-xs text-warning/70 mt-0.5">
                  A data do evento ({new Date(latestDate + "T12:00:00").toLocaleDateString("pt-PT")}) já passou. Deseja concluir o evento?
                </p>
              </div>
              <button
                onClick={() => setConfirmAction({
                  title: "Concluir Evento",
                  description: "Concluir este evento? Todas as alterações ficarão bloqueadas. Apenas um administrador poderá reabrir o evento.",
                  action: () => changeStatusMutation.mutate("completed"),
                })}
                disabled={changeStatusMutation.isPending}
                className="shrink-0 rounded-lg bg-warning px-4 py-2 text-xs font-semibold text-warning-foreground hover:bg-warning/90 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
                Concluir Evento
              </button>
            </div>
          );
        }
        return null;
      })()}

      {isMultiEvent && subEvents.length > 0 && (
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
              <div key={sub.id} className="relative group">
                {editingSubName === sub.id ? (
                  <form
                    className="flex items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editSubNameValue.trim()) {
                        renameSubEventMutation.mutate({ subId: sub.id, newName: editSubNameValue.trim() });
                      }
                    }}
                  >
                    <input
                      autoFocus
                      className="rounded-lg px-2 py-1.5 text-xs font-medium border border-primary bg-background text-foreground w-32"
                      value={editSubNameValue}
                      onChange={(e) => setEditSubNameValue(e.target.value)}
                      onBlur={() => setEditingSubName(null)}
                      onKeyDown={(e) => { if (e.key === "Escape") setEditingSubName(null); }}
                    />
                  </form>
                ) : (
                  <button
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
                )}
                {(isAdmin || isManager) && editingSubName !== sub.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditSubNameValue(sub.name);
                      setEditingSubName(sub.id);
                    }}
                    className="absolute -top-1.5 -right-1.5 rounded-full p-0.5 bg-muted border border-border text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Renomear"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {isGlobalView && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              ℹ️ Transações master são custos partilhados (rateio igual por {subEventCount} datas nos relatórios DRE/BP).
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

      {/* Locked banner for completed events */}
      {isCompleted && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
          <Lock className="h-5 w-5 text-warning shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-warning">Evento Concluído — Bloqueado para alterações</p>
            <p className="text-xs text-muted-foreground">Nenhuma alteração é permitida (bilheteira, cachê, BP, sócios, despesas extras). Apenas um administrador pode reabrir o evento.</p>
          </div>
        </div>
      )}

      {showEditModal && (
        <EventEditModal event={event} onClose={() => setShowEditModal(false)} />
      )}

      {/* Main tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Resumo</TabsTrigger>
          <TabsTrigger value="ticketing" className="flex items-center gap-1">Bilheteira <HelpTooltip text={helpTexts.eventTicketing} size={13} /></TabsTrigger>
          {(isAdmin || isManager) && <TabsTrigger value="cache" className="flex items-center gap-1">Cachê <HelpTooltip text={helpTexts.eventCache} size={13} /></TabsTrigger>}
          <TabsTrigger value="forecast" className="flex items-center gap-1">Business Plan <HelpTooltip text={helpTexts.eventForecast} size={13} /></TabsTrigger>
          {(isAdmin || isManager) && !event?.parent_event_id && !selectedSubEvent && <TabsTrigger value="partners" className="flex items-center gap-1">Sócios <HelpTooltip text={helpTexts.eventPartners} size={13} /></TabsTrigger>}
          {(isAdmin || isManager) && <TabsTrigger value="closing-costs" className="flex items-center gap-1">Fecho <HelpTooltip text={helpTexts.eventClosingTab} size={13} /></TabsTrigger>}
          {(isAdmin || isManager) && !event?.parent_event_id && !selectedSubEvent && <TabsTrigger value="partner-expenses" className="flex items-center gap-1">Desp. Sócios <HelpTooltip text={helpTexts.partnerExpenses} size={13} /></TabsTrigger>}
          {(isAdmin || isManager) && !event?.parent_event_id && !selectedSubEvent && <TabsTrigger value="partner-settlement" className="flex items-center gap-1">Fecho Parceiros <HelpTooltip text={helpTexts.partnerSettlement} size={13} /></TabsTrigger>}
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
                              {t.account_categories ? `${t.account_categories.code} ${t.account_categories.name}` : "—"}
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
          {isMultiEvent && !selectedSubEvent ? (
            <div className="glass rounded-xl p-8 text-center space-y-2">
              <Ticket className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">Selecione uma data da turnê acima para configurar a bilheteira.</p>
              <p className="text-xs text-muted-foreground">A bilheteira é configurada individualmente para cada data.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {isMultiEvent && selectedSubEvent && subEvents.length > 1 && (
                <CopyFromSelector
                  label="Copiar bilheteira de"
                  currentId={selectedSubEvent}
                  subEvents={subEvents}
                  onCopy={copyTicketingFromSubEvent}
                />
              )}

              {/* Sessions Manager */}
              <EventSessionsManager
                eventId={activeEventId}
                eventDate={selectedSubEvent ? (subEvents.find((s: any) => s.id === selectedSubEvent)?.date || event.date) : event.date}
                eventStatus={event.status}
              />

              {/* Session selector if sessions exist */}
              {eventSessions.length > 0 && (
                <div className="glass rounded-xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Filtrar bilheteira por sessão</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedSessionId(null)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        !selectedSessionId
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Todas
                    </button>
                    {eventSessions.map((s: any) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSessionId(s.id)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                          selectedSessionId === s.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s.label}
                        {s.start_time && <span className="ml-1 opacity-70">{s.start_time.slice(0, 5)}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <EventTicketing
                eventId={activeEventId}
                eventDateId={null}
                eventStatus={event.status}
                sessionId={selectedSessionId}
              />
            </div>
          )}
        </TabsContent>

        {(isAdmin || isManager) && <TabsContent value="cache">
          <EventCacheConfig
            eventId={selectedSubEvent || event.id}
            childEventIds={!selectedSubEvent && isMultiEvent ? subEvents.map((s: any) => s.id) : undefined}
            eventStatus={event.status}
          />
        </TabsContent>}

        <TabsContent value="forecast">
          {isMultiEvent && !selectedSubEvent && !event?.parent_event_id ? (
            <div className="space-y-4">
              <EventForecast eventId={event.id} eventDate={event.date} eventName={event.name} expenseOnly eventStatus={event.status} childEventIds={subEvents.map((s: any) => s.id)} />
            </div>
          ) : (
            <div className="space-y-4">
              {isMultiEvent && selectedSubEvent && subEvents.length > 1 && (
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
              <EventForecast eventId={selectedSubEvent || event.id} eventDate={selectedSubEvent ? (subEvents.find((s: any) => s.id === selectedSubEvent)?.date || event.date) : event.date} eventName={selectedSubEvent ? (subEvents.find((s: any) => s.id === selectedSubEvent)?.name || event.name) : event.name} childEventIds={!selectedSubEvent && isMultiEvent ? subEvents.map((s: any) => s.id) : undefined} parentEventId={(selectedSubEvent && isMultiEvent ? id : undefined) || (event?.parent_event_id ? event.parent_event_id : undefined)} eventStatus={event.status} />
            </div>
          )}
        </TabsContent>

        {(isAdmin || isManager) && !event?.parent_event_id && !selectedSubEvent && (
          <TabsContent value="partners">
            <div className="space-y-6">
              <EventPartnersTab eventId={event.id} eventStatus={event.status} />
              {isAdmin && (
                <PartnerAccessManager
                  eventId={event.id}
                  eventName={event.name}
                  subEvents={isMultiEvent ? subEvents.map((s: any) => ({ id: s.id, name: s.name, date: s.date })) : []}
                />
              )}
            </div>
          </TabsContent>
        )}

        <TabsContent value="closing-costs">
          <EventClosingCosts eventId={selectedSubEvent || event.id} eventStatus={event.status} />
        </TabsContent>

        {(isAdmin || isManager) && !event?.parent_event_id && !selectedSubEvent && (
          <TabsContent value="partner-expenses">
            <PartnerPaidExpensesPanel eventId={event.id} eventStatus={event.status} />
          </TabsContent>
        )}

        {(isAdmin || isManager) && !event?.parent_event_id && !selectedSubEvent && (
          <TabsContent value="partner-settlement">
            <PartnerSettlementTab eventId={event.id} eventName={event.name} />
          </TabsContent>
        )}

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
