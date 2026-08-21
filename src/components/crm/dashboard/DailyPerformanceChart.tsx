import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { buildDailySeries, niceTicks, type DailyPoint } from "@/lib/crm/daily-series";
import { formatMoney } from "@/lib/currency";
import { formatRoas } from "@/lib/crm/dashboard-format";
import type { InsightRow } from "@/components/crm/dashboard/types";

/**
 * Série diária do período: barras agrupadas de Investimento e Receita
 * (mesmo eixo, ambas dinheiro) e, imediatamente abaixo e alinhado ao mesmo
 * eixo de datas, um gráfico fino só para o ROAS.
 *
 * Nunca dois eixos verticais no mesmo gráfico: o ROAS tem escala própria e
 * por isso vive num painel separado, com referência tracejada em 1,0x.
 *
 * Dias sem dados vêm com valores `null` (lacuna) — não são desenhados como
 * zero. As duas séries distinguem-se por cor E por padrão (a receita leva
 * tracejado no contorno), para leitura sem depender de cor.
 */
export function DailyPerformanceChart({
  insights,
  from,
  to,
  currency,
}: {
  insights: InsightRow[];
  from: Date;
  to: Date;
  currency: string;
}) {
  const data = useMemo(() => buildDailySeries(insights, from, to), [insights, from, to]);

  const maxMoney = useMemo(
    () =>
      data.reduce((m, d) => Math.max(m, d.spend ?? 0, d.revenue ?? 0), 0),
    [data],
  );
  const moneyTicks = useMemo(() => niceTicks(maxMoney), [maxMoney]);
  const maxRoas = useMemo(() => data.reduce((m, d) => Math.max(m, d.roas ?? 0), 1), [data]);
  const roasTicks = useMemo(() => niceTicks(maxRoas, 2), [maxRoas]);

  const anyData = data.some((d) => d.hasData);
  const gaps = data.filter((d) => !d.hasData).length;
  // Eixo de datas com menos marcas em períodos longos.
  const tickInterval = data.length > 21 ? Math.ceil(data.length / 12) - 1 : 0;

  const config = {
    spend: { label: "Investimento", color: "hsl(var(--chart-1))" },
    revenue: { label: "Receita atribuída", color: "hsl(var(--chart-2))" },
    roas: { label: "ROAS", color: "hsl(var(--chart-3))" },
  } as const;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Investimento e receita por dia · período seleccionado
        </CardTitle>
        {gaps > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {gaps} {gaps === 1 ? "dia sem dados" : "dias sem dados"} — aparecem como lacuna, não como
            zero.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {!anyData ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem dados de insights no período seleccionado.
          </p>
        ) : (
          <>
            <ChartContainer config={config} className="aspect-auto h-[248px] w-full">
              <BarChart data={data} margin={{ left: 4, right: 8, top: 4, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval={tickInterval}
                  minTickGap={4}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={68}
                  ticks={moneyTicks}
                  domain={[0, moneyTicks[moneyTicks.length - 1]]}
                  tickFormatter={(v: number) =>
                    formatMoney(v, currency, { maximumFractionDigits: 0 })
                  }
                />
                <ChartTooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0]?.payload as DailyPoint;
                    return <DayTooltip point={p} currency={currency} />;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  iconType="square"
                  wrapperStyle={{ fontSize: 11 }}
                />
                <Bar
                  dataKey="spend"
                  name="Investimento"
                  fill="var(--color-spend)"
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="revenue"
                  name="Receita atribuída"
                  fill="var(--color-revenue)"
                  stroke="var(--color-revenue)"
                  strokeDasharray="3 2"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ChartContainer>

            {/* ROAS em painel próprio — escala diferente, nunca segundo eixo vertical. */}
            <ChartContainer config={config} className="aspect-auto h-[92px] w-full">
              <LineChart data={data} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval={tickInterval}
                  minTickGap={4}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={68}
                  ticks={roasTicks}
                  domain={[0, roasTicks[roasTicks.length - 1]]}
                  tickFormatter={(v: number) => `${v}x`}
                />
                <ReferenceLine y={1} strokeDasharray="4 4" stroke="hsl(var(--muted-foreground))" />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0]?.payload as DailyPoint;
                    return <DayTooltip point={p} currency={currency} />;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={20}
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 11 }}
                />
                <Line
                  type="monotone"
                  dataKey="roas"
                  name="ROAS"
                  stroke="var(--color-roas)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DayTooltip({ point, currency }: { point: DailyPoint; currency: string }) {
  if (!point) return null;
  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums font-medium">{value}</span>
    </div>
  );
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md min-w-[188px]">
      <div className="mb-1 font-semibold">{point.label}</div>
      {!point.hasData ? (
        <div className="text-muted-foreground">Sem dados neste dia (lacuna).</div>
      ) : (
        <div className="space-y-0.5">
          {row("Investimento", formatMoney(point.spend, currency))}
          {row("Receita", formatMoney(point.revenue, currency))}
          {row("ROAS", formatRoas(point.roas))}
          {row("Compras", point.purchases != null ? String(point.purchases) : "—")}
          {row("CPA", point.cpa != null ? formatMoney(point.cpa, currency) : "—")}
          {row("CTR", point.ctr != null ? `${(point.ctr * 100).toFixed(2)}%` : "—")}
        </div>
      )}
    </div>
  );
}
