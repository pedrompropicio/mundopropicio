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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Loader2, Save, Calculator, RefreshCw, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import {
  type CoalaSession, type CoalaCostLine, type CoalaConfig, type BreakEvenSolution, type ForecastSolution,
  computeScenarioRevenue, computeScenarioCosts, computeScenarioResult,
  computeScenarioKpis, solveBreakEven, solveForecast, computeIvaTable,
} from "@/lib/event-simulator-coala";
import { syncSimulatorFromSources } from "@/lib/event-simulator-sync";
import { expandLotSalesToDailyAttendance, type LotSale } from "@/lib/event-simulator-combos";
import { ticketSaleRevenue } from "@/lib/ticket-sales-revenue";
import { keepLatestFeverImportRows } from "@/lib/ticket-sales-batch-filter";
// combo bridge removido: combos são lotes unificados em event_ticket_lots
import { loadSponsors, type SponsorRow } from "@/lib/event-simulator-sponsors";
import { exportSimulatorToXlsx, exportSimulatorToPdf, type SimulatorExportData } from "@/lib/event-simulator-export";
import { exportNodeToPdf } from "@/lib/event-simulator-view-pdf";
import { ForecastBoostCalibrator } from "@/components/simulator/ForecastBoostCalibrator";
import ExecutiveDashboard from "@/components/simulator/ExecutiveDashboard";
import TourSimulator from "@/components/simulator/TourSimulator";
import { useEventABScenarios, type ABScenarioParticipants } from "@/hooks/useEventABScenarios";
import { scaleABFromReal, scaleABCostFromReal } from "@/lib/event-simulator-ab-scale";
import { useCompany } from "@/hooks/useCompany";
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
  forecast_final_accel: number;
  forecast_final_window_days: number;
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
  const { companyId } = useCompany();
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

  // Sub-eventos (cidades) caso este evento seja um Master de turnê
  const { data: subEvents = [] } = useQuery({
    queryKey: ["sim-sub-events", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, name, date")
        .eq("parent_event_id", eventId!)
        .order("date");
      return data ?? [];
    },
    enabled: !!eventId,
  });

  const isTourMaster = !event?.parent_event_id && subEvents.length > 0;
  const [tourMode, setTourMode] = useState<boolean>(true);

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
    queryKey: ["account-categories-l3", companyId],
    enabled: !!eventId && !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("account_categories")
        .select("id, code, name, company_id")
        .eq("is_active", true)
        .eq("company_id", companyId!)
        .order("code");
      // L3 = code com 3 níveis (x.y.z)
      return ((data as any) ?? []).filter((c: any) => /^\d+\.\d+\.\d+$/.test(c.code));
    },
  });

  // L2 categories — para o seletor de "categoria de patrocínios"
  const { data: l2Categories = [] } = useQuery<AccountCategory[]>({
    queryKey: ["account-categories-l2", companyId],
    enabled: !!eventId && !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("account_categories")
        .select("id, code, name, company_id")
        .eq("is_active", true)
        .eq("company_id", companyId!)
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
        .select("id, name, session_id, total_capacity").eq("event_id", eventId!).is("version_id", null);
      const zoneIds = (zones ?? []).map((z: any) => z.id);
      if (!zoneIds.length) return { lotSales: [] as LotSale[], dates: [] as { date: string | null }[], zoneRows: [] as any[], salesByZone: {} as Record<string, { qty: number; revenue: number }> };

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
            .select("lot_id, zone_id, sale_date, quantity, unit_price, total_value, financial_account_id, source, import_batch_id, created_at")
            .in("lot_id", lotIds)
        : { data: [] as any[] };

      const lotById = new Map((lots ?? []).map((l: any) => [l.id, l]));
      const zoneById = new Map((zones ?? []).map((z: any) => [z.id, z]));
      const salesRows = keepLatestFeverImportRows(((sales ?? []) as any[]));

      const salesByZone: Record<string, { qty: number; revenue: number }> = {};
      for (const s of salesRows) {
        const cur = salesByZone[s.zone_id] ?? { qty: 0, revenue: 0 };
        cur.qty += Number(s.quantity || 0);
        cur.revenue += ticketSaleRevenue(s);
        salesByZone[s.zone_id] = cur;
      }

      const zoneRows = ((zones ?? []) as any[]).map((z) => ({
        id: z.id,
        name: z.name,
        session_id: z.session_id ?? null,
        total_capacity: Number(z.total_capacity || 0),
        day_index: z.session_id ? (sessionIdToIdx.get(z.session_id) ?? 0) : 0,
      }));

      const lotSales: LotSale[] = salesRows.map((s) => {
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

      // Combos agora são lotes normais com is_combo=true em event_ticket_lots —
      // já entram em `lotSales` acima. UI dedicada do simulador para mostrar
      // expansão por dia será reintroduzida na próxima iteração.
      return { lotSales, dates, zoneRows, salesByZone };
    },
    enabled: !!eventId,
  });

  // Cortesias geridas em event_courtesies (EventCourtesiesEditor) — devem
  // aparecer na coluna "Cortesias" da tabela "Público diário por zona".
  // Mapeamos por (day_index baseado na data, zone_name) para casar com a chave
  // usada por expandLotSalesToDailyAttendance.
  const { data: eventCourtesies = [] } = useQuery({
    queryKey: ["sim-event-courtesies", eventId],
    queryFn: async () => {
      if (!eventId) return [] as Array<{ date: string | null; zone_name: string; quantity: number }>;
      const [{ data: cs }, { data: ds }, { data: zs }] = await Promise.all([
        supabase.from("event_courtesies").select("event_date_id, zone_id, quantity").eq("event_id", eventId),
        supabase.from("event_dates").select("id, date").eq("event_id", eventId),
        supabase.from("event_ticket_zones").select("id, name").eq("event_id", eventId).is("version_id", null),
      ]);
      const dateById = new Map((ds ?? []).map((d: any) => [d.id, d.date as string]));
      const nameById = new Map((zs ?? []).map((z: any) => [z.id, z.name as string]));
      return (cs ?? []).map((c: any) => ({
        date: dateById.get(c.event_date_id) ?? null,
        zone_name: nameById.get(c.zone_id) ?? "",
        quantity: Number(c.quantity || 0),
      })).filter((c) => c.zone_name);
    },
    enabled: !!eventId,
  });

  // Estrutura detalhada de lotes/capacidades/ritmo p/ solver Break-Even.
  // Indexamos APENAS por `zone_label` (nome da zona). O solver compõe a chave
  // por sessão (day_index + zone_label) mas reconcilia pelo nome — assim
  // funciona mesmo quando o simulador colapsa todas as vendas em day_index=0
  // (importações em batch) ou quando há mismatch entre a ordem das sessões
  // do BP e a ordem usada pela matriz Dia × Zona.
  const { data: beLotInfo } = useQuery({
    queryKey: ["sim-coala-be-lots-v2", eventId],
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id, name, total_capacity").eq("event_id", eventId!);
      const zoneIds = (zones ?? []).map((z: any) => z.id);
      if (!zoneIds.length) return {} as Record<string, import("@/lib/event-simulator-coala").SessionLotInfo>;

      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, zone_id, lot_number, price, quantity")
        .in("zone_id", zoneIds);

      const lotIds = (lots ?? []).map((l: any) => l.id);
      const { data: sales } = lotIds.length
        ? await supabase.from("ticket_sales")
            .select("lot_id, zone_id, sale_date, quantity, financial_account_id, source, import_batch_id, created_at").in("lot_id", lotIds)
        : { data: [] as any[] };

      // Vendas por lote (qty total) + 1ª data de venda por zona
      const soldByLot = new Map<string, number>();
      const firstSaleByZone = new Map<string, string>();
      for (const s of keepLatestFeverImportRows(((sales ?? []) as any[]))) {
        soldByLot.set(s.lot_id, (soldByLot.get(s.lot_id) ?? 0) + Number(s.quantity || 0));
        const cur = firstSaleByZone.get(s.zone_id);
        if (s.sale_date && (!cur || s.sale_date < cur)) firstSaleByZone.set(s.zone_id, s.sale_date);
      }

      const today = new Date().toISOString().slice(0, 10);
      // chave por NOME da zona; o solver tenta `${day}-${zone}` E também só `${zone}`.
      const out: Record<string, import("@/lib/event-simulator-coala").SessionLotInfo> = {};
      for (const z of (zones ?? []) as any[]) {
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
        const key = String(z.name);
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
  const overheadsKey = `sim-include-overheads:${eventId ?? ""}`;
  const [includeOverheads, setIncludeOverheads] = useState<boolean>(() => {
    if (typeof window === "undefined" || !eventId) return true;
    const v = window.localStorage.getItem(overheadsKey);
    return v === null ? true : v === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined" && eventId) {
      window.localStorage.setItem(overheadsKey, includeOverheads ? "1" : "0");
    }
  }, [includeOverheads, eventId, overheadsKey]);

  // Códigos das categorias indexados por id (para filtro de Grupo 10)
  const codeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of l3Categories) m.set(c.id, c.code);
    return m;
  }, [l3Categories]);
  const isOverhead = (catId: string | null) => {
    if (!catId) return false;
    const code = codeById.get(catId) ?? "";
    return code.startsWith("10.");
  };
  const visibleCosts = useMemo(
    () => localCosts.filter((c) => includeOverheads || !isOverhead(c.category_id)),
    [localCosts, includeOverheads, codeById],
  );

  useEffect(() => { if (cfg) setLocalCfg(cfg); }, [cfg]);
  useEffect(() => { setLocalSessions(sessions); }, [sessions]);
  useEffect(() => { setLocalCosts(costLines); }, [costLines]);

  const simulatorSessions = useMemo<DbInput[]>(() => {
    if (!lotSalesData?.zoneRows?.length) return localSessions;

    const rowsByKey = new Map<string, DbInput>();
    for (const s of localSessions) rowsByKey.set(`${s.day_index}|${s.zone_label}`, s);

    return lotSalesData.zoneRows.map((z: any) => {
      const dayIndex = Number(z.day_index || 0);
      const existing = rowsByKey.get(`${dayIndex}|${z.name}`) ?? rowsByKey.get(`0|${z.name}`);
      const sales = lotSalesData.salesByZone?.[z.id] ?? { qty: 0, revenue: 0 };
      const capacity = Number(z.total_capacity || 0);
      return {
        ...(existing ?? { event_id: eventId!, prior_year_qty: null, prior_year_revenue: null, avg_ticket_override: null, iva_pct: 6 }),
        event_id: eventId!,
        day_index: dayIndex,
        zone_label: z.name,
        real_sales_qty: sales.qty,
        real_sales_revenue: sales.revenue,
        projected_qty: existing ? Number(existing.projected_qty || 0) : Math.max(0, capacity - sales.qty),
        courtesy_qty: existing ? Number(existing.courtesy_qty || 0) : 0,
        forecast_qty: existing?.forecast_qty ?? null,
      } as DbInput;
    }).sort((a, b) => a.day_index - b.day_index || a.zone_label.localeCompare(b.zone_label));
  }, [eventId, localSessions, lotSalesData]);

  // ------- Default config seed (se não existir) -------
  useEffect(() => {
    if (!loadingCfg && !cfg && eventId && companyId) {
      // cria default
      supabase.from("event_simulator_config").insert({
        event_id: eventId,
        company_id: companyId,
        default_drink_avg_ticket: 10.51,
        default_food_avg_ticket: 5.40,
        ab_drink_passthrough_pct: 65,
        ab_food_passthrough_pct: 75,
        ticket_iva_pct: 6,
      } as any).then(() => qc.invalidateQueries({ queryKey: ["sim-coala-cfg", eventId] }));
    }
  }, [loadingCfg, cfg, eventId, companyId, qc]);

  // ------- Mutations -------
  const saveAll = useMutation({
    mutationFn: async () => {
      if (!localCfg || !eventId) return;
      if (!companyId) throw new Error("Empresa ativa não resolvida — recarrega a página.");
      const cfgPayload: any = { ...localCfg, event_id: eventId, company_id: companyId };
      await supabase.from("event_simulator_config").upsert(cfgPayload).throwOnError();

      // sessions: upsert one by one
      for (const s of localSessions) {
        const payload: any = { ...s, event_id: eventId, company_id: companyId };
        if (!s.id) delete payload.id;
        await supabase.from("event_simulator_inputs").upsert(payload).throwOnError();
      }
      // costs
      for (const c of localCosts) {
        const payload: any = { ...c, event_id: eventId, company_id: companyId };
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
      if (isTourMaster) {
        throw new Error("Sincronização ainda não suportada em eventos com Splits (turnê). Use o simulador apenas em eventos simples ou festivais.");
      }
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
    other_revenue: Number((localCfg as any)?.other_revenue || 0),
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
    simulatorSessions.map((s) => ({
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
    })), [simulatorSessions]);

  const calcCosts: CoalaCostLine[] = useMemo(() =>
    visibleCosts.map((c) => ({
      label: c.label,
      prior_year_amount: Number(c.prior_year_amount || 0),
      actual_amount: Number(c.actual_amount || 0),
      break_even_amount: Number(c.break_even_amount || 0),
      forecast_amount: Number(c.forecast_amount || 0),
      is_ab_passthrough: !!c.is_ab_passthrough,
    })), [visibleCosts]);

  // Data do evento = última sessão (festival multi-dia) ou end_date/start_date.
  const eventDate = useMemo(() => {
    const dates = (lotSalesData?.dates ?? []).map((d) => d.date).filter(Boolean) as string[];
    if (dates.length) return dates[dates.length - 1];
    return (event as any)?.end_date ?? (event as any)?.start_date ?? null;
  }, [lotSalesData, event]);

  const fcSolution: ForecastSolution = useMemo(
    () => solveForecast(calcSessions, calcCfg, beLotInfo, eventDate, {
      finalAccel: Number(localCfg?.forecast_final_accel) || undefined,
      finalWindowDays: Number(localCfg?.forecast_final_window_days) || undefined,
    }),
    [calcSessions, calcCfg, beLotInfo, eventDate, localCfg?.forecast_final_accel, localCfg?.forecast_final_window_days],
  );

  const beSolution = useMemo(
    () => solveBreakEven(calcSessions, calcCosts, calcCfg, beLotInfo),
    [calcSessions, calcCosts, calcCfg, beLotInfo],
  );

  const today = useMemo(() => computeScenarioRevenue(calcSessions, calcCfg, "today"), [calcSessions, calcCfg]);
  const forecast = useMemo(() => computeScenarioRevenue(calcSessions, calcCfg, "forecast", fcSolution.qtyByKey, fcSolution.revenueByKey), [calcSessions, calcCfg, fcSolution]);

  // abParticipants + bloco A&B movidos para depois de buildDailyFromBreakdown
  // (usam dailyAttendance/beDaily/fcDaily expandidos com combos).


  const ivaTable = useMemo(() => computeIvaTable(calcSessions), [calcSessions]);
  const ivaTableBe = useMemo(() => computeIvaTable(calcSessions, beSolution.revenueByKey), [calcSessions, beSolution]);
  const ivaTableFc = useMemo(() => computeIvaTable(calcSessions, fcSolution.revenueByKey), [calcSessions, fcSolution]);

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
    // Mapa data → day_index para casar event_courtesies com sessões do simulador.
    const dateToIdx = new Map<string, number>();
    dailyAttendance.forEach((d) => { if (d.day_date) dateToIdx.set(d.day_date, d.day_index); });
    const extraCourtesyByKey = new Map<string, number>();
    for (const c of eventCourtesies) {
      if (!c.date) continue;
      const idx = dateToIdx.get(c.date);
      if (idx == null) continue;
      const k = `${idx}|${c.zone_name}`;
      extraCourtesyByKey.set(k, (extraCourtesyByKey.get(k) ?? 0) + Number(c.quantity || 0));
    }
    const sessionsExp = simulatorSessions.map(s => {
      const fcQty = Number(s.forecast_qty ?? s.real_sales_qty) || 0;
      const tm = s.avg_ticket_override != null && Number(s.avg_ticket_override) > 0
        ? Number(s.avg_ticket_override)
        : (s.real_sales_qty ? Number(s.real_sales_revenue) / Number(s.real_sales_qty) : 0);
      const extra = extraCourtesyByKey.get(`${s.day_index}|${s.zone_label}`) ?? 0;
      return {
        day_label: dayLabel(s.day_index),
        zone_label: s.zone_label,
        capacity: undefined as number | undefined,
        price: tm || undefined,
        real_qty: Number(s.real_sales_qty || 0),
        real_eur: Number(s.real_sales_revenue || 0),
        projected_qty: Number(s.projected_qty || 0),
        courtesy_qty: Number(s.courtesy_qty || 0) + extra,
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
      today: todayAB, breakeven: beAB, forecast: fcAB,
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
    const pdfThemeWrappers = Array.from(
      tabContentRef.current.querySelectorAll<HTMLElement>('[data-theme="financial"]'),
    );
    const tabLabel: Record<string, string> = {
      dashboard: "Dashboard", sessions: "Sessões (Dia × Zona)", daily: "Público diário",
      revenue: "Faturamento", sponsors: "Patrocínios", costs: "Custos", iva: "IVA",
      result: "Resultados", config: "Configuração",
    };
    pdfThemeWrappers.forEach((el) => el.classList.add("pdf-rendering"));
    try {
      await exportNodeToPdf(
        tabContentRef.current,
        `Simulador_${event?.name ?? "evento"}_${tabLabel[activeTab] ?? activeTab}.pdf`,
        {
          orientation: "l",
          title: `Simulador — ${event?.name ?? ""}`,
          subtitle: `${tabLabel[activeTab] ?? activeTab} · ${new Date().toLocaleDateString("pt-PT")} · 3 cenários: Real · Break Even · Forecast`,
          forceWidth: 1000,
        },
      );
      toast({ title: "PDF da vista exportado", description: tabLabel[activeTab] ?? activeTab });
    } catch (e: any) {
      toast({ title: "Erro a exportar PDF", description: e.message, variant: "destructive" });
    } finally {
      pdfThemeWrappers.forEach((el) => el.classList.remove("pdf-rendering"));
    }
  };


  // Presença diária expandindo combos
  const dailyAttendance = useMemo(() => {
    if (!lotSalesData) return [];
      const totalDays = Math.max(1, lotSalesData.dates.length || (Math.max(0, ...simulatorSessions.map(s => s.day_index)) + 1));
    const zoneSet = new Map<string, { name: string }>();
      simulatorSessions.forEach(s => zoneSet.set(s.zone_label, { name: s.zone_label }));
    lotSalesData.lotSales.forEach(s => zoneSet.set(s.zone_name, { name: s.zone_name }));
    const courtesyMap = new Map<string, number>();
      simulatorSessions.forEach(s => courtesyMap.set(`${s.day_index}|${s.zone_label}`, Number(s.courtesy_qty || 0)));
    // Merge cortesias geridas em event_courtesies (somando às do simulador).
    // Mapeia por data → day_index na matriz de dias do festival (lotSalesData.dates).
    const dateToIdx = new Map<string, number>();
    (lotSalesData.dates ?? []).forEach((d: any, i: number) => { if (d?.date) dateToIdx.set(d.date, i); });
    for (const c of eventCourtesies) {
      if (!c.date || !c.zone_name) continue;
      const idx = dateToIdx.get(c.date);
      if (idx == null) continue;
      const k = `${idx}|${c.zone_name}`;
      courtesyMap.set(k, (courtesyMap.get(k) ?? 0) + Number(c.quantity || 0));
      zoneSet.set(c.zone_name, { name: c.zone_name });
    }
    return expandLotSalesToDailyAttendance(
      lotSalesData.lotSales,
      Array.from(zoneSet.values()),
      totalDays,
      localCfg?.combo_lot_keywords || "COMBO,PASSE,2 DIAS,3 DIAS,FULL PASS",
      lotSalesData.dates,
      courtesyMap,
    );
  }, [lotSalesData, simulatorSessions, localCfg?.combo_lot_keywords, eventCourtesies]);

  const dailyTotals = useMemo(() => {
    const byDay = new Map<number, { paying: number; courtesy: number; total: number; date: string | null }>();
    for (const r of dailyAttendance) {
      const cur = byDay.get(r.day_index) ?? { paying: 0, courtesy: 0, total: 0, date: r.day_date };
      cur.paying += r.paying; cur.courtesy += r.courtesy; cur.total += r.total;
      byDay.set(r.day_index, cur);
    }
    return Array.from(byDay.entries()).sort((a, b) => a[0] - b[0]);
  }, [dailyAttendance]);

  // Helper: combina público REAL por dia (dailyAttendance) com a projeção
  // por zona vinda dos solvers (BE/Forecast). Reusa expandLotSalesToDailyAttendance
  // para que zonas combo (Passe 2 dias) sejam expandidas a todos os dias,
  // tal como acontece com as vendas reais.
  // Devolve { dailyTotals, expanded } — expanded permite agregar por zona (A&B).
  const buildDailyFromBreakdown = (
    breakdown: Array<{ zone_label: string; day_index: number; current_qty?: number; projected_qty?: number; extra_qty?: number }>,
  ) => {
    if (!lotSalesData) return { dailyTotals, expanded: [] as ReturnType<typeof expandLotSalesToDailyAttendance> };
    const totalDays = Math.max(1, lotSalesData.dates.length || (Math.max(0, ...simulatorSessions.map(s => s.day_index)) + 1));

    // Indexa lotes reais por zone_name para herdar applies_to_days e session_id (via lotSales)
    const zoneInfoByName = new Map<string, { applies_to_days: number | null; sale_day_index: number | null }>();
    for (const ls of lotSalesData.lotSales) {
      const prev = zoneInfoByName.get(ls.zone_name);
      if (!prev) {
        zoneInfoByName.set(ls.zone_name, {
          applies_to_days: ls.applies_to_days ?? 1,
          sale_day_index: ls.sale_day_index,
        });
      }
    }

    // Constrói "vendas sintéticas" a partir das projeções extras de cada zona.
    // REGRA (decisão 2026-05-03): extras BE/Forecast contam SEMPRE como bilhete
    // simples (applies_to_days=1) — só caem no dia âncora da zona, mesmo que a
    // zona tenha combos. Conservador: não inflamos dias seguintes com projeções.
    const syntheticSales = breakdown
      .map((b) => {
        const extra = Number(b.projected_qty ?? b.extra_qty ?? 0);
        if (!Number.isFinite(extra) || extra <= 0) return null;
        const info = zoneInfoByName.get(b.zone_label);
        return {
          lot_id: `proj-${b.zone_label}-${b.day_index}`,
          lot_name: `__proj__${b.zone_label}`, // nome sem keywords combo
          applies_to_days: 1,                  // força bilhete simples
          zone_id: `proj-${b.zone_label}`,
          zone_name: b.zone_label,
          sale_day_index: info?.sale_day_index ?? b.day_index ?? null,
          qty: extra,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Combina vendas reais + projeção e expande por dia (combos → todos os dias)
    const zoneSet = new Map<string, { name: string }>();
    simulatorSessions.forEach((s) => zoneSet.set(s.zone_label, { name: s.zone_label }));
    lotSalesData.lotSales.forEach((s) => zoneSet.set(s.zone_name, { name: s.zone_name }));
    syntheticSales.forEach((s) => zoneSet.set(s.zone_name, { name: s.zone_name }));

    const courtesyMap = new Map<string, number>();
    simulatorSessions.forEach((s) => courtesyMap.set(`${s.day_index}|${s.zone_label}`, Number(s.courtesy_qty || 0)));
    // Merge cortesias geridas em event_courtesies (idêntico ao caminho Real em
    // `dailyAttendance`). Sem este merge, BE/Forecast perdiam as cortesias do
    // recinto e o A&B do cenário ficava subdimensionado vs Real.
    const dateToIdxFc = new Map<string, number>();
    (lotSalesData.dates ?? []).forEach((d: any, i: number) => { if (d?.date) dateToIdxFc.set(d.date, i); });
    for (const c of eventCourtesies) {
      if (!c.date || !c.zone_name) continue;
      const idx = dateToIdxFc.get(c.date);
      if (idx == null) continue;
      const k = `${idx}|${c.zone_name}`;
      courtesyMap.set(k, (courtesyMap.get(k) ?? 0) + Number(c.quantity || 0));
      zoneSet.set(c.zone_name, { name: c.zone_name });
    }

    const expanded = expandLotSalesToDailyAttendance(
      [...lotSalesData.lotSales, ...syntheticSales],
      Array.from(zoneSet.values()),
      totalDays,
      localCfg?.combo_lot_keywords || "COMBO,PASSE,2 DIAS,3 DIAS,FULL PASS",
      lotSalesData.dates,
      courtesyMap,
    );

    // Aplica remoções (extra_qty<0 do solver SURPLUS) na entrada âncora da
    // zona. Isto garante que `beAttendance` reflete o público reduzido e que
    // A&B/KPIs descem proporcionalmente — alinhado com a margem que o solver
    // usa (price + abMarginPerPub).
    const removalsByZone = new Map<string, { qty: number; anchorDay: number }>();
    breakdown.forEach((b) => {
      const e = Number(b.projected_qty ?? b.extra_qty ?? 0);
      if (Number.isFinite(e) && e < 0) {
        const cur = removalsByZone.get(b.zone_label);
        if (cur) cur.qty += -e;
        else removalsByZone.set(b.zone_label, { qty: -e, anchorDay: b.day_index });
      }
    });
    if (removalsByZone.size) {
      removalsByZone.forEach((rem, zone) => {
        let left = rem.qty;
        // tenta primeiro a entrada âncora; se insuficiente, varre outras
        const candidates = expanded
          .filter((r) => r.zone_label === zone && r.paying > 0)
          .sort((a, b) => (a.day_index === rem.anchorDay ? -1 : b.day_index === rem.anchorDay ? 1 : a.day_index - b.day_index));
        for (const r of candidates) {
          if (left <= 0) break;
          const cut = Math.min(left, r.paying);
          r.paying -= cut;
          r.total -= cut;
          left -= cut;
        }
      });
    }

    const byDay = new Map<number, { paying: number; courtesy: number; total: number; date: string | null }>();
    for (const r of expanded) {
      const cur = byDay.get(r.day_index) ?? { paying: 0, courtesy: 0, total: 0, date: r.day_date };
      cur.paying += r.paying; cur.courtesy += r.courtesy; cur.total += r.total;
      byDay.set(r.day_index, cur);
    }
    return { dailyTotals: Array.from(byDay.entries()).sort((a, b) => a[0] - b[0]), expanded };
  };

  const beDaily = useMemo(
    () => buildDailyFromBreakdown(beSolution.breakdown ?? []),
    [beSolution, lotSalesData, simulatorSessions, localCfg?.combo_lot_keywords, dailyTotals, eventCourtesies],
  );
  const fcDaily = useMemo(
    () => buildDailyFromBreakdown(fcSolution.breakdown ?? []),
    [fcSolution, lotSalesData, simulatorSessions, localCfg?.combo_lot_keywords, dailyTotals, eventCourtesies],
  );
  const beDailyTotals = beDaily.dailyTotals;
  const fcDailyTotals = fcDaily.dailyTotals;

  // ── Attendance × dia (combos expandidos) por cenário.
  //    Usado para A&B fallback E como base dos KPIs (totalPublic, custo/pessoa, etc.).
  //    Regra: 1 combo de N dias = N presenças (decisão 2026-05-03).
  const sumDaily = (rows: Array<[number, { paying: number; courtesy: number; total: number; date: string | null }]>) =>
    rows.reduce(
      (a, [, t]) => ({ paying: a.paying + Number(t.paying || 0), courtesy: a.courtesy + Number(t.courtesy || 0) }),
      { paying: 0, courtesy: 0 },
    );
  const todayAttendance = useMemo(() => {
    const s = sumDaily(dailyTotals);
    return { payingAttendance: s.paying, courtesyAttendance: s.courtesy };
  }, [dailyTotals]);
  const beAttendance = useMemo(() => {
    const s = sumDaily(beDailyTotals);
    return { payingAttendance: s.paying, courtesyAttendance: s.courtesy };
  }, [beDailyTotals]);
  const fcAttendance = useMemo(() => {
    const s = sumDaily(fcDailyTotals);
    return { payingAttendance: s.paying, courtesyAttendance: s.courtesy };
  }, [fcDailyTotals]);

  // Recalcular receita com attendance override (presenças × dia) — substitui
  // os `today/breakeven/forecast` "preliminares" calculados acima.
  const todayV2 = useMemo(
    () => computeScenarioRevenue(calcSessions, calcCfg, "today", undefined, undefined, todayAttendance),
    [calcSessions, calcCfg, todayAttendance],
  );
  const breakevenV2 = useMemo(
    () => computeScenarioRevenue(calcSessions, calcCfg, "breakeven", beSolution.qtyByKey, beSolution.revenueByKey, beAttendance),
    [calcSessions, calcCfg, beSolution, beAttendance],
  );
  const forecastV2 = useMemo(
    () => computeScenarioRevenue(calcSessions, calcCfg, "forecast", fcSolution.qtyByKey, fcSolution.revenueByKey, fcAttendance),
    [calcSessions, calcCfg, fcSolution, fcAttendance],
  );

  // ── Participantes (pagantes + cortesia) por zona em cada cenário,
  //    para alimentar o módulo A&B canónico do evento.
  //    IMPORTANTE: usa a presença expandida (dailyAttendance/beDaily/fcDaily),
  //    em que cada combo conta como 1 pessoa por dia coberto na sua zona.
  //    Assim, um combo de 2 dias = 2 participantes elegíveis em A&B.
  const abParticipants = useMemo<ABScenarioParticipants>(() => {
    // expandLotSalesToDailyAttendance devolve linhas com `zone_name`; alguns
    // breakdowns do solver podem usar `zone_label`. Aceitamos ambos para
    // garantir que o override do Simulador chega sempre ao hook A&B.
    const sumByZone = (rows: Array<{ zone_label?: string; zone_name?: string; paying: number; courtesy: number }>) => {
      const m: Record<string, number> = {};
      for (const r of rows) {
        const label = (r.zone_name || r.zone_label || "").toLowerCase();
        if (!label) continue;
        m[label] = (m[label] ?? 0) + Number(r.paying || 0) + Number(r.courtesy || 0);
      }
      return m;
    };
    return {
      real: sumByZone(dailyAttendance),
      breakeven: sumByZone(beDaily.expanded.length ? beDaily.expanded : dailyAttendance),
      forecast: sumByZone(fcDaily.expanded.length ? fcDaily.expanded : dailyAttendance),
    };
  }, [dailyAttendance, beDaily, fcDaily]);

  const abModule = useEventABScenarios(event?.id, abParticipants);

  // Real: usa receita/custo do módulo A&B (per-capita × participantes por zona).
  // BE/Forecast: escala SEMPRE pelo per-capita efectivo do Real
  // (receitaReal / públicoReal), aplicado ao público do cenário.
  // Isto evita que `participants_manual` ou outros casos em que o módulo A&B
  // devolve o mesmo valor nos 3 cenários congelem o A&B no nível do Real.
  const todayAB = useMemo(() => {
    if (!abModule.hasConfig || !abModule.totals) return todayV2;
    const t = abModule.totals.real;
    const drink = t.receitaBebidas;
    const food = t.receitaAlimentos;
    return {
      ...todayV2,
      drinkRevenue: drink,
      foodRevenue: food,
      totalRevenue:
        todayV2.totalRevenue - todayV2.drinkRevenue - todayV2.foodRevenue + drink + food,
    };
  }, [todayV2, abModule]);

  // Público projectado de cada cenário (mesma fonte usada pelo Dashboard
  // como `beTargetQty`/`fcTargetQty` — fcSolution.totalQty + cortesias).
  // Usado como override no scaleABFromReal para evitar que o A&B fique
  // colapsado quando `breakevenV2/forecastV2.attendanceQty` cai para o real.
  // Público projectado em PRESENÇAS×DIA (mesma unidade que `realRev.attendanceQty`
  // do módulo A&B). Antes somávamos `solution.qtyByKey` (bilhetes únicos), o que
  // misturava unidades com o numerador (`realDrink/realPresenças`) e fazia o A&B
  // BE/Forecast ficar subdimensionado em eventos com combos multi-dia.
  const bePubProjected = useMemo(
    () => Number(beAttendance?.payingAttendance || 0) + Number(beAttendance?.courtesyAttendance || 0),
    [beAttendance],
  );
  const fcPubProjected = useMemo(
    () => Number(fcAttendance?.payingAttendance || 0) + Number(fcAttendance?.courtesyAttendance || 0),
    [fcAttendance],
  );

  const beAB = useMemo(() => {
    if (!abModule.hasConfig || !abModule.totals) return breakevenV2;
    const real = abModule.totals.real;
    const scaled = scaleABFromReal(breakevenV2, todayAB, real.receitaBebidas, real.receitaAlimentos, bePubProjected);
    return { ...breakevenV2, ...scaled };
  }, [breakevenV2, todayAB, abModule, bePubProjected]);

  const fcAB = useMemo(() => {
    if (!abModule.hasConfig || !abModule.totals) return forecastV2;
    const real = abModule.totals.real;
    const scaled = scaleABFromReal(forecastV2, todayAB, real.receitaBebidas, real.receitaAlimentos, fcPubProjected);
    return { ...forecastV2, ...scaled };
  }, [forecastV2, todayAB, abModule, fcPubProjected]);

  const todayCosts = useMemo(() => {
    const base = computeScenarioCosts(calcCosts, todayAB, calcCfg, "today");
    if (abModule.hasConfig && abModule.totals) {
      const ab = abModule.totals.real.custoTotal;
      return { ...base, abCost: ab, totalCost: base.eventCosts + ab + base.souvenirCost };
    }
    return base;
  }, [calcCosts, todayAB, calcCfg, abModule]);
  const beCosts = useMemo(() => {
    const base = computeScenarioCosts(calcCosts, beAB, calcCfg, "breakeven");
    if (abModule.hasConfig && abModule.totals) {
      // Escala custo A&B pelo público do cenário (terceirização → custo 0 mantém-se 0)
      const ab = scaleABCostFromReal(abModule.totals.real.custoTotal, todayAB, beAB, bePubProjected);
      return { ...base, abCost: ab, totalCost: base.eventCosts + ab + base.souvenirCost };
    }
    return base;
  }, [calcCosts, beAB, todayAB, calcCfg, abModule, bePubProjected]);
  const fcCosts = useMemo(() => {
    const base = computeScenarioCosts(calcCosts, fcAB, calcCfg, "forecast");
    if (abModule.hasConfig && abModule.totals) {
      const ab = scaleABCostFromReal(abModule.totals.real.custoTotal, todayAB, fcAB, fcPubProjected);
      return { ...base, abCost: ab, totalCost: base.eventCosts + ab + base.souvenirCost };
    }
    return base;
  }, [calcCosts, fcAB, todayAB, calcCfg, abModule, fcPubProjected]);

  const todayRev = todayAB;
  const rawBeRev = beAB;
  const rawBeRes = useMemo(() => computeScenarioResult(rawBeRev, beCosts), [rawBeRev, beCosts]);
  const beRev = useMemo(() => {
    if (beSolution.mode === "surplus" && rawBeRes.general > 0.5) {
      return {
        ...rawBeRev,
        ticketsRevenue: rawBeRev.ticketsRevenue - rawBeRes.general,
        totalRevenue: rawBeRev.totalRevenue - rawBeRes.general,
      };
    }
    return rawBeRev;
  }, [rawBeRev, rawBeRes.general, beSolution.mode]);
  const fcRev = fcAB;

  const todayRes = useMemo(() => computeScenarioResult(todayRev, todayCosts), [todayRev, todayCosts]);
  const beRes = useMemo(() => computeScenarioResult(beRev, beCosts), [beRev, beCosts]);
  const fcRes = useMemo(() => computeScenarioResult(fcRev, fcCosts), [fcRev, fcCosts]);

  const todayKpis = useMemo(() => computeScenarioKpis(todayRev, todayCosts, todayRes), [todayRev, todayCosts, todayRes]);
  const beKpis = useMemo(() => computeScenarioKpis(beRev, beCosts, beRes), [beRev, beCosts, beRes]);
  const fcKpis = useMemo(() => computeScenarioKpis(fcRev, fcCosts, fcRes), [fcRev, fcCosts, fcRes]);

  // ------- Helpers de edição -------
  const updateSession = (idx: number, patch: Partial<DbInput>) =>
    setLocalSessions((arr) => arr.map((s, i) => i === idx ? { ...s, ...patch } : s));

  const addSession = () => {
    const nextDay = localSessions.length ? Math.max(0, ...localSessions.map((s) => s.day_index)) + 1 : 0;
    setLocalSessions((arr) => [...arr, {
      event_id: eventId!,
      day_index: nextDay,
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

  // Despacho: se for Master de turnê e modo turnê activo, renderiza TourSimulator
  if (isTourMaster && tourMode) {
    return <TourSimulator masterEvent={event} splits={subEvents as any} />;
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
          <Button variant="outline" onClick={() => {
            if (isTourMaster) {
              toast({ title: "Sincronização indisponível", description: "Eventos com Splits (turnê) não suportam sincronização. Os dados de Patrocínios, Custos e Configuração podem não estar atualizados.", variant: "destructive" });
              return;
            }
            const ok = window.confirm(
              "Sincronizar irá sobrescrever os valores de 'Forecast (BP)' e 'Real (Hoje)' das linhas de custo com os dados atuais do BP aprovado e das transações.\n\nQuaisquer edições manuais feitas nessas colunas serão perdidas.\n\nAs colunas '2025' e 'Break Even' não são afetadas.\n\nContinuar?"
            );
            if (ok) syncFromSources.mutate();
          }} disabled={syncFromSources.isPending || isTourMaster} title={isTourMaster ? "Sincronização não suportada em turnês" : undefined}>
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

      {(isTourMaster || syncFromSources.isError) && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <strong>Aviso:</strong>{" "}
          {isTourMaster
            ? "Este evento é Master de turnê — a sincronização automática não está suportada. Os dados das abas Patrocínios, Custos e Configuração podem não refletir o BP/transações atuais. Edite manualmente ou utilize o simulador num sub-evento."
            : `Falha na última sincronização${syncFromSources.error instanceof Error ? `: ${syncFromSources.error.message}` : ""}. Os dados de Patrocínios, Custos e Configuração podem estar desatualizados.`}
        </div>
      )}

      {/* KPIs scenario summary */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ScenarioCard title="Hoje (Edição 2026)" tone="muted" rev={todayAB} cost={todayCosts} res={todayRes} kpis={todayKpis} dailyTotals={dailyTotals} />
        <ScenarioCard
          title="Break Even"
          tone="warning"
          rev={beAB}
          cost={beCosts}
          res={beRes}
          kpis={beKpis}
          dailyTotals={beDailyTotals}
          extra={<BreakEvenSummary solution={beSolution} />}
        />
        <ScenarioCard
          title="Forecast"
          tone="success"
          rev={fcAB}
          cost={fcCosts}
          res={fcRes}
          kpis={fcKpis}
          dailyTotals={fcDailyTotals}
          extra={<ForecastSummary solution={fcSolution} />}
        />
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

        {/* ---------------- Dashboard executivo (3 cenários lado-a-lado) ---------------- */}
        <TabsContent value="dashboard">
          <ExecutiveDashboard
            eventName={event?.name ?? ""}
            eventId={eventId}
            today={todayAB} todayCosts={todayCosts} todayRes={todayRes} todayKpis={todayKpis}
            breakeven={beRev} beCosts={beCosts} beRes={beRes} beKpis={beKpis}
            forecast={fcAB} fcCosts={fcCosts} fcRes={fcRes} fcKpis={fcKpis}
            costLines={visibleCosts}
            dailyTotals={dailyTotals}
            ivaTable={ivaTable}
            sessions={simulatorSessions as any}
            abModule={abModule as any}
            beSolution={{ totalQty: Object.values(beSolution.qtyByKey || {}).reduce((a, b) => a + Number(b || 0), 0), totalRevenue: Object.values(beSolution.revenueByKey || {}).reduce((a, b) => a + Number(b || 0), 0) }}
            fcSolution={{ totalQty: Object.values(fcSolution.qtyByKey || {}).reduce((a, b) => a + Number(b || 0), 0), totalRevenue: Object.values(fcSolution.revenueByKey || {}).reduce((a, b) => a + Number(b || 0), 0) }}
            beDailyTotals={beDailyTotals}
            fcDailyTotals={fcDailyTotals}
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
                  <RevRow label="Bilhetes" prior={calcCfg.prior_year_tickets} a={todayAB.ticketsRevenue} b={beAB.ticketsRevenue} c={fcAB.ticketsRevenue} />
                  <RevRow label="A&B Bebida" prior={calcCfg.prior_year_drink} a={todayAB.drinkRevenue} b={beAB.drinkRevenue} c={fcAB.drinkRevenue} />
                  <RevRow label="A&B Alimento" prior={calcCfg.prior_year_food} a={todayAB.foodRevenue} b={beAB.foodRevenue} c={fcAB.foodRevenue} />
                  <RevRow label="Patrocínio" prior={calcCfg.prior_year_sponsor} a={todayAB.sponsorRevenue} b={beAB.sponsorRevenue} c={fcAB.sponsorRevenue} />
                  <RevRow label="Souvenir" prior={calcCfg.prior_year_souvenir} a={todayAB.souvenirRevenue} b={beAB.souvenirRevenue} c={fcAB.souvenirRevenue} />
                  <RevRow label="Outros Créditos" prior={calcCfg.prior_year_other} a={todayAB.otherCredits} b={beAB.otherCredits} c={fcAB.otherCredits} />
                  <TableRow className="font-bold border-t-2">
                    <TableCell>FATURAMENTO TOTAL</TableCell>
                    <TableCell className="text-right">{fmt(calcCfg.prior_year_tickets + calcCfg.prior_year_drink + calcCfg.prior_year_food + calcCfg.prior_year_sponsor + calcCfg.prior_year_souvenir + calcCfg.prior_year_other)}</TableCell>
                    <TableCell className="text-right">{fmt(todayAB.totalRevenue)}</TableCell>
                    <TableCell className="text-right">{fmt(beAB.totalRevenue)}</TableCell>
                    <TableCell className="text-right">{fmt(fcAB.totalRevenue)}</TableCell>
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
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer" title="Inclui categorias do Grupo 10 (Custos Corporativos / overheads). Útil em empresas mono-evento.">
                  <input type="checkbox" checked={includeOverheads} onChange={(e) => setIncludeOverheads(e.target.checked)} />
                  Incluir Grupo 10 (overheads)
                </label>
                <Button size="sm" variant="outline" onClick={addCost}><Plus className="mr-1 h-4 w-4" /> Adicionar linha</Button>
              </div>
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
                  {visibleCosts.map((c) => {
                    const i = localCosts.indexOf(c);
                    return (
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
                      <TableCell className="text-right text-muted-foreground" title={`BP aprovado: ${fmt(c.forecast_amount)} · TX (approved+paid): ${fmt(Math.max(0, c.actual_amount - c.actual_committed_bp))} · Pago: ${fmt(c.actual_paid)} · BP por executar: ${fmt(c.actual_committed_bp)}`}>
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
                  );})}
                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={2}>CUSTO TOTAL{includeOverheads ? "" : " (s/ Grupo 10)"}</TableCell>
                    <TableCell className="text-right">{fmt(visibleCosts.reduce((a, c) => a + Number(c.prior_year_amount || 0), 0))}</TableCell>
                    <TableCell className="text-right">{fmt(visibleCosts.reduce((a, c) => a + Number(c.actual_amount || 0), 0))}</TableCell>
                    <TableCell className="text-right">{fmt(beCosts.totalCost)}</TableCell>
                    <TableCell className="text-right">{fmt(fcCosts.totalCost)}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                <strong>2025 (manual)</strong>: introduzido manualmente para referência (não é puxado da DB).
                <strong> Hoje (Edição 2026)</strong>: <em>max(BP aprovado, TX approved+paid)</em> por categoria L3 — alinhado aos Cards do BP e à Análise de Resultados.
                Passa o rato sobre o valor para ver decomposição (BP / TX / Pago).
                Marque "A&B?" nas linhas <em>A&B Bebida/Alimento</em> — recalculadas pelo % de repasse.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- IVA ---------------- */}
        <TabsContent value="iva" className="space-y-4">
          {([
            { title: "IVA Bilheteira por sessão (cenário Hoje)", data: ivaTable },
            { title: "IVA Bilheteira por sessão (cenário Break Even)", data: ivaTableBe },
            { title: "IVA Bilheteira por sessão (cenário Forecast)", data: ivaTableFc },
          ] as const).map((blk) => (
            <Card key={blk.title}>
              <CardHeader><CardTitle>{blk.title}</CardTitle></CardHeader>
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
                    {blk.data.map((r) => (
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
                      <TableCell className="text-right">{fmt(blk.data.reduce((a, r) => a + r.gross, 0))}</TableCell>
                      <TableCell className="text-right">{fmt(blk.data.reduce((a, r) => a + r.iva, 0))}</TableCell>
                      <TableCell className="text-right">{fmt(blk.data.reduce((a, r) => a + r.net, 0))}</TableCell>
                      <TableCell className="text-right">100%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
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
                  <CfgInput label="Outras Receitas (€)" value={Number((localCfg as any).other_revenue ?? 0)}
                    onChange={(v) => setLocalCfg({ ...(localCfg as any), other_revenue: v } as any)} step={0.01} />
                   <div className="col-span-full mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                    <div className="col-span-full space-y-2">
                      <p className="text-sm font-semibold">Forecast — Reta final</p>
                      <p className="text-xs text-muted-foreground">
                        O Forecast extrapola o ritmo de vendas recente até ao dia do evento e aplica um <strong>boost</strong> (multiplicador ×) nos últimos N dias para captar a aceleração típica das curvas de bilheteira (efeito "curva em J"). Default: <strong>1,6×</strong> nos últimos <strong>30 dias</strong>.
                      </p>
                      <details className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                        <summary className="cursor-pointer font-semibold text-foreground">
                          📐 Como calculamos a projeção (modelo técnico)
                        </summary>
                        <div className="mt-3 space-y-3 text-muted-foreground">
                          <p>
                            A projeção é feita <strong>sessão a sessão</strong> — cada combinação de dia, zona e lote tem o seu próprio ritmo de venda. Cada sessão respeita a capacidade que ainda resta e usa o forecast manual como piso mínimo. A receita é somada lote a lote, ao preço de venda em vigor.
                          </p>

                          <div>
                            <p className="font-semibold text-foreground">1. Ritmo recente de vendas</p>
                            <p className="mt-1">
                              Para cada sessão medimos quantos bilhetes se venderam por dia desde o arranque das vendas:
                            </p>
                            <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-[11px]">
{`ritmo = bilhetes vendidos / dias em venda`}
                            </pre>
                            <p className="mt-1">
                              Cada zona evolui ao seu próprio ritmo: as zonas com mais procura aceleram naturalmente mais depressa.
                            </p>
                          </div>

                          <div>
                            <p className="font-semibold text-foreground">2. Fase base + reta final</p>
                            <p className="mt-1">
                              O período até ao evento é dividido em duas fases. Na <strong>fase base</strong> assume-se que as vendas continuam ao ritmo atual. Na <strong>reta final</strong> (últimos N dias antes do evento) aplica-se um <strong>multiplicador (boost)</strong> que reflete a aceleração típica das curvas de bilheteira.
                            </p>
                            <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-[11px]">
{`projeção = (ritmo × dias da fase base)
         + (ritmo × boost × dias da reta final)`}
                            </pre>
                            <p className="mt-1">
                              Um boost de <strong>1,6×</strong> significa que, na reta final, se estima vender 60% mais por dia do que no ritmo atual.
                            </p>
                          </div>

                          <div>
                            <p className="font-semibold text-foreground">3. Limites e ajustes</p>
                            <ul className="ml-4 list-disc space-y-1">
                              <li><strong>Capacidade</strong>: a projeção nunca ultrapassa o que ainda há para vender em cada zona.</li>
                              <li><strong>Piso manual</strong>: se o forecast inserido manualmente for superior à projeção automática, prevalece o manual (até ao limite da capacidade).</li>
                              <li><strong>Receita</strong>: cada bilhete extra entra no próximo lote ativo ao preço corrente; quando esse lote esgota, transita para o seguinte.</li>
                            </ul>
                          </div>

                          <div>
                            <p className="font-semibold text-foreground">4. Calibração do boost com eventos passados</p>
                            <p>
                              É possível calibrar o boost a partir de um evento já realizado. O sistema compara o ritmo médio da reta final com o ritmo médio de toda a fase anterior:
                            </p>
                            <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-[11px]">
{`ritmo final = bilhetes dos últimos N dias / N
ritmo base  = bilhetes desde o início até D−N / dias da fase base
boost       = ritmo final / ritmo base`}
                            </pre>
                            <p className="mt-1">
                              ⚠️ <strong>Importante</strong>: o boost é um <strong>multiplicador (×)</strong>, não uma percentagem. É diferente de comparar "últimos 30 dias vs 30 dias anteriores" — essa comparação usa janelas iguais, enquanto o boost aqui mede a reta final face à <em>média de toda a fase base</em>. Por isso valores como <strong>3,4×</strong> e <strong>2,65×</strong> podem coexistir sem se contradizerem: medem coisas diferentes.
                            </p>
                          </div>

                          <div>
                            <p className="font-semibold text-foreground">5. Pressupostos e limitações</p>
                            <ul className="ml-4 list-disc space-y-1">
                              <li>Assume ritmo <strong>linear</strong> na fase base e aceleração <strong>constante</strong> na reta final — não modela picos pontuais (ex.: anúncio de cartaz, abertura de novo lote, campanhas).</li>
                              <li>Não pondera sazonalidade semanal nem efeitos de variação de preço entre lotes (apenas respeita o preço do lote ativo).</li>
                              <li>Eventos com poucos dias de venda (menos de 7) tendem a sobre-estimar — recomenda-se usar piso manual.</li>
                              <li>O modelo extrapola o passado: mudanças de mercado, concorrência ou comunicação podem alterar significativamente o resultado real.</li>
                            </ul>
                          </div>
                        </div>
                      </details>
                    </div>
                    <CfgInput
                      label="Multiplicador reta final (×)"
                      value={Number(localCfg.forecast_final_accel ?? 1.6)}
                      onChange={(v) => setLocalCfg({ ...localCfg, forecast_final_accel: v })}
                      step={0.1}
                    />
                    <CfgInput
                      label="Janela reta final (dias)"
                      value={Number(localCfg.forecast_final_window_days ?? 30)}
                      onChange={(v) => setLocalCfg({ ...localCfg, forecast_final_window_days: Math.round(v) })}
                      step={1}
                    />
                    <ForecastBoostCalibrator
                      currentEventId={eventId}
                      defaultWindowDays={Number(localCfg.forecast_final_window_days ?? 30)}
                      onApply={async (boost, windowDays) => {
                        const next = {
                          ...localCfg,
                          forecast_final_accel: Number(boost.toFixed(2)),
                          forecast_final_window_days: Math.round(windowDays),
                        };
                        setLocalCfg(next);
                        if (eventId && companyId) {
                          await supabase
                            .from("event_simulator_config")
                            .upsert({ ...next, event_id: eventId, company_id: companyId } as any)
                            .throwOnError();
                          qc.invalidateQueries({ queryKey: ["sim-coala-cfg", eventId] });
                          toast({ title: "Calibração aplicada", description: `Multiplicador ${boost.toFixed(2)}× guardado.` });
                        }
                      }}
                    />
                  </div>
                  <div className="col-span-full mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                    <div className="col-span-full">
                      <p className="text-sm font-semibold">Ano anterior (2025) — manual</p>
                      <p className="text-xs text-muted-foreground">Estes valores são introduzidos manualmente e servem só de referência. <strong>Não</strong> são alimentados pela plataforma — a Edição 2026 vem de Vendas + BP + Transações.</p>
                    </div>
                    <CfgInput label="Bilhetes 2025 (€)" value={localCfg.prior_year_tickets}
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
function BreakEvenSummary({ solution }: { solution: BreakEvenSolution }) {
  if (!solution) return null;

  // ===== MODO SURPLUS: já passou o break-even — mostra margem de segurança =====
  if (solution.mode === "surplus" && solution.surplus > 0.5) {
    const removedItems = solution.breakdown.filter(b => b.extra_qty < 0);
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-2 py-0.5 text-[11px] hover:bg-emerald-500/10">
            <span className="font-semibold text-emerald-500">+{fmt(solution.surplus)}</span>
            <span className="text-muted-foreground">·</span>
            <span>−{fmtNum(solution.totalRemovedTickets)} bilh.</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[360px] text-xs">
          <div className="space-y-2">
            <div className="font-semibold text-sm">Margem de segurança</div>
            <div className="text-[11px] text-muted-foreground">
              O evento já <strong>ultrapassou</strong> o ponto de equilíbrio. Os números abaixo
              mostram a configuração mínima que ainda zerava o resultado.
            </div>
            <div className="grid grid-cols-2 gap-2 rounded bg-muted/40 p-2">
              <div><div className="text-muted-foreground text-[10px]">Margem</div><div className="font-semibold text-emerald-500">+{fmt(solution.surplus)}</div></div>
              <div><div className="text-muted-foreground text-[10px]">Bilhetes a menos</div><div className="font-semibold">−{fmtNum(solution.totalRemovedTickets)}</div></div>
            </div>
            {removedItems.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Distribuição (último lote vendido)</div>
                <div className="space-y-0.5 max-h-48 overflow-auto">
                  {removedItems.sort((a,b) => a.extra_qty - b.extra_qty).map(b => (
                    <div key={b.key} className="flex justify-between gap-2">
                      <span className="truncate">D{b.day_index+1} · {b.zone_label}</span>
                      <span className="tabular-nums whitespace-nowrap">
                        −{fmtNum(-b.extra_qty)} <span className="text-muted-foreground">@ {fmt(b.marginal_price)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground border-t pt-1">
              Cálculo simétrico ao défice: distribui pela <strong>velocidade × margem</strong>,
              consumindo do último lote vendido para trás.
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // ===== MODO EXACT: exatamente no ponto =====
  if (solution.mode === "exact" || solution.deficit <= 0.5) {
    return <Badge variant="outline" className="text-emerald-500 border-emerald-500/40">Já no break-even</Badge>;
  }
  const reachable = solution.reachable;
  const allocated = solution.breakdown.filter(b => b.extra_qty > 0);
  const ignored = solution.breakdown.filter(b => b.extra_qty === 0 && b.reason !== "ok");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-0.5 text-[11px] hover:bg-amber-500/10">
          <span className="font-semibold">{fmt(solution.deficit)}</span>
          <span className="text-muted-foreground">·</span>
          <span>{fmtNum(solution.totalExtraTickets)} bilh.</span>
          {!reachable && <Badge variant="destructive" className="ml-1 px-1 py-0 text-[9px]">parcial</Badge>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] text-xs">
        <div className="space-y-2">
          <div className="font-semibold text-sm">Como atingir o equilíbrio</div>
          <div className="grid grid-cols-2 gap-2 rounded bg-muted/40 p-2">
            <div><div className="text-muted-foreground text-[10px]">Falta cobrir</div><div className="font-semibold">{fmt(solution.deficit)}</div></div>
            <div><div className="text-muted-foreground text-[10px]">Bilhetes a vender</div><div className="font-semibold">{fmtNum(solution.totalExtraTickets)}</div></div>
            {solution.unfilled > 0.5 && (
              <div className="col-span-2 text-rose-500 text-[10px]">⚠️ Capacidade insuficiente para cobrir {fmt(solution.unfilled)}</div>
            )}
          </div>
          {allocated.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Distribuição sugerida</div>
              <div className="space-y-0.5 max-h-48 overflow-auto">
                {allocated.sort((a,b) => b.extra_qty - a.extra_qty).map(b => (
                  <div key={b.key} className="flex justify-between gap-2">
                    <span className="truncate">D{b.day_index+1} · {b.zone_label}</span>
                    <span className="tabular-nums whitespace-nowrap">
                      +{fmtNum(b.extra_qty)} <span className="text-muted-foreground">@ {fmt(b.marginal_price)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {ignored.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Zonas excluídas</div>
              <div className="space-y-0.5 max-h-32 overflow-auto">
                {ignored.map(b => {
                  const reasonTxt = b.reason === "no_velocity" ? "sem ritmo de venda"
                    : b.reason === "capacity_full" ? "lotação esgotada"
                    : b.reason === "no_price" ? "sem preço definido" : "—";
                  return (
                    <div key={b.key} className="flex justify-between gap-2 text-muted-foreground">
                      <span className="truncate">D{b.day_index+1} · {b.zone_label}</span>
                      <span className="text-[10px]">{reasonTxt}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="text-[10px] text-muted-foreground border-t pt-1">
            Distribuição pondera <strong>velocidade × margem</strong> e respeita capacidade + preço do próximo lote.
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ForecastSummary({ solution }: { solution: ForecastSolution }) {
  if (!solution) return null;
  const totalProjected = solution.breakdown.reduce((a, b) => a + b.projected_qty, 0);
  const noVelocity = solution.breakdown.filter(b => b.reason === "no_velocity");
  const allocated = solution.breakdown.filter(b => b.projected_qty > 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-2 py-0.5 text-[11px] hover:bg-emerald-500/10">
          <span className="font-semibold">+{fmtNum(totalProjected)} bilh.</span>
          <span className="text-muted-foreground">·</span>
          <span>{solution.daysToEvent}d até evento</span>
          {!solution.hasCapacityPlan && <Badge variant="outline" className="ml-1 px-1 py-0 text-[9px] border-amber-500/60 text-amber-500">sem teto</Badge>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] text-xs">
        <div className="space-y-2">
          <div className="font-semibold text-sm">Projeção até ao evento</div>
          <div className="grid grid-cols-2 gap-2 rounded bg-muted/40 p-2">
            <div><div className="text-muted-foreground text-[10px]">Dias até evento</div><div className="font-semibold">{solution.daysToEvent}d</div></div>
            <div><div className="text-muted-foreground text-[10px]">Bilhetes projetados</div><div className="font-semibold">+{fmtNum(totalProjected)}</div></div>
          </div>
          {!solution.hasCapacityPlan && (
            <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-[10px] text-amber-500">
              ⚠️ Nenhuma zona tem capacidade definida. Forecast sem teto — defina zonas/lotes em <strong>/bilheteiras</strong> para projeção realista.
            </div>
          )}
          {allocated.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Projeção por zona</div>
              <div className="space-y-0.5 max-h-48 overflow-auto">
                {allocated.sort((a,b) => b.projected_qty - a.projected_qty).map(b => (
                  <div key={b.key} className="flex justify-between gap-2">
                    <span className="truncate">
                      D{b.day_index+1} · {b.zone_label}
                      {b.manual_floor_used && <span className="ml-1 text-amber-500">[manual]</span>}
                      {b.capped_by_capacity && <span className="ml-1 text-rose-500">[max]</span>}
                    </span>
                    <span className="tabular-nums whitespace-nowrap">
                      +{fmtNum(b.projected_qty)} <span className="text-muted-foreground">({b.recent_velocity.toFixed(1)}/d)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {noVelocity.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Zonas sem projeção</div>
              <div className="space-y-0.5 max-h-32 overflow-auto">
                {noVelocity.map(b => (
                  <div key={b.key} className="flex justify-between gap-2 text-muted-foreground">
                    <span className="truncate">D{b.day_index+1} · {b.zone_label}</span>
                    <span className="text-[10px]">sem ritmo de venda</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="text-[10px] text-muted-foreground border-t pt-1">
            Híbrido: ritmo recente extrapolado + 1.6× nos últimos 30d.
            Cada zona projeta o seu próprio apetite. Forecast manual é piso mínimo.
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
  const dailyGrandPaying = days.reduce((sum, [, t]) => sum + Number(t.paying || 0), 0);
  const dailyGrandCourtesy = days.reduce((sum, [, t]) => sum + Number(t.courtesy || 0), 0);
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
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground" title="Soma dos pagantes por dia (passes multi-dia contam em cada dia). Cortesias são mostradas em separado e não entram neste total para alinhar com o cálculo de bilheteira de Break Even e Forecast.">Público pagante / dia (pagantes×dia)</div>
            {days.map(([d, t]) => (
              <div key={d} className="flex justify-between">
                <span className="text-muted-foreground">{fmtDayShort(t.date, d)}</span>
                <span className="tabular-nums">{fmtNum(t.paying)}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs text-muted-foreground border-t pt-1">
              <span title="Soma dos pagantes de todos os dias">Total pagantes×dia</span><span className="tabular-nums">{fmtNum(dailyGrandPaying)}</span>
            </div>
            {dailyGrandCourtesy > 0 && (
              <div className="flex justify-between text-[11px] text-muted-foreground/80" title="Cortesias atribuídas (não entram no total acima; impactam apenas A&B em consumo).">
                <span>Cortesias (informativo)</span><span className="tabular-nums">+{fmtNum(dailyGrandCourtesy)}</span>
              </div>
            )}
          </>
        ) : (
          <div className="flex justify-between" title="Bilhetes pagantes únicos (cada bilhete conta uma vez, mesmo que dê acesso a vários dias)"><span className="text-muted-foreground">Público (bilhetes únicos)</span><span>{fmtNum(kpis.totalPublic)}</span></div>
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
              <div className="text-xs text-muted-foreground">Público pagante / dia (Hoje)</div>
              <div className="mt-1 space-y-0.5">
                {dailyTotals.map(([d, t]: any) => (
                  <div key={d} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{fmtDate(t.date) || `Dia ${d + 1}`}</span>
                    <span className="font-semibold tabular-nums">{fmtNum(t.paying)}</span>
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
