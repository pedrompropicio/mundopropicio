import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Retorna true se o user logado deve ver apenas o módulo Operação na sidebar.
 *
 * Critérios (qualquer um basta):
 *  - flag `profiles.is_operacao_only = true` (explícito; usado para producers/leads do Coala)
 *  - profile_type='field_staff' E só tem role 'field_producer' (ou nenhuma) — fluxo legado
 */
export function useIsFieldStaffOnly(): boolean | undefined {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["is-field-staff-only", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("profile_type, is_operacao_only").eq("id", user!.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user!.id),
      ]);
      if ((profile as any)?.is_operacao_only === true) return true;
      const isFS = (profile as any)?.profile_type === "field_staff";
      if (!isFS) return false;
      const otherRoles = (roles ?? []).filter((r: any) => r.role !== "field_producer");
      return otherRoles.length === 0;
    },
  });
  return data;
}
