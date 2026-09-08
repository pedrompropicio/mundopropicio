/**
 * BI de Vendas — ecrã que abre já a dizer o que se passa, sem filtros.
 *
 * Dados 100% de RPCs existentes: get_sales_position, get_daily_sales_series
 * e get_event_capacity_quality. Nenhum SQL novo, nenhum recálculo via
 * supabase.from(). "Hoje" é sempre Europe/Lisbon (regra do projeto).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { lisbonToday, formatLisbonDateTime } from "@/lib/date-lisbon";

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
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
};

type SalesState = "Parou" | "A cair" | "Vigiar" | "Sem série" | "Por lançar" | "Estável";

const STATE_ORDER: Record<SalesState, number> = {
  "Parou": 1,
  "A cair": 2,
  "Vigiar": 3,
  "Sem série": 4,
  "Por lançar": 5,
  "Estável": 6,
};

const STATE_PILL: Record<SalesState, string> = {
  "Parou": "bg-destructive/15 text-destructive border-destructive/30",
  "A cair": "bg-destructive/15 text-destructive border-destructive/30",
  "Vigiar": "bg-warning/15 text-warning border-warning/30",
  "Sem série": "bg-muted text-muted-foreground border-border",
  "Por lançar": "bg-muted text-muted-foreground border-border",
  "Estável": "bg-secondary text-secondary-foreground border-border",
};

interface PositionRow {
  group_id: string;
  event_name: string;
  event_date: string | null;
  child_count: number;
  total_qty: number;
  total_value: number;
  last7_qty: number;
  last7_value: number;
  yesterday_qty: number;
  yesterday_value: number;
  today_qty: number;
  today_value: number;
  has_bol: boolean;
  daily_missing: boolean;
}

interface SeriesRow {
  group_id: string;
  sale_date: string;
  qty: number;
  value: number;
}

interface CapacityRow {
  group_id: string;
  capacity: number;
  trustworthy: boolean;
  issue: string | null;
}

function Sparkline({ data }: { data: number[] }) {
  const w = 120;
  const h = 32;
  const max = Math.max(...data, 1);
  const bw = w / Math.max(data.length, 1);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="text-primary" role="img" aria-label="Vendas dos últimos 30 dias">
      {data.map((v, i) => {
        const bh = max > 0 ? (v / max) * (h - 2) : 0;
        return (
          <rect
            key={i}
            x={i * bw + bw * 0.15}
            y={h - bh}
            width={Math.max(bw * 0.7, 0.6)}
            height={Math.max(bh, v > 0 ? 1 : 0)}
            fill="currentColor"
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

export default function SalesBI() {
  const today = useMemo(() => lisbonToday(), []);
  const todayISO = toISO(today);
  const start = toISO(addDays(today, -37));
  const end = toISO(addDays(today, -1));

  const positionQ = useQuery({
    queryKey: ["bi-sales-position"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_position" as any);
      if (error) throw error;
      return (data ?? []) as unknown as PositionRow[];
    },
  });

  const seriesQ = useQuery({
    queryKey: ["bi-sales-series", start, end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_daily_sales_series" as any, {
        p_start: start,
        p_end: end,
        p_event_ids: null,
        p_provider: null,
      });
      if (error) throw error;
      return (data ?? []) as unknown as SeriesRow[];
    },
  });

  const capacityQ = useQuery({
    queryKey: ["bi-capacity-quality"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_event_capacity_quality" as any);
      if (error) throw error;
      return (data ?? []) as unknown as CapacityRow[];
    },
  });

  const isLoading = positionQ.isLoading || seriesQ.isLoading || capacityQ.isLoading;

  const rows = useMemo(() => {
    const positions = positionQ.data ?? [];
    const series = seriesQ.data ?? [];
    const caps = new Map((capacityQ.data ?? []).map((c) => [c.group_id, c]));

    const d1 = toISO(addDays(today, -1));
    const d7 = toISO(addDays(today, -7));
    const d8 = toISO(addDays(today, -8));
    const d14 = toISO(addDays(today, -14));
    const d30 = toISO(addDays(today, -30));

    const byGroup = new Map<string, SeriesRow[]>();
    for (const r of series) {
      const arr = byGroup.get(r.group_id);
      if (arr) arr.push(r);
      else byGroup.set(r.group_id, [r]);
    }

    return positions
      .map((p) => {
        const rs = byGroup.get(p.group_id) ?? [];
        let sum7 = 0;
        let val7 = 0;
        let sumPrev7 = 0;
        const daysWindow = new Set<string>();
        const spark = new Map<string, number>();

        for (const r of rs) {
          const d = r.sale_date.slice(0, 10);
          const qty = Number(r.qty || 0);
          if (d >= d7 && d <= d1) {
            sum7 += qty;
            val7 += Number(r.value || 0);
          }
          if (d >= d8 && d <= d14) {
            // (d14 <= d <= d8)
          }
          if (d >= d14 && d <= d8) sumPrev7 += qty;
          if (d >= d14 && d <= d1) daysWindow.add(d);
          if (d >= d30 && d <= d1) spark.set(d, (spark.get(d) ?? 0) + qty);
        }

        const med7 = sum7 / 7;
        const medValue7 = val7 / 7;
        const prev7 = sumPrev7 / 7;
        const variacao = prev7 > 0 ? ((med7 - prev7) / prev7) * 100 : null;
        const diasSerie = daysWindow.size;
        const diasParaEvento = p.event_date ? daysBetween(todayISO, p.event_date.slice(0, 10)) : null;

        const cap = caps.get(p.group_id);
        const trustworthy = !!cap?.trustworthy && Number(cap?.capacity || 0) > 0;
        const ocupacao = trustworthy ? (Number(p.total_qty || 0) / Number(cap!.capacity)) * 100 : null;

        let state: SalesState;
        if (diasSerie >= 3 && med7 === 0) state = "Parou";
        else if (variacao !== null && variacao <= -25) state = "A cair";
        else if (trustworthy && ocupacao !== null && ocupacao < 50 && diasParaEvento !== null && diasParaEvento <= 60) state = "Vigiar";
        else if (diasSerie < 3 && Number(p.total_qty || 0) > 0) state = "Sem série";
        else if (Number(p.total_qty || 0) === 0) state = "Por lançar";
        else state = "Estável";

        // sparkline: 30 dias contínuos
        const sparkData: number[] = [];
        for (let i = 30; i >= 1; i--) sparkData.push(spark.get(toISO(addDays(today, -i))) ?? 0);

        return { p, med7, medValue7, prev7, variacao, diasSerie, diasParaEvento, trustworthy, ocupacao, issue: cap?.issue ?? null, state, sparkData };
      })
      .sort((a, b) => {
        const s = STATE_ORDER[a.state] - STATE_ORDER[b.state];
        if (s !== 0) return s;
        const va = a.variacao ?? Number.POSITIVE_INFINITY;
        const vb = b.variacao ?? Number.POSITIVE_INFINITY;
        if (va !== vb) return va - vb;
        const da = a.diasParaEvento ?? Number.POSITIVE_INFINITY;
        const db = b.diasParaEvento ?? Number.POSITIVE_INFINITY;
        return da - db;
      });
  }, [positionQ.data, seriesQ.data, capacityQ.data, today, todayISO]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Vendas
          </h1>
          <p className="text-sm text-muted-foreground">
            Eventos por realizar, ordenados por quem precisa de atenção.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Leitura de {formatLisbonDateTime(new Date())}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-16 justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar vendas…
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Sem eventos por realizar para mostrar.
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.p.group_id} className="p-4">
              <div className="grid gap-4 md:grid-cols-12 md:items-center">
                {/* Identificação */}
                <div className="md:col-span-3 min-w-0">
                  <p className="font-semibold leading-tight break-words">{r.p.event_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {Number(r.p.child_count || 0) > 0 ? `${int(r.p.child_count)} datas · ` : ""}
                    {fmtDay(r.p.event_date)}
                    {r.diasParaEvento !== null ? ` · ${int(r.diasParaEvento)} dias` : ""}
                  </p>
                  <span
                    className={cn(
                      "mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      STATE_PILL[r.state],
                    )}
                  >
                    {r.state}
                  </span>
                </div>

                {/* Sparkline */}
                <div className="md:col-span-2">
                  <Sparkline data={r.sparkData} />
                  <p className="text-[10px] text-muted-foreground">Últimos 30 dias</p>
                </div>

                {/* Média diária */}
                <div className="md:col-span-2 tabular-nums">
                  <p className="text-sm font-semibold">{nf1.format(r.med7)} bilh./dia</p>
                  <p className="text-xs text-muted-foreground">{money(r.medValue7)} /dia</p>
                </div>

                {/* Tração */}
                <div className="md:col-span-2 tabular-nums">
                  {r.variacao === null ? (
                    <p className="text-sm font-semibold text-muted-foreground">—</p>
                  ) : (
                    <p className={cn("text-sm font-semibold", r.variacao < 0 ? "text-destructive" : "text-success")}>
                      {r.variacao > 0 ? "+" : ""}
                      {nfInt.format(Math.round(r.variacao))}%
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">vs. 7 dias anteriores</p>
                </div>

                {/* Total */}
                <div className="md:col-span-1 tabular-nums">
                  <p className="text-sm font-semibold">{int(r.p.total_qty)}</p>
                  <p className="text-xs text-muted-foreground">{money(r.p.total_value)}</p>
                </div>

                {/* Ocupação */}
                <div className="md:col-span-2 tabular-nums">
                  {r.ocupacao !== null ? (
                    <>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(Math.max(r.ocupacao, 0), 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{nf1.format(r.ocupacao)}% de ocupação</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-muted-foreground">—</p>
                      <p className="text-xs text-muted-foreground">{r.issue ?? "lotação não fiável"}</p>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
