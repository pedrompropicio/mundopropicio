import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true if the current user is a Produtor Geral (general_producer)
 * of the given event. Used to grant manager-equivalent authorizations
 * inside MP Operação modals (edit/delete records, change author, etc.).
 */
export function useIsEventGeneralProducer(eventId?: string | null) {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["op-is-event-general-producer", eventId, user?.id],
    enabled: !!eventId && !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("event_team_members")
        .select("role")
        .eq("event_id", eventId!)
        .eq("profile_id", user!.id)
        .eq("role", "general_producer");
      return (data ?? []).length > 0;
    },
  });

  if (!eventId || !user) return false;
  return !!data;
}
