import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";

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

interface AgendaViewProps {
  events: CalendarEvent[];
  currentMonth: number;
  currentYear: number;
}

export function AgendaView({ events, currentMonth, currentYear }: AgendaViewProps) {
  const navigate = useNavigate();

  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }, []);

  // Group events by week
  const weeks = useMemo(() => {
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const monthEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    const filtered = events
      .filter((ev) => ev.date >= monthStart && ev.date <= monthEnd)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Group by ISO week
    const weekMap = new Map<string, CalendarEvent[]>();
    filtered.forEach((ev) => {
      const d = new Date(ev.date + "T12:00:00");
      // Get Monday of the week
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;

      if (!weekMap.has(weekKey)) weekMap.set(weekKey, []);
      weekMap.get(weekKey)!.push(ev);
    });

    return Array.from(weekMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [events, currentMonth, currentYear]);

  if (weeks.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Sem eventos neste mês</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {weeks.map(([weekKey, weekEvents]) => {
        const monday = new Date(weekKey + "T12:00:00");
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        const weekLabel = `${monday.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })} — ${sunday.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}`;

        return (
          <div key={weekKey} className="glass rounded-xl p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Semana de {weekLabel}
            </h3>
            <div className="divide-y divide-border/60">
              {weekEvents.map((ev, i) => {
                const cfg = STATUS_CONFIG[ev.status] ?? STATUS_CONFIG.planning;
                const isToday = ev.date === todayStr;
                const dateFormatted = new Date(ev.date + "T12:00:00").toLocaleDateString("pt-PT", {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                });

                return (
                  <button
                    key={`${ev.id}-${i}`}
                    onClick={() => {
                      if (ev.isReservation) {
                        navigate(`/eventos?from_reservation=${ev.id}`);
                      } else {
                        navigate(`/eventos/${ev.id}`);
                      }
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg p-2.5 transition-colors text-left group",
                      isToday ? "bg-primary/5 border border-primary/30" : "hover:bg-secondary/30",
                      ev.isReservation && "italic"
                    )}
                  >
                    <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", cfg.dot)} />
                    <div className="w-24 shrink-0">
                      <p className={cn("text-xs font-medium capitalize", isToday && "text-primary")}>{dateFormatted}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ev.name}</p>
                      {ev.venue_name && (
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {ev.venue_name}{ev.city_name ? ` • ${ev.city_name}` : ""}
                        </p>
                      )}
                    </div>
                    <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0 border", cfg.color)}>
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
