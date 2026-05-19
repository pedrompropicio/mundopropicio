import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true if the current user is ONLY a director of this event
 * (read-only mode): has a `director` entry, no `general_producer` entry,
 * is not admin and does not have manage_operacao_* permissions.
 */
export function useIsEventDirectorOnly(eventId?: string | null) {
  const { user, isAdmin, hasPermission } = useAuth();

  const { data } = useQuery({
    queryKey: ["op-is-director-only", eventId, user?.id],
    enabled: !!eventId && !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("event_team_members")
        .select("role")
        .eq("event_id", eventId!)
        .eq("profile_id", user!.id);
      return data ?? [];
    },
  });

  if (!eventId || !user) return false;
  if (isAdmin) return false;
  if (hasPermission("manage_operacao_frentes") || hasPermission("manage_operacao_etapas")) return false;

  const rows = data ?? [];
  const hasDirector = rows.some((r: any) => r.role === "director");
  const hasProducer = rows.some((r: any) => r.role === "general_producer");
  return hasDirector && !hasProducer;
}
