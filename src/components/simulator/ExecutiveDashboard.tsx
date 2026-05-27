/**
 * Executive Dashboard do Simulador — v2 (dashboard financeiro denso).
 *
 * Layout: Hero strip → Status bar → FinancialTable + KPI stack → Daily attendance
 * → Gráficos (donut/bars com referência) → Heatmap de cidades (turnê).
 *
 * Não duplica inputs: consome os mesmos dados já calculados em EventSimulator.
 * Props mantidas idênticas à v1 — callers não mudam.
 */
import React, { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, ReferenceLine,
} from "recharts";
import { FileText, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { exportNodeToPdf } from "@/lib/event-simulator-view-pdf";
import { toast } from "@/hooks/use-toast";
import DailyAttendanceCard from "@/components/simulator/DailyAttendanceCard";
import KpiHero from "@/components/simulator/KpiHero";
import ScenarioPill from "@/components/simulator/ScenarioPill";
import StatusBadge from "@/components/simulator/StatusBadge";
import ProgressKpi from "@/components/simulator/ProgressKpi";
import FinancialTable, { type FinancialRow } from "@/components/simulator/FinancialTable";
import CityHeatCard from "@/components/simulator/CityHeatCard";

const fmt = (v: number) => formatCurrency(Number.isFinite(v) ? v : 0);
const fmtNum = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-PT", { maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${(Number.isFinite(v) ? v : 0).toFixed(1)}%`;

type ScenarioKey = "real" | "breakeven" | "forecast";
const SCEN_LABELS: Record<ScenarioKey, string> = {
  real: "Real",
  breakeven: "Break Even",
  forecast: "Forecast",
};

interface Props {
  eventName: string;
  today: any; todayCosts: any; todayRes: any; todayKpis: any;
  breakeven: any; beCosts: any; beRes: any; beKpis: any;
  forecast: any; fcCosts: any; fcRes: any; fcKpis: any;
  costLines: any[];
  dailyTotals: any[];
  ivaTable: any[];
  sessions: { day_index: number; zone_label: string; real_sales_qty: number; real_sales_revenue: number; courtesy_qty: number }[];
  abModule: { hasConfig: boolean; totals: { real: any; breakeven: any; forecast: any } | null };
  beSolution?: { totalQty?: number; totalRevenue?: number };
  fcSolution?: { totalQty?: number; totalRevenue?: number };
  beDailyTotals?: Array<[number, { paying: number; courtesy: number; total: number; date: string | null }]>;
  fcDailyTotals?: Array<[number, { paying: number; courtesy: number; total: number; date: string | null }]>;
  eventId?: string;
  dailyCapacity?: number;
  tourBreakdowns?: Array<{
    name: string;
    publico: number;
    ticketMedio: number;
    abPerPerson: number;
    receita: number;
    custo: number;
    resultado: number;
    margem: number;
    breakEvenQty: number;
  }>;
}

export default function ExecutiveDashboard(props: Props) {
  const {
    eventName, today, todayCosts, todayRes, todayKpis,
    breakeven, beCosts, beRes, beKpis,
    forecast, fcCosts, fcRes, fcKpis,
    costLines, dailyTotals, sessions, abModule, beSolution, fcSolution, tourBreakdowns,
    eventId, dailyCapacity, beDailyTotals, fcDailyTotals,
  } = props;

  const [active, setActive] = useState<ScenarioKey>("real");
  const [exporting, setExporting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // -------- Selecção do trio activo --------
  const sel = useMemo(() => {
    const map = {
      real: { rev: today, cost: todayCosts, res: todayRes, kpis: todayKpis },
      breakeven: { rev: breakeven, cost: beCosts, res: beRes, kpis: beKpis },
      forecast: { rev: forecast, cost: fcCosts, res: fcRes, kpis: fcKpis },
    };
    return map[active];
  }, [active, today, todayCosts, todayRes, todayKpis, breakeven, beCosts, beRes, beKpis, forecast, fcCosts, fcRes, fcKpis]);

  // -------- Break-even / forecast targets --------
  // Cards do trio Real/BE/Forecast mostram APENAS pagantes×dia (memo:
  // simulator-public-unit.md). Cortesias entram só no A&B (per-capita) e no
  // KPI grande "Presenças × dia" (calculado à parte com paying+courtesy).
  const presOf = (rev: any) => Number(rev?.attendanceQty || 0);
  const todayPres = presOf(today);
  const beTargetQty = presOf(breakeven);
  const fcTargetQty = presOf(forecast);
  const needForBE = Math.max(0, Math.round(beTargetQty - todayPres));
  const abMarginReal =
    abModule.hasConfig && abModule.totals ? abModule.totals.real.resultadoTotal : 0;
  const reachedBE = todayRes.general >= 0;

  // -------- Charts --------
  const PIE_COLORS = ["#3b82f6", "#84cc16", "#f59e0b", "#a855f7", "#06b6d4", "#ef4444"];
  const revenueMixActive = useMemo(
    () =>
      [
        { name: "Bilheteira", value: sel.rev.ticketsRevenue },
        { name: "A&B", value: (sel.rev.drinkRevenue || 0) + (sel.rev.foodRevenue || 0) },
        { name: "Patrocínios", value: sel.rev.sponsorRevenue },
        { name: "Souvenir", value: sel.rev.souvenirRevenue },
        { name: "Outros", value: sel.rev.otherCredits },
      ].filter((r) => r.value > 0),
    [sel.rev],
  );
  const totalMix = revenueMixActive.reduce((a, r) => a + r.value, 0);

  const costsCompareChart = useMemo(() => {
    return [...(costLines ?? [])]
      .filter((c: any) => !c.is_ab_passthrough)
      .map((c: any) => {
        const real = Number(c.actual_amount || 0);
        const beRaw = Number(c.break_even_amount || 0);
        // Mesmo fallback usado em computeScenarioCosts/financialRows:
        // BE 0 → actual → prior_year → forecast.
        const be = beRaw > 0 ? beRaw : (real || Number(c.prior_year_amount || 0) || Number(c.forecast_amount || 0));
        return {
          name: c.label || "—",
          Real: real,
          BE: be,
          Forecast: Number(c.forecast_amount || 0),
        };
      })
      .filter((c) => c.Real + c.BE + c.Forecast > 0)
      .sort((a, b) => b.Real - a.Real)
      .slice(0, 8);
  }, [costLines]);

  const dailyChart = (dailyTotals ?? []).map(([d, t]: any) => ({
    name: t.date ?? `Dia ${d + 1}`,
    Pagantes: t.paying,
    Cortesias: t.courtesy,
    Total: (t.paying || 0) + (t.courtesy || 0),
  }));

  // -------- Helpers para FinancialTable --------
  const financialRows = useMemo((): FinancialRow[] => {
    const topCosts = [...(costLines ?? [])]
      .filter((c: any) => !c.is_ab_passthrough)
      .map((c: any) => {
        const real = Number(c.actual_amount || 0);
        const beRaw = Number(c.break_even_amount || 0);
        // Mesmo fallback usado em computeScenarioCosts para o cenário BE:
        // se a coluna BE estiver a 0 assume custos = reais (a alavanca é só a receita).
        const be = beRaw > 0 ? beRaw : (real || Number(c.prior_year_amount || 0) || Number(c.forecast_amount || 0));
        const fc = Number(c.forecast_amount || 0);
        return {
          label: c.label || "—",
          indent: true as const,
          values: [real, be, fc] as [number, number, number],
        };
      })
      .filter((c) => c.values.some((v) => v > 0))
      .sort((a, b) => b.values[0] - a.values[0])
      .slice(0, 7);

    // TM A&B aberto em Bebidas + Alimentos (denominador = público presença + cortesia)
    const denom = (rev: any, kpis: any) => {
      const d = (rev?.attendanceQty ?? 0) + (rev?.attendanceCourtesyQty ?? 0);
      return d > 0 ? d : (kpis?.totalPublic ?? 0);
    };
    const tmDrink = (rev: any, kpis: any) => {
      const d = denom(rev, kpis);
      return d > 0 ? Number(rev?.drinkRevenue || 0) / d : 0;
    };
    const tmFood = (rev: any, kpis: any) => {
      const d = denom(rev, kpis);
      return d > 0 ? Number(rev?.foodRevenue || 0) / d : 0;
    };

    return [
      { label: "Receitas", sectionHeader: "revenue" },
      { label: "Bilheteira", indent: true, values: [today.ticketsRevenue, breakeven.ticketsRevenue, forecast.ticketsRevenue] },
      { label: "A&B", indent: true, values: [
        (today.drinkRevenue || 0) + (today.foodRevenue || 0),
        (breakeven.drinkRevenue || 0) + (breakeven.foodRevenue || 0),
        (forecast.drinkRevenue || 0) + (forecast.foodRevenue || 0),
      ] },
      { label: "Patrocínios", indent: true, values: [today.sponsorRevenue, breakeven.sponsorRevenue, forecast.sponsorRevenue] },
      { label: "Souvenir", indent: true, values: [today.souvenirRevenue, breakeven.souvenirRevenue, forecast.souvenirRevenue] },
      { label: "Outros", indent: true, values: [today.otherCredits, breakeven.otherCredits, forecast.otherCredits] },
      {
        label: "RECEITA TOTAL", bold: true, separator: true,
        values: [today.totalRevenue, breakeven.totalRevenue, forecast.totalRevenue],
        delta: today.totalRevenue > 0 ? ((forecast.totalRevenue - today.totalRevenue) / today.totalRevenue) * 100 : 0,
        deltaType: "pct",
      },
      { label: "Custos", sectionHeader: "cost" },
      ...topCosts,
      {
        label: "CUSTO TOTAL", bold: true, separator: true,
        values: [todayCosts.totalCost, beCosts.totalCost, fcCosts.totalCost],
      },
      {
        label: "RESULTADO", bold: true, separator: true,
        values: [todayRes.general, beRes.general, fcRes.general],
        tone: todayRes.general >= 0 ? "positive" : "negative",
        delta: fcRes.general - todayRes.general,
        deltaType: "value",
      },
      { label: "Indicadores por pessoa", sectionHeader: "kpis" },
      { label: "TM Bilhetes", indent: true, values: [todayKpis.tmTickets, beKpis.tmTickets, fcKpis.tmTickets] },
      { label: "TM A&B Bebidas", indent: true, values: [tmDrink(today, todayKpis), tmDrink(breakeven, beKpis), tmDrink(forecast, fcKpis)] },
      { label: "TM A&B Alimentos", indent: true, values: [tmFood(today, todayKpis), tmFood(breakeven, beKpis), tmFood(forecast, fcKpis)] },
      { label: "Custo / pessoa", indent: true, values: [todayKpis.costPerPerson, beKpis.costPerPerson, fcKpis.costPerPerson] },
      {
        label: "Resultado / pessoa", indent: true,
        tone: todayKpis.resultPerPerson >= 0 ? "positive" : "negative",
        values: [todayKpis.resultPerPerson, beKpis.resultPerPerson, fcKpis.resultPerPerson],
      },
    ];
  }, [today, breakeven, forecast, todayCosts, beCosts, fcCosts, todayRes, beRes, fcRes, todayKpis, beKpis, fcKpis, costLines]);

  // -------- Hero metrics --------
  const pctForecast = forecast.totalRevenue > 0
    ? Math.round((today.totalRevenue / forecast.totalRevenue) * 100)
    : 0;
  const pctPubForecast = fcTargetQty > 0
    ? Math.min(100, Math.round((todayPres / fcTargetQty) * 100))
    : 0;
  const margemPct = sel.rev.totalRevenue > 0
    ? (sel.res.general / sel.rev.totalRevenue) * 100
    : 0;
  const resultDelta = fcRes.general - todayRes.general;

  // -------- Export PDF --------
  const handleExport = async () => {
    if (!rootRef.current) return;
    const wrapper = rootRef.current.closest('[data-theme="financial"]') as HTMLElement | null;
    setExporting(true);
    wrapper?.classList.add("pdf-rendering");
    try {
      await exportNodeToPdf(
        rootRef.current,
        `Dashboard_${eventName || "evento"}_${SCEN_LABELS[active]}.pdf`,
        {
          orientation: "l",
          title: `${eventName} — Dashboard Executivo`,
          subtitle: `Cenário ${SCEN_LABELS[active]} · ${new Date().toLocaleDateString("pt-PT")} · Real · Break Even · Forecast`,
          forceWidth: 1000,
        },
      );
      toast({ title: "PDF exportado", description: `Dashboard executivo (${SCEN_LABELS[active]})` });
    } catch (e: any) {
      toast({ title: "Erro a exportar", description: e.message, variant: "destructive" });
    } finally {
      wrapper?.classList.remove("pdf-rendering");
      setExporting(false);
    }
  };

  return (
    <div data-theme="financial" className="space-y-4">
      {/* CSS scoped — apenas dentro do wrapper */}
      <style>{`
        [data-theme="financial"] .section-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: hsl(var(--muted-foreground));
        }
        [data-theme="financial"].pdf-rendering [class*="backdrop"] {
          backdrop-filter: none !important;
        }
        [data-theme="financial"].pdf-rendering .recharts-wrapper {
          background: transparent !important;
        }
        [data-theme="financial"].pdf-rendering [data-pdf-grid] {
          display: grid !important;
          grid-template-columns: repeat(var(--pdf-cols, 1), minmax(0, 1fr)) !important;
        }
        [data-theme="financial"].pdf-rendering [data-pdf-full] {
          width: 100% !important;
          max-width: none !important;
        }
        [data-theme="financial"].pdf-rendering [data-pdf-compact] {
          gap: 8px !important;
        }
        [data-theme="financial"].pdf-rendering [data-pdf-compact] [class*="rounded-xl"],
        [data-theme="financial"].pdf-rendering [data-pdf-compact] .rounded-lg {
          border-radius: 6px !important;
        }
        [data-theme="financial"].pdf-rendering [data-pdf-compact] [class*="p-4"] {
          padding: 10px !important;
        }
        [data-theme="financial"].pdf-rendering [data-pdf-compact] .text-xs {
          font-size: 10px !important;
          line-height: 1.25 !important;
        }
        [data-theme="financial"] [data-pdf-deck] {
          display: none;
        }
        [data-theme="financial"].pdf-rendering [data-pdf-screen] {
          display: none !important;
        }
        [data-theme="financial"].pdf-rendering [data-pdf-deck] {
          display: block !important;
        }
        [data-theme="financial"].pdf-rendering {
          --background: 0 0% 100%;
          --foreground: 222 47% 11%;
          --card: 0 0% 100%;
          --card-foreground: 222 47% 11%;
          --popover: 0 0% 100%;
          --popover-foreground: 222 47% 11%;
          --muted: 210 40% 96%;
          --muted-foreground: 215 16% 35%;
          --border: 214 32% 88%;
          --input: 214 32% 88%;
          --secondary: 210 40% 96%;
          --secondary-foreground: 222 47% 11%;
          --accent: 210 40% 96%;
          --accent-foreground: 222 47% 11%;
        }
        [data-theme="financial"].pdf-rendering [data-pdf-page] {
          width: 1000px !important;
          min-height: 500px !important;
          padding: 18px !important;
          background: #ffffff !important;
          color: #0f172a !important;
        }
        [data-theme="financial"].pdf-rendering [data-pdf-page] * {
          color-scheme: light !important;
        }
      `}</style>

      {/* TOOLBAR — fora do rootRef */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <ScenarioPill active={active} onChange={setActive} />
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Actualizado em {new Date().toLocaleDateString("pt-PT")}
          </span>
          <Button onClick={handleExport} disabled={exporting} variant="outline" size="sm">
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            <span className="ml-1">PDF</span>
          </Button>
        </div>
      </div>

      {/* CONTEÚDO CAPTURADO PARA PDF */}
      <div ref={rootRef} className="space-y-4 bg-background p-2">
        <div data-pdf-deck>
          <section data-pdf-page className="space-y-3">
            <div className="flex items-end justify-between border-b pb-2">
              <div>
                <h2 className="text-lg font-bold">{eventName || "Evento"}</h2>
                <p className="text-xs text-muted-foreground">
                  Dashboard Executivo · <span className="font-semibold text-foreground">{SCEN_LABELS[active]}</span>
                </p>
              </div>
              <div className="text-right text-[10px] text-muted-foreground">
                {new Date().toLocaleDateString("pt-PT")} · Real · Break Even · Forecast
              </div>
            </div>
            <p className="section-label">Visão geral · cenário {SCEN_LABELS[active]}</p>
            <div data-pdf-grid style={{ "--pdf-cols": 5 } as React.CSSProperties} className="grid grid-cols-5 gap-3">
              <KpiHero label="Resultado Geral" value={fmt(sel.res.general)} tone={sel.res.general >= 0 ? "positive" : "negative"} delta={resultDelta !== 0 ? `${resultDelta >= 0 ? "+" : ""}${fmt(resultDelta)} vs FC` : undefined} deltaPositive={resultDelta >= 0} subtext={reachedBE ? "Break Even atingido" : `Faltam ${fmt(Math.abs(sel.res.general))} para BE`} />
              <KpiHero label="Receita Total" value={fmt(sel.rev.totalRevenue)} tone="neutral" subtext={`${pctForecast}% do Forecast (${fmt(forecast.totalRevenue)})`} progress={pctForecast} progressColor="blue" />
              <KpiHero label="Custo Total" value={fmt(sel.cost.totalCost)} tone="muted" subtext={`Custo/pessoa: ${fmt(sel.kpis.costPerPerson)}`} />
              <KpiHero label="Público Total" value={fmtNum(sel.kpis.totalPublic)} tone="neutral" subtext={`${pctPubForecast}% do alvo (${fmtNum(fcTargetQty)})`} progress={pctPubForecast} progressColor="emerald" />
              <KpiHero label="Margem" value={fmtPct(margemPct)} tone={margemPct >= 0 ? "positive" : "negative"} subtext={`TM: ${fmt(sel.kpis.tmTickets)} · A&B/pp: ${fmt(sel.kpis.tmAB)}`} />
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-4 py-2.5 text-sm">
              <StatusBadge ok={reachedBE} label="Break Even" subtext={reachedBE ? undefined : `Faltam ${fmtNum(needForBE)} bilhetes`} />
              <StatusBadge ok={todayRes.general >= 0} label="Margem" subtext={`Resultado: ${fmt(todayRes.general)}`} />
              <StatusBadge ok={pctPubForecast >= 100 ? true : pctPubForecast >= 60 ? "warn" : false} label={`Forecast: ${pctPubForecast}% atingido`} />
              {abModule.hasConfig && <StatusBadge ok={abMarginReal >= 0} label="A&B" subtext={`Margem A&B: ${fmt(abMarginReal)}`} />}
            </div>
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
              <FinancialTable rows={financialRows} active={active} formatFn={fmt} />
              <div className="flex flex-col gap-3">
                <ProgressKpi label="Presenças × dia" current={todayPres} currentLabel="Real" beTarget={beTargetQty} beLabel="Break Even" fcTarget={fcTargetQty} fcLabel="Forecast" formatFn={fmtNum} footer={(needForBE > 0 ? `Faltam ${fmtNum(needForBE)} presenças para BE` : "Break Even atingido") + ` · 1 Passe N dias = N presenças`} />
                {abModule.hasConfig && abModule.totals && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">A&B — Margem ({SCEN_LABELS[active]})</CardTitle></CardHeader>
                    <CardContent className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Faturação</span><span className="tabular-nums font-semibold">{fmt((abModule.totals as any)[active].faturacaoTotal)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Repasse</span><span className="tabular-nums">{fmt((abModule.totals as any)[active].custoTotal)}</span></div>
                      <div className="mt-1 flex justify-between border-t pt-1"><span className="font-semibold">Resultado A&B</span><span className={`tabular-nums font-semibold ${(abModule.totals as any)[active].resultadoTotal >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{fmt((abModule.totals as any)[active].resultadoTotal)}</span></div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </section>

          {eventId ? (
            <section data-pdf-page>
              <DailyAttendanceCard eventId={eventId} byZone />
            </section>
          ) : null}

          <section data-pdf-page className="space-y-3">
            <p className="section-label">Análise visual · {SCEN_LABELS[active]}</p>
            <div data-pdf-grid style={{ "--pdf-cols": 3 } as React.CSSProperties} className="grid grid-cols-3 gap-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Mix Receitas ({SCEN_LABELS[active]})</CardTitle></CardHeader>
                <CardContent style={{ height: 240 }}>{revenueMixActive.length ? (<div className="grid h-full grid-cols-[1fr_auto] items-center gap-3"><ResponsiveContainer><PieChart><Pie data={revenueMixActive} dataKey="value" nameKey="name" outerRadius={80} innerRadius={50} paddingAngle={2} label={false}>{revenueMixActive.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}</Pie><Tooltip formatter={(v: any) => fmt(Number(v))} /></PieChart></ResponsiveContainer><ul className="flex flex-col gap-1 pr-2 text-[11px]">{revenueMixActive.map((r, i) => { const pct = totalMix > 0 ? (r.value / totalMix) * 100 : 0; return (<li key={r.name} className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} /><span className="text-muted-foreground">{r.name}</span><span className="ml-auto tabular-nums font-semibold">{pct.toFixed(0)}%</span></li>); })}</ul></div>) : (<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sem dados</div>)}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Custos — Top categorias</CardTitle></CardHeader>
                <CardContent style={{ height: 240 }}>{costsCompareChart.length ? (<ResponsiveContainer><BarChart data={costsCompareChart} layout="vertical" margin={{ left: 60 }}><CartesianGrid strokeDasharray="3 3" opacity={0.04} /><XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} /><YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={110} /><Tooltip formatter={(v: any) => fmt(Number(v))} /><Bar dataKey="Real" fill="#3b82f6" radius={[3, 3, 0, 0]} /><Bar dataKey="BE" fill="#f59e0b" radius={[3, 3, 0, 0]} /><Bar dataKey="Forecast" fill="#10b981" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>) : (<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sem custos</div>)}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Público diário</CardTitle></CardHeader>
                <CardContent style={{ height: 240 }}>{dailyChart.length ? (<ResponsiveContainer><BarChart data={dailyChart}><CartesianGrid strokeDasharray="3 3" opacity={0.04} /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="Pagantes" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} /><Bar dataKey="Cortesias" stackId="a" fill="#a855f7" radius={[3, 3, 0, 0]} />{dailyCapacity ? (<ReferenceLine y={dailyCapacity} stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.6} label={{ value: "Cap.", fill: "#f59e0b", fontSize: 9 }} />) : null}</BarChart></ResponsiveContainer>) : (<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sem dados</div>)}</CardContent>
              </Card>
            </div>
          </section>
        </div>

        <div data-pdf-screen className="space-y-4">
        {/* Cabeçalho do PDF */}
        <div data-pdf-section className="flex items-end justify-between border-b pb-2">
          <div>
            <h2 className="text-lg font-bold">{eventName || "Evento"}</h2>
            <p className="text-xs text-muted-foreground">
              Dashboard Executivo ·{" "}
              <span className="font-semibold text-foreground">{SCEN_LABELS[active]}</span>
            </p>
          </div>
          <div className="text-right text-[10px] text-muted-foreground">
            {new Date().toLocaleDateString("pt-PT")} · Real · Break Even · Forecast
          </div>
        </div>

        {/* ZONA 1 — HERO STRIP */}
        <section data-pdf-section data-pdf-compact>
          <p className="section-label mb-2">Visão geral · cenário {SCEN_LABELS[active]}</p>
          <div data-pdf-grid style={{ "--pdf-cols": 5 } as React.CSSProperties} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiHero
              label="Resultado Geral"
              value={fmt(sel.res.general)}
              tone={sel.res.general >= 0 ? "positive" : "negative"}
              delta={resultDelta !== 0 ? `${resultDelta >= 0 ? "+" : ""}${fmt(resultDelta)} vs FC` : undefined}
              deltaPositive={resultDelta >= 0}
              subtext={
                reachedBE
                  ? "Break Even atingido"
                  : `Faltam ${fmt(Math.abs(sel.res.general))} para BE`
              }
            />
            <KpiHero
              label="Receita Total"
              value={fmt(sel.rev.totalRevenue)}
              tone="neutral"
              subtext={`${pctForecast}% do Forecast (${fmt(forecast.totalRevenue)})`}
              progress={pctForecast}
              progressColor="blue"
            />
            <KpiHero
              label="Custo Total"
              value={fmt(sel.cost.totalCost)}
              tone="muted"
              subtext={`Custo/pessoa: ${fmt(sel.kpis.costPerPerson)}`}
            />
            <KpiHero
              label="Público Total"
              value={fmtNum(sel.kpis.totalPublic)}
              tone="neutral"
              subtext={`${pctPubForecast}% do alvo (${fmtNum(fcTargetQty)})`}
              progress={pctPubForecast}
              progressColor="emerald"
            />
            <KpiHero
              label="Margem"
              value={fmtPct(margemPct)}
              tone={margemPct >= 0 ? "positive" : "negative"}
              subtext={`TM: ${fmt(sel.kpis.tmTickets)} · A&B/pp: ${fmt(sel.kpis.tmAB)}`}
            />
          </div>
        </section>

        {/* ZONA 2 — STATUS BAR */}
        <div data-pdf-section data-pdf-compact className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-4 py-2.5 text-sm">
          <StatusBadge
            ok={reachedBE}
            label="Break Even"
            subtext={reachedBE ? undefined : `Faltam ${fmtNum(needForBE)} bilhetes`}
          />
          <StatusBadge
            ok={todayRes.general >= 0}
            label="Margem"
            subtext={`Resultado: ${fmt(todayRes.general)}`}
          />
          <StatusBadge
            ok={pctPubForecast >= 100 ? true : pctPubForecast >= 60 ? "warn" : false}
            label={`Forecast: ${pctPubForecast}% atingido`}
          />
          {abModule.hasConfig && (
            <StatusBadge
              ok={abMarginReal >= 0}
              label="A&B"
              subtext={`Margem A&B: ${fmt(abMarginReal)}`}
            />
          )}
        </div>

        {/* ZONA 3 — FINANCIAL TABLE + KPI STACK */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div data-pdf-section data-pdf-full>
            <FinancialTable rows={financialRows} active={active} formatFn={fmt} />
          </div>
          <div data-pdf-section data-pdf-full data-pdf-compact className="flex flex-col gap-3">
            <ProgressKpi
              label="Presenças × dia"
              current={todayPres}
              currentLabel="Real"
              beTarget={beTargetQty}
              beLabel="Break Even"
              fcTarget={fcTargetQty}
              fcLabel="Forecast"
              formatFn={fmtNum}
              footer={
                (needForBE > 0
                  ? `Faltam ${fmtNum(needForBE)} presenças para BE`
                  : "Break Even atingido") +
                ` · 1 Passe N dias = N presenças (sem dupla contagem)`
              }
            />
            {abModule.hasConfig && abModule.totals && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">A&B — Margem ({SCEN_LABELS[active]})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Faturação</span>
                    <span className="tabular-nums font-semibold">
                      {fmt((abModule.totals as any)[active].faturacaoTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Repasse</span>
                    <span className="tabular-nums">
                      {fmt((abModule.totals as any)[active].custoTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span className="font-semibold">Resultado A&B</span>
                    <span
                      className={`tabular-nums font-semibold ${
                        (abModule.totals as any)[active].resultadoTotal >= 0
                          ? "text-emerald-500"
                          : "text-rose-500"
                      }`}
                    >
                      {fmt((abModule.totals as any)[active].resultadoTotal)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* ZONA 3.5 — Público por dia */}
        {eventId ? (
          <div data-pdf-section data-pdf-break-before>
            <DailyAttendanceCard eventId={eventId} dailyCapacity={dailyCapacity} beDailyTotals={beDailyTotals} fcDailyTotals={fcDailyTotals} />
          </div>
        ) : null}

        {/* ZONA 4 — GRÁFICOS */}
        <div data-pdf-section data-pdf-grid data-pdf-break-before style={{ "--pdf-cols": 3 } as React.CSSProperties} className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {/* Donut Mix Receitas */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Mix Receitas ({SCEN_LABELS[active]})</CardTitle>
            </CardHeader>
            <CardContent style={{ height: 240 }}>
              {revenueMixActive.length ? (
                <div className="grid grid-cols-[1fr_auto] gap-3 h-full items-center">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={revenueMixActive}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={80}
                        innerRadius={50}
                        paddingAngle={2}
                        label={false}
                      >
                        {revenueMixActive.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="flex flex-col gap-1 text-[11px] pr-2">
                    {revenueMixActive.map((r, i) => {
                      const pct = totalMix > 0 ? (r.value / totalMix) * 100 : 0;
                      return (
                        <li key={r.name} className="flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 rounded-sm"
                            style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                          <span className="text-muted-foreground">{r.name}</span>
                          <span className="ml-auto tabular-nums font-semibold">
                            {pct.toFixed(0)}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Sem dados
                </div>
              )}
            </CardContent>
          </Card>

          {/* BarChart custos */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Custos — Top categorias</CardTitle>
            </CardHeader>
            <CardContent style={{ height: 240 }}>
              {costsCompareChart.length ? (
                <ResponsiveContainer>
                  <BarChart data={costsCompareChart} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.04} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={110} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Bar dataKey="Real" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="BE" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Forecast" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Sem custos
                </div>
              )}
            </CardContent>
          </Card>

          {/* BarChart público */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Público diário</CardTitle>
            </CardHeader>
            <CardContent style={{ height: 240 }}>
              {dailyChart.length ? (
                <ResponsiveContainer>
                  <BarChart data={dailyChart}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.04} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="Pagantes" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Cortesias" stackId="a" fill="#a855f7" radius={[3, 3, 0, 0]} />
                    {dailyCapacity ? (
                      <ReferenceLine
                        y={dailyCapacity}
                        stroke="#f59e0b"
                        strokeDasharray="4 3"
                        strokeOpacity={0.6}
                        label={{ value: "Cap.", fill: "#f59e0b", fontSize: 9 }}
                      />
                    ) : null}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Sem dados
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ZONA 5 — HEATMAP CIDADES (turnê) */}
        {tourBreakdowns && tourBreakdowns.length > 0 && (
          <section data-pdf-section>
            <p className="section-label mb-3">Comparativo entre cidades · {SCEN_LABELS[active]}</p>
            <div data-pdf-grid style={{ "--pdf-cols": 4 } as React.CSSProperties} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tourBreakdowns.map((c) => (
                <CityHeatCard key={c.name} {...c} formatFn={fmt} fmtNum={fmtNum} />
              ))}
            </div>
          </section>
        )}
        </div>
      </div>
    </div>
  );
}
