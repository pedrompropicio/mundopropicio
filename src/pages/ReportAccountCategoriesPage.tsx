import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";

export default function ReportAccountCategoriesPage() {
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["report-account-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("*")
        .order("code");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["report-categories-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("category_id, amount, paid_amount, type, status");
      if (error) throw error;
      return data;
    },
  });

  // Build hierarchy
  const level1 = categories.filter((c) => !c.parent_id);
  const getChildren = (parentId: string) => categories.filter((c) => c.parent_id === parentId);

  const getCategoryTotals = (categoryId: string) => {
    // Include self + all descendants
    const ids = new Set<string>();
    const collect = (id: string) => {
      ids.add(id);
      getChildren(id).forEach((c) => collect(c.id));
    };
    collect(categoryId);

    const txs = transactions.filter((t) => t.category_id && ids.has(t.category_id));
    const totalAmount = txs.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalPaid = txs.reduce((sum, t) => sum + Number(t.paid_amount ?? 0), 0);
    const txCount = txs.length;
    return { totalAmount, totalPaid, txCount };
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Relatório do Plano de Contas</h1>
        <p className="text-sm text-muted-foreground">Visão hierárquica com totais por categoria</p>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-muted-foreground">A carregar…</p>
      ) : (
        <div className="glass rounded-xl p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-3 text-left font-medium">Código</th>
                <th className="pb-3 text-left font-medium">Categoria</th>
                <th className="pb-3 text-center font-medium">Tipo</th>
                <th className="pb-3 text-center font-medium">Transações</th>
                <th className="pb-3 text-right font-medium">Total</th>
                <th className="pb-3 text-right font-medium">Pago</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {level1.map((l1) => {
                const l1Totals = getCategoryTotals(l1.id);
                const l2Items = getChildren(l1.id);
                return (
                  <GroupBlock key={l1.id}>
                    {/* Level 1 */}
                    <tr className="bg-secondary/40 font-semibold">
                      <td className="py-2.5 pr-2 pl-2">{l1.code}</td>
                      <td className="py-2.5 pr-4">{l1.name}</td>
                      <td className="py-2.5 text-center">
                        <TypeBadge type={l1.type} />
                      </td>
                      <td className="py-2.5 text-center text-muted-foreground">{l1Totals.txCount || "—"}</td>
                      <td className="py-2.5 text-right font-mono whitespace-nowrap">{l1Totals.totalAmount > 0 ? formatCurrency(l1Totals.totalAmount) : "—"}</td>
                      <td className="py-2.5 text-right font-mono whitespace-nowrap">{l1Totals.totalPaid > 0 ? formatCurrency(l1Totals.totalPaid) : "—"}</td>
                    </tr>
                    {/* Level 2 */}
                    {l2Items.map((l2) => {
                      const l2Totals = getCategoryTotals(l2.id);
                      const l3Items = getChildren(l2.id);
                      return (
                        <GroupBlock key={l2.id}>
                          <tr className="bg-secondary/20">
                            <td className="py-2 pr-2 pl-6 text-muted-foreground">{l2.code}</td>
                            <td className="py-2 pr-4 font-medium">{l2.name}</td>
                            <td className="py-2 text-center">
                              <TypeBadge type={l2.type} />
                            </td>
                            <td className="py-2 text-center text-muted-foreground">{l2Totals.txCount || "—"}</td>
                            <td className="py-2 text-right font-mono whitespace-nowrap">{l2Totals.totalAmount > 0 ? formatCurrency(l2Totals.totalAmount) : "—"}</td>
                            <td className="py-2 text-right font-mono whitespace-nowrap">{l2Totals.totalPaid > 0 ? formatCurrency(l2Totals.totalPaid) : "—"}</td>
                          </tr>
                          {/* Level 3 */}
                          {l3Items.map((l3) => {
                            const l3Totals = getCategoryTotals(l3.id);
                            return (
                              <tr key={l3.id} className="hover:bg-secondary/10 transition-colors">
                                <td className="py-1.5 pr-2 pl-10 text-muted-foreground text-xs">{l3.code}</td>
                                <td className="py-1.5 pr-4 text-muted-foreground">{l3.name}</td>
                                <td className="py-1.5 text-center">
                                  <TypeBadge type={l3.type} small />
                                </td>
                                <td className="py-1.5 text-center text-muted-foreground">{l3Totals.txCount || "—"}</td>
                                <td className="py-1.5 text-right font-mono text-muted-foreground whitespace-nowrap">{l3Totals.totalAmount > 0 ? formatCurrency(l3Totals.totalAmount) : "—"}</td>
                                <td className="py-1.5 text-right font-mono text-muted-foreground whitespace-nowrap">{l3Totals.totalPaid > 0 ? formatCurrency(l3Totals.totalPaid) : "—"}</td>
                              </tr>
                            );
                          })}
                        </GroupBlock>
                      );
                    })}
                  </GroupBlock>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GroupBlock({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function TypeBadge({ type, small }: { type: string; small?: boolean }) {
  const isIncome = type === "income";
  return (
    <span className={`inline-flex rounded-full px-1.5 py-0.5 font-medium ${small ? "text-[10px]" : "text-xs"} ${
      isIncome ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
    }`}>
      {isIncome ? "Receita" : "Despesa"}
    </span>
  );
}
