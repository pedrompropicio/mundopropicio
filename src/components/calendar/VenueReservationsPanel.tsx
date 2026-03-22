import { useMemo } from "react";
import { Building2, ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface VenueReservation {
  id: string;
  date: string;
  venue_name: string;
  city_name: string;
  notes: string | null;
}

interface VenueReservationsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservations: VenueReservation[];
}

export function VenueReservationsPanel({ open, onOpenChange, reservations }: VenueReservationsPanelProps) {
  const navigate = useNavigate();

  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }, []);

  const upcoming = useMemo(() => {
    return reservations
      .filter((r) => r.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [reservations, todayStr]);

  if (!open) return null;

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4 text-purple-400" />
          Salas Reservadas ({upcoming.length})
        </h3>
        <button
          onClick={() => onOpenChange(false)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Fechar
        </button>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Sem reservas de sala futuras
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {upcoming.map((r) => {
            const dateFormatted = new Date(r.date + "T12:00:00").toLocaleDateString("pt-PT", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
            return (
              <button
                key={r.id}
                onClick={() => navigate(`/eventos?from_reservation=${r.id}`)}
                className="w-full flex items-center gap-3 rounded-lg p-2.5 hover:bg-secondary/30 transition-colors text-left group"
              >
                <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-purple-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate italic">
                    {r.notes || `Reserva — ${r.venue_name}`}
                  </p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {dateFormatted} • {r.venue_name}
                    {r.city_name ? ` • ${r.city_name}` : ""}
                  </p>
                </div>
                <span className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0 bg-purple-500/15 text-purple-400 border border-purple-500/30">
                  Reserva
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
