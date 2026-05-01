/**
 * Simulador de Evento — formato Coala (BP_COALA_PT_2026 v12.6)
 *
 * 3 cenários paralelos: Hoje · Break Even · Forecast
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
import { ArrowLeft, Plus, Trash2, Loader2, Save, Calculator, RefreshCw, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import {
  type CoalaSession, type CoalaCostLine, type CoalaConfig,
  computeScenarioRevenue, computeScenarioCosts, computeScenarioResult,
  computeScenarioKpis, solveBreakEven, computeIvaTable,
} from "@/lib/event-simulator-coala";
import { syncSimulatorFromSources } from "@/lib/event-simulator-sync";
import { expandLotSalesToDailyAttendance, type LotSale } from "@/lib/event-simulator-combos";
import { loadSponsors, type SponsorRow } from "@/lib/event-simulator-sponsors";
import { exportSimulatorToXlsx, exportSimulatorToPdf, type SimulatorExportData } from "@/lib/event-simulator-export";
import { exportNodeToPdf } from "@/lib/event-simulator-view-pdf";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid } from "recharts";
import { LayoutDashboard } from "lucide-react";

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
  combo_lot_keywords: string;
  sponsor_category_l2_id: string | null;
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
  actual_amount: number;
  actual_paid: number;
  actual_committed_bp: number;
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
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const tabContentRef = React.useRef<HTMLDivElement>(null);

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

  // L2 categories — para o seletor de "categoria de patrocínios"
  const { data: l2Categories = [] } = useQuery<AccountCategory[]>({
    queryKey: ["account-categories-l2"],
    queryFn: async () => {
      const { data } = await supabase
        .from("account_categories")
        .select("id, code, name")
        .eq("is_active", true)
        .order("code");
      return ((data as any) ?? []).filter((c: any) => /^\d+\.\d+$/.test(c.code));
    },
  });

  // Patrocinadores detalhados (BP type=revenue na L2 configurada)
  const { data: sponsors = [] } = useQuery<SponsorRow[]>({
    queryKey: ["sim-coala-sponsors", eventId, cfg?.sponsor_category_l2_id],
    queryFn: () => loadSponsors(eventId!, cfg?.sponsor_category_l2_id ?? null),
    enabled: !!eventId,
  });

  // Lotes + vendas para construir o público diário (combos expandidos)
  const { data: lotSalesData } = useQuery({
    queryKey: ["sim-coala-lot-sales", eventId],
    queryFn: async () => {
      // 1) zonas do evento (com session_id → identifica dia do festival)
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id, name, session_id").eq("event_id", eventId!);
      const zoneIds = (zones ?? []).map((z: any) => z.id);
      if (!zoneIds.length) return { lotSales: [] as LotSale[], dates: [] as { date: string | null }[] };

      // 2) lotes dessas zonas
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, name, zone_id, applies_to_days")
        .in("zone_id", zoneIds);

      // 3) DIAS REAIS do festival = event_sessions (cada sessão = 1 dia)
      // event_dates pode ter só 1 entrada (último dia agregador); event_sessions é a fonte fiável.
      const { data: sessionRows } = await supabase
        .from("event_sessions")
        .select("id, date").eq("event_id", eventId!).order("date");
      const sessions = (sessionRows ?? []) as { id: string; date: string | null }[];
      const sessionIdToIdx = new Map<string, number>();
      sessions.forEach((s, i) => { if (s.id) sessionIdToIdx.set(s.id, i); });
      // Datas indexadas pelo dia do festival (0..N-1)
      const dates = sessions.map((s) => ({ date: s.date }));

      // 4) vendas
      const lotIds = (lots ?? []).map((l: any) => l.id);
      const { data: sales } = lotIds.length
        ? await supabase.from("ticket_sales")
            .select("lot_id, zone_id, sale_date, quantity").in("lot_id", lotIds)
        : { data: [] as any[] };

      const lotById = new Map((lots ?? []).map((l: any) => [l.id, l]));
      const zoneById = new Map((zones ?? []).map((z: any) => [z.id, z]));

      const lotSales: LotSale[] = ((sales ?? []) as any[]).map((s) => {
        const lot = lotById.get(s.lot_id);
        const zone = zoneById.get(s.zone_id);
        // Dia do festival vem da sessão da ZONA (não da data da venda).
        // Zonas sem session_id (ex: "Passe 2 dias") → null, expandidas a todos os dias.
        const zoneSessionId = (zone as any)?.session_id ?? null;
        const dayIdx = zoneSessionId ? (sessionIdToIdx.get(zoneSessionId) ?? null) : null;
        return {
          lot_id: s.lot_id,
          lot_name: lot?.name ?? "",
          applies_to_days: lot?.applies_to_days ?? 1,
          zone_id: s.zone_id,
          zone_name: zone?.name ?? "",
          sale_day_index: dayIdx,
          qty: Number(s.quantity || 0),
        };
      });
      return { lotSales, dates };
    },
    enabled: !!eventId,
  });

  // Estrutura detalhada de lotes/capacidades/ritmo p/ solver Break-Even
  // (key = `${day_index}-${zone_label}`, igual à CoalaSession)
  const { data: beLotInfo } = useQuery({
    queryKey: ["sim-coala-be-lots", eventId],
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id, name, session_id, total_capacity").eq("event_id", eventId!);
      const zoneIds = (zones ?? []).map((z: any) => z.id);
      if (!zoneIds.length) return {} as Record<string, import("@/lib/event-simulator-coala").SessionLotInfo>;

      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, zone_id, lot_number, price, quantity")
        .in("zone_id", zoneIds);

      const { data: sessionRows } = await supabase
        .from("event_sessions")
        .select("id, date").eq("event_id", eventId!).order("date");
      const sessionList = (sessionRows ?? []) as { id: string; date: string | null }[];
      const sessionIdToIdx = new Map<string, number>();
      sessionList.forEach((s, i) => { if (s.id) sessionIdToIdx.set(s.id, i); });

      const lotIds = (lots ?? []).map((l: any) => l.id);
      const { data: sales } = lotIds.length
        ? await supabase.from("ticket_sales")
            .select("lot_id, zone_id, sale_date, quantity").in("lot_id", lotIds)
        : { data: [] as any[] };

      // Vendas por lote (qty total) + 1ª data de venda por zona
      const soldByLot = new Map<string, number>();
      const firstSaleByZone = new Map<string, string>();
      for (const s of (sales ?? []) as any[]) {
        soldByLot.set(s.lot_id, (soldByLot.get(s.lot_id) ?? 0) + Number(s.quantity || 0));
        const cur = firstSaleByZone.get(s.zone_id);
        if (s.sale_date && (!cur || s.sale_date < cur)) firstSaleByZone.set(s.zone_id, s.sale_date);
      }

      const today = new Date().toISOString().slice(0, 10);
      const out: Record<string, import("@/lib/event-simulator-coala").SessionLotInfo> = {};

      // Para zonas COM session_id → uma sessão por zona
      // Para zonas SEM session_id (passes 2 dias) → uma sessão por cada dia da zona vai
      // mas o solver trabalha pela CHAVE da CoalaSession; então criamos 1 entrada para
      // a primeira ocorrência (a quantidade real já está distribuída em CoalaSession).
      for (const z of (zones ?? []) as any[]) {
        const zoneSessionId = z.session_id ?? null;
        const dayIdx = zoneSessionId ? (sessionIdToIdx.get(zoneSessionId) ?? 0) : 0;
        const zoneLots = (lots ?? []).filter((l: any) => l.zone_id === z.id);
        const lotsArr = zoneLots.map((l: any) => ({
          lot_number: Number(l.lot_number || 1),
          price: Number(l.price || 0),
          quantity: Number(l.quantity || 0),
          sold: Number(soldByLot.get(l.id) ?? 0),
        }));
        const firstSale = firstSaleByZone.get(z.id);
        let daysSelling = 1;
        if (firstSale) {
          const ms = (new Date(today).getTime() - new Date(firstSale).getTime());
          daysSelling = Math.max(1, Math.round(ms / 86400000));
        }
        const key = `${dayIdx}-${z.name}`;
        out[key] = {
          key,
          capacity: Number(z.total_capacity || 0),
          lots: lotsArr,
          days_selling: daysSelling,
        };
      }
      return out;
    },
    enabled: !!eventId,
  });

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
        description: `Sessões: +${r.sessionsCreated} / ~${r.sessionsUpdated} · Custos: +${r.costLinesCreated} / ~${r.costLinesUpdated} · Patrocínio total: ${fmt(r.sponsorsTotal)}.`,
      });
      qc.invalidateQueries({ queryKey: ["sim-coala-inputs", eventId] });
      qc.invalidateQueries({ queryKey: ["sim-coala-costs", eventId] });
      qc.invalidateQueries({ queryKey: ["sim-coala-cfg", eventId] });
      qc.invalidateQueries({ queryKey: ["sim-coala-sponsors", eventId] });
    },
    onError: (e: any) => toast({ title: "Erro a sincronizar", description: e.message, variant: "destructive" }),
  });
  const calcCfg: CoalaConfig = useMemo(() => {
    const sponsorRevenueFromBp = sponsors.reduce((sum, sponsor) => sum + Number(sponsor.planned_amount || 0), 0);
    return {
    ab_drink_avg_ticket: Number(localCfg?.default_drink_avg_ticket || 0),
    ab_food_avg_ticket: Number(localCfg?.default_food_avg_ticket || 0),
    ab_drink_passthrough_pct: Number(localCfg?.ab_drink_passthrough_pct || 0),
    ab_food_passthrough_pct: Number(localCfg?.ab_food_passthrough_pct || 0),
    sponsorship_revenue: sponsorRevenueFromBp > 0 ? sponsorRevenueFromBp : Number(localCfg?.sponsorship_revenue || 0),
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
  };
  }, [localCfg, sponsors]);

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
      actual_amount: Number(c.actual_amount || 0),
      break_even_amount: Number(c.break_even_amount || 0),
      forecast_amount: Number(c.forecast_amount || 0),
      is_ab_passthrough: !!c.is_ab_passthrough,
    })), [localCosts]);

  const beSolution = useMemo(
    () => solveBreakEven(calcSessions, calcCosts, calcCfg, beLotInfo),
    [calcSessions, calcCosts, calcCfg, beLotInfo],
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

  // ----- Exportações XLSX/PDF (layout idêntico ao Excel de referência) -----
  const buildExportData = (): SimulatorExportData => {
    const dayLabel = (idx: number) => {
      // tenta usar a data real associada à sessão via dailyAttendance
      const found = dailyAttendance.find(d => d.day_index === idx);
      if (found?.day_date) {
        const dt = new Date(found.day_date);
        return dt.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" });
      }
      return `Dia ${idx + 1}`;
    };
    const sessionsExp = localSessions.map(s => {
      const fcQty = Number(s.forecast_qty ?? s.real_sales_qty) || 0;
      const tm = s.avg_ticket_override != null && Number(s.avg_ticket_override) > 0
        ? Number(s.avg_ticket_override)
        : (s.real_sales_qty ? Number(s.real_sales_revenue) / Number(s.real_sales_qty) : 0);
      return {
        day_label: dayLabel(s.day_index),
        zone_label: s.zone_label,
        capacity: undefined as number | undefined,
        price: tm || undefined,
        real_qty: Number(s.real_sales_qty || 0),
        real_eur: Number(s.real_sales_revenue || 0),
        projected_qty: Number(s.projected_qty || 0),
        courtesy_qty: Number(s.courtesy_qty || 0),
        forecast_qty: fcQty,
        forecast_eur: fcQty * tm,
      };
    });
    const costsExp = localCosts.map(c => {
      const cat = l3Categories.find((x: any) => x.id === c.category_id);
      return {
        category_code: cat?.code ?? null,
        label: c.label,
        prior_year: Number(c.prior_year_amount || 0),
        actual: Number(c.actual_amount || 0),
        break_even: Number(c.break_even_amount || 0),
        forecast: Number(c.forecast_amount || 0),
      };
    });
    const ivaExp = ivaTable.map(r => {
      const [day, zone] = r.label.split(" · ");
      return {
        day_label: day ?? r.label, zone_label: zone ?? "",
        gross: r.gross, iva_pct: 6, iva: r.iva, net: r.net,
      };
    });
    return {
      eventName: event?.name ?? "Evento",
      subtitle: "3 cenários paralelos · Hoje (vendas reais) · Break Even · Forecast",
      today, breakeven, forecast,
      todayCosts, beCosts, fcCosts,
      todayRes, beRes, fcRes,
      todayKpis, beKpis, fcKpis,
      ivaTotalToday: ivaTable.reduce((a, r) => a + r.iva, 0),
      sessions: sessionsExp,
      costs: costsExp,
      iva: ivaExp,
    };
  };

  const handleExportXlsx = () => {
    try { exportSimulatorToXlsx(buildExportData()); toast({ title: "Excel exportado", description: "Layout idêntico ao Simulador_Coala_2026.xlsx (4 abas)." }); }
    catch (e: any) { toast({ title: "Erro a exportar Excel", description: e.message, variant: "destructive" }); }
  };
  const handleExportPdf = () => {
    try { exportSimulatorToPdf(buildExportData()); toast({ title: "PDF exportado", description: "4 páginas: Resumo · Sessões · Custos · IVA." }); }
    catch (e: any) { toast({ title: "Erro a exportar PDF", description: e.message, variant: "destructive" }); }
  };
  const handleExportViewPdf = async () => {
    if (!tabContentRef.current) return;
    const tabLabel: Record<string, string> = {
      dashboard: "Dashboard", sessions: "Sessões (Dia × Zona)", daily: "Público diário",
      revenue: "Faturamento", sponsors: "Patrocínios", costs: "Custos", iva: "IVA",
      result: "Resultados", config: "Configuração",
    };
    try {
      await exportNodeToPdf(
        tabContentRef.current,
        `Simulador_${event?.name ?? "evento"}_${tabLabel[activeTab] ?? activeTab}.pdf`,
        { orientation: "l", title: `Simulador — ${event?.name ?? ""} · ${tabLabel[activeTab] ?? activeTab}` },
      );
      toast({ title: "PDF da vista exportado", description: tabLabel[activeTab] ?? activeTab });
    } catch (e: any) {
      toast({ title: "Erro a exportar PDF", description: e.message, variant: "destructive" });
    }
  };


  // Presença diária expandindo combos
  const dailyAttendance = useMemo(() => {
    if (!lotSalesData) return [];
    const totalDays = Math.max(1, lotSalesData.dates.length || (Math.max(0, ...localSessions.map(s => s.day_index)) + 1));
    const zoneSet = new Map<string, { name: string }>();
    localSessions.forEach(s => zoneSet.set(s.zone_label, { name: s.zone_label }));
    lotSalesData.lotSales.forEach(s => zoneSet.set(s.zone_name, { name: s.zone_name }));
    const courtesyMap = new Map<string, number>();
    localSessions.forEach(s => courtesyMap.set(`${s.day_index}|${s.zone_label}`, Number(s.courtesy_qty || 0)));
    return expandLotSalesToDailyAttendance(
      lotSalesData.lotSales,
      Array.from(zoneSet.values()),
      totalDays,
      localCfg?.combo_lot_keywords || "COMBO,PASSE,2 DIAS,3 DIAS,FULL PASS",
      lotSalesData.dates,
      courtesyMap,
    );
  }, [lotSalesData, localSessions, localCfg?.combo_lot_keywords]);

  const dailyTotals = useMemo(() => {
    const byDay = new Map<number, { paying: number; courtesy: number; total: number; date: string | null }>();
    for (const r of dailyAttendance) {
      const cur = byDay.get(r.day_index) ?? { paying: 0, courtesy: 0, total: 0, date: r.day_date };
      cur.paying += r.paying; cur.courtesy += r.courtesy; cur.total += r.total;
      byDay.set(r.day_index, cur);
    }
    return Array.from(byDay.entries()).sort((a, b) => a[0] - b[0]);
  }, [dailyAttendance]);

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
      actual_amount: 0,
      actual_paid: 0,
      actual_committed_bp: 0,
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
              <strong>2025</strong>: introduzido manualmente (referência) · <strong>Hoje (Edição 2026)</strong>: alimentado pela plataforma (vendas + BP + transações) · <strong>Break Even</strong> e <strong>Forecast</strong>: cenários simulados.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => syncFromSources.mutate()} disabled={syncFromSources.isPending}>
            {syncFromSources.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sincronizar BP + Bilheteira
          </Button>
          <Button variant="outline" onClick={handleExportXlsx}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={handleExportPdf}>
            <FileText className="mr-2 h-4 w-4" /> PDF (4 págs)
          </Button>
          <Button variant="outline" onClick={handleExportViewPdf}>
            <FileText className="mr-2 h-4 w-4" /> PDF desta vista
          </Button>
          <Button onClick={() => saveAll.mutate()} disabled={saveAll.isPending}>
            {saveAll.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar
          </Button>
        </div>
      </div>

      {/* KPIs scenario summary */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ScenarioCard title="Hoje (Edição 2026)" tone="muted" rev={today} cost={todayCosts} res={todayRes} kpis={todayKpis} dailyTotals={dailyTotals} />
        <ScenarioCard
          title="Break Even"
          tone="warning"
          rev={breakeven}
          cost={beCosts}
          res={beRes}
          kpis={beKpis}
          extra={beSolution.reachable ? null : <Badge variant="destructive">Inalcançável com margem atual</Badge>}
        />
        <ScenarioCard title="Forecast" tone="success" rev={forecast} cost={fcCosts} res={fcRes} kpis={fcKpis} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="dashboard"><LayoutDashboard className="mr-1 h-4 w-4" />Dashboard</TabsTrigger>
          <TabsTrigger value="sessions">Sessões (Dia × Zona)</TabsTrigger>
          <TabsTrigger value="daily">Público diário</TabsTrigger>
          <TabsTrigger value="revenue">Faturamento</TabsTrigger>
          <TabsTrigger value="sponsors">Patrocínios</TabsTrigger>
          <TabsTrigger value="costs">Custos</TabsTrigger>
          <TabsTrigger value="iva">IVA</TabsTrigger>
          <TabsTrigger value="result">Resultados</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
        </TabsList>

        <div ref={tabContentRef} className="bg-background">

        {/* ---------------- Dashboard (widgets fixos) ---------------- */}
        <TabsContent value="dashboard">
          <SimulatorDashboard
            eventName={event?.name ?? ""}
            today={today} todayCosts={todayCosts} todayRes={todayRes} todayKpis={todayKpis}
            breakeven={breakeven} beCosts={beCosts} beRes={beRes} beKpis={beKpis}
            forecast={forecast} fcCosts={fcCosts} fcRes={fcRes} fcKpis={fcKpis}
            costLines={localCosts}
            dailyTotals={dailyTotals}
            ivaTable={ivaTable}
          />
        </TabsContent>

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
                    <TableHead className="text-right" title="Manual — referência ano anterior">2025 qty (manual)</TableHead>
                    <TableHead className="text-right" title="Manual — referência ano anterior">2025 € (manual)</TableHead>
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

        {/* ---------------- Público diário (combos expandidos) ---------------- */}
        <TabsContent value="daily">
          <Card>
            <CardHeader>
              <CardTitle>Público diário por zona</CardTitle>
              <p className="text-xs text-muted-foreground">
                Combos multi-dia contam 1 pessoa em cada dia (ex: 1 PASSE 2 DIAS = 1 pessoa no dia 1 + 1 pessoa no dia 2).
                Override por lote em <code>event_ticket_lots.applies_to_days</code>; heurística por nome configurável em "Configuração → Combos".
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {(() => {
                const fmtDate = (d: string | null) => {
                  if (!d) return "—";
                  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
                  if (!m) return d;
                  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
                  const s = dt.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
                  return s.charAt(0).toUpperCase() + s.slice(1);
                };
                const totalsMap = new Map(dailyTotals.map(([d, t]) => [d, t]));
                // Agrupar linhas por dia, com sub-total imediatamente a seguir
                const grouped: Array<{ type: "row" | "total"; row?: typeof dailyAttendance[number]; day?: number; total?: { paying: number; courtesy: number; total: number; date: string | null } }> = [];
                const seen = new Set<number>();
                for (const r of dailyAttendance) {
                  // se passou para um novo dia, fecha o anterior
                  if (grouped.length && grouped[grouped.length - 1].type === "row") {
                    const prev = grouped[grouped.length - 1].row!;
                    if (prev.day_index !== r.day_index) {
                      const t = totalsMap.get(prev.day_index);
                      if (t) grouped.push({ type: "total", day: prev.day_index, total: t });
                      seen.add(prev.day_index);
                    }
                  }
                  grouped.push({ type: "row", row: r });
                }
                // fecha último dia
                if (grouped.length) {
                  const last = [...grouped].reverse().find(g => g.type === "row");
                  if (last && !seen.has(last.row!.day_index)) {
                    const t = totalsMap.get(last.row!.day_index);
                    if (t) grouped.push({ type: "total", day: last.row!.day_index, total: t });
                  }
                }
                const grandTotal = dailyTotals.reduce(
                  (a, [, t]) => ({ paying: a.paying + t.paying, courtesy: a.courtesy + t.courtesy, total: a.total + t.total }),
                  { paying: 0, courtesy: 0, total: 0 },
                );
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dia</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Zona</TableHead>
                        <TableHead className="text-right">Pagantes</TableHead>
                        <TableHead className="text-right">Cortesias</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grouped.map((g, i) => g.type === "row" ? (
                        <TableRow key={`r-${g.row!.day_index}-${g.row!.zone_label}`}>
                          <TableCell>{g.row!.day_index + 1}</TableCell>
                          <TableCell>{fmtDate(g.row!.day_date)}</TableCell>
                          <TableCell>{g.row!.zone_label}</TableCell>
                          <TableCell className="text-right">{fmtNum(g.row!.paying)}</TableCell>
                          <TableCell className="text-right">{fmtNum(g.row!.courtesy)}</TableCell>
                          <TableCell className="text-right font-semibold">{fmtNum(g.row!.total)}</TableCell>
                        </TableRow>
                      ) : (
                        <TableRow key={`t-${g.day}`} className="bg-muted/40 font-semibold border-b-2">
                          <TableCell>{g.day! + 1}</TableCell>
                          <TableCell>{fmtDate(g.total!.date)}</TableCell>
                          <TableCell>Subtotal Dia {g.day! + 1}</TableCell>
                          <TableCell className="text-right">{fmtNum(g.total!.paying)}</TableCell>
                          <TableCell className="text-right">{fmtNum(g.total!.courtesy)}</TableCell>
                          <TableCell className="text-right">{fmtNum(g.total!.total)}</TableCell>
                        </TableRow>
                      ))}
                      {dailyTotals.length > 1 && (
                        <TableRow className="bg-primary/10 font-bold border-t-2">
                          <TableCell colSpan={3}>PRESENÇAS TOTAIS ({dailyTotals.length} dias · soma)</TableCell>
                          <TableCell className="text-right">{fmtNum(grandTotal.paying)}</TableCell>
                          <TableCell className="text-right">{fmtNum(grandTotal.courtesy)}</TableCell>
                          <TableCell className="text-right">{fmtNum(grandTotal.total)}</TableCell>
                        </TableRow>
                      )}
                      {!dailyAttendance.length && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sem vendas registadas. Sincroniza primeiro.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Patrocinadores ---------------- */}
        <TabsContent value="sponsors">
          <Card>
            <CardHeader>
              <CardTitle>Patrocinadores — detalhe por linha do BP</CardTitle>
              <p className="text-xs text-muted-foreground">
                Lê linhas de receita aprovadas no Business Plan (categorias L3 abaixo de <strong>1.2</strong> ou da L2 escolhida na Configuração).
                Realizado vem da transação vinculada ao forecast.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patrocinador</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Previsto (BP)</TableHead>
                    <TableHead className="text-right">Realizado</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sponsors.map((s) => (
                    <TableRow key={s.forecast_id}>
                      <TableCell className="font-medium">{s.sponsor_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.category_code} — {s.category_name}</TableCell>
                      <TableCell className="text-right">{fmt(s.planned_amount)}</TableCell>
                      <TableCell className="text-right">{fmt(s.actual_amount)}</TableCell>
                      <TableCell className="text-center">
                        {s.status_hint === "fully_received" && <Badge className="bg-emerald-600">Recebido</Badge>}
                        {s.status_hint === "partial" && <Badge variant="secondary">Parcial</Badge>}
                        {s.status_hint === "pending" && <Badge variant="outline">Pendente</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={2}>TOTAL</TableCell>
                    <TableCell className="text-right">{fmt(sponsors.reduce((a, s) => a + s.planned_amount, 0))}</TableCell>
                    <TableCell className="text-right">{fmt(sponsors.reduce((a, s) => a + s.actual_amount, 0))}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  {!sponsors.length && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhum patrocínio aprovado no BP. Verifica a categoria L2 na Configuração.</TableCell></TableRow>
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
                    <TableHead className="text-right" title="Manual — referência ano anterior">2025 (manual)</TableHead>
                    <TableHead className="text-right">Hoje (Edição 2026)</TableHead>
                    <TableHead className="text-right">Break Even</TableHead>
                    <TableHead className="text-right">Forecast</TableHead>
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
                    <TableHead className="text-right" title="Manual — introduzido para referência">2025 (manual)</TableHead>
                    <TableHead className="text-right">Hoje (Edição 2026) = TX+BP</TableHead>
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
                      <TableCell className="text-right text-muted-foreground" title={`Pago: ${fmt(c.actual_paid)} · BP s/TX: ${fmt(c.actual_committed_bp)}`}>
                        {fmt(Number(c.actual_amount || 0))}
                      </TableCell>
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
                    <TableCell className="text-right">{fmt(localCosts.reduce((a, c) => a + Number(c.actual_amount || 0), 0))}</TableCell>
                    <TableCell className="text-right">{fmt(beCosts.totalCost)}</TableCell>
                    <TableCell className="text-right">{fmt(fcCosts.totalCost)}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                <strong>2025 (manual)</strong>: introduzido manualmente para referência (não é puxado da DB).
                <strong> Hoje (Edição 2026)</strong>: soma <em>Transações (qualquer status)</em> + <em>BP aprovado sem TX vinculada</em>.
                Marque "A&B?" nas linhas <em>A&B Bebida/Alimento</em> — recalculadas pelo % de repasse.
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
                    <div className="col-span-full">
                      <p className="text-sm font-semibold">Ano anterior (2025) — manual</p>
                      <p className="text-xs text-muted-foreground">Estes valores são introduzidos manualmente e servem só de referência. <strong>Não</strong> são alimentados pela plataforma — a Edição 2026 vem de Vendas + BP + Transações.</p>
                    </div>
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
        </div>
      </Tabs>
    </div>
  );
}

// ---------- Subcomponentes ----------
function ScenarioCard({ title, tone, rev, cost, res, kpis, extra, dailyTotals }: any) {
  const toneCls = tone === "warning" ? "border-amber-500/40" : tone === "success" ? "border-emerald-500/40" : "border-border";
  const resColor = res.general >= 0 ? "text-emerald-500" : "text-rose-500";
  const fmtDayShort = (d: string | null, idx: number) => {
    if (!d) return `Dia ${idx + 1}`;
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return d;
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const s = dt.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" });
    return s.charAt(0).toUpperCase() + s.slice(1).replace(".", "");
  };
  const days: Array<[number, { paying: number; courtesy: number; total: number; date: string | null }]> = dailyTotals ?? [];
  const showDailyBreakdown = days.length > 1;
  return (
    <Card className={toneCls}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          {title} {extra}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {showDailyBreakdown ? (
          <>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Público presente</div>
            {days.map(([d, t]) => (
              <div key={d} className="flex justify-between">
                <span className="text-muted-foreground">{fmtDayShort(t.date, d)}</span>
                <span className="tabular-nums">{fmtNum(t.total)}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs text-muted-foreground border-t pt-1">
              <span>Produtos vendidos</span><span className="tabular-nums">{fmtNum(kpis.totalPublic)}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between"><span className="text-muted-foreground">Público</span><span>{fmtNum(kpis.totalPublic)}</span></div>
        )}
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
  const isPercent = /\(%\)/.test(label);
  const isCurrency = /\(€\)/.test(label);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string>("");

  const formatDisplay = (n: number) => {
    if (!Number.isFinite(n)) return "";
    if (isCurrency) {
      return new Intl.NumberFormat("pt-PT", {
        style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(n);
    }
    if (isPercent) {
      return new Intl.NumberFormat("pt-PT", {
        minimumFractionDigits: 0, maximumFractionDigits: 2,
      }).format(n) + " %";
    }
    return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(n);
  };

  // Edição: aceita vírgula ou ponto, mantém o que o utilizador escreve
  const parseDraft = (s: string): number => {
    const cleaned = s.replace(/[^\d,.\-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  const display = focused ? draft : formatDisplay(Number(value) || 0);

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="text"
        inputMode="decimal"
        value={display}
        onFocus={() => {
          setFocused(true);
          setDraft(value ? String(value).replace(".", ",") : "");
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false);
          onChange(parseDraft(draft));
        }}
      />
    </div>
  );
}

// ---------- Dashboard (widgets fixos) ----------
function SimulatorDashboard({
  eventName, today, todayCosts, todayRes, todayKpis,
  breakeven, beCosts, beRes, beKpis,
  forecast, fcCosts, fcRes, fcKpis,
  costLines, dailyTotals, ivaTable,
}: any) {
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return d;
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const s = dt.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  // Top 10 custos (Hoje) — usa actual_amount
  const topCosts = [...(costLines ?? [])]
    .filter((c: any) => !c.is_ab_passthrough)
    .map((c: any) => ({ name: c.label || "—", value: Number(c.actual_amount || 0) }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const dailyChart = (dailyTotals ?? []).map(([d, t]: any) => ({
    name: fmtDate(t.date) || `Dia ${d + 1}`,
    Pagantes: t.paying,
    Cortesias: t.courtesy,
  }));

  const scenarioChart = [
    { name: "Hoje", Receita: today.totalRevenue, Custo: todayCosts.totalCost, Resultado: todayRes.general },
    { name: "Break Even", Receita: breakeven.totalRevenue, Custo: beCosts.totalCost, Resultado: beRes.general },
    { name: "Forecast", Receita: forecast.totalRevenue, Custo: fcCosts.totalCost, Resultado: fcRes.general },
  ];

  const revenueMix = [
    { name: "Bilheteira", value: today.ticketsRevenue },
    { name: "Bebida", value: today.drinkRevenue },
    { name: "Alimento", value: today.foodRevenue },
    { name: "Patrocínios", value: today.sponsorRevenue },
    { name: "Souvenir", value: today.souvenirRevenue },
    { name: "Outros", value: today.otherCredits },
  ].filter((r) => r.value > 0);

  const PIE_COLORS = ["#3b82f6", "#84cc16", "#f59e0b", "#a855f7", "#06b6d4", "#ef4444"];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(dailyTotals?.length ?? 0) > 1 ? (
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Público presente / dia (Hoje)</div>
              <div className="mt-1 space-y-0.5">
                {dailyTotals.map(([d, t]: any) => (
                  <div key={d} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{fmtDate(t.date) || `Dia ${d + 1}`}</span>
                    <span className="font-semibold tabular-nums">{fmtNum(t.total)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground border-t pt-1">
                Produtos vendidos: {fmtNum(todayKpis.totalPublic)}
              </div>
            </CardContent>
          </Card>
        ) : (
          <KpiTile label="Público (Hoje)" value={fmtNum(todayKpis.totalPublic)} />
        )}
        <KpiTile label="Receita (Hoje)" value={fmt(today.totalRevenue)} />
        <KpiTile label="Custo (Hoje)" value={fmt(todayCosts.totalCost)} />
        <KpiTile label="Resultado (Hoje)" value={fmt(todayRes.general)} tone={todayRes.general >= 0 ? "ok" : "bad"} />
        <KpiTile label="TM Ingresso" value={fmt(todayKpis.tmTickets)} />
        <KpiTile label="TM A&B / pessoa" value={fmt(todayKpis.tmAB)} />
        <KpiTile label="Custo / pessoa" value={fmt(todayKpis.costPerPerson)} />
        <KpiTile label="Resultado / pessoa" value={fmt(todayKpis.resultPerPerson)} tone={todayKpis.resultPerPerson >= 0 ? "ok" : "bad"} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Cenários: Receita · Custo · Resultado</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={scenarioChart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Receita" fill="#3b82f6" />
                <Bar dataKey="Custo" fill="#ef4444" />
                <Bar dataKey="Resultado" fill="#84cc16" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Mix de Receita (Hoje)</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={revenueMix} dataKey="value" nameKey="name" outerRadius={90} label={(e: any) => `${e.name}: ${fmt(e.value)}`}>
                  {revenueMix.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Público diário</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            {dailyChart.length ? (
              <ResponsiveContainer>
                <BarChart data={dailyChart}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Pagantes" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="Cortesias" stackId="a" fill="#a855f7" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top 10 Custos (Hoje)</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            {topCosts.length ? (
              <ResponsiveContainer>
                <BarChart data={topCosts} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={140} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} />
                  <Bar dataKey="value" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sem custos registados</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">IVA Bilheteira por sessão (Hoje)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sessão</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(ivaTable ?? []).map((r: any) => (
                <TableRow key={r.label}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="text-right">{fmt(r.gross)}</TableCell>
                  <TableCell className="text-right">{fmt(r.iva)}</TableCell>
                  <TableCell className="text-right">{fmt(r.net)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold border-t-2">
                <TableCell>TOTAL</TableCell>
                <TableCell className="text-right">{fmt((ivaTable ?? []).reduce((a: number, r: any) => a + r.gross, 0))}</TableCell>
                <TableCell className="text-right">{fmt((ivaTable ?? []).reduce((a: number, r: any) => a + r.iva, 0))}</TableCell>
                <TableCell className="text-right">{fmt((ivaTable ?? []).reduce((a: number, r: any) => a + r.net, 0))}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const cls = tone === "ok" ? "text-emerald-500" : tone === "bad" ? "text-rose-500" : "";
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-bold mt-1 ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
