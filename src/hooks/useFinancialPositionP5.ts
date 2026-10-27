import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { FINANCIAL_POSITION_PERMISSION } from "@/lib/financial-position";
import { P5_VERSION, parseFinancialPositionP5 } from "@/lib/financial-position-p5";

/** Contrato P5 (o ecrã é o P6b). Sem cache além da sessão do react-query. */
export function useFinancialPositionP5(year: number | null, enabled = true) {
  const { user, hasPermission, permissions } = useAuth();
  const { companyId, isLoading: companyLoading } = useCompany();
  const allowed = hasPermission(FINANCIAL_POSITION_PERMISSION);
  return useQuery({
    queryKey: ["financial-position-p5", P5_VERSION, user?.id, companyId, year, permissions],
    enabled: enabled && allowed && !!user && !!companyId && !companyLoading,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("financial-position", { body: { company_id: companyId, year } });
      if (error) throw error;
      const parsed = parseFinancialPositionP5(data);
      if (parsed.meta.company_id !== companyId || parsed.meta.year !== year) throw new Error("financial_position_invalid_response");
      return parsed;
    },
    staleTime: 0,
    retry: false,
  });
}
