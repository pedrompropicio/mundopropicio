import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { formatLisbonDateTime } from "@/lib/date-lisbon";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info } from "lucide-react";

type SeriesPoint = {
  day: string;
  l3_code: string | null;
  l3_name: string | null;
  l2_code: string | null;
  l1_code: string | null;
  amount: number;
};
type Marker = { kind: string; at: string; label: string | null; total: number | null };
type Evolution = {
  series: SeriesPoint[];
  origin: SeriesPoint[];
  markers: Marker[];
  audit_from: string;
  from: string;
  to: string;
};

type ChangeField = { field: string; label: string; before: string | null; after: string | null };
type BPChange = {
  changed_at: string;
  action: string;
  author: string;
  forecast_id: string;
  description: string | null;
  forecast_type: string | null;
  changes: ChangeField[] | null;
};

const PERIODS = [
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "origin", label: "Desde a origem" },
] as const;

const LEVELS = [
  { value: "l1_code", label: "Nível 1" },
  { value: "l2_code", label: "Nível 2" },
  { value: "l3_code", label: "Nível 3" },
] as const;

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 160 60% 45%))",
  "hsl(var(--chart-3, 30 80% 55%))",
  "hsl(var(--chart-4, 280 65% 60%))",
  "hsl(var(--chart-5, 340 75% 55%))",
  "hsl(200 70% 50%)",
  "hsl(90 55% 45%)",
  "hsl(15 75% 55%)",
];

function num(v: string | null): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function BPEvolution({ eventId }: { eventId: string }) {
  const [period, setPeriod] = useState<string>("90");
  const [level, setLevel] = useState<"l1_code" | "l2_code" | "l3_code">("l1_code");

  const { data, isLoading } = useQuery({
    queryKey: ["bp-evolution", eventId, period],
    enabled: !!eventId,
    queryFn: async () => {
      const params: Record<string, unknown> = { _event_id: eventId };
      if (period === "30" || period === "90") {
        const from = new Date();
        from.setDate(from.getDate() - (Number(period) - 1));
        params._from = from.toISOString().slice(0, 10);
      } else {
        params._from = "2026-06-17";
      }
      const { data, error } = await supabase.rpc("event_bp_evolution" as any, params as any);
      if (error) throw error;
      return data as unknown as Evolution;
    },
  });

  const { data: changes = [] } = useQuery({
    queryKey: ["bp-evolution-changes", eventId, period],
    enabled: !!eventId,
    queryFn: async () => {
      const days = period === "30" ? 30 : period === "90" ? 90 : 400;
      const { data, error } = await supabase.rpc("get_event_bp_changes" as any, {
        p_event_id: eventId,
        p_days: days,
      });
      if (error) throw error;
      return (data ?? []) as BPChange[];
    },
  });

  const originTotal = useMemo(
    () => (data?.origin ?? []).reduce((s, p) => s + Number(p.amount || 0), 0),
    [data],
  );

  const { chartData, keys } = useMemo(() => {
    const series = data?.series ?? [];
    const byDay = new Map<string, Record<string, number>>();
    const keySet = new Set<string>();
    for (const p of series) {
      const day = String(p.day).slice(0, 10);
      const raw = (p as any)[level] as string | null;
      const key = raw || "sem rubrica";
      keySet.add(key);
      const row = byDay.get(day) ?? {};
      row[key] = (row[key] ?? 0) + Number(p.amount || 0);
      byDay.set(day, row);
    }
    const ordered = [...keySet].sort();
    const rows = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, vals]) => ({ day, ...vals }));
    return { chartData: rows, keys: ordered };
  }, [data, level]);

  const chartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {};
    keys.forEach((k, i) => {
      cfg[k] = { label: k, color: PALETTE[i % PALETTE.length] };
    });
    return cfg;
  }, [keys]);

  const topMoves = useMemo(() => {
    const rows = changes
      .map((c) => {
        const f = (c.changes ?? []).find((x) => x.field === "amount");
        const before = num(f?.before ?? null);
        const after = num(f?.after ?? null);
        let delta = 0;
        if (c.action === "create") delta = after ?? 0;
        else if (c.action === "delete") delta = -(before ?? 0);
        else delta = (after ?? 0) - (before ?? 0);
        return { c, delta };
      })
      .filter((r) => r.delta !== 0 && r.c.forecast_type !== "income");
    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return rows.slice(0, 20);
  }, [changes]);

  const versionMarkers = (data?.markers ?? []).filter((m) => m.kind === "version");
  const annotatedMarkers = (data?.markers ?? []).filter((m) => m.kind === "annotated_change");
  const isEmpty = !isLoading && chartData.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
          {LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setLevel(l.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                level === l.value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          Previsto de despesa reconstruído a partir do registo de alterações. Sem histórico antes de{" "}
          {data?.audit_from ?? "2026-06-17"}.
        </p>
      </div>

      <div className="glass rounded-xl p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Evolução do previsto de despesa</h3>
          <span className="text-xs text-muted-foreground">
            Previsto original: <span className="font-mono">{formatCurrency(originTotal)}</span>
          </span>
        </div>

        {isLoading && <p className="text-xs text-muted-foreground">A carregar…</p>}

        {isEmpty && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Sem série para este período. O registo de alterações só começa em {data?.audit_from ?? "2026-06-17"};
            antes disso existe apenas o previsto original ({formatCurrency(originTotal)}).
          </div>
        )}

        {!isLoading && chartData.length > 0 && (
          <ChartContainer config={chartConfig} className="h-[320px] w-full">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ReferenceLine
                y={originTotal}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                label={{ value: "Original", fontSize: 10, position: "insideTopRight" }}
              />
              {versionMarkers.map((m) => (
                <ReferenceLine
                  key={m.at}
                  x={String(m.at).slice(0, 10)}
                  stroke="hsl(var(--primary))"
                  strokeDasharray="2 2"
                  label={{ value: m.label ?? "Versão", fontSize: 9, position: "insideTopLeft" }}
                />
              ))}
              {keys.map((k, i) => (
                <Area
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stackId="1"
                  stroke={PALETTE[i % PALETTE.length]}
                  fill={PALETTE[i % PALETTE.length]}
                  fillOpacity={0.25}
                />
              ))}
            </AreaChart>
          </ChartContainer>
        )}

        {(versionMarkers.length > 0 || annotatedMarkers.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {versionMarkers.map((m) => (
              <span
                key={`v-${m.at}`}
                className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                title={m.total !== null ? formatCurrency(Number(m.total)) : undefined}
              >
                {m.label} · {formatLisbonDateTime(m.at)}
                {m.total !== null ? ` · ${formatCurrency(Number(m.total))}` : ""}
              </span>
            ))}
            {annotatedMarkers.slice(0, 8).map((m, i) => (
              <span
                key={`a-${m.at}-${i}`}
                className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                title={m.label ?? undefined}
              >
                {formatLisbonDateTime(m.at)} · {(m.label ?? "").slice(0, 40)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="glass rounded-xl p-4">
        <h3 className="mb-2 text-sm font-semibold">Maiores movimentos do período</h3>
        {topMoves.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem movimentos de valor no período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Rubrica</TableHead>
                <TableHead className="text-xs">Data</TableHead>
                <TableHead className="text-xs">Quem</TableHead>
                <TableHead className="text-right text-xs">Δ €</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topMoves.map(({ c, delta }, i) => (
                <TableRow key={`${c.forecast_id}-${c.changed_at}-${i}`}>
                  <TableCell className="text-xs">{c.description || "sem descrição"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatLisbonDateTime(c.changed_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.author}</TableCell>
                  <TableCell
                    className={`text-right font-mono text-xs ${delta > 0 ? "text-warning" : "text-success"}`}
                  >
                    {delta > 0 ? "+" : ""}
                    {formatCurrency(delta)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

export default BPEvolution;
