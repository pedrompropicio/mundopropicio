import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { FINANCIAL_POSITION_PERMISSION, parseFinancialPosition } from "@/lib/financial-position";

export function useFinancialPosition(year: number | null) {
  const { user, hasPermission, permissions } = useAuth();
  const { companyId, isLoading: companyLoading, isError: companyError, error } = useCompany();
  const allowed = hasPermission(FINANCIAL_POSITION_PERMISSION);
  const query = useQuery({
    queryKey: ["financial-position-base", user?.id, companyId, year, permissions],
    enabled: allowed && !!user && !!companyId && !companyLoading && !companyError,
    queryFn: async () => {
      if (!companyId) throw new Error("company_forbidden");
      const { data, error: rpcError } = await supabase.rpc("get_financial_position_base", { p_company_id: companyId, p_year: year });
      if (rpcError) throw rpcError;
      const parsed = parseFinancialPosition(data);
      if (parsed.meta.company_id !== companyId || parsed.meta.year !== year) throw new Error("financial_position_invalid_response");
      return parsed;
    },
    staleTime: 30_000,
    retry: false,
  });
  return { ...query, companyLoading, companyError, companyMissing: !companyLoading && !companyId, companyErrorDetail: error };
}