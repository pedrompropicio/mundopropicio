import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import { Progress } from "@/components/ui/progress";
import { fetchAllPaged } from "@/lib/supabase-paging";
import { fetchTicketlineCutoffs, keepTicketSaleRow, cumulativeWithCutoff } from "@/lib/ticketline-cutoff";

export default function ReportOccupancyRate() {
  // Vendidos = acumulado da plataforma (ticket_sales por zona, com o corte dos
  // eventos Ticketline migrados — regra única em lib/ticketline-cutoff), igual à
  // capa e à aba Bilheteira. events.tickets_sold NÃO é alimentado por nenhum
  // caminho (0 em todos os eventos) e deixou de ser lido aqui.
  // Capacidade = soma de total_capacity das zonas; fallback events.tickets_total.
  const { data, isLoading } = useQuery({
    queryKey: ["occupancy-events-v2"],
    queryFn: async () => {
      const { data: evs, error } = await supabase
        .from("events")
        .select("id, name, status, date, tickets_total, parent_event_id")
        .in("status", ["active", "completed"])
        .order("date", { ascending: false });
      if (error) throw error;
      const events = evs ?? [];
      const ids = events.map((e) => e.id);
      const zones = ids.length
        ? await fetchAllPaged<any>((from, to) =>
            supabase.from("event_ticket_zones").select("id, event_id, total_capacity")
              .in("event_id", ids).order("id", { ascending: true }).range(from, to))
        : [];
      const zoneIds = zones.map((z) => z.id);
      const sales = zoneIds.length
        ? await fetchAllPaged<any>((from, to) =>
            supabase.from("ticket_sales").select("zone_id, quantity, unit_price, sale_date")
              .in("zone_id", zoneIds).order("id", { ascending: true }).range(from, to))
        : [];
      const cutoffs = await fetchTicketlineCutoffs(ids);
      return { events, zones, sales, cutoffs };
    },
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    const { events, zones, sales, cutoffs } = data;
    const zoneEvent: Record<string, string> = {};
    const cap: Record<string, number> = {};
    zones.forEach((z: any) => {
      zoneEvent[z.id] = z.event_id;
      cap[z.event_id] = (cap[z.event_id] ?? 0) + Number(z.total_capacity ?? 0);
    });
    const base: Record<string, { qty: number; value: number }> = {};
    sales.forEach((s: any) => {
      const eid = zoneEvent[s.zone_id];
      if (!eid || !keepTicketSaleRow(cutoffs, eid, s.sale_date)) return;
      const b = (base[eid] ??= { qty: 0, value: 0 });
      b.qty += Number(s.quantity ?? 0);
      b.value += Number(s.quantity ?? 0) * Number(s.unit_price ?? 0);
    });
    return events
      .map((e) => {
        const sold = cumulativeWithCutoff(base[e.id] ?? { qty: 0, value: 0 }, cutoffs.get(e.id)).qty;
        const total = cap[e.id] > 0 ? cap[e.id] : Number(e.tickets_total ?? 0);
        return {
          name: e.name.length > 20 ? e.name.slice(0, 18) + "…" : e.name,
          fullName: e.name,
          rate: total > 0 ? (sold / total) * 100 : 0,
          sold,
          total,
        };
      })
      .filter((d) => d.total > 0)
      .sort((a, b) => b.rate - a.rate);
  }, [data]);

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
