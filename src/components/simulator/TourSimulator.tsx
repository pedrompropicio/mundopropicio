/**
 * TourSimulator — vista do Simulador para um evento Master de turnê.
 *
 * Estrutura:
 *  - Tabs: 1 por cidade (Split) em modo READ-ONLY + tab "Turnê — Consolidado".
 *  - Cidades: usam `useCitySimulator(splitId)` e mostram KPIs dos 3 cenários.
 *    Para EDITAR parâmetros, o user navega ao Simulador da cidade.
 *  - Consolidado: agrega receitas/custos/resultado de todas as cidades + extras
 *    do Master (patrocínios turnê via BP + custos partilhados via
 *    `event_simulator_cost_lines` do Master). Não duplica valores.
 */
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, ExternalLink, Calculator } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { useCitySimulator } from "@/hooks/useCitySimulator";
import ExecutiveDashboard from "@/components/simulator/ExecutiveDashboard";

const fmt = (v: number) => formatCurrency(Number.isFinite(v) ? v : 0);
const fmtNum = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-PT", { maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${(Number.isFinite(v) ? v : 0).toFixed(1)}%`;

type ScenarioKey = "real" | "breakeven" | "forecast";
const SCEN_LABELS: Record<ScenarioKey, string> = {
  real: "Real (Hoje)",
  breakeven: "Break Even",
  forecast: "Forecast",
};

interface Props {
  masterEvent: any;
  splits: { id: string; name: string }[];
}

/* ---------- Vista compacta de UMA cidade (read-only) ---------- */
function CityScenarioCard({
  scen, label, rev, cost, res, kpis, tone,
}: any) {
  const toneCls = tone === "warning" ? "border-amber-500/40" : tone === "success" ? "border-emerald-500/40" : "border-border";
  const resColor = res.general >= 0 ? "text-emerald-500" : "text-rose-500";
  return (
    <Card className={toneCls}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">Público</span><span className="tabular-nums">{fmtNum(kpis.totalPublic)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Receita</span><span className="tabular-nums">{fmt(rev.totalRevenue)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Custo</span><span className="tabular-nums">{fmt(cost.totalCost)}</span></div>
        <div className={`flex justify-between font-bold border-t pt-1 mt-1 ${resColor}`}>
          <span>Resultado</span><span className="tabular-nums">{fmt(res.general)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function CityReadOnly({ split }: { split: { id: string; name: string } }) {
  const navigate = useNavigate();
  const data = useCitySimulator(split.id);
  if (data.loading) {
    return <div className="text-sm text-muted-foreground py-6 text-center">A carregar {split.name}…</div>;
  }
  const trios: { scen: ScenarioKey; tone: string }[] = [
    { scen: "real", tone: "muted" },
    { scen: "breakeven", tone: "warning" },
    { scen: "forecast", tone: "success" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">{split.name}</h3>
          <p className="text-xs text-muted-foreground">Vista read-only · para editar abre o Simulador da cidade</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate(`/eventos/${split.id}/simulador`)}>
          <ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir Simulador
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {trios.map((t) => (
          <CityScenarioCard
            key={t.scen}
            scen={t.scen}
            label={SCEN_LABELS[t.scen]}
            tone={t.tone}
            rev={data.rev[t.scen]}
            cost={data.costs[t.scen]}
            res={data.res[t.scen]}
            kpis={data.kpis[t.scen]}
          />
        ))}
      </div>

      {/* Resumo por cenário (linhas-chave) */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Faturamento por linha</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Linha</TableHead>
                <TableHead className="text-right">Real</TableHead>
                <TableHead className="text-right">Break Even</TableHead>
                <TableHead className="text-right">Forecast</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { k: "ticketsRevenue", l: "Bilheteira" },
                { k: "drinkRevenue", l: "A&B Bebida" },
                { k: "foodRevenue", l: "A&B Alimento" },
                { k: "sponsorRevenue", l: "Patrocínio" },
                { k: "souvenirRevenue", l: "Souvenir" },
                { k: "otherCredits", l: "Outros" },
              ].map((r) => (
                <TableRow key={r.k}>
                  <TableCell>{r.l}</TableCell>
                  <TableCell className="text-right">{fmt(data.rev.real[r.k] ?? 0)}</TableCell>
                  <TableCell className="text-right">{fmt(data.rev.breakeven[r.k] ?? 0)}</TableCell>
                  <TableCell className="text-right">{fmt(data.rev.forecast[r.k] ?? 0)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold border-t-2">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{fmt(data.rev.real.totalRevenue)}</TableCell>
                <TableCell className="text-right">{fmt(data.rev.breakeven.totalRevenue)}</TableCell>
                <TableCell className="text-right">{fmt(data.rev.forecast.totalRevenue)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Tab Consolidada da turnê ---------- */
function TourConsolidated({ masterEvent, splits }: Props) {
  // Carregar Master (extras) + cada split
  const masterData = useCitySimulator(masterEvent.id);
  // Hooks por cidade — chamamos um a um para respeitar a regra dos hooks.
  // Os splits são estáveis durante a vida deste componente.
  const cities = splits.map((s) => ({ split: s, data: useCitySimulator(s.id) }));

  const aggregate = useMemo(() => {
    const acc = {
      real:    { rev: 0, cost: 0, res: 0, qty: 0 },
      breakeven: { rev: 0, cost: 0, res: 0, qty: 0 },
      forecast: { rev: 0, cost: 0, res: 0, qty: 0 },
    };
    for (const c of cities) {
      if (c.data.loading) continue;
      (["real", "breakeven", "forecast"] as ScenarioKey[]).forEach((k) => {
        acc[k].rev += Number(c.data.rev[k].totalRevenue || 0);
        acc[k].cost += Number(c.data.costs[k].totalCost || 0);
        acc[k].res += Number(c.data.res[k].general || 0);
        acc[k].qty += Number(c.data.kpis[k].totalPublic || 0);
      });
    }
    // Extras Master: patrocínios da turnê (sponsorship_revenue do Master) +
    // custos fixos partilhados (cost_lines do Master). Os custos de cada
    // cidade já estão somados acima; os do Master entram aqui uma única vez.
    // Nota: o helper expandOverheadToSplits aplica-se quando os overheads
    // estão em `event_forecasts` — aqui usamos o Simulador, e a equivalência
    // operacional é: tudo o que está no Master soma 1×.
    const masterSponsor = Number(masterData.cfg?.sponsorship_revenue || 0);
    const masterEventCost = (masterData.costs?.real?.eventCosts ?? 0);
    const masterEventCostBE = (masterData.costs?.breakeven?.eventCosts ?? 0);
    const masterEventCostFC = (masterData.costs?.forecast?.eventCosts ?? 0);

    return {
      real: {
        rev: acc.real.rev + masterSponsor,
        cost: acc.real.cost + masterEventCost,
        res: acc.real.rev + masterSponsor - (acc.real.cost + masterEventCost),
        qty: acc.real.qty,
      },
      breakeven: {
        rev: acc.breakeven.rev + masterSponsor,
        cost: acc.breakeven.cost + masterEventCostBE,
        res: acc.breakeven.rev + masterSponsor - (acc.breakeven.cost + masterEventCostBE),
        qty: acc.breakeven.qty,
      },
      forecast: {
        rev: acc.forecast.rev + masterSponsor,
        cost: acc.forecast.cost + masterEventCostFC,
        res: acc.forecast.rev + masterSponsor - (acc.forecast.cost + masterEventCostFC),
        qty: acc.forecast.qty,
      },
      masterSponsor,
      masterCostReal: masterEventCost,
      masterCostBE: masterEventCostBE,
      masterCostFC: masterEventCostFC,
    };
  }, [cities, masterData]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(["real", "breakeven", "forecast"] as ScenarioKey[]).map((scen) => {
          const a = aggregate[scen];
          const tone = scen === "real" ? "border-border" : scen === "breakeven" ? "border-amber-500/40" : "border-emerald-500/40";
          const resColor = a.res >= 0 ? "text-emerald-500" : "text-rose-500";
          return (
            <Card key={scen} className={tone}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Turnê · {SCEN_LABELS[scen]}</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Público total</span><span className="tabular-nums">{fmtNum(a.qty)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Receita total</span><span className="tabular-nums">{fmt(a.rev)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Custo total</span><span className="tabular-nums">{fmt(a.cost)}</span></div>
                <div className={`flex justify-between font-bold border-t pt-1 mt-1 ${resColor}`}>
                  <span>Resultado</span><span className="tabular-nums">{fmt(a.res)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabela comparativa por cidade */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Comparativo por cidade — cenário Forecast</CardTitle>
          <p className="text-xs text-muted-foreground">Dados em tempo real, lidos da Versão Activa de cada cidade.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cidade</TableHead>
                <TableHead className="text-right">Público</TableHead>
                <TableHead className="text-right">Ticket médio</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Resultado</TableHead>
                <TableHead className="text-right">Margem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cities.map((c) => {
                const k = c.data.kpis.forecast;
                const r = c.data.rev.forecast;
                const co = c.data.costs.forecast;
                const re = c.data.res.forecast;
                const margin = r.totalRevenue > 0 ? (re.general / r.totalRevenue) * 100 : 0;
                return (
                  <TableRow key={c.split.id}>
                    <TableCell className="font-medium">{c.split.name}</TableCell>
                    <TableCell className="text-right">{fmtNum(k.totalPublic)}</TableCell>
                    <TableCell className="text-right">{fmt(k.tmTickets)}</TableCell>
                    <TableCell className="text-right">{fmt(r.totalRevenue)}</TableCell>
                    <TableCell className="text-right">{fmt(co.totalCost)}</TableCell>
                    <TableCell className={`text-right ${re.general >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{fmt(re.general)}</TableCell>
                    <TableCell className="text-right">{fmtPct(margin)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="font-bold border-t-2">
                <TableCell>Subtotal cidades</TableCell>
                <TableCell className="text-right">{fmtNum(aggregate.forecast.qty)}</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">{fmt(aggregate.forecast.rev - aggregate.masterSponsor)}</TableCell>
                <TableCell className="text-right">{fmt(aggregate.forecast.cost - aggregate.masterCostFC)}</TableCell>
                <TableCell className="text-right">{fmt((aggregate.forecast.rev - aggregate.masterSponsor) - (aggregate.forecast.cost - aggregate.masterCostFC))}</TableCell>
                <TableCell className="text-right">—</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Extras Master (ler de cfg + cost_lines do próprio Master) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Extras da Turnê (Master)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Patrocínios da turnê e custos fixos partilhados — geridos no Simulador do Master (Configuração e Custos).
            Somam <strong>uma única vez</strong> no consolidado, sem rateio adicional (a regra de rateio
            <code> expandOverheadToSplits </code> é aplicada ao BP/DRE; aqui agregamos os totais directamente).
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Componente</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Patrocínios da turnê</TableCell>
                <TableCell className="text-right text-emerald-500">{fmt(aggregate.masterSponsor)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Custos fixos partilhados (cenário Real)</TableCell>
                <TableCell className="text-right text-rose-500">−{fmt(aggregate.masterCostReal)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Custos fixos partilhados (Break Even)</TableCell>
                <TableCell className="text-right text-rose-500">−{fmt(aggregate.masterCostBE)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Custos fixos partilhados (Forecast)</TableCell>
                <TableCell className="text-right text-rose-500">−{fmt(aggregate.masterCostFC)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Componente principal ---------- */
export default function TourSimulator({ masterEvent, splits }: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<string>(splits[0]?.id ?? "consolidated");

  // Carregamentos da turnê para o Dashboard Executivo comparativo.
  const masterData = useCitySimulator(masterEvent.id);
  const cities = splits.map((s) => ({ split: s, data: useCitySimulator(s.id) }));

  // Construímos um pseudo "trio Master agregado" para o ExecutiveDashboard
  // (soma cidades + extras Master). Ficheiros internos esperam o mesmo shape
  // que o cenário standalone.
  const sumScenario = (k: ScenarioKey) => {
    const baseRev = { ticketsRevenue: 0, drinkRevenue: 0, foodRevenue: 0, sponsorRevenue: 0, souvenirRevenue: 0, otherCredits: 0, ticketsQty: 0, courtesyQty: 0, totalRevenue: 0 };
    const baseCost = { eventCosts: 0, abCost: 0, souvenirCost: 0, totalCost: 0 };
    let resGeneral = 0, resEvent = 0, resAb = 0, resSouv = 0;
    let totalPublic = 0, payingPublic = 0, ticketsRev = 0, ticketsQty = 0, drinkFood = 0;
    for (const c of cities) {
      if (c.data.loading) continue;
      const r = c.data.rev[k]; const co = c.data.costs[k]; const re = c.data.res[k]; const kp = c.data.kpis[k];
      baseRev.ticketsRevenue += r.ticketsRevenue; baseRev.drinkRevenue += r.drinkRevenue;
      baseRev.foodRevenue += r.foodRevenue; baseRev.sponsorRevenue += r.sponsorRevenue;
      baseRev.souvenirRevenue += r.souvenirRevenue; baseRev.otherCredits += r.otherCredits;
      baseRev.ticketsQty += r.ticketsQty; baseRev.courtesyQty += r.courtesyQty; baseRev.totalRevenue += r.totalRevenue;
      baseCost.eventCosts += co.eventCosts; baseCost.abCost += co.abCost;
      baseCost.souvenirCost += co.souvenirCost; baseCost.totalCost += co.totalCost;
      resGeneral += re.general; resEvent += re.event; resAb += re.ab; resSouv += re.souvenir;
      totalPublic += kp.totalPublic; payingPublic += Number((r as any).attendanceQty || 0);
      ticketsRev += r.ticketsRevenue; ticketsQty += r.ticketsQty; drinkFood += r.drinkRevenue + r.foodRevenue;
    }
    // extras Master
    const masterSponsor = Number(masterData.cfg?.sponsorship_revenue || 0);
    const masterCost = masterData.costs?.[k]?.eventCosts ?? 0;
    baseRev.sponsorRevenue += masterSponsor;
    baseRev.totalRevenue += masterSponsor;
    baseCost.eventCosts += masterCost;
    baseCost.totalCost += masterCost;
    resGeneral += masterSponsor - masterCost;
    resEvent += masterSponsor - masterCost;
    return {
      rev: baseRev,
      cost: baseCost,
      res: { general: resGeneral, event: resEvent, ab: resAb, souvenir: resSouv },
      kpis: {
        totalPublic,
        // TM Bilhetes = receita bilheteira ÷ pagantes×dia (combo 2d = 2)
        tmTickets: payingPublic > 0 ? ticketsRev / payingPublic : 0,
        tmAB: totalPublic > 0 ? drinkFood / totalPublic : 0,
        costPerPerson: totalPublic > 0 ? baseCost.totalCost / totalPublic : 0,
        resultPerPerson: totalPublic > 0 ? resGeneral / totalPublic : 0,
      },
    };
  };
  const real = useMemo(() => sumScenario("real"), [cities, masterData]);
  const be = useMemo(() => sumScenario("breakeven"), [cities, masterData]);
  const fc = useMemo(() => sumScenario("forecast"), [cities, masterData]);

  // Comparativo por cidade para o ExecutiveDashboard
  const cityBreakdowns = useMemo(() => cities.map((c) => {
    const r = c.data.rev.forecast; const re = c.data.res.forecast;
    const co = c.data.costs.forecast; const k = c.data.kpis.forecast;
    return {
      name: c.split.name,
      publico: k.totalPublic,
      ticketMedio: k.tmTickets,
      abPerPerson: k.tmAB,
      receita: r.totalRevenue,
      custo: co.totalCost,
      resultado: re.general,
      margem: r.totalRevenue > 0 ? (re.general / r.totalRevenue) * 100 : 0,
      breakEvenQty: c.data.beTotalQty,
    };
  }), [cities]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/eventos/${masterEvent.id}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold lg:text-2xl flex items-center gap-2">
              <Calculator className="h-6 w-6 text-primary" />
              Simulador da Turnê — {masterEvent?.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Master agregador · {splits.length} cidade{splits.length === 1 ? "" : "s"} · vista executiva da turnê
            </p>
          </div>
        </div>
        <Badge variant="outline">Modo Turnê</Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap gap-1">
          {splits.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>{s.name}</TabsTrigger>
          ))}
          <TabsTrigger value="consolidated" className="font-semibold">Turnê — Consolidado</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard executivo</TabsTrigger>
        </TabsList>

        {splits.map((s) => (
          <TabsContent key={s.id} value={s.id}>
            <CityReadOnly split={s} />
          </TabsContent>
        ))}

        <TabsContent value="consolidated">
          <TourConsolidated masterEvent={masterEvent} splits={splits} />
        </TabsContent>

        <TabsContent value="dashboard">
          <ExecutiveDashboard
            eventName={`${masterEvent.name} (Turnê)`}
            eventId={masterEvent.id}
            today={real.rev} todayCosts={real.cost} todayRes={real.res} todayKpis={real.kpis}
            breakeven={be.rev} beCosts={be.cost} beRes={be.res} beKpis={be.kpis}
            forecast={fc.rev} fcCosts={fc.cost} fcRes={fc.res} fcKpis={fc.kpis}
            costLines={[]}
            dailyTotals={[]}
            ivaTable={[]}
            sessions={[]}
            abModule={{ hasConfig: false, totals: null } as any}
            beSolution={{ totalQty: be.kpis.totalPublic, totalRevenue: be.rev.totalRevenue }}
            fcSolution={{ totalQty: fc.kpis.totalPublic, totalRevenue: fc.rev.totalRevenue }}
            tourBreakdowns={cityBreakdowns}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
