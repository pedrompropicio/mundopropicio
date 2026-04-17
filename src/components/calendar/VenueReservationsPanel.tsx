import { useMemo, useState } from "react";
import { Building2, ChevronRight, MapPin, FileText, MoreHorizontal, Pencil, Trash2, ArrowRightCircle } from "lucide-react";
import { cn, formatDatePTOptions } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { exportVenueReservationsPanelPDF } from "@/lib/export-venue-reservations-panel";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export interface VenueReservation {
  id: string;
  date: string;
  venue_id: string;
  city_id: string | null;
  venue_name: string;
  city_name: string;
  notes: string | null;
}

interface VenueReservationsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservations: VenueReservation[];
  onEdit: (reservation: VenueReservation) => void;
  onDelete: (id: string) => void;
  onConvertToEvent: (reservation: VenueReservation) => void;
}

export function VenueReservationsPanel({
  open,
  onOpenChange,
  reservations,
  onEdit,
  onDelete,
  onConvertToEvent,
}: VenueReservationsPanelProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }, []);

  const upcoming = useMemo(() => {
    return reservations
      .filter((r) => r.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [reservations, todayStr]);

  const groupedByMonth = useMemo(() => {
    const groups = new Map<string, VenueReservation[]>();
    upcoming.forEach((r) => {
      const d = new Date(r.date + "T12:00:00");
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [upcoming]);

  if (!open) return null;

  return (
    <>
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-purple-400" />
            Salas Reservadas ({upcoming.length})
          </h3>
          <div className="flex items-center gap-2">
            {upcoming.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => exportVenueReservationsPanelPDF(upcoming)}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              PDF
            </Button>
            )}
            <button
              onClick={() => onOpenChange(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>

        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Sem reservas de sala futuras
          </p>
        ) : (
          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            {groupedByMonth.map(([monthKey, items]) => {
              const [year, month] = monthKey.split("-");
              const monthLabel = `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;

              return (
                <div key={monthKey}>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 sticky top-0 bg-background/80 backdrop-blur-sm py-1">
                    {monthLabel} ({items.length})
                  </h4>
                  <div className="space-y-1">
                    {items.map((r) => {
                      const dateFormatted = formatDatePTOptions(r.date, {
                        day: "2-digit",
                        month: "short",
                      });
                      return (
                        <div
                          key={r.id}
                          className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-secondary/30 transition-colors group"
                        >
                          <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-purple-500" />
                          <div className="w-16 shrink-0">
                            <p className="text-xs font-medium">{dateFormatted}</p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate italic">
                              {r.notes || `Reserva — ${r.venue_name}`}
                            </p>
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {r.venue_name}
                              {r.city_name ? ` • ${r.city_name}` : ""}
                            </p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => onConvertToEvent(r)}>
                                <ArrowRightCircle className="h-4 w-4 mr-2" />
                                Criar Evento
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onEdit(r)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeleteId(r.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar reserva?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser revertida. A reserva será permanentemente eliminada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) onDelete(deleteId);
                setDeleteId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
