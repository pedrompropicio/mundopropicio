import { useMemo } from "react";
import { CalendarClock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  planning: { label: "Planeamento", color: "bg-warning/15 text-warning border-warning/30", dot: "bg-warning" },
  confirmed: { label: "Confirmado", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", dot: "bg-blue-500" },
  active: { label: "Ativo", color: "bg-success/15 text-success border-success/30", dot: "bg-success" },
};

interface ScheduledEvent {
  id: string;
  name: string;
  date: string;
  status: string;
  venue_name?: string;
  city_name?: string;
}

interface ScheduledEventsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: ScheduledEvent[];
}

export function ScheduledEventsPanel({ open, onOpenChange, events }: ScheduledEventsPanelProps) {
  const navigate = useNavigate();

  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }, []);

  // Future events sorted by date
  const upcomingEvents = useMemo(() => {
    return events
      .filter((ev) => ev.date >= todayStr && ["planning", "confirmed", "active"].includes(ev.status))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, todayStr]);

  if (!open) return null;

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          Eventos Programados ({upcomingEvents.length})
        </h3>
        <button
          onClick={() => onOpenChange(false)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Fechar
        </button>
      </div>

      {upcomingEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Sem eventos programados
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {upcomingEvents.map((ev) => {
            const cfg = STATUS_CONFIG[ev.status] ?? STATUS_CONFIG.planning;
            const dateFormatted = new Date(ev.date + "T12:00:00").toLocaleDateString("pt-PT", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
            return (
              <button
                key={ev.id}
                onClick={() => navigate(`/eventos/${ev.id}`)}
                className="w-full flex items-center gap-3 rounded-lg p-2.5 hover:bg-secondary/30 transition-colors text-left group"
              >
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", cfg.dot)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ev.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {dateFormatted}
                    {ev.venue_name ? ` • ${ev.venue_name}` : ""}
                    {ev.city_name ? ` • ${ev.city_name}` : ""}
                  </p>
                </div>
                <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0", cfg.color)}>
                  {cfg.label}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}