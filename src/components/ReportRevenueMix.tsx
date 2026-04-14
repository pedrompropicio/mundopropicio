import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(210, 70%, 50%)",
  "hsl(280, 70%, 50%)",
  "hsl(30, 70%, 50%)",
  "hsl(160, 70%, 50%)",
];

export default function ReportRevenueMix() {
  const [selectedEventId, setSelectedEventId] = useState<string>("all");

  const { data: events = [] } = useQuery({
    queryKey: ["revenue-mix-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, status, parent_event_id")
        .in("status", ["active", "completed"])
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["revenue-mix-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name, type");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["revenue-mix-txs", selectedEventId],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("amount, type, account_id, event_id")
        .eq("type", "income")
        .in("status", ["approved", "paid"]);
      if (selectedEventId !== "all") {
        query = query.eq("event_id", selectedEventId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const mixData = useMemo(() => {
    const byAccount = new Map<string, { name: string; total: number }>();
    for (const tx of transactions) {
      const accId = tx.account_id ?? "direct";
      const acc = accounts.find((a) => a.id === accId);
      const name = acc?.name ?? "Receita Direta";
      const existing = byAccount.get(accId) ?? { name, total: 0 };
      existing.total += Number(tx.amount);
      byAccount.set(accId, existing);
    }
    return Array.from(byAccount.values()).sort((a, b) => b.total - a.total);
  }, [transactions, accounts]);

  const grandTotal = mixData.reduce((s, d) => s + d.total, 0);
  const chartData = mixData.map((d, idx) => ({ name: d.name, value: d.total, fill: COLORS[idx % COLORS.length] }));
  const chartConfig = Object.fromEntries(mixData.map((d, idx) => [d.name, { label: d.name, color: COLORS[idx % COLORS.length] }]));

  const parentEvents = events.filter((e) => !e.parent_event_id);

  return (
    <div className="space-y-6">
      <Select value={selectedEventId} onValueChange={setSelectedEventId}>
        <SelectTrigger className="w-full max-w-md"><SelectValue placeholder="Todos os eventos" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os eventos</SelectItem>
          {parentEvents.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {chartData.length > 0 && (
        <div className="flex flex-col items-center sm:flex-row sm:items-start gap-6">
          <ChartContainer config={chartConfig} className="h-[280px] w-[280px]">
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={2}>
                {chartData.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent formatter={(val) => formatCurrency(Number(val))} />} />
            </PieChart>
          </ChartContainer>

          <div className="flex-1 space-y-2">
            {mixData.map((d, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                <span className="text-sm flex-1">{d.name}</span>
                <span className="text-sm font-mono">{formatCurrency(d.total)}</span>
                <span className="text-xs text-muted-foreground w-12 text-right">{grandTotal > 0 ? ((d.total / grandTotal) * 100).toFixed(1) : "0"}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass rounded-xl p-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Canal / Conta</TableHead>
              <TableHead className="text-right">Receita</TableHead>
              <TableHead className="text-right">% do Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mixData.map((d, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="text-right font-mono text-success">{formatCurrency(d.total)}</TableCell>
                <TableCell className="text-right">{grandTotal > 0 ? ((d.total / grandTotal) * 100).toFixed(1) : "0"}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <tfoot>
            <tr className="border-t-2 border-border/60 font-semibold">
              <td className="pt-3">Total</td>
              <td className="pt-3 text-right font-mono text-success">{formatCurrency(grandTotal)}</td>
              <td className="pt-3 text-right">100%</td>
            </tr>
          </tfoot>
        </Table>
      </div>
    </div>
  );
}
