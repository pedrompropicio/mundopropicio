/**
 * Simulador de Evento — `/eventos/:id/simulador`
 *
 * Modelo "Bilheteira é o motor":
 *  - Bilheteira (matriz dia × zona): input livre + botão "Puxar do BP".
 *  - Público total = bilhetes pagos + cortesias.
 *  - Receitas derivadas escalam com o público:
 *      • F&B (1.1.03)   = público × conv% × ticket médio
 *      • Merch (1.1.02) = público × conv% × ticket médio
 *  - Patrocínios (1.2.01/1.2.02): independentes do público (input manual).
 *  - Despesas variáveis (% sobre receita bruta): SPA + Comissão de bilheteira.
 *  - Curva de vendas (informativa): preset / edição anterior / similar.
 *  - DRE projetado em tempo real vs Real ano anterior, BP, Break-Even.
 *
 * Decisões fixadas (2026-04-30):
 *  - Bilheteira: input livre + botão "Puxar do BP" (mantém edição local).
 *  - Aprendizado histórico: defaults manuais; benchmarks ativam quando ≥3 eventos.
 *  - "Adoptar cenário" → Entrega 4.
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Calculator, TrendingUp, Save, Loader2, Beer, UtensilsCrossed, Ticket, Info, Shirt, Megaphone, Percent, Download, LineChart } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { format, parseISO } from "date-fns";

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
  default_merch_avg_ticket: number;
  default_merch_cmv_pct: number;
  default_merch_conversion_pct: number;
  sponsorship_revenue: number;
  sponsorship_notes: string | null;
  variable_spa_pct: number;
  variable_commission_pct: number;
  sales_curve_mode: "preset" | "prior_event" | "similar" | "manual";
  sales_curve_prior_event_id: string | null;
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
  merch_avg_ticket: number | null;
  merch_cmv_pct: number | null;
  merch_conversion_pct: number | null;
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
  default_merch_avg_ticket: 25,
  default_merch_cmv_pct: 45,
  default_merch_conversion_pct: 8,
  sponsorship_revenue: 0,
  sponsorship_notes: null,
  variable_spa_pct: 5,
  variable_commission_pct: 5,
  sales_curve_mode: "preset",
  sales_curve_prior_event_id: null,
  notes: null,
};

// Categorias relevantes para "Puxar do BP" e DRE projetado
const CAT_CODE_MERCH = "1.1.02";
const CAT_CODE_FB = "1.1.03";
const CAT_CODES_SPONSORS = ["1.2.01", "1.2.02"]; // Patrocínios + Apoios
const CAT_CODE_TICKET = "1.1.01"; // Bilheteira (legacy guess)

// Curva de vendas — preset por defeito (cumulativo % vs dias até evento)
const PRESET_CURVE: { daysBefore: number; cumulativePct: number }[] = [
  { daysBefore: 90, cumulativePct: 5 },
  { daysBefore: 60, cumulativePct: 12 },
  { daysBefore: 45, cumulativePct: 22 },
  { daysBefore: 30, cumulativePct: 35 },
  { daysBefore: 21, cumulativePct: 45 },
  { daysBefore: 14, cumulativePct: 58 },
  { daysBefore: 7, cumulativePct: 72 },
  { daysBefore: 3, cumulativePct: 85 },
  { daysBefore: 1, cumulativePct: 95 },
  { daysBefore: 0, cumulativePct: 100 },
];

// =============================================================================
// Helpers
// =============================================================================
function n(v: any, fb = 0): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fb;
}

function buildDayList(eventDate: string, eventDates: { date: string }[]): { idx: number; date: string }[] {
  const sorted = (eventDates || []).map((d) => d.date).sort();
  if (sorted.length === 0) return [{ idx: 0, date: eventDate }];
  return sorted.map((date, idx) => ({ idx, date }));
}

function effectiveAB(zone: ZoneConfig | null, cfg: SimulatorConfig) {
  return {
    drinkTicket: zone?.drink_avg_ticket ?? cfg.default_drink_avg_ticket,
    foodTicket: zone?.food_avg_ticket ?? cfg.default_food_avg_ticket,
    drinkCmvPct: zone?.drink_cmv_pct ?? cfg.default_drink_cmv_pct,
    foodCmvPct: zone?.food_cmv_pct ?? cfg.default_food_cmv_pct,
    drinkConvPct: zone?.drink_conversion_pct ?? cfg.default_drink_conversion_pct,
    foodConvPct: zone?.food_conversion_pct ?? cfg.default_food_conversion_pct,
    merchTicket: zone?.merch_avg_ticket ?? cfg.default_merch_avg_ticket,
    merchCmvPct: zone?.merch_cmv_pct ?? cfg.default_merch_cmv_pct,
    merchConvPct: zone?.merch_conversion_pct ?? cfg.default_merch_conversion_pct,
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

  const { data: ticketZones = [] } = useQuery({
    queryKey: ["ticket-zones-simulator", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_zones").select("name, capacity").eq("event_id", eventId).order("name");
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

  // BP do evento — para DRE comparativa e botão "Puxar do BP"
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

  // Eventos anteriores (mesma série/nome) — para curva "edição anterior"
  const { data: priorEvents = [] } = useQuery({
    queryKey: ["simulator-prior-events", eventId, event?.name],
    queryFn: async () => {
      if (!event?.name) return [];
      const baseName = event.name.replace(/\s*\d{4}\s*$/, "").trim();
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date")
        .ilike("name", `%${baseName}%`)
        .neq("id", eventId)
        .order("date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!event?.name,
  });

  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------
  const cfg: SimulatorConfig = configRow ?? { event_id: eventId!, ...DEFAULT_CONFIG };
  const [cfgDraft, setCfgDraft] = useState<SimulatorConfig>(cfg);
  useEffect(() => { setCfgDraft(cfg); }, [configRow]);

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

  const ticketZoneCapMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of ticketZones as any[]) m.set(t.name, n(t.capacity));
    return m;
  }, [ticketZones]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const saveConfig = useMutation({
    mutationFn: async () => {
      const payload = { ...cfgDraft, event_id: eventId!, company_id: event?.company_id };
      const { error } = await supabase.from("event_simulator_config").upsert([payload as any], { onConflict: "event_id" });
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
        company_id: event?.company_id,
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
      const { error } = await supabase.from("event_simulator_inputs").upsert([payload as any], { onConflict: "event_id,day_index,zone_label" });
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
        company_id: event?.company_id,
        zone_label: row.zone_label,
        drink_avg_ticket: row.drink_avg_ticket ?? existing?.drink_avg_ticket ?? null,
        food_avg_ticket: row.food_avg_ticket ?? existing?.food_avg_ticket ?? null,
        drink_cmv_pct: row.drink_cmv_pct ?? existing?.drink_cmv_pct ?? null,
        food_cmv_pct: row.food_cmv_pct ?? existing?.food_cmv_pct ?? null,
        drink_conversion_pct: row.drink_conversion_pct ?? existing?.drink_conversion_pct ?? null,
        food_conversion_pct: row.food_conversion_pct ?? existing?.food_conversion_pct ?? null,
        merch_avg_ticket: row.merch_avg_ticket ?? existing?.merch_avg_ticket ?? null,
        merch_cmv_pct: row.merch_cmv_pct ?? existing?.merch_cmv_pct ?? null,
        merch_conversion_pct: row.merch_conversion_pct ?? existing?.merch_conversion_pct ?? null,
        display_order: row.display_order ?? existing?.display_order ?? 0,
      };
      const { error } = await supabase.from("event_simulator_zone_config").upsert([payload as any], { onConflict: "event_id,zone_label" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["simulator-zone-config", eventId] }),
    onError: (e: any) => toast({ title: "Erro a guardar zona", description: e.message, variant: "destructive" }),
  });

  // ---------------------------------------------------------------------------
  // Derived: BP aggregates por categoria
  // ---------------------------------------------------------------------------
  const bpAggregate = useMemo(() => {
    let revenue = 0, expenses = 0;
    let bpTicket = 0, bpFB = 0, bpMerch = 0, bpSponsors = 0;
    for (const r of bpRows as any[]) {
      const amt = n(r.amount);
      const code = r.account_categories?.code as string | undefined;
      if (r.type === "income") {
        revenue += amt;
        if (code === CAT_CODE_TICKET) bpTicket += amt;
        else if (code === CAT_CODE_FB) bpFB += amt;
        else if (code === CAT_CODE_MERCH) bpMerch += amt;
        else if (code && CAT_CODES_SPONSORS.includes(code)) bpSponsors += amt;
      } else if (r.type === "expense") {
        expenses += amt;
      }
    }
    return { revenue, expenses, result: revenue - expenses, bpTicket, bpFB, bpMerch, bpSponsors };
  }, [bpRows]);

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
      merch_revenue: number;
      merch_cogs: number;
      derivedMargin: number;
    };

    const cells: Cell[] = [];
    let totalProjQty = 0, totalCourtesy = 0, totalTicketRev = 0;
    let totalDrinkRev = 0, totalFoodRev = 0, totalDrinkCogs = 0, totalFoodCogs = 0;
    let totalMerchRev = 0, totalMerchCogs = 0;

    for (const d of days) {
      for (const z of zoneLabels) {
        const inp = inputsMap.get(`${d.idx}::${z}`);
        const zoneCfg = zoneCfgMap.get(z) ?? null;
        const eff = effectiveAB(zoneCfg, cfgDraft);

        const projected = n(inp?.projected_qty);
        const courtesy = n(inp?.courtesy_qty);
        const ticketRevenue = n(inp?.projected_revenue);
        const totalPublic = projected + courtesy;

        const drinkUnits = totalPublic * (eff.drinkConvPct / 100);
        const foodUnits = totalPublic * (eff.foodConvPct / 100);
        const merchUnits = totalPublic * (eff.merchConvPct / 100);
        const ab_drink_revenue = drinkUnits * eff.drinkTicket;
        const ab_food_revenue = foodUnits * eff.foodTicket;
        const merch_revenue = merchUnits * eff.merchTicket;
        const ab_drink_cogs = ab_drink_revenue * (eff.drinkCmvPct / 100);
        const ab_food_cogs = ab_food_revenue * (eff.foodCmvPct / 100);
        const merch_cogs = merch_revenue * (eff.merchCmvPct / 100);
        const derivedMargin = (ab_drink_revenue + ab_food_revenue + merch_revenue) - (ab_drink_cogs + ab_food_cogs + merch_cogs);

        cells.push({
          day_index: d.idx, day_date: d.date, zone_label: z,
          projected_qty: projected, courtesy_qty: courtesy,
          capacity_target: n(inp?.capacity_target),
          ticketRevenue, ab_drink_revenue, ab_food_revenue, ab_drink_cogs, ab_food_cogs,
          merch_revenue, merch_cogs, derivedMargin,
        });

        totalProjQty += projected; totalCourtesy += courtesy; totalTicketRev += ticketRevenue;
        totalDrinkRev += ab_drink_revenue; totalFoodRev += ab_food_revenue;
        totalDrinkCogs += ab_drink_cogs; totalFoodCogs += ab_food_cogs;
        totalMerchRev += merch_revenue; totalMerchCogs += merch_cogs;
      }
    }

    const sponsors = n(cfgDraft.sponsorship_revenue);
    const grossRevenue = totalTicketRev + totalDrinkRev + totalFoodRev + totalMerchRev + sponsors;
    const variableSpa = grossRevenue * (n(cfgDraft.variable_spa_pct) / 100);
    const variableCommission = totalTicketRev * (n(cfgDraft.variable_commission_pct) / 100);
    const cogsTotal = totalDrinkCogs + totalFoodCogs + totalMerchCogs;

    return {
      cells,
      totals: {
        projectedQty: totalProjQty,
        courtesyQty: totalCourtesy,
        totalPublic: totalProjQty + totalCourtesy,
        ticketRevenue: totalTicketRev,
        drinkRevenue: totalDrinkRev,
        foodRevenue: totalFoodRev,
        merchRevenue: totalMerchRev,
        sponsorsRevenue: sponsors,
        drinkCogs: totalDrinkCogs,
        foodCogs: totalFoodCogs,
        merchCogs: totalMerchCogs,
        cogsTotal,
        derivedMargin: (totalDrinkRev + totalFoodRev + totalMerchRev) - cogsTotal,
        grossRevenue,
        variableSpa,
        variableCommission,
        variableTotal: variableSpa + variableCommission,
      },
    };
  }, [days, zoneLabels, inputsMap, zoneCfgMap, cfgDraft]);

  // Break-Even sugerido
  const breakEvenSuggestion = useMemo(() => {
    const marginPerPub = calc.totals.projectedQty > 0
      ? (calc.totals.ticketRevenue + calc.totals.derivedMargin) / calc.totals.projectedQty
      : 0;
    if (marginPerPub <= 0) return null;
    const fixedExpenses = bpAggregate.expenses - calc.totals.cogsTotal; // evitar duplicar CMV
    if (fixedExpenses <= 0) return null;
    return Math.ceil(fixedExpenses / marginPerPub);
  }, [calc, bpAggregate.expenses]);

  // DRE projetado vs cenários
  const dreComparison = useMemo(() => {
    const projectedRev = calc.totals.grossRevenue;
    // Despesas projetadas = (BP excluindo CMV genérico) + CMV simulado + variáveis
    const projectedExpenses = bpAggregate.expenses + calc.totals.cogsTotal + calc.totals.variableTotal;
    const beRev = bpAggregate.expenses;

    return [
      { label: "Real (ano anterior)", revenue: n(cfgDraft.prior_year_real_revenue), expenses: n(cfgDraft.prior_year_real_expenses), kind: "manual" as const },
      { label: "Forecast DVT (BP atual)", revenue: bpAggregate.revenue, expenses: bpAggregate.expenses, kind: "bp" as const },
      { label: "Projetado (simulador)", revenue: projectedRev, expenses: projectedExpenses, kind: "sim" as const },
      { label: "Break-Even", revenue: beRev, expenses: beRev, kind: "be" as const },
    ];
  }, [calc, bpAggregate, cfgDraft.prior_year_real_revenue, cfgDraft.prior_year_real_expenses]);

  // ---------------------------------------------------------------------------
  // Action: Puxar bilheteira do BP (1.1.01) — distribui pelos dias×zonas
  // ---------------------------------------------------------------------------
  const pullTicketingFromBP = useMutation({
    mutationFn: async () => {
      const total = bpAggregate.bpTicket;
      if (total <= 0) throw new Error("BP não tem receita de bilheteira (1.1.01).");
      const cells = days.flatMap((d) => zoneLabels.map((z) => ({ day_index: d.idx, zone_label: z })));
      if (cells.length === 0) return;
      const per = total / cells.length;
      for (const c of cells) {
        await supabase.from("event_simulator_inputs").upsert([{
          event_id: eventId!,
          company_id: event?.company_id,
          day_index: c.day_index,
          zone_label: c.zone_label,
          day_date: days.find((d) => d.idx === c.day_index)?.date ?? null,
          projected_revenue: Number(per.toFixed(2)),
        } as any], { onConflict: "event_id,day_index,zone_label" });
      }
    },
    onSuccess: () => {
      toast({ title: "Bilheteira preenchida a partir do BP" });
      queryClient.invalidateQueries({ queryKey: ["simulator-inputs", eventId] });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Curva de vendas — calcula vendas previstas em cada milestone
  const salesCurve = useMemo(() => {
    const totalQty = calc.totals.projectedQty;
    return PRESET_CURVE.map((p) => ({ ...p, qty: Math.round(totalQty * (p.cumulativePct / 100)) }));
  }, [calc.totals.projectedQty]);

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
            {" "}• <Badge variant="outline" className="ml-1">Bilheteira é o motor</Badge>
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI icon={<Ticket className="h-4 w-4" />} label="Público pagante" value={calc.totals.projectedQty.toLocaleString("pt-PT")} sub={`+ ${calc.totals.courtesyQty} cortesias`} />
        <KPI icon={<TrendingUp className="h-4 w-4" />} label="Receita bruta" value={formatCurrency(calc.totals.grossRevenue)} sub={`Bilh. ${formatCurrency(calc.totals.ticketRevenue)}`} />
        <KPI icon={<Beer className="h-4 w-4" />} label="F&B + Merch" value={formatCurrency(calc.totals.drinkRevenue + calc.totals.foodRevenue + calc.totals.merchRevenue)} sub={`Margem ${formatCurrency(calc.totals.derivedMargin)}`} />
        <KPI icon={<Megaphone className="h-4 w-4" />} label="Patrocínios" value={formatCurrency(calc.totals.sponsorsRevenue)} sub={cfgDraft.sponsorship_notes || "Independente do público"} />
        <KPI icon={<Calculator className="h-4 w-4" />} label="Break-Even" value={breakEvenSuggestion ? `${breakEvenSuggestion.toLocaleString("pt-PT")} pax` : "—"} sub={`Despesas ${formatCurrency(bpAggregate.expenses)}`} />
      </div>

      <Tabs defaultValue="matrix" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="matrix">Bilheteira</TabsTrigger>
          <TabsTrigger value="zones">F&B / Merch</TabsTrigger>
          <TabsTrigger value="sponsors">Patrocínios</TabsTrigger>
          <TabsTrigger value="variable">Despesas variáveis</TabsTrigger>
          <TabsTrigger value="curve">Curva de vendas</TabsTrigger>
          <TabsTrigger value="dre">DRE</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>

        {/* === Bilheteira === */}
        <TabsContent value="matrix" className="space-y-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Ticket className="h-4 w-4 text-primary" /> Inputs por dia × zona
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => pullTicketingFromBP.mutate()} disabled={!canEdit || pullTicketingFromBP.isPending || bpAggregate.bpTicket <= 0}>
                {pullTicketingFromBP.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
                Puxar do BP ({formatCurrency(bpAggregate.bpTicket)})
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dia</TableHead>
                      <TableHead>Zona</TableHead>
                      <TableHead className="text-right">Capacidade</TableHead>
                      <TableHead className="text-right">Pagantes</TableHead>
                      <TableHead className="text-right">Cortesias</TableHead>
                      <TableHead className="text-right">Receita bilh. (€)</TableHead>
                      <TableHead className="text-right">Break-Even</TableHead>
                      <TableHead className="text-right">Margem F&B+Merch</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {days.map((d) => zoneLabels.map((z) => {
                      const inp = inputsMap.get(`${d.idx}::${z}`);
                      const cell = calc.cells.find((c) => c.day_index === d.idx && c.zone_label === z);
                      const capPlaceholder = ticketZoneCapMap.get(z);
                      return (
                        <TableRow key={`${d.idx}-${z}`}>
                          <TableCell className="text-xs whitespace-nowrap">{format(parseISO(d.date), "dd/MM")}</TableCell>
                          <TableCell className="text-xs font-medium">{z}</TableCell>
                          <TableCell className="text-right">
                            <NumInput
                              value={inp?.capacity_target ?? null}
                              placeholder={capPlaceholder ? String(capPlaceholder) : ""}
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
                          <TableCell className="text-right font-mono text-xs">{formatCurrency(cell?.derivedMargin ?? 0)}</TableCell>
                        </TableRow>
                      );
                    }))}
                    <TableRow className="font-semibold bg-secondary/30">
                      <TableCell colSpan={3} className="text-xs">TOTAL</TableCell>
                      <TableCell className="text-right">{calc.totals.projectedQty.toLocaleString("pt-PT")}</TableCell>
                      <TableCell className="text-right">{calc.totals.courtesyQty}</TableCell>
                      <TableCell className="text-right">{formatCurrency(calc.totals.ticketRevenue)}</TableCell>
                      <TableCell />
                      <TableCell className="text-right">{formatCurrency(calc.totals.derivedMargin)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === F&B / Merch por Zona === */}
        <TabsContent value="zones" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Beer className="h-4 w-4 text-primary" /> Conversão e Ticket Médio por Zona
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Receitas escalam com o público total (pagantes + cortesias). Vazio = usa defaults globais.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead rowSpan={2}>Zona</TableHead>
                      <TableHead className="text-right" colSpan={3}><Beer className="inline h-3 w-3 mr-1" /> Bebidas</TableHead>
                      <TableHead className="text-right" colSpan={3}><UtensilsCrossed className="inline h-3 w-3 mr-1" /> Comida</TableHead>
                      <TableHead className="text-right" colSpan={3}><Shirt className="inline h-3 w-3 mr-1" /> Merch</TableHead>
                    </TableRow>
                    <TableRow>
                      <TableHead className="text-right text-xs">Conv.%</TableHead>
                      <TableHead className="text-right text-xs">Ticket €</TableHead>
                      <TableHead className="text-right text-xs">CMV %</TableHead>
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
                          <TableCell className="text-right"><NumInput value={zc?.merch_conversion_pct ?? null} placeholder={`${cfgDraft.default_merch_conversion_pct}`} step="0.1" disabled={!canEdit} onCommit={(v) => upsertZoneCfg.mutate({ zone_label: z, merch_conversion_pct: v })} className="w-16 ml-auto" /></TableCell>
                          <TableCell className="text-right"><NumInput value={zc?.merch_avg_ticket ?? null} placeholder={`${cfgDraft.default_merch_avg_ticket}`} step="0.01" disabled={!canEdit} onCommit={(v) => upsertZoneCfg.mutate({ zone_label: z, merch_avg_ticket: v })} className="w-20 ml-auto" /></TableCell>
                          <TableCell className="text-right"><NumInput value={zc?.merch_cmv_pct ?? null} placeholder={`${cfgDraft.default_merch_cmv_pct}`} step="0.1" disabled={!canEdit} onCommit={(v) => upsertZoneCfg.mutate({ zone_label: z, merch_cmv_pct: v })} className="w-16 ml-auto" /></TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="font-semibold bg-secondary/30 [&>td]:text-xs">
                      <TableCell>Receita projetada</TableCell>
                      <TableCell colSpan={3} className="text-right font-mono">{formatCurrency(calc.totals.drinkRevenue)}</TableCell>
                      <TableCell colSpan={3} className="text-right font-mono">{formatCurrency(calc.totals.foodRevenue)}</TableCell>
                      <TableCell colSpan={3} className="text-right font-mono">{formatCurrency(calc.totals.merchRevenue)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Patrocínios === */}
        <TabsContent value="sponsors" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-primary" /> Patrocínios e Apoios
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Independente do público projetado. BP atual: <strong>{formatCurrency(bpAggregate.bpSponsors)}</strong> (1.2.01 + 1.2.02).
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Receita de patrocínios projetada (€)">
                  <NumInput
                    value={cfgDraft.sponsorship_revenue}
                    step="0.01"
                    disabled={!canEdit}
                    onCommit={(v) => setCfgDraft((s) => ({ ...s, sponsorship_revenue: n(v) }))}
                  />
                </Field>
                <div className="space-y-1">
                  <Label className="text-xs">Notas / Patrocinadores</Label>
                  <Input
                    value={cfgDraft.sponsorship_notes ?? ""}
                    placeholder="Ex.: Coca-Cola 30k confirmado, Super Bock em pipe…"
                    disabled={!canEdit}
                    onChange={(e) => setCfgDraft((s) => ({ ...s, sponsorship_notes: e.target.value || null }))}
                  />
                </div>
              </div>
              {bpAggregate.bpSponsors > 0 && Math.abs(bpAggregate.bpSponsors - cfgDraft.sponsorship_revenue) > 0.5 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 text-xs">
                  <span>BP atual tem {formatCurrency(bpAggregate.bpSponsors)} em patrocínios.</span>
                  <Button size="sm" variant="outline" onClick={() => setCfgDraft((s) => ({ ...s, sponsorship_revenue: bpAggregate.bpSponsors }))} disabled={!canEdit}>
                    <Download className="h-3 w-3 mr-1" /> Puxar do BP
                  </Button>
                </div>
              )}
              <div className="flex justify-end">
                <Button size="sm" onClick={() => saveConfig.mutate()} disabled={!canEdit || saveConfig.isPending}>
                  <Save className="h-3 w-3 mr-1" /> Guardar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Despesas variáveis === */}
        <TabsContent value="variable" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Percent className="h-4 w-4 text-primary" /> Despesas variáveis (escalam com receita)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Calculadas em tempo real sobre a receita bruta projetada.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="SPA / Direitos autorais (% receita bruta)">
                  <NumInput value={cfgDraft.variable_spa_pct} step="0.1" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, variable_spa_pct: n(v) }))} />
                </Field>
                <Field label="Comissão de bilheteira (% receita de bilheteira)">
                  <NumInput value={cfgDraft.variable_commission_pct} step="0.1" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, variable_commission_pct: n(v) }))} />
                </Field>
              </div>
              <Table>
                <TableBody className="[&>tr>td]:text-xs">
                  <TableRow>
                    <TableCell>SPA ({cfgDraft.variable_spa_pct}% × receita bruta {formatCurrency(calc.totals.grossRevenue)})</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(calc.totals.variableSpa)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Comissão ({cfgDraft.variable_commission_pct}% × bilheteira {formatCurrency(calc.totals.ticketRevenue)})</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(calc.totals.variableCommission)}</TableCell>
                  </TableRow>
                  <TableRow className="font-semibold bg-secondary/30">
                    <TableCell>Total despesas variáveis</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(calc.totals.variableTotal)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => saveConfig.mutate()} disabled={!canEdit || saveConfig.isPending}>
                  <Save className="h-3 w-3 mr-1" /> Guardar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Curva de vendas === */}
        <TabsContent value="curve" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <LineChart className="h-4 w-4 text-primary" /> Curva de vendas projetada
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Distribuição esperada de vendas ao longo do tempo. Total projetado: <strong>{calc.totals.projectedQty.toLocaleString("pt-PT")} bilhetes</strong>.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Modo da curva">
                  <Select
                    value={cfgDraft.sales_curve_mode}
                    onValueChange={(v: any) => setCfgDraft((s) => ({ ...s, sales_curve_mode: v }))}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preset">Preset (curva típica)</SelectItem>
                      <SelectItem value="prior_event">Edição anterior</SelectItem>
                      <SelectItem value="similar">Eventos similares</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {cfgDraft.sales_curve_mode === "prior_event" && priorEvents.length > 0 && (
                  <Field label="Evento de referência">
                    <Select
                      value={cfgDraft.sales_curve_prior_event_id ?? ""}
                      onValueChange={(v) => setCfgDraft((s) => ({ ...s, sales_curve_prior_event_id: v || null }))}
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="h-8"><SelectValue placeholder="Escolher…" /></SelectTrigger>
                      <SelectContent>
                        {priorEvents.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.name} ({format(parseISO(p.date), "dd/MM/yyyy")})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dias antes do evento</TableHead>
                    <TableHead className="text-right">Cumulativo %</TableHead>
                    <TableHead className="text-right">Bilhetes vendidos (cum.)</TableHead>
                    <TableHead className="text-right">Receita esperada (cum.)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesCurve.map((p) => (
                    <TableRow key={p.daysBefore}>
                      <TableCell className="text-xs">{p.daysBefore === 0 ? "Dia do evento" : `D-${p.daysBefore}`}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{p.cumulativePct}%</TableCell>
                      <TableCell className="text-right font-mono text-xs">{p.qty.toLocaleString("pt-PT")}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(calc.totals.ticketRevenue * (p.cumulativePct / 100))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground flex items-start gap-2">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Curva é informativa. Modos "Edição anterior" e "Eventos similares" usam vendas reais quando disponíveis (ainda não implementado o cálculo do histórico — aparece quando ≥3 eventos com vendas registadas).</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === DRE === */}
        <TabsContent value="dre" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> DRE projetado em tempo real
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Projetado = Bilheteira + F&B + Merch + Patrocínios − (BP despesas + CMV simulado + variáveis).
              </p>
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

              {/* Decomposição da receita projetada */}
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                <Card className="bg-muted/20">
                  <CardHeader className="pb-1"><CardTitle className="text-xs">Receita projetada</CardTitle></CardHeader>
                  <CardContent className="text-xs space-y-1">
                    <RowKV label="Bilheteira" value={formatCurrency(calc.totals.ticketRevenue)} />
                    <RowKV label="Bebidas" value={formatCurrency(calc.totals.drinkRevenue)} />
                    <RowKV label="Comida" value={formatCurrency(calc.totals.foodRevenue)} />
                    <RowKV label="Merchandising" value={formatCurrency(calc.totals.merchRevenue)} />
                    <RowKV label="Patrocínios" value={formatCurrency(calc.totals.sponsorsRevenue)} />
                    <RowKV label="TOTAL" value={formatCurrency(calc.totals.grossRevenue)} bold />
                  </CardContent>
                </Card>
                <Card className="bg-muted/20">
                  <CardHeader className="pb-1"><CardTitle className="text-xs">Despesa projetada</CardTitle></CardHeader>
                  <CardContent className="text-xs space-y-1">
                    <RowKV label="BP atual (todas)" value={formatCurrency(bpAggregate.expenses)} />
                    <RowKV label="CMV F&B + Merch (simulado)" value={formatCurrency(calc.totals.cogsTotal)} />
                    <RowKV label="SPA + Comissões" value={formatCurrency(calc.totals.variableTotal)} />
                    <RowKV label="TOTAL" value={formatCurrency(bpAggregate.expenses + calc.totals.cogsTotal + calc.totals.variableTotal)} bold />
                  </CardContent>
                </Card>
              </div>

              <div className="mt-4 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground flex items-start gap-2">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>Adoptar cenário</strong> (criar/atualizar forecasts reais a partir do simulador) chega na <em>Entrega 4</em>.
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Config === */}
        <TabsContent value="config" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Beer className="h-4 w-4" /> Defaults Bebidas</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-3 gap-3">
                <Field label="Conv. %"><NumInput value={cfgDraft.default_drink_conversion_pct} step="0.1" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_drink_conversion_pct: n(v) }))} /></Field>
                <Field label="Ticket €"><NumInput value={cfgDraft.default_drink_avg_ticket} step="0.01" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_drink_avg_ticket: n(v) }))} /></Field>
                <Field label="CMV %"><NumInput value={cfgDraft.default_drink_cmv_pct} step="0.1" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_drink_cmv_pct: n(v) }))} /></Field>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><UtensilsCrossed className="h-4 w-4" /> Defaults Comida</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-3 gap-3">
                <Field label="Conv. %"><NumInput value={cfgDraft.default_food_conversion_pct} step="0.1" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_food_conversion_pct: n(v) }))} /></Field>
                <Field label="Ticket €"><NumInput value={cfgDraft.default_food_avg_ticket} step="0.01" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_food_avg_ticket: n(v) }))} /></Field>
                <Field label="CMV %"><NumInput value={cfgDraft.default_food_cmv_pct} step="0.1" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_food_cmv_pct: n(v) }))} /></Field>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shirt className="h-4 w-4" /> Defaults Merchandising</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-3 gap-3">
                <Field label="Conv. %"><NumInput value={cfgDraft.default_merch_conversion_pct} step="0.1" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_merch_conversion_pct: n(v) }))} /></Field>
                <Field label="Ticket €"><NumInput value={cfgDraft.default_merch_avg_ticket} step="0.01" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_merch_avg_ticket: n(v) }))} /></Field>
                <Field label="CMV %"><NumInput value={cfgDraft.default_merch_cmv_pct} step="0.1" disabled={!canEdit} onCommit={(v) => setCfgDraft((s) => ({ ...s, default_merch_cmv_pct: n(v) }))} /></Field>
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
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
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

function RowKV({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold border-t pt-1 mt-1" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
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
