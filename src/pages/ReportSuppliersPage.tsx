import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";

export default function ReportSuppliersPage() {
  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["report-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, nif, category, is_active")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["report-suppliers-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("supplier_id, amount, paid_amount, status, type")
        .not("supplier_id", "is", null);
      if (error) throw error;
      return data;
    },
  });

  const supplierStats = suppliers.map((s) => {
    const txs = transactions.filter((t) => t.supplier_id === s.id);
    const totalExpenses = txs.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0);
    const totalPaid = txs.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.paid_amount ?? 0), 0);
    const totalIncome = txs.filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0);
    const pendingCount = txs.filter((t) => t.status === "pending").length;
    const approvedCount = txs.filter((t) => t.status === "approved").length;
    const paidCount = txs.filter((t) => t.status === "paid").length;
    return {
      ...s,
      totalExpenses,
      totalPaid,
      totalIncome,
      balance: totalExpenses - totalPaid,
      txCount: txs.length,
      pendingCount,
      approvedCount,
      paidCount,
    };
  });

  const totals = supplierStats.reduce(
    (acc, s) => ({
      totalExpenses: acc.totalExpenses + s.totalExpenses,
      totalPaid: acc.totalPaid + s.totalPaid,
      balance: acc.balance + s.balance,
      totalIncome: acc.totalIncome + s.totalIncome,
    }),
    { totalExpenses: 0, totalPaid: 0, balance: 0, totalIncome: 0 }
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Relatório de Fornecedores</h1>
        <p className="text-sm text-muted-foreground">Resumo financeiro por fornecedor</p>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-muted-foreground">A carregar…</p>
      ) : (
        <div className="glass rounded-xl p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-3 text-left font-medium">Fornecedor</th>
                <th className="hidden pb-3 text-left font-medium sm:table-cell">Categoria</th>
                <th className="pb-3 text-center font-medium">Transações</th>
                <th className="pb-3 text-right font-medium">Total Despesas</th>
                <th className="pb-3 text-right font-medium">Pago</th>
                <th className="pb-3 text-right font-medium">Em Aberto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {supplierStats.map((s) => (
                <tr key={s.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="py-3 pr-4">
                    <p className="font-medium">{s.name}</p>
                    {s.nif && <p className="text-xs text-muted-foreground">NIF: {s.nif}</p>}
                    {!s.is_active && (
                      <span className="inline-flex rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">Inativo</span>
                    )}
                  </td>
                  <td className="hidden py-3 pr-4 text-muted-foreground sm:table-cell">{s.category ?? "—"}</td>
                  <td className="py-3 text-center">
                    <span className="text-muted-foreground">{s.txCount}</span>
                    {s.txCount > 0 && (
                      <div className="flex justify-center gap-1 mt-0.5">
                        {s.pendingCount > 0 && <span className="inline-flex rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">{s.pendingCount} pend.</span>}
                        {s.approvedCount > 0 && <span className="inline-flex rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">{s.approvedCount} aprov.</span>}
                        {s.paidCount > 0 && <span className="inline-flex rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">{s.paidCount} pago</span>}
                      </div>
                    )}
                  </td>
                  <td className="py-3 text-right font-mono text-warning whitespace-nowrap">{formatCurrency(s.totalExpenses)}</td>
                  <td className="py-3 text-right font-mono text-success whitespace-nowrap">{formatCurrency(s.totalPaid)}</td>
                  <td className={`py-3 text-right font-mono font-semibold whitespace-nowrap ${s.balance > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {formatCurrency(s.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border/60 font-semibold">
                <td className="pt-3 pr-4" colSpan={2}>Totais</td>
                <td className="hidden sm:table-cell"></td>
                <td className="pt-3 text-right font-mono text-warning whitespace-nowrap">{formatCurrency(totals.totalExpenses)}</td>
                <td className="pt-3 text-right font-mono text-success whitespace-nowrap">{formatCurrency(totals.totalPaid)}</td>
                <td className={`pt-3 text-right font-mono whitespace-nowrap ${totals.balance > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {formatCurrency(totals.balance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
