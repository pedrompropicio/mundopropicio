import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText } from "lucide-react";
import { exportAccountCategoriesToPDF } from "@/lib/export-account-categories";

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

  const level1 = categories.filter((c) => !c.parent_id);
  const getChildren = (parentId: string) => categories.filter((c) => c.parent_id === parentId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Relatório do Plano de Contas</h1>
          <p className="text-sm text-muted-foreground">Visão hierárquica do plano de contas</p>
        </div>
        {categories.length > 0 && (
          <button
            onClick={() => exportAccountCategoriesToPDF(categories)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <FileText className="h-4 w-4" />
            PDF
          </button>
        )}
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {level1.map((l1) => {
                const l2Items = getChildren(l1.id);
                return (
                  <GroupBlock key={l1.id}>
                    <tr className="bg-secondary/40 font-semibold">
                      <td className="py-2.5 pr-2 pl-2">{l1.code}</td>
                      <td className="py-2.5 pr-4">{l1.name}</td>
                      <td className="py-2.5 text-center">
                        <TypeBadge type={l1.type} />
                      </td>
                    </tr>
                    {l2Items.map((l2) => {
                      const l3Items = getChildren(l2.id);
                      return (
                        <GroupBlock key={l2.id}>
                          <tr className="bg-secondary/20">
                            <td className="py-2 pr-2 pl-6 text-muted-foreground">{l2.code}</td>
                            <td className="py-2 pr-4 font-medium">{l2.name}</td>
                            <td className="py-2 text-center">
                              <TypeBadge type={l2.type} />
                            </td>
                          </tr>
                          {l3Items.map((l3) => (
                            <tr key={l3.id} className="hover:bg-secondary/10 transition-colors">
                              <td className="py-1.5 pr-2 pl-10 text-muted-foreground text-xs">{l3.code}</td>
                              <td className="py-1.5 pr-4 text-muted-foreground">{l3.name}</td>
                              <td className="py-1.5 text-center">
                                <TypeBadge type={l3.type} small />
                              </td>
                            </tr>
                          ))}
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
