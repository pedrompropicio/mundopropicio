import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import { differenceInDays } from "date-fns";

const BUCKETS = [
  { label: "A vencer", min: -Infinity, max: -1, color: "hsl(var(--success))" },
  { label: "0-30 dias", min: 0, max: 30, color: "hsl(var(--warning))" },
  { label: "31-60 dias", min: 31, max: 60, color: "hsl(var(--accent-foreground))" },
  { label: "61-90 dias", min: 61, max: 90, color: "hsl(var(--destructive)/0.7)" },
  { label: "> 90 dias", min: 91, max: Infinity, color: "hsl(var(--destructive))" },
];

export default function ReportAging() {
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["aging-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, paid_amount, date, due_date, status, type, supplier_id, suppliers(name)")
        .eq("type", "expense")
        .in("status", ["pending", "approved"]);
      if (error) throw error;
      return data;
    },
  });

  const today = new Date();

  const agingData = useMemo(() => {
    const buckets = BUCKETS.map((b) => ({ ...b, total: 0, count: 0, items: [] as typeof transactions }));

    for (const tx of transactions) {
      const dueDate = tx.due_date ?? tx.date;
      const daysOverdue = differenceInDays(today, new Date(dueDate));
      const openAmount = Number(tx.amount) - Number(tx.paid_amount ?? 0);
      if (openAmount <= 0) continue;

      const bucket = buckets.find((b) => daysOverdue >= b.min && daysOverdue <= b.max);
      if (bucket) {
        bucket.total += openAmount;
        bucket.count += 1;
        bucket.items.push(tx);
      }
    }
    return buckets;
  }, [transactions]);

  const grandTotal = agingData.reduce((s, b) => s + b.total, 0);
  const chartData = agingData.map((b) => ({ name: b.label, value: b.total, color: b.color }));
  const chartConfig = { value: { label: "Valor", color: "hsl(var(--primary))" } };

  if (isLoading) return <p className="py-8 text-center text-muted-foreground">A carregar…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {agingData.map((b) => (
          <div key={b.label} className="glass rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground">{b.label}</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(b.total)}</p>
            <p className="text-xs text-muted-foreground">{b.count} transações</p>
          </div>
        ))}
      </div>

      {grandTotal > 0 && (
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <ChartTooltip content={<ChartTooltipContent formatter={(val) => formatCurrency(Number(val))} />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}

      <div className="glass rounded-xl p-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Faixa</TableHead>
              <TableHead className="text-center">Quantidade</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">% do Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agingData.map((b) => (
              <TableRow key={b.label}>
                <TableCell className="font-medium">{b.label}</TableCell>
                <TableCell className="text-center">{b.count}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(b.total)}</TableCell>
                <TableCell className="text-right">{grandTotal > 0 ? ((b.total / grandTotal) * 100).toFixed(1) : "0.0"}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <tfoot>
            <tr className="border-t-2 border-border/60 font-semibold">
              <td className="pt-3">Total</td>
              <td className="pt-3 text-center">{agingData.reduce((s, b) => s + b.count, 0)}</td>
              <td className="pt-3 text-right font-mono">{formatCurrency(grandTotal)}</td>
              <td className="pt-3 text-right">100%</td>
            </tr>
          </tfoot>
        </Table>
      </div>
    </div>
  );
}
