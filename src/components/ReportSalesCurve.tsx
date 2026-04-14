import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { format, parseISO, differenceInDays, startOfDay } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ReportSalesCurve() {
  const [selectedEventId, setSelectedEventId] = useState<string>("");

  const { data: events = [] } = useQuery({
    queryKey: ["sales-curve-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, status, date, tickets_total, parent_event_id")
        .in("status", ["active", "completed"])
        .gt("tickets_total", 0)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: salesLog = [] } = useQuery({
    queryKey: ["sales-curve-log", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return [];
      // Use ticket office transactions as a proxy for sales
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, date, type")
        .eq("event_id", selectedEventId)
        .eq("type", "income")
        .in("status", ["approved", "paid"])
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEventId,
  });

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  const curveData = useMemo(() => {
    if (!salesLog.length || !selectedEvent) return [];

    const byDate = new Map<string, number>();
    for (const tx of salesLog) {
      const d = tx.date;
      byDate.set(d, (byDate.get(d) ?? 0) + Number(tx.amount));
    }

    const sorted = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    let cumulative = 0;
    return sorted.map(([date, amount]) => {
      cumulative += amount;
      return { date, label: format(parseISO(date), "dd/MM"), daily: amount, cumulative };
    });
  }, [salesLog, selectedEvent]);

  const chartConfig = {
    cumulative: { label: "Receita Acumulada", color: "hsl(var(--primary))" },
    daily: { label: "Receita Diária", color: "hsl(var(--success))" },
  };

  const parentEvents = events.filter((e) => !e.parent_event_id);

  return (
    <div className="space-y-6">
      <Select value={selectedEventId} onValueChange={setSelectedEventId}>
        <SelectTrigger className="w-full max-w-md"><SelectValue placeholder="Selecione um evento" /></SelectTrigger>
        <SelectContent>
          {parentEvents.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {selectedEventId && curveData.length > 0 && (
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
          <AreaChart data={curveData}>
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <ChartTooltip content={<ChartTooltipContent formatter={(val) => formatCurrency(Number(val))} />} />
            <Area type="monotone" dataKey="cumulative" stroke="hsl(var(--primary))" fill="url(#salesGradient)" strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
      )}

      {selectedEventId && curveData.length > 0 && (
        <div className="glass rounded-xl p-4 overflow-x-auto max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Receita Diária</TableHead>
                <TableHead className="text-right">Acumulado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {curveData.map((d) => (
                <TableRow key={d.date}>
                  <TableCell>{format(parseISO(d.date), "dd/MM/yyyy")}</TableCell>
                  <TableCell className="text-right font-mono text-success">{formatCurrency(d.daily)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{formatCurrency(d.cumulative)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedEventId && curveData.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">Sem dados de receitas para este evento.</p>
      )}
    </div>
  );
}
