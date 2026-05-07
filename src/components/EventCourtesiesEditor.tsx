import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { formatDatePT } from "@/lib/utils";
import { Save } from "lucide-react";

interface Props {
  eventId: string;
}

/**
 * Editor de cortesias por dia × zona (sem cenário).
 * As cortesias são as mesmas em Real, Break Even e Projecção:
 * representam quantos lugares por zona/dia são oferecidos e por isso
 * NÃO entram à venda mas SOMAM ao público (denominador per capita A&B).
 */
export function EventCourtesiesEditor({ eventId }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, number>>({});

  const { data: dates = [] } = useQuery({
    queryKey: ["courtesies_dates", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_dates")
        .select("id, date, label")
        .eq("event_id", eventId)
        .order("date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: zones = [] } = useQuery({
    queryKey: ["courtesies_zones", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("id, name, session_id")
        .eq("event_id", eventId)
        .is("version_id", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["courtesies_sessions", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sessions")
        .select("id, date")
        .eq("event_id", eventId)
        .is("version_id", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sessionDateById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions) m.set(s.id, s.date);
    return m;
  }, [sessions]);

  /** Zona com session_id só se aplica à data dessa sessão; sem session_id aplica-se a todas. */
  const zoneAppliesToDate = (zone: any, dateRow: any) => {
    if (!zone.session_id) return true;
    const sd = sessionDateById.get(zone.session_id);
    return !sd || sd === dateRow.date;
  };

  const { data: rows = [] } = useQuery({
    queryKey: ["event_courtesies", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_courtesies")
        .select("id, event_date_id, zone_id, quantity")
        .eq("event_id", eventId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const existingMap = useMemo(() => {
    const m = new Map<string, { id: string; quantity: number }>();
    for (const r of rows) m.set(`${r.event_date_id}|${r.zone_id}`, { id: r.id, quantity: r.quantity });
    return m;
  }, [rows]);

  const cellKey = (dateId: string, zoneId: string) => `${dateId}|${zoneId}`;

  const valueAt = (dateId: string, zoneId: string): number => {
    const k = cellKey(dateId, zoneId);
    if (k in draft) return draft[k];
    return existingMap.get(k)?.quantity ?? 0;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const [k, qty] of Object.entries(draft)) {
        const [dateId, zoneId] = k.split("|");
        const existing = existingMap.get(k);
        if (qty <= 0 && existing) {
          const { error } = await supabase.from("event_courtesies").delete().eq("id", existing.id);
          if (error) throw error;
        } else if (existing) {
          const { error } = await supabase
            .from("event_courtesies")
            .update({ quantity: qty })
            .eq("id", existing.id);
          if (error) throw error;
        } else if (qty > 0) {
          const { error } = await supabase.from("event_courtesies").insert({
            event_id: eventId,
            event_date_id: dateId,
            zone_id: zoneId,
            scenario: "real",
            quantity: qty,
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Cortesias guardadas");
      setDraft({});
      qc.invalidateQueries({ queryKey: ["event_courtesies", eventId] });
      qc.invalidateQueries({ queryKey: ["event_courtesies_attendance", eventId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalForDay = (dateId: string) =>
    zones.reduce((s, z) => s + valueAt(dateId, z.id), 0);

  if (dates.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Configure datas e zonas do evento antes de definir cortesias.
        </CardContent>
      </Card>
    );
  }

  const dirty = Object.keys(draft).length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Cortesias por dia</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Iguais para Real, Break Even e Projecção. Somam ao público (per capita A&amp;B) e
            <strong> não consomem capacidade à venda</strong> — acrescem.
          </p>
        </div>
        <Button size="sm" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          <Save className="h-3.5 w-3.5 mr-1" /> Guardar
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-32">Zona</TableHead>
                {dates.map((d) => (
                  <TableHead key={d.id} className="text-right text-xs">
                    {formatDatePT(d.date)}
                    {d.label ? <div className="text-[10px] text-muted-foreground">{d.label}</div> : null}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {zones.map((z) => (
                <TableRow key={z.id}>
                  <TableCell className="font-medium text-sm">{z.name}</TableCell>
                  {dates.map((d) => (
                    <TableCell key={d.id} className="text-right">
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-20 text-right text-xs ml-auto"
                        value={valueAt(d.id, z.id)}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [cellKey(d.id, z.id)]: Math.max(0, parseInt(e.target.value) || 0),
                          }))
                        }
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              <TableRow className="bg-muted/30">
                <TableCell className="font-semibold text-sm">Total por dia</TableCell>
                {dates.map((d) => (
                  <TableCell key={d.id} className="text-right font-mono font-semibold">
                    {totalForDay(d.id).toLocaleString("pt-PT")}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
