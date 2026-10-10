import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { BUDGET_MODES, type BudgetMode, useCompanyDefaultBudgetMode } from "@/lib/budget-mode";

/** #100 — default do modo orçamental da empresa activa. Editável só por admin/manager. */
export function CompanyBudgetModeCard() {
  const { isAdmin, isManager } = useAuth();
  const canEdit = isAdmin || isManager;
  const qc = useQueryClient();
  const { data: mode, isLoading } = useCompanyDefaultBudgetMode();

  const save = useMutation({
    mutationFn: async (m: BudgetMode) => {
      const { data, error } = await supabase.rpc("set_company_default_budget_mode" as any, { _mode: m } as any);
      if (error) throw new Error(error.message);
      if (data !== m) throw new Error("O modo não foi gravado.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-default-budget-mode"] });
      toast({ title: "Modo orçamental por defeito atualizado" });
    },
    onError: (e: Error) => toast({ title: "Erro ao gravar", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Wallet className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-base">Modo orçamental por defeito</CardTitle>
          <CardDescription>
            Pré-seleccionado ao criar eventos. Os eventos sem modo próprio herdam este valor.
            {!canEdit && " Só admin ou manager podem alterar."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {BUDGET_MODES.map((b) => (
            <button
              key={b.value}
              type="button"
              title={b.hint}
              disabled={!canEdit || isLoading || save.isPending || mode === b.value}
              onClick={() => save.mutate(b.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-default ${
                mode === b.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground disabled:opacity-60"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
