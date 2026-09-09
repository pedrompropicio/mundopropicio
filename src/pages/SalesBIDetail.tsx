/**
 * Detalhe do BI de Vendas — um tour e as suas cidades.
 *
 * Dados: uma única chamada a get_daily_sales_series (que já resolve a
 * precedência de origem) + leitura de events para os nomes das cidades.
 * "Hoje" é sempre Europe/Lisbon.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, FileDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { lisbonToday } from "@/lib/date-lisbon";
import { IvaToggle, useIvaMode } from "@/components/sales/IvaToggle";
import { netOfIva, useEventIvaRates } from "@/hooks/useEventIvaRates";
import { exportEventSalesPdf, type EventSalesPdfVariant } from "@/lib/export-event-sales-pdf";
import { fetchZoneCapacities, totalsByEvent } from "@/lib/zone-capacities";
import { traction, type Traction } from "@/lib/traction";
import { salesAvgDays, salesAvgDaysLabel } from "@/lib/sales-avg-days";


const nfInt = new Intl.NumberFormat("pt-PT");
const nfMoney = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const money = (v: number) => `${nfMoney.format(Number(v || 0))} €`;
const int = (v: number) => nfInt.format(Number(v || 0));

const toISO = (d: Date) => format(d, "yyyy-MM-dd");
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtDay = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const daysBetween = (fromISO: string, toISOStr: string) => {
  const [y1, m1, d1] = fromISO.split("-").map(Number);
  const [y2, m2, d2] = toISOStr.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

interface SeriesRow {
  group_id: string;
  event_id: string;
  event_name: string;
  event_date: string | null;
  sale_date: string;
  provider: string;
  qty: number;
  value: number;
}

interface CapacityRow {
  group_id: string;
  capacity: number | null;
  available: number | null;
  occupied: number | null;
  blocked: number | null;
  zones: number | null;
  zones_oversold: number | null;
  last_observed: string | null;
  stale: boolean;
  trustworthy: boolean;
  issue: string | null;
}

interface EventRow {
  id: string;
  name: string;
  date: string | null;
  parent_event_id: string | null;
}

const PERIODS = [7, 14, 30, 90] as const;

function Variation({ t }: { t: Traction }) {
  if (t.pct !== null) {
    return (
      <span className={cn("font-semibold", t.pct < 0 ? "text-destructive" : "text-success")}>
        {t.pct > 0 ? "+" : ""}
        {nfInt.format(Math.round(t.pct))}%
      </span>
    );
  }
  if (t.shortBase) {
    return (
      <span className="inline-block">
        <span>{int(t.qty)} vs {int(t.prevQty)}</span>
        <span className="block text-[10px] text-muted-foreground">base curta</span>
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}


function BarsChart({ points }: { points: { date: string; qty: number; ma: number | null }[] }) {
  const w = 900;
  const chartH = 220;
  const axisH = 22;
  const h = chartH + axisH;
  const pad = 8;
  const max = Math.max(...points.map((p) => Math.max(p.qty, p.ma ?? 0)), 1);
  const bw = (w - pad * 2) / Math.max(points.length, 1);
  const y = (v: number) => chartH - pad - (v / max) * (chartH - pad * 2);
  const line = points
    .map((p, i) => (p.ma === null ? null : `${pad + i * bw + bw / 2},${y(p.ma)}`))
    .filter(Boolean)
    .join(" ");
  const step = points.length <= 14 ? 1 : Math.ceil(points.length / 10);
  const showLabel = (i: number) => i === 0 || i === points.length - 1 || i % step === 0;
  const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      style={{ height: h }}
      role="img"
      aria-label="Bilhetes por dia com média móvel de 7 dias"
    >
      {points.map((p, i) => {
        const bh = chartH - pad - y(p.qty);
        return (
          <rect
            key={p.date}
            x={pad + i * bw + bw * 0.15}
            y={y(p.qty)}
            width={Math.max(bw * 0.7, 0.8)}
            height={Math.max(bh, p.qty > 0 ? 1 : 0)}
            className="fill-primary"
            opacity={0.8}
          >
            <title>{`${fmtDay(p.date)} — ${int(p.qty)} bilhetes`}</title>
          </rect>
        );
      })}
      {line ? (
        <polyline
          points={line}
          fill="none"
          className="stroke-warning"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {points.map((p, i) =>
        showLabel(i) ? (
          <text
            key={`l-${p.date}`}
            x={pad + i * bw + bw / 2}
            y={chartH + 15}
            textAnchor="middle"
            fontSize={11}
            className="fill-current text-muted-foreground"
          >
            {ddmm(p.date)}
          </text>
        ) : null,
      )}
    </svg>
  );
}


export default function SalesBIDetail() {
  const { groupId = "" } = useParams();
  const navigate = useNavigate();
  const { withIva, setWithIva, ivaSuffix } = useIvaMode();
  const { rateOf, groupRateOf } = useEventIvaRates();
  const [days, setDays] = useState<number>(30);
  const today = useMemo(() => lisbonToday(), []);
  const todayISO = toISO(today);

  // DUAS JANELAS DE PROPÓSITO — não as unifiques:
  // - série lida até HOJE (inclusive): alimenta os totais de vida do evento,
  //   que têm de bater com o cartão do /vendas (get_sales_position).
  // - período (até hoje-1): alimenta médias, tração e gráfico, porque o dia
  //   de hoje está incompleto e puxaria as médias para baixo.
  const seriesEnd = todayISO;
  const periodEnd = toISO(addDays(today, -1));
  const start = "2020-01-01";

  const seriesQ = useQuery({
    queryKey: ["bi-detail-series", groupId, start, seriesEnd],

    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_daily_sales_series" as any, {
        p_start: start,
        p_end: seriesEnd,
        p_event_ids: [groupId],
        p_provider: null,
      });
      if (error) throw error;
      return (data ?? []) as unknown as SeriesRow[];
    },
  });

  const eventsQ = useQuery({
    queryKey: ["bi-detail-events", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, parent_event_id")
        .or(`id.eq.${groupId},parent_event_id.eq.${groupId}`);
      if (error) throw error;
      return (data ?? []) as unknown as EventRow[];
    },
  });

  // Qualidade da lotação (só leitura da RPC existente; usada no PDF)
  const capacityQ = useQuery({
    queryKey: ["bi-capacity-quality"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_event_capacity_quality" as any);
      if (error) throw error;
      return (data ?? []) as unknown as CapacityRow[];
    },
  });

  // Ocupação da sala por cidade — a RPC agrega por tour, por isso aqui lê-se a
  // tabela, SEMPRE com a última observação por (event_id, zone_label).
  const eventIds = useMemo(() => (eventsQ.data ?? []).map((e) => e.id), [eventsQ.data]);
  const zoneCapsQ = useQuery({
    queryKey: ["bi-detail-zone-caps", groupId, eventIds.length],
    enabled: eventIds.length > 0,
    queryFn: async () => totalsByEvent(await fetchZoneCapacities(eventIds)),
  });

  const isLoading = seriesQ.isLoading || eventsQ.isLoading;

  const model = useMemo(() => {
    const series = seriesQ.data ?? [];
    const events = eventsQ.data ?? [];

    const pStart = toISO(addDays(today, -days));
    const pEnd = periodEnd;
    const prevStart = toISO(addDays(today, -(2 * days)));
    const prevEnd = toISO(addDays(today, -days - 1));

    const tourName = series[0]?.event_name ?? events.find((e) => e.id === groupId)?.name ?? "Tour";
    const children = events.filter((e) => e.parent_event_id === groupId);
    const cityList = children.length > 0 ? children : events.filter((e) => e.id === groupId);

    // Próximo espetáculo
    const futureDates = cityList
      .map((e) => e.date?.slice(0, 10))
      .filter((d): d is string => !!d && d >= todayISO)
      .sort();
    const nextDate = futureDates[0] ?? cityList.map((e) => e.date?.slice(0, 10)).filter(Boolean).sort().pop() ?? null;
    const nextIn = nextDate ? daysBetween(todayISO, nextDate) : null;

    // Agregações
    let qty = 0;
    let value = 0;
    let prevQty = 0;
    let totalQty = 0;
    let totalValue = 0;
    const allByDay = new Map<string, number>();
    const valueByDay = new Map<string, number>();
    const byCity = new Map<string, { qty: number; value: number; prevQty: number; total: number; firstSale: string | null }>();
    const sourceByCity = new Map<string, Set<string>>();
    let firstSale: string | null = null;


    for (const r of series) {
      const d = r.sale_date.slice(0, 10);
      const q = Number(r.qty || 0);
      // cada linha converte-se com a taxa do SEU evento; os totais são a soma
      // das linhas já convertidas — nunca uma taxa média sobre o agregado.
      const vGross = Number(r.value || 0);
      const v = withIva ? vGross : netOfIva(vGross, rateOf(r.event_id));
      const c = byCity.get(r.event_id) ?? { qty: 0, value: 0, prevQty: 0, total: 0, firstSale: null };
      c.total += q;
      if (q > 0 && (c.firstSale === null || d < c.firstSale)) c.firstSale = d;
      if (q > 0 && (firstSale === null || d < firstSale)) firstSale = d;
      totalQty += q;
      totalValue += v;

      allByDay.set(d, (allByDay.get(d) ?? 0) + q);
      valueByDay.set(d, (valueByDay.get(d) ?? 0) + v);
      if (r.provider) {
        const s = sourceByCity.get(r.event_id) ?? new Set<string>();
        s.add(r.provider);
        sourceByCity.set(r.event_id, s);
      }
      if (d >= pStart && d <= pEnd) {
        qty += q;
        value += v;
        c.qty += q;
        c.value += v;
      }
      if (d >= prevStart && d <= prevEnd) {
        prevQty += q;
        c.prevQty += q;
      }
      byCity.set(r.event_id, c);
    }

    const variacao = traction(qty, prevQty, days);

    // Gráfico: dias de calendário do período + média móvel de 7 dias
    const points: { date: string; qty: number; value: number; ma: number | null }[] = [];
    for (let i = days; i >= 1; i--) {
      const d = toISO(addDays(today, -i));
      let sum = 0;
      for (let k = 0; k < 7; k++) {
        sum += allByDay.get(toISO(addDays(today, -(i + k)))) ?? 0;
      }
      points.push({ date: d, qty: allByDay.get(d) ?? 0, value: valueByDay.get(d) ?? 0, ma: sum / 7 });
    }

    const caps = zoneCapsQ.data;
    const cities = cityList
      .map((e) => {
        const c = byCity.get(e.id) ?? { qty: 0, value: 0, prevQty: 0, total: 0, firstSale: null };
        const t = caps?.get(e.id) ?? null;
        // Denominador honesto: dias desde o arranque de venda dentro do período.
        const medDays = salesAvgDays(c.firstSale, pStart, pEnd, days);
        return {
          id: e.id,
          name: e.name,
          date: e.date?.slice(0, 10) ?? null,
          qty: c.qty,
          value: c.value,
          med: c.qty / medDays,
          medDays,
          variacao: traction(c.qty, c.prevQty, days),
          total: c.total,
          source: [...(sourceByCity.get(e.id) ?? [])].join(" + ") || null,
          // Ocupação da sala (bilheteira): occupied / capacity, nunca os nossos bilhetes.
          salaCapacity: t && t.capacity > 0 ? t.capacity : null,
          salaOccupied: t && t.capacity > 0 ? t.occupied : null,
          salaPct: t && t.capacity > 0 ? (t.occupied / t.capacity) * 100 : null,
        };
      })
      .sort((a, b) => b.qty - a.qty);

    const medDays = salesAvgDays(firstSale, pStart, pEnd, days);

    return {
      tourName,
      nextDate,
      nextIn,
      qty,
      value,
      med: qty / medDays,
      medValue: value / medDays,
      medDays,
      variacao,
      totalQty,
      totalValue,
      points,
      cities,
    };


  }, [seriesQ.data, eventsQ.data, zoneCapsQ.data, days, today, todayISO, periodEnd, groupId, withIva, rateOf]);

  // Ocupação da sala do tour — da RPC (agrega por tour)
  const sala = useMemo(() => {
    const cap = (capacityQ.data ?? []).find((c) => c.group_id === groupId);
    if (!cap || !cap.trustworthy || !cap.capacity) {
      return { pct: null as number | null, occupied: null as number | null, capacity: null as number | null, issue: cap?.issue ?? null };
    }
    return {
      pct: (Number(cap.occupied || 0) / Number(cap.capacity)) * 100,
      occupied: Number(cap.occupied || 0),
      capacity: Number(cap.capacity),
      issue: null as string | null,
    };
  }, [capacityQ.data, groupId]);

  const ivaLbl = withIva ? null : <span className="ml-1 text-[10px]">s/ IVA</span>;

  // O PDF herda exatamente o ecrã: tour, período e estado do IVA.
  const handleExport = async (variant: EventSalesPdfVariant) => {
    const cap = (capacityQ.data ?? []).find((c) => c.group_id === groupId);
    await exportEventSalesPdf({
      variant,
      tourName: model.tourName,
      days,
      periodStart: toISO(addDays(today, -days)),
      periodEnd,
      withIva,
      ivaRate: groupRateOf(groupId),
      totalQty: model.totalQty,
      totalValue: model.totalValue,
      qty: model.qty,
      value: model.value,
      med: model.med,
      medValue: model.medValue,
      variacao: model.variacao,
      capacity: {
        trustworthy: !!cap?.trustworthy,
        capacity: cap?.capacity ?? null,
        occupied: cap?.occupied ?? null,
        issue: cap?.issue ?? null,
      },
      points: model.points,
      cities: model.cities,
      qualityIssues:
        cap && !cap.trustworthy ? [{ name: model.tourName, issue: cap.issue ?? "—" }] : [],
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Link to={`/vendas${ivaSuffix}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar a Vendas
        </Link>
        <h1 className="mt-1 text-xl font-bold tracking-tight lg:text-2xl">{model.tourName}</h1>
        <p className="text-sm text-muted-foreground">
          Próximo espetáculo: {fmtDay(model.nextDate)}
          {model.nextIn !== null ? ` · ${int(model.nextIn)} dias` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
        {PERIODS.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={days === p ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setDays(p)}
          >
            {p} dias
          </Button>
        ))}
        </div>
        <IvaToggle withIva={withIva} onChange={setWithIva} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              <FileDown className="mr-1 h-3.5 w-3.5" /> Exportar PDF
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport("internal")}>Versão interna</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("partner")}>Versão sócio / artista</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar detalhe…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
            <Card className="p-3 tabular-nums">
              <p className="text-xs text-muted-foreground">Bilhetes no período</p>
              <p className="text-lg font-semibold">{int(model.qty)}</p>
              <p className="text-[10px] text-muted-foreground">até ontem — hoje ainda está a decorrer</p>
            </Card>
            <Card className="p-3 tabular-nums">
              <p className="text-xs text-muted-foreground">Receita no período{ivaLbl}</p>
              <p className="text-lg font-semibold">{money(model.value)}</p>
              <p className="text-[10px] text-muted-foreground">até ontem — hoje ainda está a decorrer</p>
            </Card>
            <Card className="p-3 tabular-nums">
              <p className="text-xs text-muted-foreground">Média diária</p>
              <p className="text-lg font-semibold">{nf1.format(model.med)} bilh./dia</p>
              <p className="text-[10px] text-muted-foreground">{salesAvgDaysLabel(model.medDays)}</p>
            </Card>
            <Card className="p-3 tabular-nums">
              <p className="text-xs text-muted-foreground">Receita/dia{ivaLbl}</p>
              <p className="text-lg font-semibold">{money(model.medValue)}</p>
              <p className="text-[10px] text-muted-foreground">{salesAvgDaysLabel(model.medDays)}</p>
            </Card>

            <Card className="p-3 tabular-nums">
              <p className="text-xs text-muted-foreground">Tração vs. período anterior</p>
              <p className="text-lg">
                <Variation t={model.variacao} />
              </p>
            </Card>
            <Card className="p-3 tabular-nums">
              <p className="text-xs text-muted-foreground">Total do evento{ivaLbl}</p>
              <p className="text-lg font-semibold">{int(model.totalQty)}</p>
              <p className="text-xs text-muted-foreground">{money(model.totalValue)}</p>
              <p className="text-[10px] text-muted-foreground">vida do evento, até hoje inclusive</p>

            </Card>
            {/* Ocupação da sala = bilheteira (occupied/capacity). NÃO são os nossos bilhetes. */}
            <Card className="p-3 tabular-nums">
              <p className="text-xs text-muted-foreground">Ocupação da sala</p>
              {sala.pct !== null ? (
                <>
                  <p className="text-lg font-semibold">{nf1.format(sala.pct)}%</p>
                  <p className="text-xs text-muted-foreground">
                    {int(sala.occupied ?? 0)} de {int(sala.capacity ?? 0)} lugares
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-muted-foreground">—</p>
                  <p className="text-xs text-muted-foreground">
                    {sala.issue ?? "sem observação de lotação da bilheteira"}
                  </p>
                </>
              )}
            </Card>
          </div>


          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Bilhetes por dia</p>
              <p className="text-xs text-muted-foreground">linha = média móvel de 7 dias</p>
            </div>
            <BarsChart points={model.points} />
          </Card>

          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Cidade</th>
                    <th className="p-3 font-medium">Data</th>
                    <th className="p-3 text-right font-medium">Bilhetes</th>
                    <th className="p-3 text-right font-medium">Receita{ivaLbl}</th>
                    <th className="p-3 text-right font-medium">Média/dia</th>
                    <th className="p-3 text-right font-medium">Tração</th>
                    <th className="p-3 text-right font-medium">Total acumulado</th>
                    <th className="p-3 text-right font-medium">Ocupação da sala</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {model.cities.map((c) => (
                    <tr
                      key={c.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                      role="link"
                      tabIndex={0}
                      onClick={() => navigate(`/vendas/${groupId}/${c.id}${ivaSuffix}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/vendas/${groupId}/${c.id}${ivaSuffix}`);
                        }
                      }}
                    >
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3 text-muted-foreground">{fmtDay(c.date)}</td>
                      <td className="p-3 text-right">{int(c.qty)}</td>
                      <td className="p-3 text-right">{money(c.value)}</td>
                      <td className="p-3 text-right">
                        {nf1.format(c.med)}
                        <span className="block text-[10px] text-muted-foreground">
                          {salesAvgDaysLabel(c.medDays)}
                        </span>
                      </td>

                      <td className="p-3 text-right">
                        <Variation t={c.variacao} />
                      </td>
                      <td className="p-3 text-right">{int(c.total)}</td>
                      <td className="p-3 text-right">
                        {c.salaPct !== null ? (
                          <>
                            {nf1.format(c.salaPct)}%
                            <span className="block text-xs text-muted-foreground">
                              {int(c.salaOccupied ?? 0)} de {int(c.salaCapacity ?? 0)}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
