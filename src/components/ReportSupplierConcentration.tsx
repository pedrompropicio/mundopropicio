import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Line, ComposedChart, Cell } from "recharts";
import { Badge } from "@/components/ui/badge";

export default function ReportSupplierConcentration() {
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["concentration-txs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("supplier_id, amount, type, status, suppliers(name)")
        .eq("type", "expense")
        .in("status", ["approved", "paid"])
        .not("supplier_id", "is", null);
      if (error) throw error;
      return data;
    },
  });

  const supplierData = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const tx of transactions) {
      if (!tx.supplier_id) continue;
      const name = (tx.suppliers as any)?.name ?? "Desconhecido";
      const existing = map.get(tx.supplier_id) ?? { name, total: 0, count: 0 };
      existing.total += Number(tx.amount);
      existing.count += 1;
      map.set(tx.supplier_id, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [transactions]);

  const grandTotal = supplierData.reduce((s, d) => s + d.total, 0);

  const paretoData = useMemo(() => {
    let cumulative = 0;
    return supplierData.slice(0, 20).map((d) => {
      cumulative += d.total;
      return {
        name: d.name.length > 15 ? d.name.slice(0, 13) + "…" : d.name,
        value: d.total,
        cumPct: grandTotal > 0 ? (cumulative / grandTotal) * 100 : 0,
      };
    });
  }, [supplierData, grandTotal]);

  const top80Idx = paretoData.findIndex((d) => d.cumPct >= 80);
  const chartConfig = { value: { label: "Despesa", color: "hsl(var(--primary))" }, cumPct: { label: "% Acumulada", color: "hsl(var(--warning))" } };

  if (isLoading) return <p className="py-8 text-center text-muted-foreground">A carregar…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Fornecedores</p>
          <p className="text-2xl font-bold">{supplierData.length}</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Despesas</p>
          <p className="text-lg font-bold font-mono">{formatCurrency(grandTotal)}</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Top 80% em</p>
          <p className="text-2xl font-bold">{top80Idx >= 0 ? top80Idx + 1 : "—"} <span className="text-sm font-normal text-muted-foreground">fornecedores</span></p>
        </div>
      </div>

      {paretoData.length > 0 && (
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
          <ComposedChart data={paretoData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
            <YAxis yAxisId="left" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar yAxisId="left" dataKey="value" radius={[4, 4, 0, 0]}>
              {paretoData.map((_, idx) => (
                <Cell key={idx} fill={idx <= (top80Idx >= 0 ? top80Idx : 0) ? "hsl(var(--primary))" : "hsl(var(--muted-foreground)/0.3)"} />
              ))}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="cumPct" stroke="hsl(var(--warning))" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ChartContainer>
      )}

      <div className="glass rounded-xl p-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead className="text-center">Transações</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">% do Total</TableHead>
              <TableHead className="text-right">% Acumulada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              let cum = 0;
              return supplierData.slice(0, 30).map((d, idx) => {
                cum += d.total;
                const pct = grandTotal > 0 ? (d.total / grandTotal) * 100 : 0;
                const cumPct = grandTotal > 0 ? (cum / grandTotal) * 100 : 0;
                return (
                  <TableRow key={idx}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-center">{d.count}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(d.total)}</TableCell>
                    <TableCell className="text-right">{pct.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={cumPct <= 80 ? "default" : "secondary"}>{cumPct.toFixed(1)}%</Badge>
                    </TableCell>
                  </TableRow>
                );
              });
            })()}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
