/**
 * Simulador de Evento — `/eventos/:id/simulador`
 *
 * Página standalone que permite simular cenários financeiros para um evento:
 *  - Matriz Bilheteira por (dia × zona): projetado, cortesias, break-even (sugerido + override).
 *  - Conversão público → consumo A&B (taxa de conversão por zona) com ticket médio e CMV.
 *  - DRE comparativa: Real 2025 (manual) | Projetado | Break-Even | Forecast DVT (BP atual).
 *
 * Decisões fixadas (2026-04-30):
 *  - Break-Even: sugestão automática + override manual.
 *  - A&B: granularidade por zona (Pista vs VIP).
 *  - DRE: reusa categorias do BP do evento (event_forecasts agrupado por L1).
 *  - Ano anterior: input manual por evento.
 *  - "Adoptar cenário" → marcado como TODO Entrega 4 (cria forecasts reais).
 */
import React, { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calculator, TrendingUp, Save, Sparkles, Loader2, Beer, UtensilsCrossed, Ticket, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { addDays, format, parseISO } from "date-fns";

// =============================================================================
// Types
// =============================================================================
type SimulatorConfig = {
  event_id: string;
  prior_year_real_revenue: number | null;
  prior_year_real_expenses: number | null;
  prior_year_notes: string | null;
  default_drink_avg_ticket: number;
  default_food_avg_ticket: number;
  default_drink_cmv_pct: number;
  default_food_cmv_pct: number;
  default_drink_conversion_pct: number;
  default_food_conversion_pct: number;
  notes: string | null;
};

type ZoneConfig = {
  id: string;
  event_id: string;
  zone_label: string;
  drink_avg_ticket: number | null;
  food_avg_ticket: number | null;
  drink_cmv_pct: number | null;
  food_cmv_pct: number | null;
  drink_conversion_pct: number | null;
  food_conversion_pct: number | null;
  display_order: number;
};

type SimInput = {
  id?: string;
  event_id: string;
  day_index: number;
  day_date: string | null;
  zone_label: string;
  capacity_target: number | null;
  projected_qty: number;
  break_even_qty_manual: number | null;
  courtesy_qty: number;
  projected_revenue: number | null;
  notes: string | null;
};

const DEFAULT_CONFIG: Omit<SimulatorConfig, "event_id"> = {
  prior_year_real_revenue: null,
  prior_year_real_expenses: null,
  prior_year_notes: null,
  default_drink_avg_ticket: 10.51,
  default_food_avg_ticket: 5.40,
  default_drink_cmv_pct: 65,
  default_food_cmv_pct: 75,
  default_drink_conversion_pct: 100,
  default_food_conversion_pct: 60,
  notes: null,
};

// =============================================================================
// Helpers
// =============================================================================
function n(v: any, fb = 0): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fb;
}

/** Gera lista de dias do evento a partir das event_dates (ou só `events.date`). */
function buildDayList(eventDate: string, eventDates: { date: string }[]): { idx: number; date: string }[] {
  const sorted = (eventDates || []).map((d) => d.date).sort();
  if (sorted.length === 0) return [{ idx: 0, date: eventDate }];
  return sorted.map((date, idx) => ({ idx, date }));
}

/** Resolve o valor efetivo de A&B (zona override → default global). */
function effectiveAB(zone: ZoneConfig | null, cfg: SimulatorConfig) {
  return {
    drinkTicket: zone?.drink_avg_ticket ?? cfg.default_drink_avg_ticket,
    foodTicket: zone?.food_avg_ticket ?? cfg.default_food_avg_ticket,
    drinkCmvPct: zone?.drink_cmv_pct ?? cfg.default_drink_cmv_pct,
    foodCmvPct: zone?.food_cmv_pct ?? cfg.default_food_cmv_pct,
    drinkConvPct: zone?.drink_conversion_pct ?? cfg.default_drink_conversion_pct,
    foodConvPct: zone?.food_conversion_pct ?? cfg.default_food_conversion_pct,
  };
}

// =============================================================================
// Page
// =============================================================================
export default function EventSimulator() {
  const { id: eventId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, isManager, hasPermission } = useAuth();
  const canEdit = isAdmin || isManager || hasPermission?.("forecast.write");

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------
  const { data: event, isLoading: loadingEvent } = useQuery({
    queryKey: ["event-detail-simulator", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name, date, status, parent_event_id, company_id").eq("id", eventId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  const { data: eventDates = [] } = useQuery({
    queryKey: ["event-dates-simulator", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_dates").select("date").eq("event_id", eventId).order("date");
      if (error) throw error;
      return data || [];
    },
    enabled: !!eventId,
  });

  // Zonas vindas das ticket_zones (se existirem); fallback para ["Pista"]
  const { data: ticketZones = [] } = useQuery({
    queryKey: ["ticket-zones-simulator", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("ticket_zones").select("name, capacity").eq("event_id", eventId).order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!eventId,
  });

  const { data: configRow, isLoading: loadingConfig } = useQuery({
    queryKey: ["simulator-config", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_simulator_config").select("*").eq("event_id", eventId).maybeSingle();
      if (error) throw error;
      return data as SimulatorConfig | null;
    },
    enabled: !!eventId,
  });

  const { data: zoneCfgRows = [] } = useQuery({
    queryKey: ["simulator-zone-config", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_simulator_zone_config").select("*").eq("event_id", eventId).order("display_order");
      if (error) throw error;
      return (data || []) as ZoneConfig[];
    },
    enabled: !!eventId,
  });

  const { data: inputRows = [] } = useQuery({
    queryKey: ["simulator-inputs", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_simulator_inputs").select("*").eq("event_id", eventId);
      if (error) throw error;
      return (data || []) as SimInput[];
    },
    enabled: !!eventId,
  });

  // BP do evento (para DRE comparativa "Forecast DVT") — agrupa por L1
  const { data: bpRows = [] } = useQuery({
    queryKey: ["simulator-bp", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("type, amount, category_id, account_categories(code, name, parent_id)")
        .eq("event_id", eventId)
        .neq("status", "rejected");
      if (error) throw error;
      return data || [];
    },
    enabled: !!eventId,
  });

  // ---------------------------------------------------------------------------
  // Local state (cópias editáveis das queries)
  // ---------------------------------------------------------------------------
  const cfg: SimulatorConfig = configRow ?? { event_id: eventId!, ...DEFAULT_CONFIG };
  const [cfgDraft, setCfgDraft] = useState<SimulatorConfig>(cfg);
  useEffect(() => { setCfgDraft(cfg); }, [configRow?.event_id, configRow?.updated_at as any]);

  // Zonas: usa as do simulador; se não houver ainda, usa as do bilheteira (capacity informativa)
  const zoneLabels: string[] = useMemo(() => {
    if (zoneCfgRows.length > 0) return zoneCfgRows.map((z) => z.zone_label);
    if (ticketZones.length > 0) return Array.from(new Set(ticketZones.map((t: any) => t.name)));
    return ["Pista"];
  }, [zoneCfgRows, ticketZones]);

  const days = useMemo(() => (event ? buildDayList(event.date, eventDates) : []), [event, eventDates]);

  const inputsMap = useMemo(() => {
    const m = new Map<string, SimInput>();
    for (const r of inputRows) m.set(`${r.day_index}::${r.zone_label}`, r);
    return m;
  }, [inputRows]);

  const zoneCfgMap = useMemo(() => {
    const m = new Map<string, ZoneConfig>();
    for (const z of zoneCfgRows) m.set(z.zone_label, z);
    return m;
  }, [zoneCfgRows]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const saveConfig = useMutation({
    mutationFn: async () => {
      const payload = { ...cfgDraft, event_id: eventId! };
      const { error } = await supabase.from("event_simulator_config").upsert(payload, { onConflict: "event_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Configurações guardadas" });
      queryClient.invalidateQueries({ queryKey: ["simulator-config", eventId] });
    },
    onError: (e: any) => toast({ title: "Erro a guardar", description: e.message, variant: "destructive" }),
  });

  const upsertInput = useMutation({
    mutationFn: async (row: Partial<SimInput> & { day_index: number; zone_label: string }) => {
      const existing = inputsMap.get(`${row.day_index}::${row.zone_label}`);
      const dayDate = days.find((d) => d.idx === row.day_index)?.date ?? null;
      const payload = {
        event_id: eventId!,
        day_index: row.day_index,
        zone_label: row.zone_label,
        day_date: dayDate,
        projected_qty: row.projected_qty ?? existing?.projected_qty ?? 0,
        break_even_qty_manual: row.break_even_qty_manual ?? existing?.break_even_qty_manual ?? null,
        courtesy_qty: row.courtesy_qty ?? existing?.courtesy_qty ?? 0,
        capacity_target: row.capacity_target ?? existing?.capacity_target ?? null,
        projected_revenue: row.projected_revenue ?? existing?.projected_revenue ?? null,
        notes: row.notes ?? existing?.notes ?? null,
      };
      const { error } = await supabase.from("event_simulator_inputs").upsert(payload, { onConflict: "event_id,day_index,zone_label" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["simulator-inputs", eventId] }),
    onError: (e: any) => toast({ title: "Erro a guardar input", description: e.message, variant: "destructive" }),
  });

  const upsertZoneCfg = useMutation({
    mutationFn: async (row: Partial<ZoneConfig> & { zone_label: string }) => {
      const existing = zoneCfgMap.get(row.zone_label);
      const payload = {
        event_id: eventId!,
        zone_label: row.zone_label,
        drink_avg_ticket: row.drink_avg_ticket ?? existing?.drink_avg_ticket ?? null,
        food_avg_ticket: row.food_avg_ticket ?? existing?.food_avg_ticket ?? null,
        drink_cmv_pct: row.drink_cmv_pct ?? existing?.drink_cmv_pct ?? null,
        food_cmv_pct: row.food_cmv_pct ?? existing?.food_cmv_pct ?? null,
        drink_conversion_pct: row.drink_conversion_pct ?? existing?.drink_conversion_pct ?? null,
        food_conversion_pct: row.food_conversion_pct ?? existing?.food_conversion_pct ?? null,
        display_order: row.display_order ?? existing?.display_order ?? 0,
      };
      const { error } = await supabase.from("event_simulator_zone_config").upsert(payload, { onConflict: "event_id,zone_label" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["simulator-zone-config", eventId] }),
    onError: (e: any) => toast({ title: "Erro a guardar zona", description: e.message, variant: "destructive" }),
  });

  // ---------------------------------------------------------------------------
  // Derived: cálculos do simulador
  // ---------------------------------------------------------------------------
  const calc = useMemo(() => {
    type Cell = {
      day_index: number;
      day_date: string | null;
      zone_label: string;
      projected_qty: number;
      courtesy_qty: number;
      capacity_target: number;
      ticketRevenue: number;
      ab_drink_revenue: number;
      ab_food_revenue: number;
      ab_drink_cogs: number;
      ab_food_cogs: number;
      ab_margin: number;
    };

    const cells: Cell[] = [];
    let totalProjQty = 0, totalCourtesy = 0, totalTicketRev = 0;
    let totalDrinkRev = 0, totalFoodRev = 0, totalDrinkCogs = 0, totalFoodCogs = 0;

    for (const d of days) {
      for (const z of zoneLabels) {
        const inp = inputsMap.get(`${d.idx}::${z}`);
        const zoneCfg = zoneCfgMap.get(z) ?? null;
        const eff = effectiveAB(zoneCfg, cfgDraft);

        const projected = n(inp?.projected_qty);
        const courtesy = n(inp?.courtesy_qty);
        const ticketRevenue = n(inp?.projected_revenue); // manual (preço médio embutido)
        const paidPublic = projected; // paying audience
        const totalPublic = projected + courtesy; // consumidores totais

        const drinkUnits = totalPublic * (eff.drinkConvPct / 100);
        const foodUnits = totalPublic * (eff.foodConvPct / 100);
        const ab_drink_revenue = drinkUnits * eff.drinkTicket;
        const ab_food_revenue = foodUnits * eff.foodTicket;
        const ab_drink_cogs = ab_drink_revenue * (eff.drinkCmvPct / 100);
        const ab_food_cogs = ab_food_revenue * (eff.foodCmvPct / 100);
        const ab_margin = (ab_drink_revenue + ab_food_revenue) - (ab_drink_cogs + ab_food_cogs);

        cells.push({
          day_index: d.idx, day_date: d.date, zone_label: z,
          projected_qty: paidPublic, courtesy_qty: courtesy,
          capacity_target: n(inp?.capacity_target),
          ticketRevenue, ab_drink_revenue, ab_food_revenue, ab_drink_cogs, ab_food_cogs, ab_margin,
        });

        totalProjQty += paidPublic; totalCourtesy += courtesy; totalTicketRev += ticketRevenue;
        totalDrinkRev += ab_drink_revenue; totalFoodRev += ab_food_revenue;
        totalDrinkCogs += ab_drink_cogs; totalFoodCogs += ab_food_cogs;
      }
    }

    return {
      cells,
      totals: {
        projectedQty: totalProjQty,
        courtesyQty: totalCourtesy,
        ticketRevenue: totalTicketRev,
        drinkRevenue: totalDrinkRev,
        foodRevenue: totalFoodRev,
        drinkCogs: totalDrinkCogs,
        foodCogs: totalFoodCogs,
        abMargin: (totalDrinkRev + totalFoodRev) - (totalDrinkCogs + totalFoodCogs),
        grossRevenue: totalTicketRev + totalDrinkRev + totalFoodRev,
      },
    };
  }, [days, zoneLabels, inputsMap, zoneCfgMap, cfgDraft]);

  // ---------------------------------------------------------------------------
  // Derived: BP do evento (Forecast DVT) — agrega receitas vs despesas
  // ---------------------------------------------------------------------------
  const bpAggregate = useMemo(() => {
    let revenue = 0, expenses = 0;
    for (const r of bpRows as any[]) {
      const amt = n(r.amount);
      if (r.type === "income") revenue += amt;
      else if (r.type === "expense") expenses += amt;
    }
    return { revenue, expenses, result: revenue - expenses };
  }, [bpRows]);

  // Break-Even sugerido = (despesas BP) / (margem média por bilhete vendido)
  const breakEvenSuggestion = useMemo(() => {
    const totalAB = calc.totals.drinkRevenue + calc.totals.foodRevenue - calc.totals.drinkCogs - calc.totals.foodCogs;
    const marginPerPub = calc.totals.projectedQty > 0
      ? (calc.totals.ticketRevenue + totalAB) / calc.totals.projectedQty
      : 0;
    if (marginPerPub <= 0) return null;
    const needed = bpAggregate.expenses / marginPerPub;
    return Math.ceil(needed);
  }, [calc, bpAggregate.expenses]);

  // DRE comparativa: 4 colunas
  const dreComparison = useMemo(() => {
    const projectedRev = calc.totals.grossRevenue;
    const projectedAbCogs = calc.totals.drinkCogs + calc.totals.foodCogs;
    const projectedExpenses = bpAggregate.expenses + projectedAbCogs;

    // Break-Even = nível em que receitas = despesas
    const beRev = bpAggregate.expenses; // por definição

    return [
      { label: "Real 2025", revenue: n(cfgDraft.prior_year_real_revenue), expenses: n(cfgDraft.prior_year_real_expenses), kind: "manual" as const },
      { label: "Forecast DVT (BP atual)", revenue: bpAggregate.revenue, expenses: bpAggregate.expenses, kind: "bp" as const },
      { label: "Projetado (simulador)", revenue: projectedRev, expenses: projectedExpenses, kind: "sim" as const },
      { label: "Break-Even", revenue: beRev, expenses: beRev, kind: "be" as const },
    ];
  }, [calc, bpAggregate, cfgDraft.prior_year_real_revenue, cfgDraft.prior_year_real_expenses]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loadingEvent || loadingConfig) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!event) return <div className="p-6">Evento não encontrado.</div>;

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <button
            onClick={() => navigate(`/eventos/${eventId}`)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="h-3 w-3" /> Voltar ao evento
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" /> Simulador — {event.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            {days.length} dia{days.length === 1 ? "" : "s"} × {zoneLabels.length} zona{zoneLabels.length === 1 ? "" : "s"}
            {" "}• Modo: <Badge variant="outline" className="ml-1">read-only no BP</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => saveConfig.mutate()} disabled={!canEdit || saveConfig.isPending}>
            {saveConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar configurações
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={<Ticket className="h-4 w-4" />} label="Bilhetes projetados" value={calc.totals.projectedQty.toLocaleString("pt-PT")} sub={`+ ${calc.totals.courtesyQty} cortesias`} />
        <KPI icon={<TrendingUp className="h-4 w-4" />} label="Receita bruta projetada" value={formatCurrency(calc.totals.grossRevenue)} sub={`Bilheteira ${formatCurrency(calc.totals.ticketRevenue)}`} />
        <KPI icon={<Beer className="h-4 w-4" />} label="Margem A&B" value={formatCurrency(calc.totals.abMargin)} sub={`Receita ${formatCurrency(calc.totals.drinkRevenue + calc.totals.foodRevenue)}`} />
        <KPI icon={<Calculator className="h-4 w-4" />} label="Break-Even sugerido" value={breakEvenSuggestion ? `${breakEvenSuggestion.toLocaleString("pt-PT")} bilhetes` : "—"} sub={`Despesas BP ${formatCurrency(bpAggregate.expenses)}`} />
      </div>

      <Tabs defaultValue="matrix" className="w-full">
        <TabsList>
          <TabsTrigger value="matrix">Matriz Bilheteira</TabsTrigger>
          <TabsTrigger value="zones">A&B por Zona</TabsTrigger>
          <TabsTrigger value="dre">DRE Comparativa</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>

        {/* === Matriz === */}
        <TabsContent value="matrix" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Ticket className="h-4 w-4 text-primary" /> Inputs por dia × zona
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dia</TableHead>
                      <TableHead>Zona</TableHead>
                      <TableHead className="text-right">Capacidade</TableHead>
                      <TableHead className="text-right">Projetado</TableHead>
                      <TableHead className="text-right">Cortesias</TableHead>
                      <TableHead className="text-right">Receita bilheteira (€)</TableHead>
                      <TableHead className="text-right">Break-Even (override)</TableHead>
                      <TableHead className="text-right">Margem A&B</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {days.map((d) => zoneLabels.map((z) => {
                      const inp = inputsMap.get(`${d.idx}::${z}`);
                      const cell = calc.cells.find((c) => c.day_index === d.idx && c.zone_label === z);
                      return (
                        <TableRow key={`${d.idx}-${z}`}>
                          <TableCell className="text-xs whitespace-nowrap">{format(parseISO(d.date), "dd/MM")}</TableCell>
                          <TableCell className="text-xs font-medium">{z}</TableCell>
                          <TableCell className="text-right">
                            <NumInput
                              value={inp?.capacity_target ?? null}
                              disabled={!canEdit}
                              onCommit={(v) => upsertInput.mutate({ day_index: d.idx, zone_label: z, capacity_target: v })}
                              className="w-20 ml-auto"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <NumInput
                              value={inp?.projected_qty ?? 0}
                              disabled={!canEdit}
                              onCommit={(v) => upsertInput.mutate({ day_index: d.idx, zone_label: z, projected_qty: v ?? 0 })}
                              className="w-20 ml-auto"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <NumInput
                              value={inp?.courtesy_qty ?? 0}
                              disabled={!canEdit}
                              onCommit={(v) => upsertInput.mutate({ day_index: d.idx, zone_label: z, courtesy_qty: v ?? 0 })}
                              className="w-16 ml-auto"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <NumInput
                              value={inp?.projected_revenue ?? null}
                              step="0.01"
                              disabled={!canEdit}
                              onCommit={(v) => upsertInput.mutate({ day_index: d.idx, zone_label: z, projected_revenue: v })}
                              className="w-24 ml-auto"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <NumInput
                              value={inp?.break_even_qty_manual ?? null}
                              placeholder={breakEvenSuggestion ? `~${Math.round(breakEvenSuggestion / Math.max(1, days.length * zoneLabels.length))}` : ""}
                              disabled={!canEdit}
                              onCommit={(v) => upsertInput.mutate({ day_index: d.idx, zone_label: z, break_even_qty_manual: v })}
                              className="w-20 ml-auto"
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatCurrency(cell?.ab_margin ?? 0)}</TableCell>
                        </TableRow>
                      );
                    }))}
                    <TableRow className="font-semibold bg-secondary/30">
                      <TableCell colSpan={3} className="text-xs">TOTAL</TableCell>
                      <TableCell className="text-right">{calc.totals.projectedQty.toLocaleString("pt-PT")}</TableCell>
                      <TableCell className="text-right">{calc.totals.courtesyQty}</TableCell>
                      <TableCell className="text-right">{formatCurrency(calc.totals.ticketRevenue)}</TableCell>
                      <TableCell />
                      <TableCell className="text-right">{formatCurrency(calc.totals.abMargin)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Zonas A&B === */}
        <TabsContent value="zones" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Beer className="h-4 w-4 text-primary" /> Conversão e Ticket Médio por Zona
              </CardTitle>
              <p className="text-xs text-muted-foreground">Valores em branco usam os defaults globais (separador "Configurações").</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zona</TableHead>
                      <TableHead className="text-right" colSpan={3}><Beer className="inline h-3 w-3 mr-1" /> Bebidas</TableHead>
                      <TableHead className="text-right" colSpan={3}><UtensilsCrossed className="inline h-3 w-3 mr-1" /> Comida</TableHead>
                    </TableRow>
                    <TableRow>
                      <TableHead />
                      <TableHead className="text-right text-xs">Conv.%</TableHead>
                      <TableHead className="text-right text-xs">Ticket €</TableHead>
                      <TableHead className="text-right text-xs">CMV %</TableHead>
                      <TableHead className="text-right text-xs">Conv.%</TableHead>
                      <TableHead className="text-right text-xs">Ticket €</TableHead>
                      <TableHead className="text-right text-xs">CMV %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {zoneLabels.map((z) => {
                      const zc = zoneCfgMap.get(z) ?? null;
                      return (
                        <TableRow key={z}>
                          <TableCell className="font-medium text-xs">{z}</TableCell>
                          <TableCell className="text-right"><NumInput value={zc?.drink_conversion_pct ?? null} placeholder={`${cfgDraft.default_drink_conversion_pct}`} step="0.1" disabled={!canEdit} onCommit={(v) => upsertZoneCfg.mutate({ zone_label: z, drink_conversion_pct: v })} className="w-16 ml-auto" /></TableCell>
                          <TableCell className="text-right"><NumInput value={zc?.drink_avg_ticket ?? null} placeholder={`${cfgDraft.default_drink_avg_ticket}`} step="0.01" disabled={!canEdit} onCommit={(v) => upsertZoneCfg.mutate({ zone_label: z, drink_avg_ticket: v })} className="w-20 ml-auto" /></TableCell>
                          <TableCell className="text-right"><NumInput value={zc?.drink_cmv_pct ?? null} placeholder={`${cfgDraft.default_drink_cmv_pct}`} step="0.1" disabled={!canEdit} onCommit={(v) => upsertZoneCfg.mutate({ zone_label: z, drink_cmv_pct: v })} className="w-16 ml-auto" /></TableCell>
                          <TableCell className="text-right"><NumInput value={zc?.food_conversion_pct ?? null} placeholder={`${cfgDraft.default_food_conversion_pct}`} step="0.1" disabled={!canEdit} onCommit={(v) => upsertZoneCfg.mutate({ zone_label: z, food_conversion_pct: v })} className="w-16 ml-auto" /></TableCell>
                          <TableCell className="text-right"><NumInput value={zc?.food_avg_ticket ?? null} placeholder={`${cfgDraft.default_food_avg_ticket}`} step="0.01" disabled={!canEdit} onCommit={(v) => upsertZoneCfg.mutate({ zone_label: z, food_avg_ticket: v })} className="w-20 ml-auto" /></TableCell>
                          <TableCell className="text-right"><NumInput value={zc?.food_cmv_pct ?? null} placeholder={`${cfgDraft.default_food_cmv_pct}`} step="0.1" disabled={!canEdit} onCommit={(v) => upsertZoneCfg.mutate({ zone_label: z, food_cmv_pct: v })} className="w-16 ml-auto" /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === DRE === */}
        <TabsContent value="dre" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> DRE Comparativa
              </CardTitle>
              <p className="text-xs text-muted-foreground">Receita bruta vs despesas para cada cenário. Forecast DVT lê do BP atual.</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cenário</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Despesa</TableHead>
                    <TableHead className="text-right">Resultado</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dreComparison.map((c) => {
                    const result = c.revenue - c.expenses;
                    const margin = c.revenue > 0 ? (result / c.revenue) * 100 : 0;
                    return (
                      <TableRow key={c.label}>
                        <TableCell className="text-xs font-medium">
                          {c.label}
                          {c.kind === "manual" && <Badge variant="outline" className="ml-2 text-[10px]">manual</Badge>}
                          {c.kind === "bp" && <Badge variant="outline" className="ml-2 text-[10px]">do BP</Badge>}
                          {c.kind === "be" && <Badge variant="outline" className="ml-2 text-[10px]">calculado</Badge>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatCurrency(c.revenue)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatCurrency(c.expenses)}</TableCell>
                        <TableCell className={`text-right font-mono text-xs ${result < 0 ? "text-destructive" : "text-emerald-500"}`}>{formatCurrency(result)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{margin.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="mt-4 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground flex items-start gap-2">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>Adoptar cenário</strong> (criar forecasts reais a partir do simulador) chega na <em>Entrega 4</em>.
                  Para já, o simulador é read-only no BP.
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Config === */}
        <TabsContent value="config" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Defaults A&B</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Field label="Bebidas — Conversão %"><NumInput value={cfgDraft.default_drink_conversion_pct} step="0.1" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_drink_conversion_pct: n(v) }))} /></Field>
                <Field label="Bebidas — Ticket médio €"><NumInput value={cfgDraft.default_drink_avg_ticket} step="0.01" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_drink_avg_ticket: n(v) }))} /></Field>
                <Field label="Bebidas — CMV %"><NumInput value={cfgDraft.default_drink_cmv_pct} step="0.1" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_drink_cmv_pct: n(v) }))} /></Field>
                <div />
                <Field label="Comida — Conversão %"><NumInput value={cfgDraft.default_food_conversion_pct} step="0.1" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_food_conversion_pct: n(v) }))} /></Field>
                <Field label="Comida — Ticket médio €"><NumInput value={cfgDraft.default_food_avg_ticket} step="0.01" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_food_avg_ticket: n(v) }))} /></Field>
                <Field label="Comida — CMV %"><NumInput value={cfgDraft.default_food_cmv_pct} step="0.1" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_food_cmv_pct: n(v) }))} /></Field>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Histórico Real (ano anterior)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Receita real anterior (€)"><NumInput value={cfgDraft.prior_year_real_revenue} step="0.01" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, prior_year_real_revenue: v }))} /></Field>
                <Field label="Despesas reais anteriores (€)"><NumInput value={cfgDraft.prior_year_real_expenses} step="0.01" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, prior_year_real_expenses: v }))} /></Field>
                <div className="space-y-1">
                  <Label className="text-xs">Notas</Label>
                  <Input
                    value={cfgDraft.prior_year_notes ?? ""}
                    onChange={(e) => setCfgDraft((s) => ({ ...s, prior_year_notes: e.target.value || null }))}
                    placeholder="Edição 2025…"
                    disabled={!canEdit}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => saveConfig.mutate()} disabled={!canEdit || saveConfig.isPending}>
              {saveConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar configurações
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// Sub-componentes
// =============================================================================
function KPI({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
        <div className="text-lg font-semibold mt-1">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/**
 * Input numérico com commit on-blur. Aceita null para "sem valor".
 */
function NumInput({
  value, onCommit, disabled, placeholder, step = "1", className,
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  step?: string;
  className?: string;
}) {
  const [local, setLocal] = useState<string>(value == null ? "" : String(value));
  useEffect(() => { setLocal(value == null ? "" : String(value)); }, [value]);
  return (
    <Input
      type="number"
      step={step}
      value={local}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local === "") { if (value !== null && value !== undefined) onCommit(null); return; }
        const n2 = Number(local);
        if (Number.isFinite(n2) && n2 !== value) onCommit(n2);
      }}
      className={`h-7 text-right ${className ?? ""}`}
    />
  );
}
