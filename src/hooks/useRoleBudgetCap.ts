import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface RoleBudgetCap {
  /** null = sem limite | 0 = sem autoridade | number = cap €/dia | undefined = a carregar */
  capEur: number | null | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

/**
 * Lê o cap diário de budget (€) do user atual via RPC server-side
 * (public.get_user_max_daily_budget_eur), que cruza TODOS os roles do user.
 * staleTime alto: o cap raramente muda.
 */
export function useRoleBudgetCap(): RoleBudgetCap {
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ["role-budget-cap", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      // (supabase as any): a função nova não está nos tipos auto-gerados.
      const { data, error } = await (supabase as any).rpc(
        "get_user_max_daily_budget_eur",
        { _user_id: userId },
      );
      if (error) throw error;
      // numeric → string via PostgREST; coerção preservando null (= sem limite).
      return data === null || data === undefined ? null : Number(data);
    },
  });

  return {
    capEur: query.data as number | null | undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error instanceof Error ? query.error.message : undefined,
  };
}
