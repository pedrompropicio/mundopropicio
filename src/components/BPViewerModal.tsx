import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EventForecast } from "@/components/EventForecast";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * BP viewer for editors (and admins/managers) to consult forecasts and
 * BP-vs-Real comparison without leaving the Transactions page.
 *
 * Renders the same <EventForecast /> component used inside the Event modal,
 * so users get the identical UX: tabs "Previsões" + "Previsão vs Real" with
 * full expand chevrons (group L2 → category L3 → matched transactions).
 *
 * Edit/approve/delete actions are already gated inside EventForecast based on
 * useAuth() roles, so editors automatically see a read-only view.
 */
export default function BPViewerModal({ open, onClose }: Props) {
  const [eventId, setEventId] = useState<string>("");

  const { data: events = [] } = useQuery({
    queryKey: ["bp-viewer-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, parent_event_id, status")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Group: standalone/parents first, children indented
  const grouped = useMemo(() => {
    const parents = events.filter((e: any) => !e.parent_event_id);
    const childMap: Record<string, any[]> = {};
    events
      .filter((e: any) => e.parent_event_id)
      .forEach((e: any) => {
        (childMap[e.parent_event_id] ||= []).push(e);
      });
    Object.values(childMap).forEach((arr) => arr.sort((a, b) => a.date.localeCompare(b.date)));
    const out: { id: string; name: string; date: string; isChild: boolean }[] = [];
    parents.forEach((p: any) => {
      out.push({ id: p.id, name: p.name, date: p.date, isChild: false });
      (childMap[p.id] || []).forEach((c: any) =>
        out.push({ id: c.id, name: c.name, date: c.date, isChild: true })
      );
    });
    return out;
  }, [events]);

  const selectedEvent = events.find((e: any) => e.id === eventId);
  const childEventIds = useMemo(
    () => events.filter((e: any) => e.parent_event_id === eventId).map((e: any) => e.id),
    [events, eventId]
  );
  const isMaster = childEventIds.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consultar Business Plan</DialogTitle>
          <DialogDescription>
            Vista de consulta — Previsões aprovadas e comparação com o real lançado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Evento</label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione um evento" />
              </SelectTrigger>
              <SelectContent>
                {grouped.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className={e.isChild ? "pl-4 text-muted-foreground" : ""}>
                      {e.isChild ? "↳ " : ""}{e.name} — {e.date}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {eventId && selectedEvent ? (
            <EventForecast
              key={eventId}
              eventId={eventId}
              eventDate={(selectedEvent as any).date}
              eventName={(selectedEvent as any).name}
              eventStatus={(selectedEvent as any).status}
              parentEventId={(selectedEvent as any).parent_event_id ?? undefined}
              childEventIds={isMaster ? childEventIds : undefined}
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Selecione um evento para consultar o Business Plan.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
