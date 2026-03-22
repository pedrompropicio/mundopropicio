import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Ticket, ArrowRight, Plus, X, Calendar, Layers, Route, LayoutGrid, List, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";
import { CityVenueSelector } from "@/components/CityVenueSelector";

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

interface SubEventForm {
  name: string;
  date: string;
  city_id: string;
  venue_id: string;
}

interface EventForm {
  name: string;
  date: string;
  city_id: string;
  venue_id: string;
  budget: string;
  tickets_total: string;
  status: string;
  event_type: EventType;
  pl_mode: "active" | "passive";
  festival_dates: string[];
  sub_events: SubEventForm[];
}

const emptyForm: EventForm = {
  name: "",
  date: new Date().toISOString().split("T")[0],
  city_id: "",
  venue_id: "",
  budget: "",
  tickets_total: "",
  status: "planning",
  event_type: "simple",
  pl_mode: "passive",
  festival_dates: [],
  sub_events: [{ name: "", date: "", city_id: "", venue_id: "" }],
};

export default function Events() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>({ ...emptyForm });
  const [newFestivalDate, setNewFestivalDate] = useState("");
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "list">(() => {
    const saved = localStorage.getItem("events-view-mode");
    return saved === "list" ? "list" : "cards";
  });
  const [sortField, setSortField] = useState<"date" | "location" | "status" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const queryClient = useQueryClient();

  // Fetch cities and venues for display on cards
  const { data: citiesMap = {} } = useQuery({
    queryKey: ["cities_map"],
    queryFn: async () => {
      const { data } = await supabase.from("cities" as any).select("*");
      const map: Record<string, string> = {};
      (data ?? []).forEach((c: any) => { map[c.id] = c.name; });
      return map;
    },
  });

  const { data: venuesMap = {} } = useQuery({
    queryKey: ["venues_map"],
    queryFn: async () => {
      const { data } = await supabase.from("venues" as any).select("*");
      const map: Record<string, any> = {};
      (data ?? []).forEach((v: any) => { map[v.id] = v; });
      return map;
    },
  });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events_full"],
    queryFn: async () => {
      const { data: evts, error } = await (supabase
        .from("events")
        .select("*") as any)
        .is("parent_event_id", null)
        .order("date", { ascending: false });
      if (error) throw error;

      const parentIds = (evts ?? []).filter((e: any) => e.event_type === "multi_day").map((e: any) => e.id);
      let subEventsMap: Record<string, any[]> = {};
      if (parentIds.length > 0) {
        const { data: subs } = await (supabase
          .from("events")
          .select("*") as any)
          .in("parent_event_id", parentIds);
        (subs ?? []).forEach((s: any) => {
          if (!subEventsMap[s.parent_event_id]) subEventsMap[s.parent_event_id] = [];
          subEventsMap[s.parent_event_id].push(s);
        });
      }

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

      return (evts ?? []).map((e: any) => {
        const eventType = e.event_type || "simple";
        let totalIncome = totals[e.id]?.income ?? 0;
        let totalExpenses = totals[e.id]?.expense ?? 0;

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

  // Handle from_reservation query param
  const fromReservationId = searchParams.get("from_reservation");
  const { data: reservationData } = useQuery({
    queryKey: ["reservation-prefill", fromReservationId],
    queryFn: async () => {
      if (!fromReservationId) return null;
      const { data, error } = await supabase
        .from("venue_reservations")
        .select("id, date, venue_id, city_id, notes")
        .eq("id", fromReservationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!fromReservationId,
  });

  useEffect(() => {
    if (reservationData) {
      const venue = (venuesMap as any)[reservationData.venue_id];
      setForm({
        ...emptyForm,
        name: reservationData.notes || "",
        date: reservationData.date,
        venue_id: reservationData.venue_id || "",
        city_id: reservationData.city_id || venue?.city_id || "",
      });
      setReservationId(reservationData.id);
      setShowForm(true);
      setSearchParams({}, { replace: true });
    }
  }, [reservationData, venuesMap]);

  const createMutation = useMutation({
    mutationFn: async (data: EventForm) => {
      const venueName = data.venue_id ? (venuesMap as any)[data.venue_id]?.name : null;
      const cityName = data.city_id ? (citiesMap as any)[data.city_id] : null;
      const locationStr = [venueName, cityName].filter(Boolean).join(", ");

      const { data: newEvent, error } = await supabase.from("events").insert({
        name: data.name,
        date: data.date,
        location: locationStr || null,
        budget: parseFloat(data.budget) || 0,
        tickets_total: parseInt(data.tickets_total) || 0,
        status: data.status,
        event_type: data.event_type,
        pl_mode: data.pl_mode,
        city_id: data.city_id || null,
        venue_id: data.venue_id || null,
      } as any).select().single();
      if (error) throw error;

      const parentId = (newEvent as any).id;

      if (data.event_type === "festival" && data.festival_dates.length > 0) {
        const datesToInsert = data.festival_dates.map(d => ({
          event_id: parentId,
          date: d,
        }));
        const { error: dErr } = await supabase.from("event_dates" as any).insert(datesToInsert);
        if (dErr) throw dErr;
      }

      if (data.event_type === "multi_day") {
        const validSubs = data.sub_events.filter(s => s.name && s.date);
        if (validSubs.length > 0) {
          const subsToInsert = validSubs.map(s => {
            const subVenue = s.venue_id ? (venuesMap as any)[s.venue_id]?.name : null;
            const subCity = s.city_id ? (citiesMap as any)[s.city_id] : null;
            const subLocation = [subVenue, subCity].filter(Boolean).join(", ");
            return {
              name: s.name,
              date: s.date,
              location: subLocation || null,
              city_id: s.city_id || null,
              venue_id: s.venue_id || null,
              status: data.status,
              event_type: "simple",
              parent_event_id: parentId,
              budget: 0,
              tickets_total: 0,
            };
          });
          const { error: sErr } = await supabase.from("events").insert(subsToInsert as any);
          if (sErr) throw sErr;
        }
      }
    },
    onSuccess: async () => {
      // If created from a reservation, delete the reservation
      if (reservationId) {
        await supabase.from("venue_reservations").delete().eq("id", reservationId);
        queryClient.invalidateQueries({ queryKey: ["venue-reservations"] });
        setReservationId(null);
        toast({ title: "Evento criado e reserva convertida com sucesso!" });
      } else {
        toast({ title: "Evento criado com sucesso!" });
      }
      queryClient.invalidateQueries({ queryKey: ["events_full"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["cities_map"] });
      queryClient.invalidateQueries({ queryKey: ["venues_map"] });
      setShowForm(false);
      setForm({ ...emptyForm });
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
    setForm({ ...form, sub_events: [...form.sub_events, { name: "", date: "", city_id: "", venue_id: "" }] });
  };

  const removeSubEvent = (idx: number) => {
    setForm({ ...form, sub_events: form.sub_events.filter((_, i) => i !== idx) });
  };

  const updateSubEvent = (idx: number, field: string, value: string) => {
    const updated = [...form.sub_events];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "city_id") updated[idx].venue_id = "";
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

  const getLocationDisplay = (event: any) => {
    if (event.venue_id && venuesMap[event.venue_id]) {
      const venue = venuesMap[event.venue_id];
      const city = event.city_id ? citiesMap[event.city_id] : null;
      return [venue.name, city].filter(Boolean).join(", ");
    }
    return event.location;
  };

  const statusOrder: Record<string, number> = { active: 0, planning: 1, confirmed: 2, completed: 3, cancelled: 4 };

  const toggleSort = (field: "date" | "location" | "status") => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: "date" | "location" | "status" }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const sortedEvents = [...events].sort((a: any, b: any) => {
    if (!sortField) return 0;
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortField === "date") {
      return (a.date > b.date ? 1 : a.date < b.date ? -1 : 0) * dir;
    }
    if (sortField === "location") {
      const locA = (getLocationDisplay(a) || "").toLowerCase();
      const locB = (getLocationDisplay(b) || "").toLowerCase();
      return locA.localeCompare(locB) * dir;
    }
    if (sortField === "status") {
      return ((statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)) * dir;
    }
    return 0;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Eventos</h1>
          <p className="text-sm text-muted-foreground">Gestão e acompanhamento financeiro por evento</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-secondary/50 p-0.5">
            <button
              onClick={() => { setViewMode("cards"); localStorage.setItem("events-view-mode", "cards"); }}
              className={`rounded-md p-1.5 transition-all ${viewMode === "cards" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              title="Vista em cartões"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setViewMode("list"); localStorage.setItem("events-view-mode", "list"); }}
              className={`rounded-md p-1.5 transition-all ${viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              title="Vista em lista"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo Evento</span>
          </button>
        </div>
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

              {/* P&L Mode */}
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">Modo P&L *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, pl_mode: "active" })}
                    className={`rounded-lg border p-3 text-xs font-medium transition-all text-left ${
                      form.pl_mode === "active"
                        ? "border-success bg-success/10 text-success"
                        : "border-border bg-background text-muted-foreground hover:border-success/40"
                    }`}
                  >
                    <span className="block font-semibold">P&L Ativo</span>
                    <span className="block text-[10px] opacity-70 mt-0.5">Controla saldo por categoria do P&L</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, pl_mode: "passive" })}
                    className={`rounded-lg border p-3 text-xs font-medium transition-all text-left ${
                      form.pl_mode === "passive"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <span className="block font-semibold">P&L Passivo</span>
                    <span className="block text-[10px] opacity-70 mt-0.5">Transações livres sem controlo</span>
                  </button>
                </div>
              </div>

              {/* City / Venue for simple and festival */}
              {form.event_type !== "multi_day" && (
                <CityVenueSelector
                  cityId={form.city_id}
                  venueId={form.venue_id}
                  onCityChange={(id) => setForm({ ...form, city_id: id, venue_id: "" })}
                  onVenueChange={(id) => setForm({ ...form, venue_id: id })}
                />
              )}

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

              {/* Multi-day: Sub-events with city/venue */}
              {form.event_type === "multi_day" && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-muted-foreground">Datas / Locais da Turnê</label>
                  <div className="space-y-3">
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
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={sub.name}
                            onChange={(e) => updateSubEvent(idx, "name", e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="Nome (ex: Lisboa)"
                          />
                          <input
                            type="date"
                            value={sub.date}
                            onChange={(e) => updateSubEvent(idx, "date", e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                        </div>
                        <CityVenueSelector
                          cityId={sub.city_id}
                          venueId={sub.venue_id}
                          onCityChange={(id) => updateSubEvent(idx, "city_id", id)}
                          onVenueChange={(id) => updateSubEvent(idx, "venue_id", id)}
                          compact
                        />
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
      ) : viewMode === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sortedEvents.map((event: any) => {
            const profit = event.totalIncome - event.totalExpenses;
            const budgetUsed = event.budget > 0 ? (event.totalExpenses / event.budget) * 100 : 0;
            const eventType = event.event_type as EventType;
            const locationDisplay = getLocationDisplay(event);
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

                {locationDisplay && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{locationDisplay}</span>
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
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">Evento</th>
                <th className="px-4 py-3 hidden sm:table-cell cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("date")}>
                  <div className="flex items-center gap-1">Data <SortIcon field="date" /></div>
                </th>
                <th className="px-4 py-3 hidden md:table-cell cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("location")}>
                  <div className="flex items-center gap-1">Local <SortIcon field="location" /></div>
                </th>
                <th className="px-4 py-3 hidden sm:table-cell cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("status")}>
                  <div className="flex items-center gap-1">Estado <SortIcon field="status" /></div>
                </th>
                <th className="px-4 py-3 text-right">Receitas</th>
                <th className="px-4 py-3 text-right">Despesas</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">Lucro</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {sortedEvents.map((event: any) => {
                const profit = event.totalIncome - event.totalExpenses;
                const eventType = event.event_type as EventType;
                const locationDisplay = getLocationDisplay(event);
                const isMultiDay = eventType === "multi_day" && event.subEvents?.length > 0;
                return (
                  <>
                    <tr key={event.id} className="border-b border-border/30 last:border-0 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/eventos/${event.id}`} className="group">
                          <div className="flex items-center gap-2">
                            <span className="font-medium group-hover:text-primary transition-colors">{event.name}</span>
                            <EventTypeBadge type={eventType} />
                            {isMultiDay && (
                              <span className="text-[10px] text-muted-foreground">{event.subEvents.length} datas</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground sm:hidden mt-0.5">{formatDate(event.date)}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{formatDate(event.date)}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {locationDisplay ? (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[180px]">{locationDisplay}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <EventStatusBadge status={event.status as any} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-medium text-success">{formatCurrency(event.totalIncome)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-medium text-warning">{formatCurrency(event.totalExpenses)}</td>
                      <td className={`px-4 py-3 text-right font-mono text-sm font-bold hidden sm:table-cell ${profit >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(profit)}
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/eventos/${event.id}`} className="text-muted-foreground hover:text-primary transition-colors">
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                    {isMultiDay && event.subEvents.map((sub: any) => {
                      const subLocation = getLocationDisplay(sub);
                      return (
                        <tr key={sub.id} className="border-b border-border/20 last:border-0 hover:bg-secondary/20 transition-colors bg-secondary/10">
                          <td className="px-4 py-2.5 pl-10">
                            <Link to={`/eventos/${sub.id}`} className="group">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">└</span>
                                <span className="text-sm group-hover:text-primary transition-colors">{sub.name}</span>
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{formatDate(sub.date)}</td>
                          <td className="px-4 py-2.5 hidden md:table-cell">
                            {subLocation ? (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate max-w-[180px]">{subLocation}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 hidden sm:table-cell">
                            <EventStatusBadge status={sub.status as any} />
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground" colSpan={1}>—</td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground" colSpan={1}>—</td>
                          <td className="px-4 py-2.5 hidden sm:table-cell"></td>
                          <td className="px-4 py-2.5">
                            <Link to={`/eventos/${sub.id}`} className="text-muted-foreground hover:text-primary transition-colors">
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
