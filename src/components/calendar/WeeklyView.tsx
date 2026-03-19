import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  planning: { label: "Planeamento", color: "bg-warning/15 text-warning border-warning/30", dot: "bg-warning" },
  confirmed: { label: "Confirmado", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", dot: "bg-blue-500" },
  active: { label: "Ativo", color: "bg-success/15 text-success border-success/30", dot: "bg-success" },
  completed: { label: "Concluído", color: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30", dot: "bg-muted-foreground" },
  reservation: { label: "Reserva", color: "bg-purple-500/15 text-purple-400 border-purple-500/30", dot: "bg-purple-500" },
};

const DAY_NAMES_FULL = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

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

interface WeeklyViewProps {
  events: CalendarEvent[];
  weekStart: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onGoToday: () => void;
}

function formatDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function WeeklyView({ events, weekStart, onPrevWeek, onNextWeek, onGoToday }: WeeklyViewProps) {
  const navigate = useNavigate();
  const todayStr = formatDateStr(new Date());

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekStart]);

  const weekLabel = useMemo(() => {
    const first = weekDays[0];
    const last = weekDays[6];
    const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
    return `${first.toLocaleDateString("pt-PT", opts)} — ${last.toLocaleDateString("pt-PT", { ...opts, year: "numeric" })}`;
  }, [weekDays]);

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={onPrevWeek} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-lg font-semibold min-w-[240px] text-center">{weekLabel}</h2>
          <button onClick={onNextWeek} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button onClick={onGoToday} className="text-xs font-medium text-primary hover:underline">Hoje</button>
      </div>

      <div className="grid grid-cols-7 divide-x divide-border border border-border rounded-lg overflow-hidden">
        {weekDays.map((day, i) => {
          const dateStr = formatDateStr(day);
          const isToday = dateStr === todayStr;
          const dayEvents = events.filter((ev) => ev.date === dateStr);

          return (
            <div
              key={i}
              className={cn(
                "p-2 min-h-[200px] transition-colors",
                isToday ? "bg-primary/5" : ""
              )}
            >
              <div className="text-center mb-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase">{DAY_NAMES_FULL[i]}</p>
                <span className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                  isToday ? "bg-primary text-primary-foreground" : ""
                )}>
                  {day.getDate()}
                </span>
              </div>

              <div className="space-y-1">
                {dayEvents.map((ev, j) => {
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
                        "w-full text-left rounded-md px-1.5 py-1 text-[11px] font-medium border transition-colors hover:opacity-80",
                        cfg.color,
                        ev.isReservation && "italic"
                      )}
                      title={`${ev.name}${ev.venue_name ? ` — ${ev.venue_name}` : ""}`}
                    >
                      <p className="truncate">{ev.name}</p>
                      {ev.venue_name && (
                        <p className="text-[9px] opacity-70 truncate">{ev.venue_name}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
