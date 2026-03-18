import { useMemo } from "react";
import { cn } from "@/lib/utils";

const MONTH_NAMES_SHORT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const STATUS_DOTS: Record<string, string> = {
  planning: "bg-warning",
  confirmed: "bg-blue-500",
  active: "bg-success",
  completed: "bg-muted-foreground",
  reservation: "bg-purple-500",
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

interface AnnualViewProps {
  events: CalendarEvent[];
  currentYear: number;
}

function formatDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function AnnualView({ events, currentYear }: AnnualViewProps) {
  const todayStr = useMemo(() => {
    const t = new Date();
    return formatDateStr(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((ev) => {
      if (!ev.date.startsWith(String(currentYear))) return;
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    });
    return map;
  }, [events, currentYear]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 12 }, (_, month) => {
        const firstDay = new Date(currentYear, month, 1);
        const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
        const startDow = (firstDay.getDay() + 6) % 7; // Mon=0

        const days: (number | null)[] = [];
        for (let i = 0; i < startDow; i++) days.push(null);
        for (let d = 1; d <= daysInMonth; d++) days.push(d);
        while (days.length % 7 !== 0) days.push(null);

        return (
          <div key={month} className="glass rounded-xl p-3">
            <h4 className="text-sm font-semibold text-center mb-2">{MONTH_NAMES_SHORT[month]}</h4>
            <div className="grid grid-cols-7 gap-px text-center">
              {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
                <div key={i} className="text-[9px] text-muted-foreground font-medium py-0.5">{d}</div>
              ))}
              {days.map((day, i) => {
                if (day === null) return <div key={`e-${i}`} className="h-6" />;
                const dateStr = formatDateStr(currentYear, month, day);
                const isToday = dateStr === todayStr;
                const dayEvents = eventsByDate.get(dateStr) || [];
                const hasEvents = dayEvents.length > 0;

                // Get unique status dots (max 3)
                const uniqueStatuses = [...new Set(dayEvents.map((e) => e.status))].slice(0, 3);

                return (
                  <div
                    key={day}
                    className={cn(
                      "h-6 flex flex-col items-center justify-center rounded relative group cursor-default",
                      isToday && "bg-primary text-primary-foreground rounded-full",
                      hasEvents && !isToday && "bg-secondary/40 rounded"
                    )}
                    title={dayEvents.map((e) => e.name).join(", ")}
                  >
                    <span className="text-[10px] leading-none">{day}</span>
                    {hasEvents && (
                      <div className="flex gap-px absolute -bottom-0.5">
                        {uniqueStatuses.map((s, j) => (
                          <span key={j} className={cn("h-1 w-1 rounded-full", STATUS_DOTS[s] || "bg-primary")} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
