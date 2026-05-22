import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Devolve os frente_id onde o utilizador autenticado é lead activo
 * (operacao_frente_team.role_in_frente='lead' AND active=true).
 *
 * Multi-produtor (OP-18): substitui o filtro legacy por current_lead_id,
 * que só considerava o produtor primário.
 */
export function useMyLeadFrenteIds() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["my-lead-frentes", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operacao_frente_team")
        .select("frente_id")
        .eq("profile_id", user!.id)
        .eq("role_in_frente", "lead")
        .eq("active", true);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r: any) => r.frente_id as string)));
    },
  });
  return {
    leadFrenteIds: q.data ?? [],
    leadFrenteIdSet: new Set(q.data ?? []),
    isLoading: q.isLoading,
  };
}
