import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, MapPin, Music, CalendarDays, Plus, CalendarClock, FileDown, ArrowRightCircle, Trash2, LayoutGrid, List, Calendar, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { VenueReservationModal } from "@/components/calendar/VenueReservationModal";
import { ScheduledEventsPanel } from "@/components/calendar/ScheduledEventsPanel";
import { VenueReservationsPanel } from "@/components/calendar/VenueReservationsPanel";
import { WeeklyView } from "@/components/calendar/WeeklyView";
import { AgendaView } from "@/components/calendar/AgendaView";
import { AnnualView } from "@/components/calendar/AnnualView";
import { exportVenueReservationsToPDF } from "@/lib/export-venue-reservations";
import { toast } from "sonner";

type CalendarViewMode = "month" | "week" | "agenda" | "year";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  planning: { label: "Planeamento", color: "bg-warning/15 text-warning border-warning/30", dot: "bg-warning" },
  confirmed: { label: "Confirmado", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", dot: "bg-blue-500" },
  active: { label: "Ativo", color: "bg-success/15 text-success border-success/30", dot: "bg-success" },
  completed: { label: "Concluído", color: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30", dot: "bg-muted-foreground" },
  reservation: { label: "Reserva", color: "bg-purple-500/15 text-purple-400 border-purple-500/30", dot: "bg-purple-500" },
};

interface CalendarEvent {
  id: string;
  name: string;
  date: string;
  status: string;
  venue_name?: string;
  city_name?: string;
  event_type: string;
  isReservation?: boolean;
}

export default function EventCalendar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [showScheduledPanel, setShowScheduledPanel] = useState(false);
  const [showReservationsPanel, setShowReservationsPanel] = useState(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.getFullYear(), d.getMonth(), diff);
  });

  const { data: events = [] } = useQuery({
    queryKey: ["calendar-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, status, event_type, venue_id, city_id, parent_event_id")
        .in("status", ["planning", "confirmed", "active", "completed"])
        .order("date");
      if (error) throw error;
      return data;
    },
  });

  const { data: eventDates = [] } = useQuery({
    queryKey: ["calendar-event-dates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_dates")
        .select("event_id, date, label");
      if (error) throw error;
      return data;
    },
  });

  const { data: venues = [] } = useQuery({
    queryKey: ["calendar-venues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venues")
        .select("id, name, city_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: cities = [] } = useQuery({
    queryKey: ["calendar-cities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cities")
        .select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const { data: venueReservationsRaw = [] } = useQuery({
    queryKey: ["venue-reservations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_reservations")
        .select("id, date, venue_id, city_id, notes")
        .order("date");
      if (error) throw error;
      return data;
    },
  });

  const convertToEventMutation = useMutation({
    mutationFn: async (reservation: { id: string; date: string; venue_id: string; city_id: string | null; notes: string | null }) => {
      const venue = venues.find((v) => v.id === reservation.venue_id);
      // Create event
      const { error: insertErr } = await supabase.from("events").insert({
        name: reservation.notes || `Evento — ${venue?.name || "Sala"}`,
        date: reservation.date,
        venue_id: reservation.venue_id,
        city_id: reservation.city_id || venue?.city_id || null,
        status: "planning",
        event_type: "simple",
      });
      if (insertErr) throw insertErr;
      // Delete reservation
      const { error: delErr } = await supabase.from("venue_reservations").delete().eq("id", reservation.id);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      toast.success("Reserva convertida em evento com sucesso");
      queryClient.invalidateQueries({ queryKey: ["venue-reservations"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (err: any) => toast.error("Erro: " + err.message),
  });

  const deleteReservationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("venue_reservations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reserva eliminada");
      queryClient.invalidateQueries({ queryKey: ["venue-reservations"] });
    },
    onError: (err: any) => toast.error("Erro: " + err.message),
  });

  // Build enriched events with all dates
  const calendarEvents = useMemo(() => {
    const venueMap = Object.fromEntries(venues.map((v) => [v.id, v]));
    const cityMap = Object.fromEntries(cities.map((c) => [c.id, c]));
    const eventMap = Object.fromEntries(events.map((e) => [e.id, e]));

    // Filter out parent events
    const visibleEvents = events.filter((ev) => {
      const hasChildren = events.some((child) => child.parent_event_id === ev.id);
      return !hasChildren;
    });

    const result: CalendarEvent[] = [];

    visibleEvents.forEach((ev) => {
      const venue = ev.venue_id ? venueMap[ev.venue_id] : null;
      const city = ev.city_id ? cityMap[ev.city_id] : venue ? cityMap[venue.city_id] : null;
      const parentEvent = ev.parent_event_id ? eventMap[ev.parent_event_id] : null;

      let displayName = ev.name;
      if (parentEvent) {
        const parts = [parentEvent.name];
        if (city?.name) parts.push(city.name);
        displayName = parts.join(" — ");
      }

      const base = {
        id: ev.id,
        name: displayName,
        status: ev.status,
        venue_name: venue?.name,
        city_name: city?.name,
        event_type: ev.event_type,
      };

      result.push({ ...base, date: ev.date });

      const extras = eventDates.filter((ed) => ed.event_id === ev.id && ed.date !== ev.date);
      extras.forEach((ed) => {
        result.push({ ...base, date: ed.date });
      });
    });

    // Add venue reservations to calendar
    venueReservationsRaw.forEach((r) => {
      const venue = r.venue_id ? venueMap[r.venue_id] : null;
      const city = r.city_id ? cityMap[r.city_id] : venue ? cityMap[venue.city_id] : null;
      result.push({
        id: r.id,
        name: r.notes || `Reserva — ${venue?.name || "Sala"}`,
        date: r.date,
        status: "reservation",
        venue_name: venue?.name,
        city_name: city?.name,
        event_type: "reservation",
        isReservation: true,
      });
    });

    return result;
  }, [events, eventDates, venues, cities, venueReservationsRaw]);

  // Calendar grid
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const startDayOfWeek = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [startDayOfWeek, daysInMonth]);

  const getEventsForDay = (day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return calendarEvents.filter((ev) => {
      if (selectedFilter && ev.status !== selectedFilter) return false;
      return ev.date === dateStr;
    });
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  const goToday = () => { setCurrentMonth(today.getMonth()); setCurrentYear(today.getFullYear()); };

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Stats
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { planning: 0, confirmed: 0, active: 0 };
    events.forEach((ev) => { if (counts[ev.status] !== undefined) counts[ev.status]++; });
    return counts;
  }, [events]);

  // Venue reservations for this month
  const monthReservations = useMemo(() => {
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
    const monthEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    // Real venue reservations
    const reservations = venueReservationsRaw
      .filter((r) => r.date >= monthStart && r.date <= monthEnd)
      .map((r) => {
        const venue = venues.find((v) => v.id === r.venue_id);
        const city = r.city_id
          ? cities.find((c) => c.id === r.city_id)
          : venue ? cities.find((c) => c.id === venue.city_id) : null;
        return { ...r, venue_name: venue?.name || "", city_name: city?.name || "" };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // Events with venues in this month
    const eventsWithVenues = calendarEvents
      .filter((ev) => !ev.isReservation && ev.venue_name && ev.date >= monthStart && ev.date <= monthEnd)
      .sort((a, b) => a.date.localeCompare(b.date));

    return { reservations, eventsWithVenues };
  }, [venueReservationsRaw, calendarEvents, currentMonth, currentYear, daysInMonth, venues, cities]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Calendário de Eventos
          </h1>
          <p className="text-sm text-muted-foreground">Visualize todos os eventos e reservas de salas</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            variant={showScheduledPanel ? "default" : "outline"}
            onClick={() => setShowScheduledPanel((v) => !v)}
            className="gap-1.5"
          >
            <CalendarClock className="h-4 w-4" />
            <span className="hidden sm:inline">Programados</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setShowReservationModal(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Reservar Sala</span>
          </Button>
        </div>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {(["planning", "confirmed", "active"] as const).map((status) => {
          const cfg = STATUS_CONFIG[status];
          const isSelected = selectedFilter === status;
          return (
            <button
              key={status}
              onClick={() => setSelectedFilter(isSelected ? null : status)}
              className={cn(
                "glass rounded-xl p-3 text-left transition-all border",
                isSelected ? cfg.color : "border-transparent hover:border-border/50"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("h-2.5 w-2.5 rounded-full", cfg.dot)} />
                <span className="text-xs font-medium text-muted-foreground">{cfg.label}</span>
              </div>
              <p className="text-xl font-bold">{statusCounts[status]}</p>
            </button>
          );
        })}
      </div>

      {/* View mode switcher */}
      <div className="flex items-center gap-1 glass rounded-lg p-1 w-fit">
        {([
          { mode: "month" as const, icon: LayoutGrid, label: "Mês" },
          { mode: "week" as const, icon: Calendar, label: "Semana" },
          { mode: "agenda" as const, icon: List, label: "Lista" },
          { mode: "year" as const, icon: CalendarDays, label: "Ano" },
        ]).map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              viewMode === mode
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Monthly view */}
      {viewMode === "month" && (
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-semibold min-w-[180px] text-center">
                {MONTH_NAMES[currentMonth]} {currentYear}
              </h2>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button onClick={goToday} className="text-xs font-medium text-primary hover:underline">
              Hoje
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-muted-foreground/30">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2 border-r border-muted-foreground/30 last:border-r-0">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 border-l border-muted-foreground/30">
            {calendarDays.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} className="min-h-[80px] lg:min-h-[100px] border-r border-b border-muted-foreground/30" />;

              const dayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = dayStr === todayStr;
              const dayEvents = getEventsForDay(day);

              return (
                <div
                  key={day}
                  className={cn(
                    "min-h-[80px] lg:min-h-[100px] p-1 transition-colors border-r border-b border-muted-foreground/30",
                    isToday ? "bg-primary/5" : "hover:bg-secondary/30",
                  )}
                >
                  <span className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                  )}>
                    {day}
                  </span>

                  <div className="mt-0.5 space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev, j) => {
                      const cfg = STATUS_CONFIG[ev.status] ?? STATUS_CONFIG.planning;
                      return (
                        <button
                          key={`${ev.id}-${j}`}
                          onClick={() => {
                            if (ev.isReservation) {
                              navigate(`/eventos?from_reservation=${ev.id}`);
                            } else {
                              navigate(`/eventos/${ev.id}`);
                            }
                          }}
                          className={cn(
                            "w-full text-left rounded px-1 py-0.5 text-[10px] lg:text-xs font-medium truncate border transition-colors hover:opacity-80",
                            cfg.color,
                            ev.isReservation && "italic"
                          )}
                          title={`${ev.name}${ev.venue_name ? ` — ${ev.venue_name}` : ""}${ev.isReservation ? " (Reserva)" : ""}`}
                        >
                          <span className="hidden lg:inline">{ev.name}</span>
                          <span className="lg:hidden">{ev.name.slice(0, 10)}{ev.name.length > 10 ? "…" : ""}</span>
                        </button>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} mais</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly view */}
      {viewMode === "week" && (
        <WeeklyView
          events={calendarEvents}
          weekStart={weekStart}
          onPrevWeek={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}
          onNextWeek={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}
          onGoToday={() => {
            const d = new Date();
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            setWeekStart(new Date(d.getFullYear(), d.getMonth(), diff));
          }}
        />
      )}

      {/* Agenda view */}
      {viewMode === "agenda" && (
        <>
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h2 className="text-lg font-semibold min-w-[180px] text-center">
                  {MONTH_NAMES[currentMonth]} {currentYear}
                </h2>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <button onClick={goToday} className="text-xs font-medium text-primary hover:underline">Hoje</button>
            </div>
          </div>
          <AgendaView events={calendarEvents} currentMonth={currentMonth} currentYear={currentYear} />
        </>
      )}

      {/* Annual view */}
      {viewMode === "year" && (
        <>
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentYear((y) => y - 1)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h2 className="text-lg font-semibold min-w-[80px] text-center">{currentYear}</h2>
                <button onClick={() => setCurrentYear((y) => y + 1)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <button onClick={() => setCurrentYear(today.getFullYear())} className="text-xs font-medium text-primary hover:underline">Hoje</button>
            </div>
          </div>
          <AnnualView events={calendarEvents} currentYear={currentYear} onMonthClick={(month) => { setCurrentMonth(month); setViewMode("month"); }} />
        </>
      )}

      {/* Venue reservations */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Reservas de Sala — {MONTH_NAMES[currentMonth]}
          </h3>
          {monthReservations.reservations.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-7 text-xs"
              onClick={() =>
                exportVenueReservationsToPDF(
                  monthReservations.reservations.map((r) => ({
                    name: r.notes || "Reserva",
                    date: r.date,
                    venue_name: r.venue_name,
                    city_name: r.city_name,
                    status: "reservation",
                  })),
                  `${MONTH_NAMES[currentMonth]} ${currentYear}`
                )
              }
            >
              <FileDown className="h-3.5 w-3.5" />
              PDF
            </Button>
          )}
        </div>

        {monthReservations.reservations.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Sem reservas de sala neste mês
          </p>
        ) : (
          <div className="space-y-2">
            {monthReservations.reservations.map((r) => {
              const dateFormatted = new Date(r.date + "T12:00:00").toLocaleDateString("pt-PT", {
                day: "2-digit",
                month: "short",
              });
              return (
              <div
                  key={r.id}
                  onClick={() => navigate(`/eventos?from_reservation=${r.id}`)}
                  className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-secondary/30 transition-colors cursor-pointer"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400 border border-purple-500/30">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {r.venue_name}
                      {r.city_name ? ` • ${r.city_name}` : ""}
                    </p>
                    {r.notes && (
                      <p className="text-xs text-muted-foreground truncate">{r.notes}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium">{dateFormatted}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Converter em evento"
                      onClick={() => convertToEventMutation.mutate(r)}
                    >
                      <ArrowRightCircle className="h-3.5 w-3.5 text-primary" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Eliminar reserva"
                      onClick={() => {
                        if (confirm("Eliminar esta reserva de sala?")) {
                          deleteReservationMutation.mutate(r.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Events with venues this month */}
      {monthReservations.eventsWithVenues.length > 0 && (
        <div className="glass rounded-xl p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Music className="h-4 w-4 text-primary" />
            Eventos com Sala — {MONTH_NAMES[currentMonth]}
          </h3>
          <div className="space-y-2">
            {monthReservations.eventsWithVenues.map((ev, i) => {
              const cfg = STATUS_CONFIG[ev.status] ?? STATUS_CONFIG.planning;
              const dateFormatted = new Date(ev.date + "T12:00:00").toLocaleDateString("pt-PT", {
                day: "2-digit",
                month: "short",
              });
              return (
                <button
                  key={`${ev.id}-${ev.date}-${i}`}
                  onClick={() => navigate(`/eventos/${ev.id}`)}
                  className="w-full flex items-center gap-3 rounded-lg p-2.5 hover:bg-secondary/30 transition-colors text-left"
                >
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", cfg.color)}>
                    <Music className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ev.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ev.venue_name}{ev.city_name ? ` • ${ev.city_name}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium">{dateFormatted}</p>
                    <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium", cfg.color)}>
                      {cfg.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Scheduled events panel */}
      <ScheduledEventsPanel
        open={showScheduledPanel}
        onOpenChange={setShowScheduledPanel}
        events={calendarEvents.filter((e) => !e.isReservation)}
      />

      {/* Venue reservation modal */}
      <VenueReservationModal
        open={showReservationModal}
        onOpenChange={setShowReservationModal}
      />
    </div>
  );
}
