/**
 * Detalhe do BI de Vendas — um tour e as suas cidades.
 *
 * Dados: uma única chamada a get_daily_sales_series (que já resolve a
 * precedência de origem) + leitura de events para os nomes das cidades.
 * "Hoje" é sempre Europe/Lisbon.
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { lisbonToday } from "@/lib/date-lisbon";

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

interface EventRow {
  id: string;
  name: string;
  date: string | null;
  parent_event_id: string | null;
}

const PERIODS = [7, 14, 30, 90] as const;

function Variation({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("font-semibold", v < 0 ? "text-destructive" : "text-success")}>
      {v > 0 ? "+" : ""}
      {nfInt.format(Math.round(v))}%
    </span>
  );
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
  const [days, setDays] = useState<number>(30);
  const today = useMemo(() => lisbonToday(), []);
  const todayISO = toISO(today);

  const end = toISO(addDays(today, -1));
  const start = toISO(addDays(today, -(2 * days) - 30));

  const seriesQ = useQuery({
    queryKey: ["bi-detail-series", groupId, start, end],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_daily_sales_series" as any, {
        p_start: start,
        p_end: end,
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

  const isLoading = seriesQ.isLoading || eventsQ.isLoading;

  const model = useMemo(() => {
    const series = seriesQ.data ?? [];
    const events = eventsQ.data ?? [];

    const pStart = toISO(addDays(today, -days));
    const pEnd = end;
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
    const byDay = new Map<string, number>();
    const byCity = new Map<string, { qty: number; value: number; prevQty: number; total: number }>();

    for (const r of series) {
      const d = r.sale_date.slice(0, 10);
      const q = Number(r.qty || 0);
      const v = Number(r.value || 0);
      const c = byCity.get(r.event_id) ?? { qty: 0, value: 0, prevQty: 0, total: 0 };
      c.total += q;
      if (d >= pStart && d <= pEnd) {
        qty += q;
        value += v;
        byDay.set(d, (byDay.get(d) ?? 0) + q);
        c.qty += q;
        c.value += v;
      }
      if (d >= prevStart && d <= prevEnd) {
        prevQty += q;
        c.prevQty += q;
      }
      byCity.set(r.event_id, c);
    }

    const variacao = prevQty > 0 ? ((qty - prevQty) / prevQty) * 100 : null;

    // Gráfico: dias de calendário + média móvel de 7 dias (usa dias antes do período)
    const points: { date: string; qty: number; ma: number | null }[] = [];
    for (let i = days; i >= 1; i--) {
      const d = toISO(addDays(today, -i));
      let sum = 0;
      for (let k = 0; k < 7; k++) {
        const dk = toISO(addDays(today, -(i + k)));
        sum += byDay.get(dk) ?? seriesDayFallback(series, dk);
      }
      points.push({ date: d, qty: byDay.get(d) ?? 0, ma: sum / 7 });
    }

    const cities = cityList
      .map((e) => {
        const c = byCity.get(e.id) ?? { qty: 0, value: 0, prevQty: 0, total: 0 };
        return {
          id: e.id,
          name: e.name,
          date: e.date?.slice(0, 10) ?? null,
          qty: c.qty,
          value: c.value,
          med: c.qty / days,
          variacao: c.prevQty > 0 ? ((c.qty - c.prevQty) / c.prevQty) * 100 : null,
          total: c.total,
        };
      })
      .sort((a, b) => b.qty - a.qty);

    return {
      tourName,
      nextDate,
      nextIn,
      qty,
      value,
      med: qty / days,
      medValue: value / days,
      variacao,
      points,
      cities,
    };
  }, [seriesQ.data, eventsQ.data, days, today, todayISO, end, groupId]);

  return (
    <div className="space-y-4">
      <div>
        <Link to="/vendas" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar a Vendas
        </Link>
        <h1 className="mt-1 text-xl font-bold tracking-tight lg:text-2xl">{model.tourName}</h1>
        <p className="text-sm text-muted-foreground">
          Próximo espetáculo: {fmtDay(model.nextDate)}
          {model.nextIn !== null ? ` · ${int(model.nextIn)} dias` : ""}
        </p>
      </div>

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

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar detalhe…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Card className="p-3 tabular-nums">
              <p className="text-xs text-muted-foreground">Bilhetes no período</p>
              <p className="text-lg font-semibold">{int(model.qty)}</p>
            </Card>
            <Card className="p-3 tabular-nums">
              <p className="text-xs text-muted-foreground">Receita no período</p>
              <p className="text-lg font-semibold">{money(model.value)}</p>
            </Card>
            <Card className="p-3 tabular-nums">
              <p className="text-xs text-muted-foreground">Média diária</p>
              <p className="text-lg font-semibold">{nf1.format(model.med)} bilh./dia</p>
            </Card>
            <Card className="p-3 tabular-nums">
              <p className="text-xs text-muted-foreground">Receita/dia</p>
              <p className="text-lg font-semibold">{money(model.medValue)}</p>
            </Card>
            <Card className="p-3 tabular-nums">
              <p className="text-xs text-muted-foreground">Tração vs. período anterior</p>
              <p className="text-lg">
                <Variation v={model.variacao} />
              </p>
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
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Cidade</th>
                    <th className="p-3 font-medium">Data</th>
                    <th className="p-3 text-right font-medium">Bilhetes</th>
                    <th className="p-3 text-right font-medium">Receita</th>
                    <th className="p-3 text-right font-medium">Média/dia</th>
                    <th className="p-3 text-right font-medium">Tração</th>
                    <th className="p-3 text-right font-medium">Total acumulado</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {model.cities.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3 text-muted-foreground">{fmtDay(c.date)}</td>
                      <td className="p-3 text-right">{int(c.qty)}</td>
                      <td className="p-3 text-right">{money(c.value)}</td>
                      <td className="p-3 text-right">{nf1.format(c.med)}</td>
                      <td className="p-3 text-right">
                        <Variation v={c.variacao} />
                      </td>
                      <td className="p-3 text-right">{int(c.total)}</td>
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

/** Soma de um dia fora da janela do período (usada pela média móvel). */
function seriesDayFallback(series: SeriesRow[], iso: string): number {
  let s = 0;
  for (const r of series) if (r.sale_date.slice(0, 10) === iso) s += Number(r.qty || 0);
  return s;
}
