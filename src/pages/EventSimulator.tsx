/**
 * Simulador de Evento — formato Coala (BP_COALA_PT_2026 v12.6)
 *
 * 3 cenários paralelos: Hoje · Break Even · Forecast DVT
 * Bloco 1: Matriz por Dia × Zona (Vendas Reais + Projeção + Cortesia + Forecast + IVA)
 * Bloco 2: Faturamento comparativo (2025 / Orçamento / BE / Forecast)
 * Bloco 3: Custos por categoria L3 do Plano de Contas (2025 / BE / Forecast)
 * Bloco 4: IVA por sessão
 * Bloco 5: Resultados (Geral / Evento / A&B / Souvenir) + Indicadores per capita
 */
import React, { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Loader2, Save, Calculator, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import {
  type CoalaSession, type CoalaCostLine, type CoalaConfig,
  computeScenarioRevenue, computeScenarioCosts, computeScenarioResult,
  computeScenarioKpis, solveBreakEven, computeIvaTable,
} from "@/lib/event-simulator-coala";
import { syncSimulatorFromSources } from "@/lib/event-simulator-sync";

// ----- Tipos DB -----
type DbConfig = {
  event_id: string;
  default_drink_avg_ticket: number;
  default_food_avg_ticket: number;
  ab_drink_passthrough_pct: number;
  ab_food_passthrough_pct: number;
  sponsorship_revenue: number;
  souvenir_revenue: number;
  souvenir_cost: number;
  bonif_bebidas: number;
  ponto_vendido: number;
  prior_year_tickets: number;
  prior_year_drink: number;
  prior_year_food: number;
  prior_year_sponsor: number;
  prior_year_souvenir: number;
  prior_year_other: number;
  ticket_iva_pct: number;
};

type DbInput = {
  id?: string;
  event_id: string;
  day_index: number;
  zone_label: string;
  real_sales_qty: number;
  real_sales_revenue: number;
  projected_qty: number;
  courtesy_qty: number;
  forecast_qty: number | null;
  avg_ticket_override: number | null;
  iva_pct: number;
  prior_year_qty: number | null;
  prior_year_revenue: number | null;
};

type DbCostLine = {
  id?: string;
  event_id: string;
  category_id: string | null;
  label: string;
  prior_year_amount: number;
  break_even_amount: number;
  forecast_amount: number;
  is_ab_passthrough: boolean;
  display_order: number;
};

type AccountCategory = { id: string; code: string; name: string };

const fmt = (v: number) => formatCurrency(Number.isFinite(v) ? v : 0);
const fmtNum = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString("pt-PT", { maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function EventSimulator() {
  const { id: eventId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ------- Queries -------
  const { data: event } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => {
      const { data } = await supabase.from("events").select("*").eq("id", eventId!).maybeSingle();
      return data;
    },
    enabled: !!eventId,
  });

  const { data: cfg, isLoading: loadingCfg } = useQuery<DbConfig | null>({
    queryKey: ["sim-coala-cfg", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("event_simulator_config")
        .select("*")
        .eq("event_id", eventId!)
        .maybeSingle();
      return (data as any) ?? null;
    },
    enabled: !!eventId,
  });

  const { data: sessions = [] } = useQuery<DbInput[]>({
    queryKey: ["sim-coala-inputs", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("event_simulator_inputs")
        .select("*")
        .eq("event_id", eventId!)
        .order("day_index").order("zone_label");
      return (data as any) ?? [];
    },
    enabled: !!eventId,
  });

  const { data: costLines = [] } = useQuery<DbCostLine[]>({
    queryKey: ["sim-coala-costs", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("event_simulator_cost_lines")
        .select("*")
        .eq("event_id", eventId!)
        .order("display_order");
      return (data as any) ?? [];
    },
    enabled: !!eventId,
  });

  const { data: l3Categories = [] } = useQuery<AccountCategory[]>({
    queryKey: ["account-categories-l3"],
    queryFn: async () => {
      const { data } = await supabase
        .from("account_categories")
        .select("id, code, name")
        .eq("is_active", true)
        .order("code");
      // L3 = code com 3 níveis (x.y.z)
      return ((data as any) ?? []).filter((c: any) => /^\d+\.\d+\.\d+$/.test(c.code));
    },
  });

  // ------- Local state for editing -------
  const [localCfg, setLocalCfg] = useState<DbConfig | null>(null);
  const [localSessions, setLocalSessions] = useState<DbInput[]>([]);
  const [localCosts, setLocalCosts] = useState<DbCostLine[]>([]);

  useEffect(() => { if (cfg) setLocalCfg(cfg); }, [cfg]);
  useEffect(() => { setLocalSessions(sessions); }, [sessions]);
  useEffect(() => { setLocalCosts(costLines); }, [costLines]);

  // ------- Default config seed (se não existir) -------
  useEffect(() => {
    if (!loadingCfg && !cfg && eventId) {
      // cria default
      supabase.from("event_simulator_config").insert({
        event_id: eventId,
        default_drink_avg_ticket: 10.51,
        default_food_avg_ticket: 5.40,
        ab_drink_passthrough_pct: 65,
        ab_food_passthrough_pct: 75,
        ticket_iva_pct: 6,
      } as any).then(() => qc.invalidateQueries({ queryKey: ["sim-coala-cfg", eventId] }));
    }
  }, [loadingCfg, cfg, eventId, qc]);

  // ------- Mutations -------
  const saveAll = useMutation({
    mutationFn: async () => {
      if (!localCfg || !eventId) return;
      const cfgPayload: any = { ...localCfg, event_id: eventId };
      delete cfgPayload.company_id;
      await supabase.from("event_simulator_config").upsert(cfgPayload).throwOnError();

      // sessions: upsert one by one
      for (const s of localSessions) {
        const payload: any = { ...s, event_id: eventId };
        delete payload.company_id;
        if (!s.id) delete payload.id;
        await supabase.from("event_simulator_inputs").upsert(payload).throwOnError();
      }
      // costs
      for (const c of localCosts) {
        const payload: any = { ...c, event_id: eventId };
        delete payload.company_id;
        if (!c.id) delete payload.id;
        await supabase.from("event_simulator_cost_lines").upsert(payload).throwOnError();
      }
    },
    onSuccess: () => {
      toast({ title: "Simulador guardado", description: "Todas as alterações foram persistidas." });
      qc.invalidateQueries({ queryKey: ["sim-coala-cfg", eventId] });
      qc.invalidateQueries({ queryKey: ["sim-coala-inputs", eventId] });
      qc.invalidateQueries({ queryKey: ["sim-coala-costs", eventId] });
    },
    onError: (e: any) => toast({ title: "Erro ao guardar", description: e.message, variant: "destructive" }),
  });

  const removeSession = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("event_simulator_inputs").delete().eq("id", id).throwOnError();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sim-coala-inputs", eventId] }),
  });

  const removeCost = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("event_simulator_cost_lines").delete().eq("id", id).throwOnError();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sim-coala-costs", eventId] }),
  });

  const syncFromSources = useMutation({
    mutationFn: async () => {
      if (!eventId) throw new Error("Sem evento");
      return syncSimulatorFromSources(eventId);
    },
    onSuccess: (r) => {
      toast({
        title: "Simulador sincronizado",
        description: `Sessões: +${r.sessionsCreated} criadas, ${r.sessionsUpdated} atualizadas. Custos: +${r.costLinesCreated} criadas, ${r.costLinesUpdated} atualizadas.`,
      });
      qc.invalidateQueries({ queryKey: ["sim-coala-inputs", eventId] });
      qc.invalidateQueries({ queryKey: ["sim-coala-costs", eventId] });
    },
    onError: (e: any) => toast({ title: "Erro a sincronizar", description: e.message, variant: "destructive" }),
  });
  const calcCfg: CoalaConfig = useMemo(() => ({
    ab_drink_avg_ticket: Number(localCfg?.default_drink_avg_ticket || 0),
    ab_food_avg_ticket: Number(localCfg?.default_food_avg_ticket || 0),
    ab_drink_passthrough_pct: Number(localCfg?.ab_drink_passthrough_pct || 0),
    ab_food_passthrough_pct: Number(localCfg?.ab_food_passthrough_pct || 0),
    sponsorship_revenue: Number(localCfg?.sponsorship_revenue || 0),
    souvenir_revenue: Number(localCfg?.souvenir_revenue || 0),
    souvenir_cost: Number(localCfg?.souvenir_cost || 0),
    bonif_bebidas: Number(localCfg?.bonif_bebidas || 0),
    ponto_vendido: Number(localCfg?.ponto_vendido || 0),
    prior_year_tickets: Number(localCfg?.prior_year_tickets || 0),
    prior_year_drink: Number(localCfg?.prior_year_drink || 0),
    prior_year_food: Number(localCfg?.prior_year_food || 0),
    prior_year_sponsor: Number(localCfg?.prior_year_sponsor || 0),
    prior_year_souvenir: Number(localCfg?.prior_year_souvenir || 0),
    prior_year_other: Number(localCfg?.prior_year_other || 0),
    ticket_iva_pct: Number(localCfg?.ticket_iva_pct || 6),
  }), [localCfg]);

  const calcSessions: CoalaSession[] = useMemo(() =>
    localSessions.map((s) => ({
      day_index: s.day_index,
      zone_label: s.zone_label,
      real_sales_qty: Number(s.real_sales_qty || 0),
      real_sales_revenue: Number(s.real_sales_revenue || 0),
      projected_qty: Number(s.projected_qty || 0),
      courtesy_qty: Number(s.courtesy_qty || 0),
      forecast_qty: Number(s.forecast_qty || 0),
      prior_year_qty: Number(s.prior_year_qty || 0),
      prior_year_revenue: Number(s.prior_year_revenue || 0),
      iva_pct: Number(s.iva_pct || 6),
      avg_ticket_override: s.avg_ticket_override,
    })), [localSessions]);

  const calcCosts: CoalaCostLine[] = useMemo(() =>
    localCosts.map((c) => ({
      label: c.label,
      prior_year_amount: Number(c.prior_year_amount || 0),
      break_even_amount: Number(c.break_even_amount || 0),
      forecast_amount: Number(c.forecast_amount || 0),
      is_ab_passthrough: !!c.is_ab_passthrough,
    })), [localCosts]);

  const beSolution = useMemo(
    () => solveBreakEven(calcSessions, calcCosts, calcCfg),
    [calcSessions, calcCosts, calcCfg],
  );

  const today = useMemo(() => computeScenarioRevenue(calcSessions, calcCfg, "today"), [calcSessions, calcCfg]);
  const breakeven = useMemo(() => computeScenarioRevenue(calcSessions, calcCfg, "breakeven", beSolution.qtyByKey), [calcSessions, calcCfg, beSolution]);
  const forecast = useMemo(() => computeScenarioRevenue(calcSessions, calcCfg, "forecast"), [calcSessions, calcCfg]);

  const todayCosts = useMemo(() => computeScenarioCosts(calcCosts, today, calcCfg, "today"), [calcCosts, today, calcCfg]);
  const beCosts = useMemo(() => computeScenarioCosts(calcCosts, breakeven, calcCfg, "breakeven"), [calcCosts, breakeven, calcCfg]);
  const fcCosts = useMemo(() => computeScenarioCosts(calcCosts, forecast, calcCfg, "forecast"), [calcCosts, forecast, calcCfg]);

  const todayRes = useMemo(() => computeScenarioResult(today, todayCosts), [today, todayCosts]);
  const beRes = useMemo(() => computeScenarioResult(breakeven, beCosts), [breakeven, beCosts]);
  const fcRes = useMemo(() => computeScenarioResult(forecast, fcCosts), [forecast, fcCosts]);

  const todayKpis = useMemo(() => computeScenarioKpis(today, todayCosts, todayRes), [today, todayCosts, todayRes]);
  const beKpis = useMemo(() => computeScenarioKpis(breakeven, beCosts, beRes), [breakeven, beCosts, beRes]);
  const fcKpis = useMemo(() => computeScenarioKpis(forecast, fcCosts, fcRes), [forecast, fcCosts, fcRes]);

  const ivaTable = useMemo(() => computeIvaTable(calcSessions), [calcSessions]);

  // ------- Helpers de edição -------
  const updateSession = (idx: number, patch: Partial<DbInput>) =>
    setLocalSessions((arr) => arr.map((s, i) => i === idx ? { ...s, ...patch } : s));

  const addSession = () => {
    const maxDay = Math.max(0, ...localSessions.map((s) => s.day_index)) + (localSessions.length ? 0 : 0);
    setLocalSessions((arr) => [...arr, {
      event_id: eventId!,
      day_index: maxDay,
      zone_label: "Pista",
      real_sales_qty: 0,
      real_sales_revenue: 0,
      projected_qty: 0,
      courtesy_qty: 0,
      forecast_qty: null,
      avg_ticket_override: null,
      iva_pct: 6,
      prior_year_qty: null,
      prior_year_revenue: null,
    }]);
  };

  const updateCost = (idx: number, patch: Partial<DbCostLine>) =>
    setLocalCosts((arr) => arr.map((c, i) => i === idx ? { ...c, ...patch } : c));

  const addCost = () => {
    setLocalCosts((arr) => [...arr, {
      event_id: eventId!,
      category_id: null,
      label: "Nova categoria",
      prior_year_amount: 0,
      break_even_amount: 0,
      forecast_amount: 0,
      is_ab_passthrough: false,
      display_order: arr.length,
    }]);
  };

  if (loadingCfg) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/eventos/${eventId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold lg:text-2xl flex items-center gap-2">
              <Calculator className="h-6 w-6 text-primary" />
              Simulador — {event?.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              3 cenários paralelos: <strong>Hoje</strong> · <strong>Break Even</strong> · <strong>Forecast DVT</strong>
            </p>
          </div>
        </div>
        <Button onClick={() => saveAll.mutate()} disabled={saveAll.isPending}>
          {saveAll.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Guardar
        </Button>
      </div>

      {/* KPIs scenario summary */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ScenarioCard title="Hoje" tone="muted" rev={today} cost={todayCosts} res={todayRes} kpis={todayKpis} />
        <ScenarioCard
          title="Break Even"
          tone="warning"
          rev={breakeven}
          cost={beCosts}
          res={beRes}
          kpis={beKpis}
          extra={beSolution.reachable ? null : <Badge variant="destructive">Inalcançável com margem atual</Badge>}
        />
        <ScenarioCard title="Forecast DVT" tone="success" rev={forecast} cost={fcCosts} res={fcRes} kpis={fcKpis} />
      </div>

      <Tabs defaultValue="sessions" className="space-y-4">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="sessions">Sessões (Dia × Zona)</TabsTrigger>
          <TabsTrigger value="revenue">Faturamento</TabsTrigger>
          <TabsTrigger value="costs">Custos</TabsTrigger>
          <TabsTrigger value="iva">IVA</TabsTrigger>
          <TabsTrigger value="result">Resultados</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
        </TabsList>

        {/* ---------------- Sessões ---------------- */}
        <TabsContent value="sessions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Matriz por Dia × Zona</CardTitle>
              <Button size="sm" variant="outline" onClick={addSession}><Plus className="mr-1 h-4 w-4" /> Adicionar sessão</Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dia</TableHead>
                    <TableHead>Zona</TableHead>
                    <TableHead className="text-right">Vendas Reais (qty)</TableHead>
                    <TableHead className="text-right">Faturação Real</TableHead>
                    <TableHead className="text-right">Projeção</TableHead>
                    <TableHead className="text-right">Cortesia</TableHead>
                    <TableHead className="text-right">Forecast (qty)</TableHead>
                    <TableHead className="text-right">TM override</TableHead>
                    <TableHead className="text-right">IVA %</TableHead>
                    <TableHead className="text-right">2025 qty</TableHead>
                    <TableHead className="text-right">2025 €</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localSessions.map((s, i) => (
                    <TableRow key={s.id ?? `new-${i}`}>
                      <TableCell><Input className="h-8 w-16" type="number" value={s.day_index + 1}
                        onChange={(e) => updateSession(i, { day_index: Math.max(0, Number(e.target.value) - 1) })} /></TableCell>
                      <TableCell><Input className="h-8 w-28" value={s.zone_label}
                        onChange={(e) => updateSession(i, { zone_label: e.target.value })} /></TableCell>
                      <TableCell><Input className="h-8 w-24 text-right" type="number" value={s.real_sales_qty}
                        onChange={(e) => updateSession(i, { real_sales_qty: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input className="h-8 w-28 text-right" type="number" step="0.01" value={s.real_sales_revenue}
                        onChange={(e) => updateSession(i, { real_sales_revenue: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input className="h-8 w-24 text-right" type="number" value={s.projected_qty}
                        onChange={(e) => updateSession(i, { projected_qty: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input className="h-8 w-24 text-right" type="number" value={s.courtesy_qty}
                        onChange={(e) => updateSession(i, { courtesy_qty: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input className="h-8 w-24 text-right" type="number" value={s.forecast_qty ?? ""}
                        onChange={(e) => updateSession(i, { forecast_qty: e.target.value ? Number(e.target.value) : null })} /></TableCell>
                      <TableCell><Input className="h-8 w-24 text-right" type="number" step="0.01" value={s.avg_ticket_override ?? ""}
                        onChange={(e) => updateSession(i, { avg_ticket_override: e.target.value ? Number(e.target.value) : null })} /></TableCell>
                      <TableCell><Input className="h-8 w-16 text-right" type="number" value={s.iva_pct}
                        onChange={(e) => updateSession(i, { iva_pct: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input className="h-8 w-24 text-right" type="number" value={s.prior_year_qty ?? ""}
                        onChange={(e) => updateSession(i, { prior_year_qty: e.target.value ? Number(e.target.value) : null })} /></TableCell>
                      <TableCell><Input className="h-8 w-28 text-right" type="number" step="0.01" value={s.prior_year_revenue ?? ""}
                        onChange={(e) => updateSession(i, { prior_year_revenue: e.target.value ? Number(e.target.value) : null })} /></TableCell>
                      <TableCell>
                        {s.id && (
                          <Button size="icon" variant="ghost" onClick={() => removeSession.mutate(s.id!)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!localSessions.length && (
                    <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-6">Nenhuma sessão. Adicione a primeira.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Faturamento ---------------- */}
        <TabsContent value="revenue">
          <Card>
            <CardHeader><CardTitle>Faturamento — comparativo de cenários</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Linha</TableHead>
                    <TableHead className="text-right">2025 (real)</TableHead>
                    <TableHead className="text-right">Hoje</TableHead>
                    <TableHead className="text-right">Break Even</TableHead>
                    <TableHead className="text-right">Forecast DVT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <RevRow label="Ingressos" prior={calcCfg.prior_year_tickets} a={today.ticketsRevenue} b={breakeven.ticketsRevenue} c={forecast.ticketsRevenue} />
                  <RevRow label="A&B Bebida" prior={calcCfg.prior_year_drink} a={today.drinkRevenue} b={breakeven.drinkRevenue} c={forecast.drinkRevenue} />
                  <RevRow label="A&B Alimento" prior={calcCfg.prior_year_food} a={today.foodRevenue} b={breakeven.foodRevenue} c={forecast.foodRevenue} />
                  <RevRow label="Patrocínio" prior={calcCfg.prior_year_sponsor} a={today.sponsorRevenue} b={breakeven.sponsorRevenue} c={forecast.sponsorRevenue} />
                  <RevRow label="Souvenir" prior={calcCfg.prior_year_souvenir} a={today.souvenirRevenue} b={breakeven.souvenirRevenue} c={forecast.souvenirRevenue} />
                  <RevRow label="Outros Créditos" prior={calcCfg.prior_year_other} a={today.otherCredits} b={breakeven.otherCredits} c={forecast.otherCredits} />
                  <TableRow className="font-bold border-t-2">
                    <TableCell>FATURAMENTO TOTAL</TableCell>
                    <TableCell className="text-right">{fmt(calcCfg.prior_year_tickets + calcCfg.prior_year_drink + calcCfg.prior_year_food + calcCfg.prior_year_sponsor + calcCfg.prior_year_souvenir + calcCfg.prior_year_other)}</TableCell>
                    <TableCell className="text-right">{fmt(today.totalRevenue)}</TableCell>
                    <TableCell className="text-right">{fmt(breakeven.totalRevenue)}</TableCell>
                    <TableCell className="text-right">{fmt(forecast.totalRevenue)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Custos ---------------- */}
        <TabsContent value="costs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Custos por categoria L3</CardTitle>
              <Button size="sm" variant="outline" onClick={addCost}><Plus className="mr-1 h-4 w-4" /> Adicionar linha</Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria L3</TableHead>
                    <TableHead>Rótulo</TableHead>
                    <TableHead className="text-right">2025</TableHead>
                    <TableHead className="text-right">Break Even</TableHead>
                    <TableHead className="text-right">Forecast</TableHead>
                    <TableHead className="text-center">A&B?</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localCosts.map((c, i) => (
                    <TableRow key={c.id ?? `new-c-${i}`}>
                      <TableCell>
                        <Select value={c.category_id ?? ""} onValueChange={(v) => updateCost(i, { category_id: v || null })}>
                          <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Selecionar L3..." /></SelectTrigger>
                          <SelectContent>
                            {l3Categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.code} — {cat.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input className="h-8 w-48" value={c.label} onChange={(e) => updateCost(i, { label: e.target.value })} /></TableCell>
                      <TableCell><Input className="h-8 w-28 text-right" type="number" step="0.01" value={c.prior_year_amount}
                        onChange={(e) => updateCost(i, { prior_year_amount: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input className="h-8 w-28 text-right" type="number" step="0.01" value={c.break_even_amount}
                        onChange={(e) => updateCost(i, { break_even_amount: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input className="h-8 w-28 text-right" type="number" step="0.01" value={c.forecast_amount}
                        onChange={(e) => updateCost(i, { forecast_amount: Number(e.target.value) })} /></TableCell>
                      <TableCell className="text-center">
                        <input type="checkbox" checked={c.is_ab_passthrough}
                          onChange={(e) => updateCost(i, { is_ab_passthrough: e.target.checked })} />
                      </TableCell>
                      <TableCell>
                        {c.id && (
                          <Button size="icon" variant="ghost" onClick={() => removeCost.mutate(c.id!)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={2}>CUSTO TOTAL</TableCell>
                    <TableCell className="text-right">{fmt(localCosts.reduce((a, c) => a + Number(c.prior_year_amount || 0), 0))}</TableCell>
                    <TableCell className="text-right">{fmt(beCosts.totalCost)}</TableCell>
                    <TableCell className="text-right">{fmt(fcCosts.totalCost)}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                Marque "A&B?" nas linhas <em>A&B Bebida</em> e <em>A&B Alimento</em> — esses valores são recalculados automaticamente
                pelo % de repasse aplicado à receita derivada (não somam diretamente).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- IVA ---------------- */}
        <TabsContent value="iva">
          <Card>
            <CardHeader><CardTitle>IVA Bilheteira por sessão (cenário Hoje)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sessão</TableHead>
                    <TableHead className="text-right">Bruto</TableHead>
                    <TableHead className="text-right">IVA</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead className="text-right">Repres.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ivaTable.map((r) => (
                    <TableRow key={r.label}>
                      <TableCell>{r.label}</TableCell>
                      <TableCell className="text-right">{fmt(r.gross)}</TableCell>
                      <TableCell className="text-right">{fmt(r.iva)}</TableCell>
                      <TableCell className="text-right">{fmt(r.net)}</TableCell>
                      <TableCell className="text-right">{fmtPct(r.share)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">{fmt(ivaTable.reduce((a, r) => a + r.gross, 0))}</TableCell>
                    <TableCell className="text-right">{fmt(ivaTable.reduce((a, r) => a + r.iva, 0))}</TableCell>
                    <TableCell className="text-right">{fmt(ivaTable.reduce((a, r) => a + r.net, 0))}</TableCell>
                    <TableCell className="text-right">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Resultados ---------------- */}
        <TabsContent value="result">
          <Card>
            <CardHeader><CardTitle>Resultados e Indicadores per capita</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Indicador</TableHead>
                    <TableHead className="text-right">Hoje</TableHead>
                    <TableHead className="text-right">Break Even</TableHead>
                    <TableHead className="text-right">Forecast</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <ResRow label="Resultado Geral" a={todayRes.general} b={beRes.general} c={fcRes.general} />
                  <ResRow label="Resultado Evento" a={todayRes.event} b={beRes.event} c={fcRes.event} />
                  <ResRow label="Resultado A&B" a={todayRes.ab} b={beRes.ab} c={fcRes.ab} />
                  <ResRow label="Resultado Souvenir" a={todayRes.souvenir} b={beRes.souvenir} c={fcRes.souvenir} />
                  <TableRow><TableCell colSpan={4} className="font-bold pt-6">Indicadores</TableCell></TableRow>
                  <KpiRow label="Público total (qty)" a={todayKpis.totalPublic} b={beKpis.totalPublic} c={fcKpis.totalPublic} isInt />
                  <KpiRow label="TM Ingresso" a={todayKpis.tmTickets} b={beKpis.tmTickets} c={fcKpis.tmTickets} />
                  <KpiRow label="TM A&B" a={todayKpis.tmAB} b={beKpis.tmAB} c={fcKpis.tmAB} />
                  <KpiRow label="Custo / pessoa" a={todayKpis.costPerPerson} b={beKpis.costPerPerson} c={fcKpis.costPerPerson} />
                  <KpiRow label="Resultado / pessoa" a={todayKpis.resultPerPerson} b={beKpis.resultPerPerson} c={fcKpis.resultPerPerson} />
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Config ---------------- */}
        <TabsContent value="config">
          <Card>
            <CardHeader><CardTitle>Configuração global</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {localCfg && (
                <>
                  <CfgInput label="TM Bebida (€)" value={localCfg.default_drink_avg_ticket}
                    onChange={(v) => setLocalCfg({ ...localCfg, default_drink_avg_ticket: v })} step={0.01} />
                  <CfgInput label="TM Alimento (€)" value={localCfg.default_food_avg_ticket}
                    onChange={(v) => setLocalCfg({ ...localCfg, default_food_avg_ticket: v })} step={0.01} />
                  <CfgInput label="Repasse Bebida (%)" value={localCfg.ab_drink_passthrough_pct}
                    onChange={(v) => setLocalCfg({ ...localCfg, ab_drink_passthrough_pct: v })} />
                  <CfgInput label="Repasse Alimento (%)" value={localCfg.ab_food_passthrough_pct}
                    onChange={(v) => setLocalCfg({ ...localCfg, ab_food_passthrough_pct: v })} />
                  <CfgInput label="IVA Bilheteira (%)" value={localCfg.ticket_iva_pct}
                    onChange={(v) => setLocalCfg({ ...localCfg, ticket_iva_pct: v })} />
                  <CfgInput label="Patrocínio (€)" value={localCfg.sponsorship_revenue}
                    onChange={(v) => setLocalCfg({ ...localCfg, sponsorship_revenue: v })} step={0.01} />
                  <CfgInput label="Souvenir Receita (€)" value={localCfg.souvenir_revenue}
                    onChange={(v) => setLocalCfg({ ...localCfg, souvenir_revenue: v })} step={0.01} />
                  <CfgInput label="Souvenir Custo (€)" value={localCfg.souvenir_cost}
                    onChange={(v) => setLocalCfg({ ...localCfg, souvenir_cost: v })} step={0.01} />
                  <CfgInput label="Bonif. Bebidas (€)" value={localCfg.bonif_bebidas}
                    onChange={(v) => setLocalCfg({ ...localCfg, bonif_bebidas: v })} step={0.01} />
                  <CfgInput label="Ponto Vendido (€)" value={localCfg.ponto_vendido}
                    onChange={(v) => setLocalCfg({ ...localCfg, ponto_vendido: v })} step={0.01} />
                  <div className="col-span-full mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                    <p className="col-span-full text-sm font-semibold text-muted-foreground">Ano anterior (2025)</p>
                    <CfgInput label="Ingressos 2025 (€)" value={localCfg.prior_year_tickets}
                      onChange={(v) => setLocalCfg({ ...localCfg, prior_year_tickets: v })} step={0.01} />
                    <CfgInput label="Bebida 2025 (€)" value={localCfg.prior_year_drink}
                      onChange={(v) => setLocalCfg({ ...localCfg, prior_year_drink: v })} step={0.01} />
                    <CfgInput label="Alimento 2025 (€)" value={localCfg.prior_year_food}
                      onChange={(v) => setLocalCfg({ ...localCfg, prior_year_food: v })} step={0.01} />
                    <CfgInput label="Patrocínio 2025 (€)" value={localCfg.prior_year_sponsor}
                      onChange={(v) => setLocalCfg({ ...localCfg, prior_year_sponsor: v })} step={0.01} />
                    <CfgInput label="Souvenir 2025 (€)" value={localCfg.prior_year_souvenir}
                      onChange={(v) => setLocalCfg({ ...localCfg, prior_year_souvenir: v })} step={0.01} />
                    <CfgInput label="Outros 2025 (€)" value={localCfg.prior_year_other}
                      onChange={(v) => setLocalCfg({ ...localCfg, prior_year_other: v })} step={0.01} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Subcomponentes ----------
function ScenarioCard({ title, tone, rev, cost, res, kpis, extra }: any) {
  const toneCls = tone === "warning" ? "border-amber-500/40" : tone === "success" ? "border-emerald-500/40" : "border-border";
  const resColor = res.general >= 0 ? "text-emerald-500" : "text-rose-500";
  return (
    <Card className={toneCls}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          {title} {extra}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Público</span><span>{fmtNum(kpis.totalPublic)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Receita</span><span>{fmt(rev.totalRevenue)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Custo</span><span>{fmt(cost.totalCost)}</span></div>
        <div className={`flex justify-between font-bold border-t pt-1 mt-1 ${resColor}`}>
          <span>Resultado</span><span>{fmt(res.general)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function RevRow({ label, prior, a, b, c }: { label: string; prior: number; a: number; b: number; c: number }) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="text-right text-muted-foreground">{fmt(prior)}</TableCell>
      <TableCell className="text-right">{fmt(a)}</TableCell>
      <TableCell className="text-right">{fmt(b)}</TableCell>
      <TableCell className="text-right">{fmt(c)}</TableCell>
    </TableRow>
  );
}

function ResRow({ label, a, b, c }: { label: string; a: number; b: number; c: number }) {
  const cls = (v: number) => v >= 0 ? "text-emerald-500" : "text-rose-500";
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className={`text-right ${cls(a)}`}>{fmt(a)}</TableCell>
      <TableCell className={`text-right ${cls(b)}`}>{fmt(b)}</TableCell>
      <TableCell className={`text-right ${cls(c)}`}>{fmt(c)}</TableCell>
    </TableRow>
  );
}

function KpiRow({ label, a, b, c, isInt }: { label: string; a: number; b: number; c: number; isInt?: boolean }) {
  const f = (v: number) => isInt ? fmtNum(v) : fmt(v);
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="text-right">{f(a)}</TableCell>
      <TableCell className="text-right">{f(b)}</TableCell>
      <TableCell className="text-right">{f(c)}</TableCell>
    </TableRow>
  );
}

function CfgInput({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
