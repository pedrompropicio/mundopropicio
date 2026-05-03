import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { formatDatePT } from "@/lib/utils";
import { Save } from "lucide-react";

type Scenario = "real" | "breakeven" | "forecast";

interface Props {
  eventId: string;
}

const scenarioLabel: Record<Scenario, string> = {
  real: "Real",
  breakeven: "Break Even",
  forecast: "Projecção",
};

/**
 * Editor de cortesias por dia × zona × cenário.
 * Fonte: tabela event_courtesies (UNIQUE por event_date_id, zone_id, scenario).
 * As cortesias contam para o público por dia (denominador do per capita A&B)
 * mas não geram receita de bilheteira.
 */
export function EventCourtesiesEditor({ eventId }: Props) {
  const qc = useQueryClient();
  const [scenario, setScenario] = useState<Scenario>("real");
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
        .select("id, name")
        .eq("event_id", eventId)
        .is("version_id", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["event_courtesies", eventId, scenario],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_courtesies")
        .select("id, event_date_id, zone_id, quantity")
        .eq("event_id", eventId)
        .eq("scenario", scenario);
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
      const ops: Promise<any>[] = [];
      for (const [k, qty] of Object.entries(draft)) {
        const [dateId, zoneId] = k.split("|");
        const existing = existingMap.get(k);
        if (qty <= 0 && existing) {
          ops.push(supabase.from("event_courtesies").delete().eq("id", existing.id));
        } else if (existing) {
          ops.push(
            supabase.from("event_courtesies").update({ quantity: qty }).eq("id", existing.id),
          );
        } else if (qty > 0) {
          ops.push(
            supabase.from("event_courtesies").insert({
              event_id: eventId,
              event_date_id: dateId,
              zone_id: zoneId,
              scenario,
              quantity: qty,
            }),
          );
        }
      }
      const results = await Promise.all(ops);
      const errs = results.map((r: any) => r.error).filter(Boolean);
      if (errs.length) throw new Error(errs[0].message);
    },
    onSuccess: () => {
      toast.success("Cortesias guardadas");
      setDraft({});
      qc.invalidateQueries({ queryKey: ["event_courtesies", eventId, scenario] });
      qc.invalidateQueries({ queryKey: ["event_courtesies_attendance", eventId, scenario] });
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
            As cortesias somam ao público do dia (per capita A&B) mas não geram receita.
          </p>
        </div>
        <Button size="sm" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          <Save className="h-3.5 w-3.5 mr-1" /> Guardar
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs value={scenario} onValueChange={(v) => { setScenario(v as Scenario); setDraft({}); }}>
          <TabsList>
            <TabsTrigger value="real">Real</TabsTrigger>
            <TabsTrigger value="breakeven">Break Even</TabsTrigger>
            <TabsTrigger value="forecast">Projecção</TabsTrigger>
          </TabsList>
          <TabsContent value={scenario} className="mt-4">
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
                    <TableCell className="font-semibold text-sm">Total — {scenarioLabel[scenario]}</TableCell>
                    {dates.map((d) => (
                      <TableCell key={d.id} className="text-right font-mono font-semibold">
                        {totalForDay(d.id).toLocaleString("pt-PT")}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
