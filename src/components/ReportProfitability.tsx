import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell } from "recharts";

export default function ReportProfitability() {
  const [view, setView] = useState<"artist" | "venue">("artist");

  const { data: events = [] } = useQuery({
    queryKey: ["profitability-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, status, venue_id, parent_event_id")
        .in("status", ["completed"]);
      if (error) throw error;
      return data;
    },
  });

  const { data: venues = [] } = useQuery({
    queryKey: ["profitability-venues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("venues").select("id, name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: cacheConfigs = [] } = useQuery({
    queryKey: ["profitability-cache"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_cache_configs")
        .select("event_id, artist_name, real_amount, fixed_amount, minimum_guaranteed");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["profitability-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("event_id, type, amount, status, is_transitory, exclude_from_result")
        .in("status", ["approved", "paid"]);
      if (error) throw error;
      return data;
    },
  });

  const artistData = useMemo(() => {
    const map = new Map<string, { artist: string; events: number; totalRevenue: number; totalExpense: number; margin: number }>();
    
    for (const cc of cacheConfigs) {
      const ev = events.find((e) => e.id === cc.event_id);
      if (!ev) continue;
      
      const evTxs = transactions.filter((t) => t.event_id === cc.event_id && !t.is_transitory && !t.exclude_from_result);
      const revenue = evTxs.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
      const expense = evTxs.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
      const margin = revenue - expense;

      const existing = map.get(cc.artist_name);
      if (existing) {
        existing.events += 1;
        existing.totalRevenue += revenue;
        existing.totalExpense += expense;
        existing.margin += margin;
      } else {
        map.set(cc.artist_name, { artist: cc.artist_name, events: 1, totalRevenue: revenue, totalExpense: expense, margin });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.margin - a.margin);
  }, [cacheConfigs, events, transactions]);

  const venueData = useMemo(() => {
    const map = new Map<string, { venue: string; events: number; totalRevenue: number; totalExpense: number; margin: number }>();
    
    for (const ev of events) {
      if (!ev.venue_id) continue;
      const venue = venues.find((v) => v.id === ev.venue_id);
      const venueName = venue?.name ?? "Desconhecido";

      const evTxs = transactions.filter((t) => t.event_id === ev.id && !t.is_transitory && !t.exclude_from_result);
      const revenue = evTxs.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
      const expense = evTxs.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
      const margin = revenue - expense;

      const existing = map.get(venueName);
      if (existing) {
        existing.events += 1;
        existing.totalRevenue += revenue;
        existing.totalExpense += expense;
        existing.margin += margin;
      } else {
        map.set(venueName, { venue: venueName, events: 1, totalRevenue: revenue, totalExpense: expense, margin });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.margin - a.margin);
  }, [events, venues, transactions]);

  const data = view === "artist" ? artistData : venueData;
  const nameKey = view === "artist" ? "artist" : "venue";
  const chartData = data.slice(0, 15).map((d) => ({
    name: (d as any)[nameKey].length > 20 ? (d as any)[nameKey].slice(0, 18) + "…" : (d as any)[nameKey],
    margin: d.margin,
  }));

  const chartConfig = { margin: { label: "Margem", color: "hsl(var(--primary))" } };

  return (
    <div className="space-y-6">
      <Tabs value={view} onValueChange={(v) => setView(v as any)}>
        <TabsList>
          <TabsTrigger value="artist">Por Artista</TabsTrigger>
          <TabsTrigger value="venue">Por Venue</TabsTrigger>
        </TabsList>
      </Tabs>

      {chartData.length > 0 && (
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent formatter={(val) => formatCurrency(Number(val))} />} />
            <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={entry.margin >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}

      <div className="glass rounded-xl p-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{view === "artist" ? "Artista" : "Venue"}</TableHead>
              <TableHead className="text-center">Eventos</TableHead>
              <TableHead className="text-right">Receita Total</TableHead>
              <TableHead className="text-right">Despesa Total</TableHead>
              <TableHead className="text-right">Margem</TableHead>
              <TableHead className="text-right">Margem %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sem dados de eventos concluídos</TableCell></TableRow>
            ) : data.map((d, idx) => {
              const name = (d as any)[nameKey];
              const marginPct = d.totalRevenue > 0 ? ((d.margin / d.totalRevenue) * 100) : 0;
              return (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell className="text-center">{d.events}</TableCell>
                  <TableCell className="text-right font-mono text-success">{formatCurrency(d.totalRevenue)}</TableCell>
                  <TableCell className="text-right font-mono text-warning">{formatCurrency(d.totalExpense)}</TableCell>
                  <TableCell className={`text-right font-mono font-semibold ${d.margin >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(d.margin)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={marginPct >= 0 ? "default" : "destructive"}>{marginPct.toFixed(1)}%</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
