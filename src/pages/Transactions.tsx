import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatCurrencyDecimal, formatDate, calcIvaAmount } from "@/lib/mock-data";
import type { IvaRate } from "@/lib/mock-data";

export default function Transactions() {
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, events(name), account_categories(name)")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = filter === "all" ? transactions : transactions.filter((t) => t.type === filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Transações</h1>
        <p className="text-sm text-muted-foreground">Todas as movimentações financeiras</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "income", "expense"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              filter === f ? "bg-primary text-primary-foreground glow-primary" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {f === "all" ? "Todas" : f === "income" ? "Receitas" : "Despesas"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass rounded-xl p-5">
        {isLoading ? (
          <p className="py-8 text-center text-muted-foreground">A carregar transações…</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Sem transações registadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 text-left font-medium">Descrição</th>
                  <th className="hidden pb-3 text-left font-medium sm:table-cell">Evento</th>
                  <th className="hidden pb-3 text-left font-medium md:table-cell">Categoria</th>
                  <th className="hidden pb-3 text-center font-medium lg:table-cell">IVA</th>
                  <th className="pb-3 text-left font-medium">Estado</th>
                  <th className="pb-3 text-left font-medium">Data</th>
                  <th className="pb-3 text-right font-medium">Valor s/IVA</th>
                  <th className="pb-3 text-right font-medium">Valor c/IVA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.map((t) => {
                  const eventName = (t.events as any)?.name ?? "—";
                  const categoryName = (t.account_categories as any)?.name ?? "—";
                  const ivaRate = (t.iva_rate ?? 23) as IvaRate;
                  const amount = Number(t.amount);

                  return (
                    <tr key={t.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{t.description}</p>
                        <p className="text-xs text-muted-foreground sm:hidden">{eventName}</p>
                      </td>
                      <td className="hidden py-3 pr-4 text-muted-foreground sm:table-cell">{eventName}</td>
                      <td className="hidden py-3 pr-4 text-muted-foreground md:table-cell">{categoryName}</td>
                      <td className="hidden py-3 pr-4 text-center lg:table-cell">
                        <span className="inline-flex h-6 w-10 items-center justify-center rounded bg-primary/15 text-xs font-bold text-primary">{ivaRate}%</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          t.status === "paid" ? "bg-success/15 text-success" : t.status === "pending" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"
                        }`}>
                          {t.status === "paid" ? "Pago" : t.status === "pending" ? "Pendente" : "Atrasado"}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="py-3 text-right font-mono text-muted-foreground whitespace-nowrap">
                        {formatCurrencyDecimal(amount - calcIvaAmount(amount, ivaRate))}
                      </td>
                      <td className={`py-3 text-right font-mono font-semibold whitespace-nowrap ${t.type === "income" ? "text-success" : "text-warning"}`}>
                        {t.type === "income" ? "+" : "-"}{formatCurrency(amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
