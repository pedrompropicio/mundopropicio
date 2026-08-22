import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/currency";
import { formatCurrency, formatPercent } from "@/lib/crm/dashboard-format";
import { niceTicks } from "@/lib/crm/daily-series";
import { lisbonToday } from "@/lib/date-lisbon";
import {
  buildSalesImpactSeries,
  computeSalesImpact,
  salesImpactWindow,
  type DailySaleRow,
  type SalesImpactPoint,
} from "@/lib/crm/sales-impact";
import type { InsightRow } from "@/components/crm/dashboard/types";
import { format, parseISO } from "date-fns";

/**
 * Painel de impacto nas vendas, por evento.
 *
 * Sobrepõe (em dois gráficos empilhados que partilham o eixo de datas — nunca
 * dois eixos verticais no mesmo gráfico) os bilhetes vendidos por dia na
 * bilheteira com o investimento diário por plataforma, e marca o dia de
 * arranque de cada plataforma.
 *
 * Serve para VER o impacto em vez de o deduzir do pixel: quando a atribuição
 * está partida (o `fbc` não chega ao Purchase da Ticketline), a série da
 * bilheteira é a fonte de verdade. A leitura em números é uma **variação após
 * o arranque** — correlação, não experiência controlada.
 *
 * Só alguns eventos têm série diária em `ticketline_daily_sales`. Sem série,
 * o painel diz isso explicitamente e não desenha gráfico vazio.
 */
export function SalesImpactPanel({
  eventId,
  insights,
  days,
  currency,
}: {
  eventId: string;
  insights: InsightRow[];
  days: number;
  currency: string;
}) {
  const today = useMemo(() => lisbonToday(), []);
  const { from, to } = useMemo(() => salesImpactWindow(today, days), [today, days]);
  const fromIso = format(from, "yyyy-MM-dd");
  const toIso = format(to, "yyyy-MM-dd");

  const { data: sales, isLoading } = useQuery({
    queryKey: ["crm-sales-impact", eventId, fromIso, toIso],
    queryFn: async (): Promise<DailySaleRow[]> => {
      const { data, error } = await supabase
        .from("ticketline_daily_sales")
        .select("sale_date, quantity, total_value")
        .eq("event_id", eventId)
        .gte("sale_date", fromIso)
        .lte("sale_date", toIso)
        .order("sale_date");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const points = useMemo(
    () => buildSalesImpactSeries(sales ?? [], insights, from, to),
    [sales, insights, from, to],
  );
  const summary = useMemo(() => computeSalesImpact(points, insights), [points, insights]);

  const hasSeries = (sales?.length ?? 0) > 0;

  const maxTickets = useMemo(
    () => points.reduce((m, p) => Math.max(m, p.tickets ?? 0), 0),
    [points],
  );
  const ticketTicks = useMemo(() => niceTicks(maxTickets, 3), [maxTickets]);
  const maxSpend = useMemo(
    () => points.reduce((m, p) => Math.max(m, (p.metaSpend ?? 0) + (p.googleSpend ?? 0)), 0),
    [points],
  );
  const spendTicks = useMemo(() => niceTicks(maxSpend, 2), [maxSpend]);
  const tickInterval = points.length > 21 ? Math.ceil(points.length / 12) - 1 : 0;

  const config = {
    tickets: { label: "Bilhetes vendidos", color: "hsl(var(--chart-3))" },
    metaSpend: { label: "Investimento Meta", color: "hsl(var(--chart-1))" },
    googleSpend: { label: "Investimento Google", color: "hsl(var(--chart-2))" },
  } as const;

  const startMarks = (
    <>
      {summary.metaStart && (
        <ReferenceLine
          x={format(parseISO(summary.metaStart), "dd/MM")}
          stroke="hsl(var(--chart-1))"
          strokeDasharray="4 3"
        />
      )}
      {summary.googleStart && (
        <ReferenceLine
          x={format(parseISO(summary.googleStart), "dd/MM")}
          stroke="hsl(var(--chart-2))"
          strokeDasharray="4 3"
        />
      )}
    </>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Impacto nas vendas · bilheteira vs investimento
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Como ler este painel">
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[320px] text-xs">
              A variação após o arranque é <strong>correlação, não experiência controlada</strong>.
              Ao mesmo tempo acontecem imprensa, abertura de vendas e outras plataformas — não
              atribuir a diferença à campanha.
            </TooltipContent>
          </Tooltip>
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Série diária da bilheteira (Ticketline) como fonte de verdade, comparada com o que as
          plataformas reportam.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">A carregar série diária…</p>
        ) : !hasSeries ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sem série diária de vendas para este evento. Só os eventos com captura diária da
            Ticketline têm esta série — não é reconstruída a partir de <code>ticket_sales</code>,
            que é agregado por lote e zona.
          </p>
        ) : (
          <>
            {/* Gráfico 1 — bilhetes/dia (escala de unidades). */}
            <ChartContainer config={config} className="aspect-auto h-[200px] w-full">
              <BarChart data={points} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval={tickInterval} minTickGap={4} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={68}
                  ticks={ticketTicks}
                  domain={[0, ticketTicks[ticketTicks.length - 1]]}
                />
                <ChartTooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return <DayTooltip point={payload[0]?.payload as SalesImpactPoint} currency={currency} />;
                  }}
                />
                <Legend verticalAlign="top" height={26} iconType="square" wrapperStyle={{ fontSize: 11 }} />
                {startMarks}
                <Bar dataKey="tickets" name="Bilhetes vendidos" fill="var(--color-tickets)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>

            {/* Gráfico 2 — investimento/dia (escala de dinheiro), mesmo eixo de datas. */}
            <ChartContainer config={config} className="aspect-auto h-[150px] w-full">
              <BarChart data={points} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval={tickInterval} minTickGap={4} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={68}
                  ticks={spendTicks}
                  domain={[0, spendTicks[spendTicks.length - 1]]}
                  tickFormatter={(v: number) => formatMoney(v, currency, { maximumFractionDigits: 0 })}
                />
                <ChartTooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return <DayTooltip point={payload[0]?.payload as SalesImpactPoint} currency={currency} />;
                  }}
                />
                <Legend verticalAlign="top" height={26} iconType="square" wrapperStyle={{ fontSize: 11 }} />
                {startMarks}
                <Bar dataKey="metaSpend" name="Investimento Meta" stackId="s" fill="var(--color-metaSpend)" />
                <Bar dataKey="googleSpend" name="Investimento Google" stackId="s" fill="var(--color-googleSpend)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>

            {summary.firstStart == null ? (
              <p className="text-xs text-muted-foreground">
                Sem investimento registado na janela — não há arranque para comparar.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 md:grid-cols-4">
                <Metric
                  label="Variação após o arranque"
                  value={
                    summary.multiplier != null
                      ? `${summary.multiplier.toFixed(1)}×`
                      : "—"
                  }
                  hint={`${fmtAvg(summary.beforeAvgTickets)} → ${fmtAvg(summary.afterAvgTickets)} bilhetes/dia`}
                />
                <Metric
                  label="Bilhetes depois"
                  value={summary.ticketsAfter.toLocaleString("pt-PT")}
                  hint={`${formatCurrency(Math.round(summary.revenueAfter * 100), currency)} · ${summary.daysAfter}d`}
                />
                <Metric
                  label="Investimento depois"
                  value={formatCurrency(Math.round(summary.spendAfter * 100), currency)}
                  hint={`desde ${format(parseISO(summary.firstStart), "dd/MM")}`}
                />
                <Metric
                  label="Captado pelas plataformas"
                  value={summary.capturedShare != null ? formatPercent(summary.capturedShare, false) : "—"}
                  hint={`${summary.reportedPurchases} compras reportadas vs ${summary.ticketsAfter} bilhetes`}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function fmtAvg(v: number | null): string {
  return v == null ? "—" : v.toFixed(1);
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function DayTooltip({ point, currency }: { point?: SalesImpactPoint; currency: string }) {
  if (!point) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{point.label}</div>
      <div className="tabular-nums">
        Bilhetes: {point.tickets == null ? "sem registo" : point.tickets}
      </div>
      {point.revenue != null && (
        <div className="tabular-nums">
          Receita: {formatCurrency(Math.round(point.revenue * 100), currency)}
        </div>
      )}
      <div className="tabular-nums">
        Meta:{" "}
        {point.metaSpend == null
          ? "—"
          : formatMoney(point.metaSpend, currency)}
      </div>
      <div className="tabular-nums">
        Google:{" "}
        {point.googleSpend == null
          ? "—"
          : formatMoney(point.googleSpend, currency)}
      </div>
    </div>
  );
}
