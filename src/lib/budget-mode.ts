import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** D6 — events.budget_mode / companies.default_budget_mode. NÃO confundir com operacao_mode. */
export type BudgetMode = "with_bp" | "without_bp";

export const BUDGET_MODES: { value: BudgetMode; label: string; hint: string }[] = [
  { value: "with_bp", label: "Com BP", hint: "Custo = previsto + excedido; linha de BP exigida nas despesas" },
  { value: "without_bp", label: "Sem BP", hint: "Custo = realizado; não exige linha de BP" },
];

export const budgetModeLabel = (m: string | null | undefined) =>
  BUDGET_MODES.find((b) => b.value === m)?.label ?? "Com BP";

/** Default da empresa activa (RPC SECURITY DEFINER; companies só é legível por platform_admin). */
export function useCompanyDefaultBudgetMode() {
  return useQuery({
    queryKey: ["company-default-budget-mode"],
    queryFn: async (): Promise<BudgetMode> => {
      const { data, error } = await supabase.rpc("get_company_default_budget_mode" as any);
      if (error) throw new Error(`Modo orçamental da empresa: ${error.message}`);
      return (data as BudgetMode) ?? "with_bp";
    },
    staleTime: 60_000,
  });
}
