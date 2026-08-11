import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

/** Nº de pendências abertas levantadas pela contabilista (badge do menu). */
export function useAccountantPendenciesCount(enabled = true) {
  const { companyId } = useCompany();
  const { data } = useQuery({
    queryKey: ["accountant-pendencies-count", companyId],
    enabled: enabled && !!companyId,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("accountant_transaction_reviews")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "pendente");
      if (error) throw error;
      return count ?? 0;
    },
  });
  return data ?? 0;
}
