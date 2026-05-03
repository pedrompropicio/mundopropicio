/**
 * Executive Dashboard do Simulador — vista executiva em painel de controlo.
 *
 * Layout: grid responsivo de cards independentes. Cada card mostra os 3
 * cenários (Real / Break Even / Forecast) lado-a-lado para comparação directa.
 *
 * Não duplica inputs: consome os mesmos dados já calculados em EventSimulator
 * (rev/cost/res/kpis × 3 cenários) + o módulo A&B canónico.
 *
 * Export PDF: captura o nó DOM via exportNodeToPdf (html2canvas + jsPDF) em
 * formato A4 landscape.
 */
import React, { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid, LineChart, Line,
} from "recharts";
import { FileText, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { exportNodeToPdf } from "@/lib/event-simulator-view-pdf";
import { toast } from "@/hooks/use-toast";
import DailyAttendanceCard from "@/components/simulator/DailyAttendanceCard";

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
  // 3 cenários
  today: any; todayCosts: any; todayRes: any; todayKpis: any;
  breakeven: any; beCosts: any; beRes: any; beKpis: any;
  forecast: any; fcCosts: any; fcRes: any; fcKpis: any;
  // raw data
  costLines: any[];
  dailyTotals: any[];
  ivaTable: any[];
  sessions: { day_index: number; zone_label: string; real_sales_qty: number; real_sales_revenue: number; courtesy_qty: number }[];
  abModule: { hasConfig: boolean; totals: { real: any; breakeven: any; forecast: any } | null };
  beSolution?: { totalQty?: number; totalRevenue?: number };
  fcSolution?: { totalQty?: number; totalRevenue?: number };
  /** ID do evento — para puxar público/dia canónico (Simples vs Combo expandido). */
  eventId?: string;
  /** Capacidade total por dia (soma das zonas) — opcional, para mostrar ocupação. */
  dailyCapacity?: number;
  /** Comparativo entre cidades (apenas para vista Master/Turnê). */
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

/* Tone-aware number cell */
function Money({ v, signed = false }: { v: number; signed?: boolean }) {
  const ok = v >= 0;
  return (
    <span
      className={`tabular-nums font-semibold ${signed ? (ok ? "text-emerald-500" : "text-rose-500") : ""}`}
    >
      {fmt(v)}
    </span>
  );
}
function Pct({ v }: { v: number }) {
  const ok = v >= 0;
  return (
    <span className={`tabular-nums font-semibold ${ok ? "text-emerald-500" : "text-rose-500"}`}>
      {fmtPct(v)}
    </span>
  );
}

/** Card de 3 colunas (Real / BE / Forecast) com linhas KPI. */
function CompareCard({
  title,
  rows,
  active,
}: {
  title: string;
  active: ScenarioKey;
  rows: { label: string; values: [React.ReactNode, React.ReactNode, React.ReactNode]; bold?: boolean }[];
}) {
  const activeIdx = (["real", "breakeven", "forecast"] as ScenarioKey[]).indexOf(active);
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{title}</CardTitle>
          <Badge variant="outline" className="text-[10px] shrink-0 sm:hidden">
            {SCEN_LABELS[active]}
          </Badge>
          <Badge variant="outline" className="text-[10px] shrink-0 hidden sm:inline-flex">
            destaque: {SCEN_LABELS[active]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Mobile: 2 colunas (label + cenário activo) */}
        <div className="grid grid-cols-[1fr_auto] gap-x-2 text-xs sm:hidden">
          {rows.map((r, i) => (
            <React.Fragment key={i}>
              <div className={`py-1 ${r.bold ? "font-semibold" : "text-muted-foreground"}`}>
                {r.label}
              </div>
              <div className="py-1 text-right tabular-nums">
                {r.values[activeIdx]}
              </div>
            </React.Fragment>
          ))}
        </div>
        {/* Desktop: 4 colunas comparação */}
        <div className="hidden sm:grid grid-cols-[1fr_repeat(3,minmax(0,1fr))] gap-x-2 text-xs">
          <div />
          {(["real", "breakeven", "forecast"] as ScenarioKey[]).map((k) => (
            <div
              key={k}
              className={`text-right text-[10px] uppercase tracking-wide pb-1 ${
                k === active ? "text-primary font-semibold" : "text-muted-foreground"
              }`}
            >
              {SCEN_LABELS[k]}
            </div>
          ))}
          {rows.map((r, i) => (
            <React.Fragment key={i}>
              <div className={`py-1 ${r.bold ? "font-semibold" : "text-muted-foreground"}`}>
                {r.label}
              </div>
              {r.values.map((v, j) => (
                <div
                  key={j}
                  className={`py-1 text-right ${
                    (["real", "breakeven", "forecast"] as ScenarioKey[])[j] === active
                      ? "bg-muted/40 rounded-sm px-1"
                      : ""
                  }`}
                >
                  {v}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ExecutiveDashboard(props: Props) {
  const {
    eventName, today, todayCosts, todayRes, todayKpis,
    breakeven, beCosts, beRes, beKpis,
    forecast, fcCosts, fcRes, fcKpis,
    costLines, dailyTotals, sessions, abModule, beSolution, fcSolution, tourBreakdowns,
    eventId, dailyCapacity,
  } = props;

  const [active, setActive] = useState<ScenarioKey>("real");
  const [exporting, setExporting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // -------- Selecção do trio activo (para tons / destaques) --------
  const sel = useMemo(() => {
    const map = {
      real: { rev: today, cost: todayCosts, res: todayRes, kpis: todayKpis },
      breakeven: { rev: breakeven, cost: beCosts, res: beRes, kpis: beKpis },
      forecast: { rev: forecast, cost: fcCosts, res: fcRes, kpis: fcKpis },
    };
    return map[active];
  }, [active, today, todayCosts, todayRes, todayKpis, breakeven, beCosts, beRes, beKpis, forecast, fcCosts, fcRes, fcKpis]);

  // -------- TM por zona (Pista/VIP com fallback às 2 primeiras) --------
  const zoneTm = useMemo(() => {
    const acc = new Map<string, { qty: number; rev: number }>();
    for (const s of sessions ?? []) {
      const k = (s.zone_label || "").trim();
      if (!k) continue;
      const cur = acc.get(k) ?? { qty: 0, rev: 0 };
      cur.qty += Number(s.real_sales_qty || 0);
      cur.rev += Number(s.real_sales_revenue || 0);
      acc.set(k, cur);
    }
    const all = Array.from(acc.entries()).map(([name, v]) => ({
      name,
      tm: v.qty > 0 ? v.rev / v.qty : 0,
      qty: v.qty,
    }));
    const findCi = (needle: string) =>
      all.find((z) => z.name.toLowerCase().includes(needle));
    const pista = findCi("pista") ?? all[0] ?? { name: "—", tm: 0, qty: 0 };
    const vip =
      findCi("vip") ?? all.find((z) => z.name !== pista.name) ?? { name: "—", tm: 0, qty: 0 };
    return { pista, vip };
  }, [sessions]);

  const courtesyTotal = useMemo(
    () => (sessions ?? []).reduce((a, s) => a + Number(s.courtesy_qty || 0), 0),
    [sessions],
  );
  const realSalesTotal = useMemo(
    () => (sessions ?? []).reduce((a, s) => a + Number(s.real_sales_qty || 0), 0),
    [sessions],
  );

  // -------- Break-even faltam --------
  const beTargetQty = Number(beSolution?.totalQty ?? beKpis?.totalPublic ?? 0);
  const fcTargetQty = Number(fcSolution?.totalQty ?? fcKpis?.totalPublic ?? 0);
  const needForBE = Math.max(0, Math.round(beTargetQty - todayKpis.totalPublic));
  // BE "sem A&B": ignora a margem A&B → mais ingressos necessários (proxy: usa beRes − margemAB / TM)
  const abMarginReal =
    abModule.hasConfig && abModule.totals ? abModule.totals.real.resultadoTotal : 0;
  const tmBilheteira = todayKpis.tmTickets || 0;
  const needForBeNoAB = needForBE + (tmBilheteira > 0 ? Math.ceil(abMarginReal / tmBilheteira) : 0);
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

  const costsCompareChart = useMemo(() => {
    const top = [...(costLines ?? [])]
      .filter((c: any) => !c.is_ab_passthrough)
      .map((c: any) => ({
        name: c.label || "—",
        Real: Number(c.actual_amount || 0),
        BE: Number(c.break_even_amount || 0),
        Forecast: Number(c.forecast_amount || 0),
      }))
      .filter((c) => c.Real + c.BE + c.Forecast > 0)
      .sort((a, b) => b.Real - a.Real)
      .slice(0, 8);
    return top;
  }, [costLines]);

  const dailyChart = (dailyTotals ?? []).map(([d, t]: any) => ({
    name: t.date ?? `Dia ${d + 1}`,
    Pagantes: t.paying,
    Cortesias: t.courtesy,
  }));

  // -------- Export PDF --------
  const handleExport = async () => {
    if (!rootRef.current) return;
    setExporting(true);
    try {
      await exportNodeToPdf(
        rootRef.current,
        `Dashboard_${eventName || "evento"}_${SCEN_LABELS[active]}.pdf`,
        {
          orientation: "l",
          title: `${eventName} — Dashboard Executivo · ${SCEN_LABELS[active]} · ${new Date().toLocaleDateString("pt-PT")}`,
        },
      );
      toast({ title: "PDF exportado", description: `Dashboard executivo (${SCEN_LABELS[active]})` });
    } catch (e: any) {
      toast({ title: "Erro a exportar", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // -------- Helpers row builders --------
  const rev3 = [today, breakeven, forecast];
  const cost3 = [todayCosts, beCosts, fcCosts];
  const res3 = [todayRes, beRes, fcRes];
  const kpis3 = [todayKpis, beKpis, fcKpis];
  const ab3 =
    abModule.hasConfig && abModule.totals
      ? [abModule.totals.real, abModule.totals.breakeven, abModule.totals.forecast]
      : null;

  return (
    <div className="space-y-4">
      {/* Toolbar (não vai para o PDF) */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex w-full gap-1 rounded-md border p-1 sm:w-auto">
          {(["real", "breakeven", "forecast"] as ScenarioKey[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={active === k ? "default" : "ghost"}
              onClick={() => setActive(k)}
              className="h-8 flex-1 sm:flex-none text-xs px-2"
            >
              {SCEN_LABELS[k]}
            </Button>
          ))}
        </div>
        <Button onClick={handleExport} disabled={exporting} variant="outline" size="sm" className="w-full sm:w-auto">
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileText className="mr-2 h-4 w-4" />
          )}
          <span className="sm:hidden">PDF</span>
          <span className="hidden sm:inline">Exportar PDF (landscape)</span>
        </Button>
      </div>

      {/* Conteúdo capturado para PDF */}
      <div ref={rootRef} className="space-y-3 bg-background p-2">
        {/* Cabeçalho do PDF */}
        <div className="flex flex-col gap-1 border-b pb-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold">{eventName || "Evento"}</h2>
            <p className="text-[11px] sm:text-xs text-muted-foreground">
              Dashboard Executivo · Cenário:{" "}
              <span className="font-semibold text-foreground">{SCEN_LABELS[active]}</span>
            </p>
          </div>
          <div className="text-left sm:text-right text-[10px] text-muted-foreground">
            <div>Exportado em {new Date().toLocaleDateString("pt-PT")}</div>
            <div className="hidden sm:block">Comparação: Real · Break Even · Forecast</div>
          </div>
        </div>

        {/* Linha 1 — Resumo Financeiro · Bilhética · Receitas */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <CompareCard
            title="Resumo Financeiro"
            active={active}
            rows={[
              {
                label: "Faturamento Total",
                values: rev3.map((r) => <Money key="" v={r.totalRevenue} />) as any,
                bold: true,
              },
              {
                label: "Custo Total",
                values: cost3.map((c) => <Money key="" v={c.totalCost} />) as any,
              },
              {
                label: "Resultado Geral",
                values: res3.map((r) => <Money key="" v={r.general} signed />) as any,
                bold: true,
              },
              {
                label: "Resultado / pessoa",
                values: kpis3.map((k) => <Money key="" v={k.resultPerPerson} signed />) as any,
              },
              {
                label: "Margem",
                values: rev3.map((r, i) => (
                  <Pct key="" v={r.totalRevenue > 0 ? (res3[i].general / r.totalRevenue) * 100 : 0} />
                )) as any,
                bold: true,
              },
            ]}
          />

          <CompareCard
            title="Bilhética"
            active={active}
            rows={[
              {
                label: "Total Participantes",
                values: kpis3.map((k) => (
                  <span key="" className="tabular-nums font-semibold">
                    {fmtNum(k.totalPublic)}
                  </span>
                )) as any,
                bold: true,
              },
              {
                label: `TM ${zoneTm.pista.name}`,
                values: [
                  <Money key="" v={zoneTm.pista.tm} />,
                  <span key="" className="text-muted-foreground">—</span>,
                  <span key="" className="text-muted-foreground">—</span>,
                ],
              },
              {
                label: `TM ${zoneTm.vip.name}`,
                values: [
                  <Money key="" v={zoneTm.vip.tm} />,
                  <span key="" className="text-muted-foreground">—</span>,
                  <span key="" className="text-muted-foreground">—</span>,
                ],
              },
              {
                label: "Vendas Reais (qty)",
                values: [
                  <span key="" className="tabular-nums font-semibold">{fmtNum(realSalesTotal)}</span>,
                  <span key="" className="text-muted-foreground">—</span>,
                  <span key="" className="text-muted-foreground">—</span>,
                ],
              },
              {
                label: "Cortesias",
                values: [
                  <span key="" className="tabular-nums">{fmtNum(courtesyTotal)}</span>,
                  <span key="" className="text-muted-foreground">—</span>,
                  <span key="" className="text-muted-foreground">—</span>,
                ],
              },
              {
                label: "Projeção (qty alvo)",
                values: [
                  <span key="" className="tabular-nums">{fmtNum(todayKpis.totalPublic)}</span>,
                  <span key="" className="tabular-nums font-semibold">{fmtNum(beTargetQty)}</span>,
                  <span key="" className="tabular-nums font-semibold">{fmtNum(fcTargetQty)}</span>,
                ],
              },
            ]}
          />

          <CompareCard
            title="Receitas"
            active={active}
            rows={(() => {
              const lines = [
                { key: "ticketsRevenue", label: "Ingressos" },
                { key: "abRevenue", label: "A&B" },
                { key: "sponsorRevenue", label: "Patrocínios" },
                { key: "souvenirRevenue", label: "Souvenir" },
                { key: "otherCredits", label: "Outros Créditos" },
              ];
              const v = (r: any, k: string) =>
                k === "abRevenue" ? (r.drinkRevenue || 0) + (r.foodRevenue || 0) : r[k] || 0;
              return [
                ...lines.map((l) => ({
                  label: l.label,
                  values: rev3.map((r) => {
                    const val = v(r, l.key);
                    const pct = r.totalRevenue > 0 ? (val / r.totalRevenue) * 100 : 0;
                    return (
                      <span key="">
                        <Money v={val} />
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({pct.toFixed(0)}%)
                        </span>
                      </span>
                    );
                  }) as any,
                })),
                {
                  label: "Total",
                  bold: true,
                  values: rev3.map((r) => <Money key="" v={r.totalRevenue} />) as any,
                },
              ];
            })()}
          />
        </div>

        {/* Linha 2 — Custos · A&B · Indicadores por pessoa */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <CompareCard
            title="Custos"
            active={active}
            rows={(() => {
              const top = [...(costLines ?? [])]
                .filter((c: any) => !c.is_ab_passthrough)
                .map((c: any) => ({
                  label: c.label || "—",
                  real: Number(c.actual_amount || 0),
                  be: Number(c.break_even_amount || 0),
                  fc: Number(c.forecast_amount || 0),
                }))
                .filter((c) => c.real + c.be + c.fc > 0)
                .sort((a, b) => b.real - a.real)
                .slice(0, 7);
              return [
                ...top.map((c) => ({
                  label: c.label,
                  values: [c.real, c.be, c.fc].map((val, i) => {
                    const tot = [todayCosts.totalCost, beCosts.totalCost, fcCosts.totalCost][i];
                    const pct = tot > 0 ? (val / tot) * 100 : 0;
                    return (
                      <span key="">
                        <Money v={val} />
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({pct.toFixed(0)}%)
                        </span>
                      </span>
                    );
                  }) as any,
                })),
                {
                  label: "Total Custos",
                  bold: true,
                  values: cost3.map((c) => <Money key="" v={c.totalCost} />) as any,
                },
              ];
            })()}
          />

          {ab3 ? (
            <CompareCard
              title="A&B (módulo dedicado)"
              active={active}
              rows={[
                {
                  label: "Faturação Total A&B",
                  values: ab3.map((a) => <Money key="" v={a.faturacaoTotal} />) as any,
                  bold: true,
                },
                {
                  label: "Receita do Evento",
                  values: ab3.map((a) => <Money key="" v={a.receitaTotal} />) as any,
                },
                {
                  label: "Custo Repasse",
                  values: ab3.map((a) => <Money key="" v={a.custoTotal} />) as any,
                },
                {
                  label: "Resultado A&B",
                  values: ab3.map((a) => <Money key="" v={a.resultadoTotal} signed />) as any,
                  bold: true,
                },
                {
                  label: "Margem A&B",
                  values: ab3.map((a) => <Pct key="" v={a.margemPct} />) as any,
                  bold: true,
                },
              ]}
            />
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">A&B</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Módulo A&B não configurado para este evento. Abre a aba <strong>A&B</strong> para
                definir zonas, per capita e repasses.
              </CardContent>
            </Card>
          )}

          <CompareCard
            title="Indicadores por pessoa"
            active={active}
            rows={[
              {
                label: "TM Ingresso",
                values: kpis3.map((k) => <Money key="" v={k.tmTickets} />) as any,
              },
              {
                label: "TM A&B",
                values: kpis3.map((k) => <Money key="" v={k.tmAB} />) as any,
              },
              {
                label: "Custo / pessoa",
                values: kpis3.map((k) => <Money key="" v={k.costPerPerson} />) as any,
              },
              {
                label: "Resultado / pessoa",
                values: kpis3.map((k) => <Money key="" v={k.resultPerPerson} signed />) as any,
                bold: true,
              },
            ]}
          />
        </div>

        {/* Linha 3 — Break-even (largura cheia, com KPIs grandes) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Break Even
              {reachedBE ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Atingido
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" /> Por atingir
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-md border p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Bilhetes em falta (com A&B)
                </div>
                <div
                  className={`mt-1 text-2xl font-bold tabular-nums ${
                    needForBE === 0 ? "text-emerald-500" : "text-rose-500"
                  }`}
                >
                  {fmtNum(needForBE)}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Bilhetes em falta (sem A&B)
                </div>
                <div
                  className={`mt-1 text-2xl font-bold tabular-nums ${
                    needForBeNoAB === 0 ? "text-emerald-500" : "text-rose-500"
                  }`}
                >
                  {fmtNum(needForBeNoAB)}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Resultado actual
                </div>
                <div
                  className={`mt-1 text-2xl font-bold tabular-nums ${
                    todayRes.general >= 0 ? "text-emerald-500" : "text-rose-500"
                  }`}
                >
                  {fmt(todayRes.general)}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Margem A&B (Real)
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {fmt(abMarginReal)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Linha 4 — Gráficos */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Receitas — Mix ({SCEN_LABELS[active]})
              </CardTitle>
            </CardHeader>
            <CardContent style={{ height: 240 }}>
              {revenueMixActive.length ? (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={revenueMixActive}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={75}
                      label={(e: any) => `${e.name}`}
                    >
                      {revenueMixActive.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Sem dados
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Custos — Top categorias (3 cenários)</CardTitle>
            </CardHeader>
            <CardContent style={{ height: 240 }}>
              {costsCompareChart.length ? (
                <ResponsiveContainer>
                  <BarChart data={costsCompareChart} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={110} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Real" fill="#3b82f6" />
                    <Bar dataKey="BE" fill="#f59e0b" />
                    <Bar dataKey="Forecast" fill="#84cc16" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Sem custos
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Público diário (Real)</CardTitle>
            </CardHeader>
            <CardContent style={{ height: 240 }}>
              {dailyChart.length ? (
                <ResponsiveContainer>
                  <BarChart data={dailyChart}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Pagantes" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="Cortesias" stackId="a" fill="#a855f7" />
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

        {/* Comparativo entre cidades (apenas turnê) */}
        {tourBreakdowns && tourBreakdowns.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Comparativo entre cidades — Forecast</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-1">Cidade</th>
                      <th className="text-right">Público</th>
                      <th className="text-right">TM</th>
                      <th className="text-right">A&B/pp</th>
                      <th className="text-right">Margem</th>
                      <th className="text-right">BE (qty)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tourBreakdowns.map((c) => (
                      <tr key={c.name} className="border-b">
                        <td className="py-1 font-medium">{c.name}</td>
                        <td className="text-right tabular-nums">{fmtNum(c.publico)}</td>
                        <td className="text-right tabular-nums">{fmt(c.ticketMedio)}</td>
                        <td className="text-right tabular-nums">{fmt(c.abPerPerson)}</td>
                        <td className={`text-right tabular-nums ${c.resultado >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{fmtPct(c.margem)}</td>
                        <td className="text-right tabular-nums">{fmtNum(c.breakEvenQty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Resultado por cidade — Forecast</CardTitle>
              </CardHeader>
              <CardContent style={{ height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={tourBreakdowns}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="receita" name="Receita" fill="#3b82f6" />
                    <Bar dataKey="custo" name="Custo" fill="#f59e0b" />
                    <Bar dataKey="resultado" name="Resultado" fill="#84cc16" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
