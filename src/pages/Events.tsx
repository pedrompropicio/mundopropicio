import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Ticket, ArrowRight, Plus, X, Calendar, Layers, Route } from "lucide-react";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";

type EventType = "simple" | "festival" | "multi_day";

const eventTypeLabels: Record<EventType, string> = {
  simple: "Evento Simples",
  festival: "Festival",
  multi_day: "Múltiplos Dias",
};

const eventTypeIcons: Record<EventType, typeof Calendar> = {
  simple: Calendar,
  festival: Layers,
  multi_day: Route,
};

interface EventForm {
  name: string;
  date: string;
  location: string;
  budget: string;
  tickets_total: string;
  status: string;
  event_type: EventType;
  // Festival dates
  festival_dates: string[];
  // Multi-day sub-events
  sub_events: { name: string; date: string; location: string }[];
}

const emptyForm: EventForm = {
  name: "",
  date: new Date().toISOString().split("T")[0],
  location: "",
  budget: "",
  tickets_total: "",
  status: "planning",
  event_type: "simple",
  festival_dates: [],
  sub_events: [{ name: "", date: "", location: "" }],
};

export default function Events() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>({ ...emptyForm });
  const [newFestivalDate, setNewFestivalDate] = useState("");
  const queryClient = useQueryClient();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events_full"],
    queryFn: async () => {
      // Only fetch top-level events (no sub-events)
      const { data: evts, error } = await supabase
        .from("events")
        .select("*")
        .is("parent_event_id", null)
        .order("date", { ascending: false });
      if (error) throw error;

      // Fetch sub-events
      const parentIds = evts.filter(e => (e as any).event_type === "multi_day").map(e => e.id);
      let subEventsMap: Record<string, any[]> = {};
      if (parentIds.length > 0) {
        const { data: subs } = await supabase
          .from("events")
          .select("*")
          .in("parent_event_id", parentIds);
        (subs ?? []).forEach(s => {
          const pid = (s as any).parent_event_id;
          if (!subEventsMap[pid]) subEventsMap[pid] = [];
          subEventsMap[pid].push(s);
        });
      }

      // Fetch transaction totals per event (including sub-events)
      const { data: txns } = await supabase
        .from("transactions")
        .select("event_id, type, amount");

      const totals: Record<string, { income: number; expense: number }> = {};
      (txns ?? []).forEach((t) => {
        if (!t.event_id) return;
        if (!totals[t.event_id]) totals[t.event_id] = { income: 0, expense: 0 };
        if (t.type === "income") totals[t.event_id].income += Number(t.amount);
        else totals[t.event_id].expense += Number(t.amount);
      });

      return evts.map((e) => {
        const eventType = (e as any).event_type || "simple";
        let totalIncome = totals[e.id]?.income ?? 0;
        let totalExpenses = totals[e.id]?.expense ?? 0;

        // For multi-day, aggregate sub-events
        if (eventType === "multi_day" && subEventsMap[e.id]) {
          subEventsMap[e.id].forEach(sub => {
            totalIncome += totals[sub.id]?.income ?? 0;
            totalExpenses += totals[sub.id]?.expense ?? 0;
          });
        }

        return {
          ...e,
          event_type: eventType,
          totalIncome,
          totalExpenses,
          subEvents: subEventsMap[e.id] || [],
        };
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: EventForm) => {
      // Create main event
      const { data: newEvent, error } = await supabase.from("events").insert({
        name: data.name,
        date: data.date,
        location: data.location || null,
        budget: parseFloat(data.budget) || 0,
        tickets_total: parseInt(data.tickets_total) || 0,
        status: data.status,
        event_type: data.event_type,
      } as any).select().single();
      if (error) throw error;

      const parentId = (newEvent as any).id;

      // For festival, save extra dates
      if (data.event_type === "festival" && data.festival_dates.length > 0) {
        const datesToInsert = data.festival_dates.map(d => ({
          event_id: parentId,
          date: d,
        }));
        const { error: dErr } = await supabase.from("event_dates" as any).insert(datesToInsert);
        if (dErr) throw dErr;
      }

      // For multi-day, create sub-events
      if (data.event_type === "multi_day") {
        const validSubs = data.sub_events.filter(s => s.name && s.date);
        if (validSubs.length > 0) {
          const subsToInsert = validSubs.map(s => ({
            name: s.name,
            date: s.date,
            location: s.location || null,
            status: data.status,
            event_type: "simple",
            parent_event_id: parentId,
            budget: 0,
            tickets_total: 0,
          }));
          const { error: sErr } = await supabase.from("events").insert(subsToInsert as any);
          if (sErr) throw sErr;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events_full"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setShowForm(false);
      setForm({ ...emptyForm });
      toast({ title: "Evento criado com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar evento", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.date) {
      toast({ title: "Preencha o nome e data do evento", variant: "destructive" });
      return;
    }
    if (form.event_type === "multi_day") {
      const validSubs = form.sub_events.filter(s => s.name && s.date);
      if (validSubs.length === 0) {
        toast({ title: "Adicione pelo menos uma data ao evento", variant: "destructive" });
        return;
      }
    }
    createMutation.mutate(form);
  };

  const addSubEvent = () => {
    setForm({ ...form, sub_events: [...form.sub_events, { name: "", date: "", location: "" }] });
  };

  const removeSubEvent = (idx: number) => {
    setForm({ ...form, sub_events: form.sub_events.filter((_, i) => i !== idx) });
  };

  const updateSubEvent = (idx: number, field: string, value: string) => {
    const updated = [...form.sub_events];
    updated[idx] = { ...updated[idx], [field]: value };
    setForm({ ...form, sub_events: updated });
  };

  const addFestivalDate = () => {
    if (newFestivalDate && !form.festival_dates.includes(newFestivalDate)) {
      setForm({ ...form, festival_dates: [...form.festival_dates, newFestivalDate].sort() });
      setNewFestivalDate("");
    }
  };

  const removeFestivalDate = (date: string) => {
    setForm({ ...form, festival_dates: form.festival_dates.filter(d => d !== date) });
  };

  const EventTypeBadge = ({ type }: { type: EventType }) => {
    const Icon = eventTypeIcons[type];
    const colors: Record<EventType, string> = {
      simple: "bg-blue-500/15 text-blue-400",
      festival: "bg-purple-500/15 text-purple-400",
      multi_day: "bg-amber-500/15 text-amber-400",
    };
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[type]}`}>
        <Icon className="h-3 w-3" />
        {eventTypeLabels[type]}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Eventos</h1>
          <p className="text-sm text-muted-foreground">Gestão e acompanhamento financeiro por evento</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo Evento</span>
        </button>
      </div>

      {/* Creation Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowForm(false)}>
          <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Novo Evento</h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1 hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Event Type Selection */}
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">Tipo de Evento *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["simple", "festival", "multi_day"] as EventType[]).map(type => {
                    const Icon = eventTypeIcons[type];
                    const isSelected = form.event_type === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setForm({ ...form, event_type: type })}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        {eventTypeLabels[type]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {form.event_type === "multi_day" ? "Nome da Turnê *" : "Nome *"}
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder={form.event_type === "multi_day" ? "Ex: Turnê Portugal 2026" : "Ex: Festival de Verão 2026"}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {form.event_type === "festival" ? "Data de Início *" : "Data *"}
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Estado</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="planning">Planeamento</option>
                    <option value="active">Ativo</option>
                    <option value="completed">Concluído</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
              </div>

              {/* Festival: Additional Dates */}
              {form.event_type === "festival" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Datas Adicionais do Festival</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="date"
                      value={newFestivalDate}
                      onChange={(e) => setNewFestivalDate(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <button
                      type="button"
                      onClick={addFestivalDate}
                      className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {form.festival_dates.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {form.festival_dates.map(d => (
                        <span key={d} className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 text-purple-400 px-2.5 py-1 text-xs">
                          {formatDate(d)}
                          <button type="button" onClick={() => removeFestivalDate(d)}>
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Multi-day: Sub-events */}
              {form.event_type === "multi_day" && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-muted-foreground">Datas / Locais da Turnê</label>
                  <div className="space-y-2">
                    {form.sub_events.map((sub, idx) => (
                      <div key={idx} className="rounded-lg border border-border/50 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Data {idx + 1}</span>
                          {form.sub_events.length > 1 && (
                            <button type="button" onClick={() => removeSubEvent(idx)} className="text-destructive hover:text-destructive/80">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <input
                          value={sub.name}
                          onChange={(e) => updateSubEvent(idx, "name", e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                          placeholder="Nome da data (ex: Lisboa)"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={sub.date}
                            onChange={(e) => updateSubEvent(idx, "date", e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                          <input
                            value={sub.location}
                            onChange={(e) => updateSubEvent(idx, "location", e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="Local"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addSubEvent}
                    className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar data
                  </button>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Localização</label>
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder={form.event_type === "multi_day" ? "Local principal" : "Ex: Altice Arena, Lisboa"}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Orçamento (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.budget}
                    onChange={(e) => setForm({ ...form, budget: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Bilhetes (total)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.tickets_total}
                    onChange={(e) => setForm({ ...form, tickets_total: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="0"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                {createMutation.isPending ? "A guardar…" : "Criar Evento"}
              </button>
            </form>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-muted-foreground">A carregar eventos…</p>
      ) : events.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Sem eventos registados.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((event: any) => {
            const profit = event.totalIncome - event.totalExpenses;
            const budgetUsed = event.budget > 0 ? (event.totalExpenses / event.budget) * 100 : 0;
            const eventType = event.event_type as EventType;
            return (
              <Link
                key={event.id}
                to={`/eventos/${event.id}`}
                className="glass group rounded-xl p-5 transition-all hover:border-primary/40 hover:glow-primary animate-fade-in"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold group-hover:text-primary transition-colors">{event.name}</h3>
                    <p className="text-xs text-muted-foreground">{formatDate(event.date)}</p>
                  </div>
                  <EventStatusBadge status={event.status as any} />
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <EventTypeBadge type={eventType} />
                  {eventType === "multi_day" && event.subEvents?.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">{event.subEvents.length} datas</span>
                  )}
                </div>

                {event.location && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{event.location}</span>
                  </div>
                )}

                {event.budget > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Orçamento</span>
                      <span className="font-mono font-medium">{budgetUsed.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(budgetUsed, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Receitas</p>
                    <p className="text-sm font-bold text-success">{formatCurrency(event.totalIncome)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Despesas</p>
                    <p className="text-sm font-bold text-warning">{formatCurrency(event.totalExpenses)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Lucro</p>
                    <p className={`text-sm font-bold ${profit >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(profit)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Ticket className="h-3 w-3" />
                    {event.tickets_sold.toLocaleString()} / {event.tickets_total.toLocaleString()} bilhetes
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
