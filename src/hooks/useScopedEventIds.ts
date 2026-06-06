import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Resolve event IDs visible to the current user for cross-event Operação lists.
 * - Admin / platform_admin / users with manage_operacao_frentes → all non-cancelled events of current company (RLS scopes by company).
 * - Other users → events where they are in operacao_frente_team OR are current_lead_id of a frente.
 *
 * Ref: docs/op-13-gestao-geral/01-arquitetura.md §2.2
 */
export function useScopedEventIds(): { eventIds: string[]; isLoading: boolean } {
  const { user, isAdmin, hasPermission } = useAuth();
  const broadScope = isAdmin || hasPermission("manage_operacao_frentes");

  const q = useQuery({
    queryKey: ["op-scoped-events", user?.id, broadScope],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      if (broadScope) {
        const { data, error } = await supabase
          .from("events")
          .select("id")
          .eq("management_type", "own")
          .neq("status", "cancelled");
        if (error) throw error;
        return (data ?? []).map((e: any) => e.id as string);
      }

      const [{ data: teams }, { data: leads }] = await Promise.all([
        supabase
          .from("operacao_frente_team")
          .select("frente_id")
          .eq("profile_id", user!.id)
          .eq("active", true),
        supabase
          .from("operacao_frentes")
          .select("id")
          .eq("current_lead_id", user!.id),
      ]);
      const frenteIds = Array.from(
        new Set([
          ...((teams ?? []).map((t: any) => t.frente_id) as string[]),
          ...((leads ?? []).map((f: any) => f.id) as string[]),
        ]),
      );
      if (frenteIds.length === 0) return [];
      const { data: fr } = await supabase
        .from("operacao_frentes")
        .select("event_id")
        .in("id", frenteIds);
      return Array.from(new Set((fr ?? []).map((f: any) => f.event_id as string)));
    },
  });

  return { eventIds: q.data ?? [], isLoading: q.isLoading };
}
