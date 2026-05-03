import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/ui/money-input";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  computeTotals,
  type ABScenario,
  type ABZoneInput,
  type ABFoodConfig,
} from "@/lib/event-ab-calc";
import { useCitySimulator } from "@/hooks/useCitySimulator";

interface Props {
  eventId: string;
}

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);
const fmtPct = (n: number) =>
  new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(n || 0) + " %";

export default function EventABTab({ eventId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [scenario, setScenario] = useState<ABScenario>("forecast");

  // ── data ──
  const { data: zones = [] } = useQuery({
    queryKey: ["ab_zones", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ab_zones")
        .select("*")
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: config } = useQuery({
    queryKey: ["ab_config", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ab_config")
        .select("*")
        .eq("event_id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketZones = [] } = useQuery({
    queryKey: ["ab_ticket_zones_src", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("id, name, total_capacity")
        .eq("event_id", eventId)
        .is("version_id", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: realParticipants = {} } = useQuery({
    queryKey: ["ab_real_participants", eventId, ticketZones.map((z) => z.id).join(",")],
    queryFn: async () => {
      const zoneIds = (ticketZones ?? []).map((z) => z.id);
      if (zoneIds.length === 0) return {};
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("zone_id, quantity")
        .in("zone_id", zoneIds);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) {
        if (!r.zone_id) continue;
        map[r.zone_id] = (map[r.zone_id] ?? 0) + Number(r.quantity || 0);
      }
      return map;
    },
    enabled: ticketZones.length > 0,
  });

  // Forecast/Break Even vêm do Simulador (mesma lógica do Master Tour). O public
  // "real" continua a sair de ticket_sales (acima). Se o Simulador não estiver
  // configurado, BE/Forecast caem para a capacidade total dos lotes (fallback).
  const sim = useCitySimulator(eventId);
  const { data: lotsCapacity = {} } = useQuery({
    queryKey: ["ab_lots_capacity", eventId],
    queryFn: async () => {
      const zoneIds = (ticketZones ?? []).map((z) => z.id);
      if (zoneIds.length === 0) return {};
      const { data, error } = await supabase
        .from("event_ticket_lots")
        .select("zone_id, quantity")
        .in("zone_id", zoneIds);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const l of data ?? []) {
        map[l.zone_id] = (map[l.zone_id] ?? 0) + Number(l.quantity || 0);
      }
      return map;
    },
    enabled: ticketZones.length > 0,
  });

  /** Mapa zone_label.toLowerCase() → participantes do Simulador (cenário). */
  const simParticipantsByLabel = useMemo(() => {
    const out: Record<"breakeven" | "forecast", Record<string, number>> = {
      breakeven: {},
      forecast: {},
    };
    for (const s of sim.sessions ?? []) {
      const label = (s.zone_label || "").toLowerCase();
      const courtesy = Number((s as any).courtesy_qty) || 0;
      const realQty = Number((s as any).real_sales_qty) || 0;
      // o solver guarda em sim.kpis indirectamente; mais simples: re-derivar via abModule
      // mas aqui já basta usar real+courtesy como mínimo; substituiremos abaixo.
      out.breakeven[label] = (out.breakeven[label] ?? 0) + realQty + courtesy;
      out.forecast[label] = (out.forecast[label] ?? 0) + realQty + courtesy;
    }
    // Sobrepor com qty calculadas pelo solver (BE/Forecast) que já estão no abModule.totals
    if (sim.abModule?.totals) {
      for (const t of sim.abModule.totals.breakeven.zones) {
        out.breakeven[t.zone_label.toLowerCase()] = t.participants;
      }
      for (const t of sim.abModule.totals.forecast.zones) {
        out.forecast[t.zone_label.toLowerCase()] = t.participants;
      }
    }
    return out;
  }, [sim.sessions, sim.abModule?.totals]);

  // ── mutations ──
  const upsertConfig = useMutation({
    mutationFn: async (patch: Partial<ABFoodConfig> & { auto_sync_bp?: boolean }) => {
      const payload = { event_id: eventId, ...config, ...patch };
      delete (payload as any).id;
      delete (payload as any).created_at;
      delete (payload as any).updated_at;
      delete (payload as any).company_id;
      const { error } = await supabase
        .from("event_ab_config")
        .upsert(payload, { onConflict: "event_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ab_config", eventId] }),
    onError: (e: any) => toast({ title: "Erro a guardar", description: e.message, variant: "destructive" }),
  });

  const upsertZone = useMutation({
    mutationFn: async (z: any) => {
      const payload = { ...z, event_id: eventId };
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.company_id;
      if (z.id) {
        const { error } = await supabase.from("event_ab_zones").update(payload).eq("id", z.id);
        if (error) throw error;
      } else {
        delete payload.id;
        const { error } = await supabase.from("event_ab_zones").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ab_zones", eventId] }),
    onError: (e: any) => toast({ title: "Erro a guardar zona", description: e.message, variant: "destructive" }),
  });

  const deleteZone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_ab_zones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ab_zones", eventId] }),
  });

  // ── importar zonas da bilhética que ainda não existem ──
  const importTicketZones = async () => {
    const existing = new Set(zones.map((z) => z.source_ticket_zone_id).filter(Boolean));
    const toAdd = ticketZones.filter((tz) => !existing.has(tz.id));
    if (toAdd.length === 0) {
      toast({ title: "Sem novas zonas", description: "Todas as zonas de bilheteira já estão no A&B." });
      return;
    }
    for (let i = 0; i < toAdd.length; i++) {
      const tz = toAdd[i];
      await upsertZone.mutateAsync({
        zone_label: tz.name,
        source_ticket_zone_id: tz.id,
        sort_order: zones.length + i,
        open_bar: false,
        open_food: false,
        per_capita_bebidas: 0,
        repasse_bebidas_pct: 0,
      });
    }
    toast({ title: "Zonas importadas", description: `${toAdd.length} zona(s) adicionadas.` });
  };

  // ── participantes por cenário ──
  const participantsForZone = (z: any): number => {
    if (z.participants_manual != null) return Number(z.participants_manual);
    const srcId = z.source_ticket_zone_id;
    if (!srcId) return 0;
    if (scenario === "real") return realParticipants[srcId] ?? 0;
    if (scenario === "forecast") return forecastParticipants[srcId] ?? 0;
    // breakeven: por defeito = forecast (até existir ligação ao Simulador de break-even)
    return forecastParticipants[srcId] ?? 0;
  };

  const calcInputs: ABZoneInput[] = useMemo(
    () =>
      zones.map((z: any) => ({
        id: z.id,
        zone_label: z.zone_label,
        participants: participantsForZone(z),
        open_bar: !!z.open_bar,
        open_food: !!z.open_food,
        per_capita_bebidas: Number(z.per_capita_bebidas || 0),
        repasse_bebidas_pct: Number(z.repasse_bebidas_pct || 0),
      })),
    [zones, scenario, realParticipants, forecastParticipants],
  );

  const food: ABFoodConfig = {
    fee_alimentos: Number(config?.fee_alimentos || 0),
    repasse_alimentos_pct: Number(config?.repasse_alimentos_pct || 0),
    per_capita_alimentos: Number(config?.per_capita_alimentos || 0),
  };

  const totals = useMemo(() => computeTotals(calcInputs, food), [calcInputs, food]);

  // ── add zona vazia ──
  const addEmptyZone = () =>
    upsertZone.mutate({
      zone_label: `Nova zona ${zones.length + 1}`,
      sort_order: zones.length,
      open_bar: false,
      open_food: false,
      per_capita_bebidas: 0,
      repasse_bebidas_pct: 0,
    });

  return (
    <div className="space-y-6">
      {/* Cabeçalho + cenário */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold">A&B — Alimentos & Bebidas</h2>
          <p className="text-sm text-muted-foreground">
            Configuração de operação A&B do evento. Valores sem IVA.
          </p>
        </div>
        <Tabs value={scenario} onValueChange={(v) => setScenario(v as ABScenario)}>
          <TabsList>
            <TabsTrigger value="real">Real</TabsTrigger>
            <TabsTrigger value="breakeven">Break Even</TabsTrigger>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* KPIs consolidados */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Faturação A&B" value={fmtEUR(totals.faturacaoTotal)} />
        <Kpi label="Receita A&B" value={fmtEUR(totals.receitaTotal)} highlight />
        <Kpi label="Custo A&B" value={fmtEUR(totals.custoTotal)} />
        <Kpi label="Resultado A&B" value={fmtEUR(totals.resultadoTotal)} highlight={totals.resultadoTotal >= 0} negative={totals.resultadoTotal < 0} />
        <Kpi label="Margem" value={fmtPct(totals.margemPct)} />
      </div>

      {/* Bebidas — por zona */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Bebidas — por zona</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={importTicketZones}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Importar zonas da bilheteira
            </Button>
            <Button size="sm" onClick={addEmptyZone}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar zona
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {zones.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Sem zonas configuradas. Importa as zonas da bilheteira ou adiciona manualmente.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zona</TableHead>
                  <TableHead className="text-right">Participantes ({scenario})</TableHead>
                  <TableHead className="text-right">Override manual</TableHead>
                  <TableHead className="text-center">Open Bar</TableHead>
                  <TableHead className="text-right">Per capita Bebidas</TableHead>
                  <TableHead className="text-right">% Repasse</TableHead>
                  <TableHead className="text-center">Open Food</TableHead>
                  <TableHead className="text-right">Faturação</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map((z: any) => {
                  const r = totals.zones.find((x) => x.id === z.id)!;
                  return (
                    <TableRow key={z.id}>
                      <TableCell>
                        <Input
                          value={z.zone_label}
                          onChange={(e) => upsertZone.mutate({ ...z, zone_label: e.target.value })}
                          className="min-w-[140px]"
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r?.participants ?? 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={z.participants_manual ?? ""}
                          placeholder="auto"
                          onBlur={(e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            if (v !== z.participants_manual) upsertZone.mutate({ ...z, participants_manual: v });
                          }}
                          className="w-24 ml-auto"
                          onChange={() => {}}
                          defaultValue={z.participants_manual ?? ""}
                          key={`pm-${z.id}-${z.participants_manual ?? ""}`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={!!z.open_bar}
                          onCheckedChange={(v) => upsertZone.mutate({ ...z, open_bar: v })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyInput
                          value={Number(z.per_capita_bebidas || 0)}
                          onChange={(v) => upsertZone.mutate({ ...z, per_capita_bebidas: v })}
                          className="w-28 ml-auto"
                          disabled={!!z.open_bar}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyInput
                          value={Number(z.repasse_bebidas_pct || 0)}
                          onChange={(v) => upsertZone.mutate({ ...z, repasse_bebidas_pct: v })}
                          className="w-24 ml-auto"
                          percent
                          disabled={!!z.open_bar}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={!!z.open_food}
                          onCheckedChange={(v) => upsertZone.mutate({ ...z, open_food: v })}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtEUR(r?.faturacaoBebidas ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums text-primary">{fmtEUR(r?.receitaBebidas ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{fmtEUR(r?.custoBebidas ?? 0)}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => deleteZone.mutate(z.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-semibold">
                  <TableCell colSpan={7}>Totais Bebidas</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtEUR(totals.faturacaoBebidas)}</TableCell>
                  <TableCell className="text-right tabular-nums text-primary">{fmtEUR(totals.receitaBebidas)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtEUR(totals.custoBebidas)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Alimentos — global */}
      <Card>
        <CardHeader>
          <CardTitle>Alimentos — configuração global</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Fee fixo (€)</Label>
            <MoneyInput
              value={food.fee_alimentos}
              onChange={(v) => upsertConfig.mutate({ fee_alimentos: v })}
            />
            <p className="text-xs text-muted-foreground">Receita garantida do operador.</p>
          </div>
          <div className="space-y-2">
            <Label>% Repasse</Label>
            <MoneyInput
              value={food.repasse_alimentos_pct}
              onChange={(v) => upsertConfig.mutate({ repasse_alimentos_pct: v })}
              percent
            />
          </div>
          <div className="space-y-2">
            <Label>Per capita Alimentos (€/pessoa)</Label>
            <MoneyInput
              value={food.per_capita_alimentos}
              onChange={(v) => upsertConfig.mutate({ per_capita_alimentos: v })}
            />
          </div>

          <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
            <Kpi label="Participantes elegíveis" value={String(totals.participantesElegiveisAlimentos)} />
            <Kpi label="Faturação Alimentos" value={fmtEUR(totals.faturacaoAlimentos)} />
            <Kpi label="Receita Alimentos" value={fmtEUR(totals.receitaAlimentos)} highlight />
            <Kpi label="Custo Alimentos" value={fmtEUR(totals.custoAlimentos)} />
          </div>

          <div className="md:col-span-3 flex items-center justify-between pt-2 border-t">
            <div>
              <Label>Sincronizar com Business Plan</Label>
              <p className="text-xs text-muted-foreground">
                Quando ativo, os totais A&B (cenário Forecast) são propagados como linhas BP de receita e custo.
                <span className="ml-1 italic">Em breve — flag persistida.</span>
              </p>
            </div>
            <Switch
              checked={!!config?.auto_sync_bp}
              onCheckedChange={(v) => upsertConfig.mutate({ auto_sync_bp: v })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  highlight,
  negative,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          "text-lg font-semibold tabular-nums " +
          (negative ? "text-destructive" : highlight ? "text-primary" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
