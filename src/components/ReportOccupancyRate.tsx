import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import { Progress } from "@/components/ui/progress";

export default function ReportOccupancyRate() {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["occupancy-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, status, date, tickets_sold, tickets_total, parent_event_id")
        .in("status", ["active", "completed"])
        .gt("tickets_total", 0)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const chartData = useMemo(() => {
    return events.filter((e) => !e.parent_event_id).map((e) => ({
      name: e.name.length > 20 ? e.name.slice(0, 18) + "…" : e.name,
      fullName: e.name,
      rate: e.tickets_total > 0 ? (e.tickets_sold / e.tickets_total) * 100 : 0,
      sold: e.tickets_sold,
      total: e.tickets_total,
    })).sort((a, b) => b.rate - a.rate);
  }, [events]);

  const avgRate = chartData.length > 0 ? chartData.reduce((s, d) => s + d.rate, 0) / chartData.length : 0;
  const chartConfig = { rate: { label: "Ocupação %", color: "hsl(var(--primary))" } };

  if (isLoading) return <p className="py-8 text-center text-muted-foreground">A carregar…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Eventos</p>
          <p className="text-2xl font-bold">{chartData.length}</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Ocupação Média</p>
          <p className="text-2xl font-bold">{avgRate.toFixed(1)}%</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Bilhetes Vendidos</p>
          <p className="text-2xl font-bold">{chartData.reduce((s, d) => s + d.sold, 0).toLocaleString()}</p>
        </div>
      </div>

      {chartData.length > 0 && (
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
          <BarChart data={chartData.slice(0, 15)} layout="vertical" margin={{ left: 130 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent formatter={(val) => `${Number(val).toFixed(1)}%`} />} />
            <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
              {chartData.slice(0, 15).map((entry, idx) => (
                <Cell key={idx} fill={entry.rate >= 80 ? "hsl(var(--success))" : entry.rate >= 50 ? "hsl(var(--warning))" : "hsl(var(--destructive))"} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}

      <div className="glass rounded-xl p-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead className="text-center">Vendidos</TableHead>
              <TableHead className="text-center">Capacidade</TableHead>
              <TableHead className="w-40">Ocupação</TableHead>
              <TableHead className="text-right">%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chartData.map((d, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{d.fullName}</TableCell>
                <TableCell className="text-center">{d.sold.toLocaleString()}</TableCell>
                <TableCell className="text-center">{d.total.toLocaleString()}</TableCell>
                <TableCell><Progress value={d.rate} className="h-2" /></TableCell>
                <TableCell className={`text-right font-mono font-semibold ${d.rate >= 80 ? "text-success" : d.rate >= 50 ? "text-warning" : "text-destructive"}`}>{d.rate.toFixed(1)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
