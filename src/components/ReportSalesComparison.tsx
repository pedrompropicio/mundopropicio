import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { format, parseISO, differenceInDays } from "date-fns";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(210, 70%, 50%)",
  "hsl(280, 70%, 50%)",
];

export default function ReportSalesComparison() {
  const { data: events = [] } = useQuery({
    queryKey: ["sales-comparison-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, status, date, tickets_sold, tickets_total, parent_event_id")
        .in("status", ["active", "completed"])
        .gt("tickets_total", 0)
        .is("parent_event_id", null)
        .order("date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["sales-comparison-txs"],
    queryFn: async () => {
      const eventIds = events.map((e) => e.id);
      if (!eventIds.length) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("event_id, amount, date, type")
        .in("event_id", eventIds)
        .eq("type", "income")
        .in("status", ["approved", "paid"])
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: events.length > 0,
  });

  const comparisonData = useMemo(() => {
    // For each event, compute cumulative revenue by days-before-event
    const eventCurves = events.slice(0, 6).map((ev) => {
      const evDate = parseISO(ev.date);
      const evTxs = transactions
        .filter((t) => t.event_id === ev.id)
        .map((t) => ({
          daysBefore: differenceInDays(evDate, parseISO(t.date)),
          amount: Number(t.amount),
        }))
        .filter((t) => t.daysBefore >= 0)
        .sort((a, b) => b.daysBefore - a.daysBefore);

      let cum = 0;
      const points = new Map<number, number>();
      for (const t of evTxs) {
        cum += t.amount;
        points.set(t.daysBefore, cum);
      }
      return { event: ev, points, totalRevenue: cum };
    });

    // Build unified X-axis
    const allDays = new Set<number>();
    eventCurves.forEach((ec) => ec.points.forEach((_, d) => allDays.add(d)));
    const sortedDays = Array.from(allDays).sort((a, b) => b - a);

    const chartPoints = sortedDays.map((day) => {
      const point: any = { daysBefore: day, label: `-${day}d` };
      eventCurves.forEach((ec, idx) => {
        // Find the closest cumulative value
        let val = 0;
        for (const [d, cum] of ec.points) {
          if (d >= day) val = cum;
        }
        point[`ev${idx}`] = val;
      });
      return point;
    });

    return { chartPoints, eventCurves };
  }, [events, transactions]);

  const chartConfig = Object.fromEntries(
    comparisonData.eventCurves.map((ec, idx) => [`ev${idx}`, { label: ec.event.name, color: COLORS[idx % COLORS.length] }])
  );

  return (
    <div className="space-y-6">
      {comparisonData.chartPoints.length > 0 && (
        <ChartContainer config={chartConfig} className="h-[400px] w-full">
          <LineChart data={comparisonData.chartPoints}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {comparisonData.eventCurves.map((_, idx) => (
              <Line key={idx} type="monotone" dataKey={`ev${idx}`} stroke={COLORS[idx % COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ChartContainer>
      )}

      <div className="glass rounded-xl p-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead className="text-center">Vendidos / Cap.</TableHead>
              <TableHead className="w-32">Ocupação</TableHead>
              <TableHead className="text-right">%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.slice(0, 10).map((e) => {
              const rate = e.tickets_total > 0 ? (e.tickets_sold / e.tickets_total) * 100 : 0;
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell className="text-center">{e.tickets_sold} / {e.tickets_total}</TableCell>
                  <TableCell><Progress value={rate} className="h-2" /></TableCell>
                  <TableCell className="text-right font-mono font-semibold">{rate.toFixed(1)}%</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {events.length === 0 && <p className="py-8 text-center text-muted-foreground">Sem eventos com bilheteira configurada.</p>}
    </div>
  );
}
