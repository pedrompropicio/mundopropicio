import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, MapPin, Music, CalendarDays, Plus, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { VenueReservationModal } from "@/components/calendar/VenueReservationModal";
import { ScheduledEventsPanel } from "@/components/calendar/ScheduledEventsPanel";

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
};

interface CalendarEvent {
  id: string;
  name: string;
  date: string;
  status: string;
  venue_name?: string;
  city_name?: string;
  event_type: string;
}

export default function EventCalendar() {
  const navigate = useNavigate();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [showScheduledPanel, setShowScheduledPanel] = useState(false);

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

  // Build enriched events with all dates
  const calendarEvents = useMemo(() => {
    const venueMap = Object.fromEntries(venues.map((v) => [v.id, v]));
    const cityMap = Object.fromEntries(cities.map((c) => [c.id, c]));
    const eventMap = Object.fromEntries(events.map((e) => [e.id, e]));

    // Filter out parent events (event_type === 'multi_day' with no parent_event_id)
    const visibleEvents = events.filter((ev) => {
      const hasChildren = events.some((child) => child.parent_event_id === ev.id);
      return !hasChildren;
    });

    const result: CalendarEvent[] = [];

    visibleEvents.forEach((ev) => {
      const venue = ev.venue_id ? venueMap[ev.venue_id] : null;
      const city = ev.city_id ? cityMap[ev.city_id] : venue ? cityMap[venue.city_id] : null;
      const parentEvent = ev.parent_event_id ? eventMap[ev.parent_event_id] : null;

      // Build display name: "Parent Name — City" for sub-events, or just event name
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

      // Add main date
      result.push({ ...base, date: ev.date });

      // Add extra dates (festivals/multi-day)
      const extras = eventDates.filter((ed) => ed.event_id === ev.id && ed.date !== ev.date);
      extras.forEach((ed) => {
        result.push({ ...base, date: ed.date });
      });
    });

    return result;
  }, [events, eventDates, venues, cities]);

  // Calendar grid
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Monday = 0
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
  const venueReservations = useMemo(() => {
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
    const monthEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
    return calendarEvents
      .filter((ev) => ev.venue_name && ev.date >= monthStart && ev.date <= monthEnd)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [calendarEvents, currentMonth, currentYear, daysInMonth]);

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
            variant="outline"
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

      {/* Calendar navigation */}
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
        <div className="grid grid-cols-7 gap-px mb-1">
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-px">
          {calendarDays.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} className="min-h-[80px] lg:min-h-[100px]" />;

            const dayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = dayStr === todayStr;
            const dayEvents = getEventsForDay(day);

            return (
              <div
                key={day}
                className={cn(
                  "min-h-[80px] lg:min-h-[100px] rounded-lg p-1 transition-colors border",
                  isToday ? "border-primary/50 bg-primary/5" : "border-transparent hover:bg-secondary/30",
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
                        onClick={() => navigate(`/eventos/${ev.id}`)}
                        className={cn(
                          "w-full text-left rounded px-1 py-0.5 text-[10px] lg:text-xs font-medium truncate border transition-colors hover:opacity-80",
                          cfg.color
                        )}
                        title={`${ev.name}${ev.venue_name ? ` — ${ev.venue_name}` : ""}`}
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

      {/* Venue reservations */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Salas de Espetáculo Reservadas — {MONTH_NAMES[currentMonth]}
        </h3>

        {venueReservations.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Sem reservas de salas neste mês
          </p>
        ) : (
          <div className="space-y-2">
            {venueReservations.map((ev, i) => {
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
        )}
      </div>
      {/* Scheduled events panel */}
      <ScheduledEventsPanel
        open={showScheduledPanel}
        onOpenChange={setShowScheduledPanel}
        events={calendarEvents}
      />

      {/* Venue reservation modal */}
      <VenueReservationModal
        open={showReservationModal}
        onOpenChange={setShowReservationModal}
      />
    </div>
  );
}
