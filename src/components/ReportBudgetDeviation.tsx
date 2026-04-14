import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, ReferenceLine } from "recharts";
import { buildCategoryLookup } from "@/lib/category-hierarchy";
import { Badge } from "@/components/ui/badge";

export default function ReportBudgetDeviation() {
  const [selectedEventId, setSelectedEventId] = useState<string>("");

  const { data: events = [] } = useQuery({
    queryKey: ["budget-dev-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, status, date, parent_event_id")
        .in("status", ["active", "completed"])
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["budget-dev-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*").eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const { data: forecasts = [] } = useQuery({
    queryKey: ["budget-dev-forecasts", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return [];
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("category_id, amount, type")
        .eq("event_id", selectedEventId)
        .eq("type", "expense");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEventId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["budget-dev-txs", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("category_id, amount, type, status, is_transitory, exclude_from_result")
        .eq("event_id", selectedEventId)
        .eq("type", "expense")
        .in("status", ["approved", "paid"]);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEventId,
  });

  const lookup = useMemo(() => buildCategoryLookup(categories), [categories]);

  const deviationData = useMemo(() => {
    const catMap = new Map<string, { name: string; code: string; forecast: number; actual: number }>();

    for (const f of forecasts) {
      if (!f.category_id) continue;
      const cat = lookup.get(f.category_id);
      const parentId = cat?.parent_id ?? f.category_id;
      const parent = lookup.get(parentId);
      const key = parentId;
      const existing = catMap.get(key) ?? { name: parent?.name ?? "Outros", code: parent?.code ?? "99", forecast: 0, actual: 0 };
      existing.forecast += Number(f.amount);
      catMap.set(key, existing);
    }

    for (const t of transactions) {
      if (t.is_transitory || t.exclude_from_result || !t.category_id) continue;
      const cat = lookup.get(t.category_id);
      const parentId = cat?.parent_id ?? t.category_id;
      const parent = lookup.get(parentId);
      const key = parentId;
      const existing = catMap.get(key) ?? { name: parent?.name ?? "Outros", code: parent?.code ?? "99", forecast: 0, actual: 0 };
      existing.actual += Number(t.amount);
      catMap.set(key, existing);
    }

    return Array.from(catMap.values())
      .map((d) => ({ ...d, deviation: d.actual - d.forecast, deviationPct: d.forecast > 0 ? ((d.actual - d.forecast) / d.forecast) * 100 : 0 }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [forecasts, transactions, lookup]);

  const chartData = deviationData.filter((d) => d.deviation !== 0).slice(0, 12).map((d) => ({
    name: d.name.length > 18 ? d.name.slice(0, 16) + "…" : d.name,
    deviation: d.deviation,
  }));

  const chartConfig = { deviation: { label: "Desvio", color: "hsl(var(--primary))" } };

  const parentEvents = events.filter((e) => !e.parent_event_id);

  return (
    <div className="space-y-6">
      <Select value={selectedEventId} onValueChange={setSelectedEventId}>
        <SelectTrigger className="w-full max-w-md"><SelectValue placeholder="Selecione um evento" /></SelectTrigger>
        <SelectContent>
          {parentEvents.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {selectedEventId && deviationData.length > 0 && (
        <>
          {chartData.length > 0 && (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <ReferenceLine x={0} stroke="hsl(var(--border))" />
                <ChartTooltip content={<ChartTooltipContent formatter={(val) => formatCurrency(Number(val))} />} />
                <Bar dataKey="deviation" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.deviation > 0 ? "hsl(var(--destructive))" : "hsl(var(--success))"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}

          <div className="glass rounded-xl p-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria (L2)</TableHead>
                  <TableHead className="text-right">Previsto (BP)</TableHead>
                  <TableHead className="text-right">Real</TableHead>
                  <TableHead className="text-right">Desvio (€)</TableHead>
                  <TableHead className="text-right">Desvio (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deviationData.map((d) => (
                  <TableRow key={d.code}>
                    <TableCell className="font-medium">{d.code} — {d.name}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(d.forecast)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(d.actual)}</TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${d.deviation > 0 ? "text-destructive" : d.deviation < 0 ? "text-success" : "text-muted-foreground"}`}>
                      {d.deviation > 0 ? "+" : ""}{formatCurrency(d.deviation)}
                    </TableCell>
                    <TableCell className="text-right">
                      {d.forecast > 0 ? (
                        <Badge variant={d.deviationPct > 10 ? "destructive" : d.deviationPct < -10 ? "default" : "secondary"}>
                          {d.deviationPct > 0 ? "+" : ""}{d.deviationPct.toFixed(1)}%
                        </Badge>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {selectedEventId && deviationData.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">Sem dados de BP ou transações para este evento.</p>
      )}
    </div>
  );
}
