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
  type ABMode,
  type ABZoneInput,
  type ABFoodConfig,
} from "@/lib/event-ab-calc";
import { useCitySimulator } from "@/hooks/useCitySimulator";
import { useCompany } from "@/hooks/useCompany";
import EventABRealizedSection from "@/components/EventABRealizedSection";
import EventABAttachmentsSection from "@/components/EventABAttachmentsSection";


interface Props {
  eventId: string;
}

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);
const fmtPct = (n: number) =>
  new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(n || 0) + " %";

// ── Selector de modo ──────────────────────────────────────────────────────────

function ModeSelector({
  value,
  onChange,
}: {
  value: ABMode;
  onChange: (m: ABMode) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border p-1 bg-muted/40 text-sm">
      <button
        type="button"
        onClick={() => onChange("terceirizacao")}
        className={`px-3 py-1 rounded transition-colors ${
          value === "terceirizacao"
            ? "bg-background shadow text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Terceirização
      </button>
      <button
        type="button"
        onClick={() => onChange("exploracao_propria")}
        className={`px-3 py-1 rounded transition-colors ${
          value === "exploracao_propria"
            ? "bg-background shadow text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Exploração Própria
      </button>
    </div>
  );
}

// ── KPIs adaptativos ──────────────────────────────────────────────────────────

function KpisConsolidados({ totals, modeBebidas, modeAlimentos }: {
  totals: ReturnType<typeof computeTotals>;
  modeBebidas: ABMode;
  modeAlimentos: ABMode;
}) {
  const isExploration = modeBebidas === "exploracao_propria" || modeAlimentos === "exploracao_propria";

  if (isExploration) {
    const resultColor = totals.resultadoTotal >= 0 ? "text-emerald-600" : "text-rose-600";
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Receita A&B (evento)" value={fmtEUR(totals.receitaTotal)} highlight />
        <Kpi label="Custo A&B (evento)" value={fmtEUR(totals.custoCasaTotal)} negative />
        <Kpi label="Resultado A&B" value={fmtEUR(totals.resultadoTotal)} className={resultColor} />
        <Kpi label="Faturação total" value={fmtEUR(totals.faturacaoTotal)} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Kpi label="Faturação A&B (gerador)" value={fmtEUR(totals.faturacaoTotal)} />
      <Kpi label="Receita A&B (evento)" value={fmtEUR(totals.receitaTotal)} highlight />
      <Kpi label="Parte do gerador" value={fmtEUR(totals.parteGeradorTotal)} />
      <Kpi label="Resultado A&B (evento)" value={fmtEUR(totals.resultadoTotal)} highlight />
      <Kpi label="Quota do evento" value={fmtPct(totals.margemPct)} />
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function EventABTab({ eventId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { companyId } = useCompany();
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

  // Participantes "real" por zona, alinhado a useEventAttendance:
  //  - bilhete simples (1 dia) → soma na sua zona
  //  - bilhete combo/passe → expande para cada zona consumida (consumes_zone_ids)
  //    ou, em fallback, para cada dia do evento a partir da zona âncora.
  // Assim, um passe de 2 dias conta 1× em Sáb e 1× em Dom (não 2× no Passe).
  const { data: realParticipants = {} } = useQuery({
    queryKey: ["ab_real_participants_v2", eventId, ticketZones.map((z) => z.id).join(",")],
    queryFn: async () => {
      const zoneIds = (ticketZones ?? []).map((z) => z.id);
      if (zoneIds.length === 0) return {};
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, zone_id, is_combo, lot_kind, applies_to_days, consumes_zone_ids")
        .in("zone_id", zoneIds);
      const lotById = new Map<string, any>();
      for (const l of (lots ?? []) as any[]) lotById.set(l.id, l);

      const { data, error } = await supabase
        .from("ticket_sales")
        .select("zone_id, lot_id, quantity")
        .in("zone_id", zoneIds);
      if (error) throw error;

      const map: Record<string, number> = {};
      for (const r of (data ?? []) as any[]) {
        if (!r.zone_id) continue;
        const qty = Number(r.quantity || 0);
        if (!qty) continue;
        const lot = r.lot_id ? lotById.get(r.lot_id) : null;
        const isCombo = !!lot && (lot.is_combo || lot.lot_kind === "combo");
        if (isCombo) {
          const consumed: string[] = (lot.consumes_zone_ids ?? []) as string[];
          if (consumed.length > 0) {
            for (const zid of consumed) map[zid] = (map[zid] ?? 0) + qty;
          } else {
            // fallback: sem consumes_zone_ids → soma na própria zona do passe (sem ×dias)
            map[r.zone_id] = (map[r.zone_id] ?? 0) + qty;
          }
        } else {
          map[r.zone_id] = (map[r.zone_id] ?? 0) + qty;
        }
      }
      return map;
    },
    enabled: ticketZones.length > 0,
  });

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

  const simParticipantsByLabel = useMemo(() => {
    const out: Record<"breakeven" | "forecast", Record<string, number>> = {
      breakeven: {}, forecast: {},
    };
    // Fallback: agrega sim.sessions por (zone_label × day_index).
    // Para zonas-passe com a mesma quantidade em todos os dias, colapsa via máximo
    // (evita contagem dupla da mesma pessoa em múltiplos dias).
    const byZoneDay: Record<string, Record<number, number>> = {};
    for (const s of sim.sessions ?? []) {
      const label = (s.zone_label || "").toLowerCase();
      const courtesy = Number((s as any).courtesy_qty) || 0;
      const realQty = Number((s as any).real_sales_qty) || 0;
      const di = Number((s as any).day_index ?? 0);
      (byZoneDay[label] ??= {})[di] = (byZoneDay[label][di] ?? 0) + realQty + courtesy;
    }
    const collapse = (byDay: Record<number, number>): number => {
      const vals = Object.values(byDay);
      if (vals.length <= 1) return vals.reduce((a, b) => a + b, 0);
      return vals.every((v) => v === vals[0]) ? vals[0] : vals.reduce((a, b) => a + b, 0);
    };
    for (const [label, byDay] of Object.entries(byZoneDay)) {
      const v = collapse(byDay);
      out.breakeven[label] = v;
      out.forecast[label] = v;
    }
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

  // ── modos de operação ──
  const modeBebidas: ABMode   = (config?.ab_mode_bebidas   as ABMode)   ?? "terceirizacao";
  const modeAlimentos: ABMode = (config?.ab_mode_alimentos as ABMode) ?? "terceirizacao";

  // ── mutations ──
  const upsertConfig = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      if (!companyId) throw new Error("Empresa ativa não resolvida — recarrega a página.");
      const payload: any = { event_id: eventId, ...config, ...patch, company_id: companyId };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
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
      if (!companyId) throw new Error("Empresa ativa não resolvida — recarrega a página.");
      const payload: any = { ...z, event_id: eventId, company_id: companyId };
      delete payload.created_at;
      delete payload.updated_at;
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
        per_capita_custo_bebidas: 0,
        custo_fixo_bebidas: 0,
      });
    }
    toast({ title: "Zonas importadas", description: `${toAdd.length} zona(s) adicionadas.` });
  };

  const participantsForZone = (z: any): number => {
    if (z.participants_manual != null) return Number(z.participants_manual);
    const srcId = z.source_ticket_zone_id;
    const labelKey = (z.zone_label || "").toLowerCase();
    if (scenario === "real") return srcId ? (realParticipants[srcId] ?? 0) : 0;
    const fromSim = simParticipantsByLabel[scenario]?.[labelKey];
    if (fromSim != null && fromSim > 0) return fromSim;
    return srcId ? (lotsCapacity[srcId] ?? 0) : 0;
  };

  const calcInputs: ABZoneInput[] = useMemo(
    () =>
      zones.map((z: any) => ({
        id: z.id,
        zone_label: z.zone_label,
        participants: participantsForZone(z),
        open_bar: !!z.open_bar,
        open_food: !!z.open_food,
        per_capita_bebidas:       Number(z.per_capita_bebidas      || 0),
        repasse_bebidas_pct:      Number(z.repasse_bebidas_pct     || 0),
        per_capita_custo_bebidas: Number(z.per_capita_custo_bebidas || 0),
        custo_fixo_bebidas:       Number(z.custo_fixo_bebidas      || 0),
        operador_nome:            z.operador_nome ?? undefined,
        // Facturação real do operador só manda no cenário Real
        faturacao_real_bebidas:
          scenario === "real" && z.faturacao_real_bebidas != null
            ? Number(z.faturacao_real_bebidas)
            : null,
      })),
    [zones, scenario, realParticipants, simParticipantsByLabel, lotsCapacity],
  );

  const food: ABFoodConfig = useMemo(
    () => ({
      fee_alimentos:              Number(config?.fee_alimentos              || 0),
      repasse_alimentos_pct:      Number(config?.repasse_alimentos_pct      || 0),
      per_capita_alimentos:       Number(config?.per_capita_alimentos       || 0),
      per_capita_custo_alimentos: Number(config?.per_capita_custo_alimentos || 0),
      custo_fixo_alimentos:       Number(config?.custo_fixo_alimentos       || 0),
      faturacao_real_alimentos:
        scenario === "real" && config?.faturacao_real_alimentos != null
          ? Number(config.faturacao_real_alimentos)
          : null,
    }),
    [config, scenario],
  );

  const totals = useMemo(
    () => computeTotals(calcInputs, food, modeBebidas, modeAlimentos),
    [calcInputs, food, modeBebidas, modeAlimentos],
  );

  /** Há facturação real informada em qualquer bloco? (para reconciliação informativa) */
  const hasFaturacaoReal =
    config?.faturacao_real_alimentos != null ||
    zones.some((z: any) => z.faturacao_real_bebidas != null);


  const addEmptyZone = () =>
    upsertZone.mutate({
      zone_label: `Nova zona ${zones.length + 1}`,
      sort_order: zones.length,
      open_bar: false,
      open_food: false,
      per_capita_bebidas: 0,
      repasse_bebidas_pct: 0,
      per_capita_custo_bebidas: 0,
      custo_fixo_bebidas: 0,
    });

  // Label contextual do per_capita_bebidas conforme o modo (decisão 3.2)
  const labelPerCapitaBebidas = modeBebidas === "exploracao_propria"
    ? "Per capita receita (evento)"
    : "Per capita faturação (operador)";

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

      {/* KPIs consolidados — adaptativos conforme os modos */}
      <KpisConsolidados totals={totals} modeBebidas={modeBebidas} modeAlimentos={modeAlimentos} />

      {/* Realizado (fecho) — origem: transações do evento (read-only) */}
      <EventABRealizedSection eventId={eventId} />



      {/* Bebidas — por zona */}
      <Card>
        <CardHeader className="flex-row items-center justify-between flex-wrap gap-2">
          <div className="space-y-1">
            <CardTitle>Bebidas — por zona</CardTitle>
            <ModeSelector
              value={modeBebidas}
              onChange={(m) => upsertConfig.mutate({ ab_mode_bebidas: m })}
            />
          </div>
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
                  <TableHead>Operador</TableHead>
                  <TableHead className="text-right">Participantes ({scenario})</TableHead>
                  <TableHead className="text-right">Override manual</TableHead>
                  <TableHead className="text-center">Open Bar</TableHead>
                  <TableHead className="text-right">{labelPerCapitaBebidas}</TableHead>
                  <TableHead className="text-right">Facturação real (€)</TableHead>

                  {modeBebidas === "terceirizacao" && (
                    <TableHead className="text-right">% Repasse</TableHead>
                  )}
                  {modeBebidas === "exploracao_propria" && (
                    <>
                      <TableHead className="text-right">Per capita custo</TableHead>
                      <TableHead className="text-right">Custo fixo (€)</TableHead>
                    </>
                  )}
                  <TableHead className="text-center">Open Food</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  {modeBebidas === "exploracao_propria" && (
                    <TableHead className="text-right">Custo</TableHead>
                  )}
                  <TableHead className="text-right">Resultado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map((z: any) => {
                  const r = totals.zones.find((x) => x.id === z.id)!;
                  const resultColor = (r?.resultadoBebidas ?? 0) >= 0 ? "text-primary" : "text-rose-600";
                  return (
                    <TableRow key={z.id}>
                      <TableCell>
                        <Input
                          value={z.zone_label}
                          onChange={(e) => upsertZone.mutate({ ...z, zone_label: e.target.value })}
                          className="min-w-[120px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={z.operador_nome ?? ""}
                          placeholder="Operador (opcional)"
                          onChange={(e) => upsertZone.mutate({ ...z, operador_nome: e.target.value || null })}
                          className="min-w-[140px] text-xs"
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r?.participants ?? 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number" min={0}
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
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="estimado"
                          className="w-28 ml-auto"
                          disabled={!!z.open_bar}
                          onChange={() => {}}
                          defaultValue={z.faturacao_real_bebidas ?? ""}
                          key={`fr-${z.id}-${z.faturacao_real_bebidas ?? ""}`}
                          onBlur={(e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            if (v !== (z.faturacao_real_bebidas ?? null)) {
                              upsertZone.mutate({ ...z, faturacao_real_bebidas: v });
                            }
                          }}
                        />
                      </TableCell>

                      {modeBebidas === "terceirizacao" && (
                        <TableCell className="text-right">
                          <MoneyInput
                            value={Number(z.repasse_bebidas_pct || 0)}
                            onChange={(v) => upsertZone.mutate({ ...z, repasse_bebidas_pct: v })}
                            className="w-24 ml-auto"
                            percent
                            disabled={!!z.open_bar}
                          />
                        </TableCell>
                      )}
                      {modeBebidas === "exploracao_propria" && (
                        <>
                          <TableCell className="text-right">
                            <MoneyInput
                              value={Number(z.per_capita_custo_bebidas || 0)}
                              onChange={(v) => upsertZone.mutate({ ...z, per_capita_custo_bebidas: v })}
                              className="w-28 ml-auto"
                              disabled={!!z.open_bar}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <MoneyInput
                              value={Number(z.custo_fixo_bebidas || 0)}
                              onChange={(v) => upsertZone.mutate({ ...z, custo_fixo_bebidas: v })}
                              className="w-28 ml-auto"
                            />
                          </TableCell>
                        </>
                      )}
                      <TableCell className="text-center">
                        <Switch
                          checked={!!z.open_food}
                          onCheckedChange={(v) => upsertZone.mutate({ ...z, open_food: v })}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-primary">
                        {fmtEUR(r?.receitaBebidas ?? 0)}
                      </TableCell>
                      {modeBebidas === "exploracao_propria" && (
                        <TableCell className="text-right tabular-nums text-rose-600">
                          {fmtEUR(r?.custoCasaBebidas ?? 0)}
                        </TableCell>
                      )}
                      <TableCell className={`text-right tabular-nums ${resultColor}`}>
                        {fmtEUR(r?.resultadoBebidas ?? 0)}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => deleteZone.mutate(z.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-semibold">
                  <TableCell colSpan={modeBebidas === "terceirizacao" ? 9 : 10}>Totais Bebidas</TableCell>
                  <TableCell className="text-right tabular-nums text-primary">{fmtEUR(totals.receitaBebidas)}</TableCell>
                  {modeBebidas === "exploracao_propria" && (
                    <TableCell className="text-right tabular-nums text-rose-600">{fmtEUR(totals.custoCasaBebidas)}</TableCell>
                  )}
                  <TableCell className={`text-right tabular-nums ${(totals.receitaBebidas - totals.custoCasaBebidas) >= 0 ? "text-primary" : "text-rose-600"}`}>
                    {fmtEUR(totals.receitaBebidas - totals.custoCasaBebidas)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Alimentos */}
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>Alimentos — configuração global</CardTitle>
          <ModeSelector
            value={modeAlimentos}
            onChange={(m) => upsertConfig.mutate({ ab_mode_alimentos: m })}
          />
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          {/* Campo operador */}
          <div className="md:col-span-3 space-y-2">
            <Label>Operador (opcional)</Label>
            <Input
              value={config?.operador_nome_alimentos ?? ""}
              placeholder="Ex: NOS Alive Catering"
              onBlur={(e) => upsertConfig.mutate({ operador_nome_alimentos: e.target.value || null })}
              className="max-w-sm"
              onChange={() => {}}
              defaultValue={config?.operador_nome_alimentos ?? ""}
              key={`op-ali-${config?.operador_nome_alimentos ?? ""}`}
            />
          </div>

          {/* Per capita — label contextual */}
          <div className="space-y-2">
            <Label>
              {modeAlimentos === "exploracao_propria"
                ? "Per capita receita (evento) (€/pessoa)"
                : "Per capita faturação (operador) (€/pessoa)"}
            </Label>
            <MoneyInput
              value={food.per_capita_alimentos}
              onChange={(v) => upsertConfig.mutate({ per_capita_alimentos: v })}
            />
          </div>

          {/* Facturação REAL do operador (fecho POS) — vence o per capita */}
          <div className="space-y-2">
            <Label>Facturação real do operador (€, s/IVA)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              placeholder="vazio = estimar por per capita"
              defaultValue={config?.faturacao_real_alimentos ?? ""}
              key={`fr-ali-${config?.faturacao_real_alimentos ?? ""}`}
              onChange={() => {}}
              onBlur={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                if (v !== (config?.faturacao_real_alimentos ?? null)) {
                  upsertConfig.mutate({ faturacao_real_alimentos: v });
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Quando preenchida substitui <em>participantes × per capita</em> no cenário Real.
              Vazio = estimativa. 0 é um valor válido.
              {scenario !== "real" && " Não afecta Break Even nem Forecast."}
            </p>
          </div>


          {/* Campos Terceirização */}
          {modeAlimentos === "terceirizacao" && (
            <>
              <div className="space-y-2">
                <Label>Fee fixo (€)</Label>
                <MoneyInput
                  value={food.fee_alimentos}
                  onChange={(v) => upsertConfig.mutate({ fee_alimentos: v })}
                />
                <p className="text-xs text-muted-foreground">Receita garantida independente das vendas.</p>
              </div>
              <div className="space-y-2">
                <Label>% Repasse</Label>
                <MoneyInput
                  value={food.repasse_alimentos_pct}
                  onChange={(v) => upsertConfig.mutate({ repasse_alimentos_pct: v })}
                  percent
                />
              </div>
            </>
          )}

          {/* Campos Exploração Própria */}
          {modeAlimentos === "exploracao_propria" && (
            <>
              <div className="space-y-2">
                <Label>Per capita custo (€/pessoa)</Label>
                <MoneyInput
                  value={food.per_capita_custo_alimentos}
                  onChange={(v) => upsertConfig.mutate({ per_capita_custo_alimentos: v })}
                />
                <p className="text-xs text-muted-foreground">Custo estimado por pessoa (CMV + operação).</p>
              </div>
              <div className="space-y-2">
                <Label>Custo fixo (€)</Label>
                <MoneyInput
                  value={food.custo_fixo_alimentos}
                  onChange={(v) => upsertConfig.mutate({ custo_fixo_alimentos: v })}
                />
                <p className="text-xs text-muted-foreground">Staff fixo, aluguer de equipamento, etc.</p>
              </div>
            </>
          )}

          {/* KPIs Alimentos */}
          <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
            <Kpi label="Participantes elegíveis" value={String(totals.participantesElegiveisAlimentos)} />
            <Kpi label={modeAlimentos === "exploracao_propria" ? "Receita Alimentos" : "Faturação Alimentos"}
                 value={fmtEUR(totals.faturacaoAlimentos)} />
            <Kpi label="Receita Alimentos (evento)" value={fmtEUR(totals.receitaAlimentos)} highlight />
            {modeAlimentos === "exploracao_propria" ? (
              <Kpi label="Custo Alimentos (evento)" value={fmtEUR(totals.custoCasaAlimentos)} negative />
            ) : (
              <Kpi label="Parte gerador (Alimentos)" value={fmtEUR(totals.parteGeradorAlimentos)} />
            )}
          </div>

          {/* auto_sync_bp — TODO v2 */}
          <div className="md:col-span-3 flex items-center justify-between pt-2 border-t">
            <div>
              <Label>Sincronizar com Business Plan</Label>
              <p className="text-xs text-muted-foreground">
                Quando ativo, os totais A&B (cenário Forecast) são propagados como linhas BP.
                <span className="ml-1 italic">Em breve — flag persistida. Em modo exploração própria: v2.</span>
              </p>
            </div>
            <Switch
              checked={!!config?.auto_sync_bp}
              onCheckedChange={(v) => upsertConfig.mutate({ auto_sync_bp: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Anexos — documentos de fecho do operador de bares (só armazenamento) */}
      <EventABAttachmentsSection eventId={eventId} />
    </div>
  );
}

// ── Componente KPI ────────────────────────────────────────────────────────────

function Kpi({
  label, value, highlight, negative, className,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  negative?: boolean;
  className?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          "text-lg font-semibold tabular-nums " +
          (className ?? (negative ? "text-destructive" : highlight ? "text-primary" : ""))
        }
      >
        {value}
      </div>
    </div>
  );
}
