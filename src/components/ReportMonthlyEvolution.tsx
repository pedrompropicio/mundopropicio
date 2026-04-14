import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function ReportMonthlyEvolution() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  const { data: transactions = [] } = useQuery({
    queryKey: ["monthly-evolution-txs", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("type, amount, paid_amount, status, date, is_transitory, exclude_from_result")
        .in("status", ["approved", "paid"])
        .gte("date", `${year}-01-01`)
        .lte("date", `${year}-12-31`);
      if (error) throw error;
      return data;
    },
  });

  const monthlyData = useMemo(() => {
    const data = MONTHS.map((month, idx) => ({
      month,
      revenue: 0,
      expense: 0,
      margin: 0,
    }));

    for (const tx of transactions) {
      if (tx.is_transitory || tx.exclude_from_result) continue;
      const m = new Date(tx.date).getMonth();
      const amt = Number(tx.amount);
      if (tx.type === "income") {
        data[m].revenue += amt;
      } else {
        data[m].expense += amt;
      }
    }

    data.forEach((d) => { d.margin = d.revenue - d.expense; });
    return data;
  }, [transactions]);

  const totals = monthlyData.reduce(
    (acc, d) => ({ revenue: acc.revenue + d.revenue, expense: acc.expense + d.expense, margin: acc.margin + d.margin }),
    { revenue: 0, expense: 0, margin: 0 }
  );

  const chartConfig = {
    revenue: { label: "Receita", color: "hsl(var(--success))" },
    expense: { label: "Despesa", color: "hsl(var(--warning))" },
    margin: { label: "Margem", color: "hsl(var(--primary))" },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Ano:</span>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <ChartContainer config={chartConfig} className="h-[350px] w-full">
        <LineChart data={monthlyData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <ChartTooltip content={<ChartTooltipContent formatter={(val) => formatCurrency(Number(val))} />} />
          <Line type="monotone" dataKey="revenue" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="expense" stroke="hsl(var(--warning))" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="margin" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ChartContainer>

      <div className="glass rounded-xl p-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead className="text-right">Receita</TableHead>
              <TableHead className="text-right">Despesa</TableHead>
              <TableHead className="text-right">Margem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthlyData.map((d) => (
              <TableRow key={d.month}>
                <TableCell className="font-medium">{d.month}</TableCell>
                <TableCell className="text-right font-mono text-success">{formatCurrency(d.revenue)}</TableCell>
                <TableCell className="text-right font-mono text-warning">{formatCurrency(d.expense)}</TableCell>
                <TableCell className={`text-right font-mono font-semibold ${d.margin >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(d.margin)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <tfoot>
            <tr className="border-t-2 border-border/60 font-semibold">
              <td className="pt-3 pr-4">Total {year}</td>
              <td className="pt-3 text-right font-mono text-success">{formatCurrency(totals.revenue)}</td>
              <td className="pt-3 text-right font-mono text-warning">{formatCurrency(totals.expense)}</td>
              <td className={`pt-3 text-right font-mono ${totals.margin >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(totals.margin)}</td>
            </tr>
          </tfoot>
        </Table>
      </div>
    </div>
  );
}
