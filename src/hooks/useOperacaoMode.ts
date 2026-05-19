import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type OperacaoMode = "planning" | "montagem" | "evento" | "post";

/** Returns the operacao_mode for a specific event (or null while loading). */
export function useOperacaoMode(eventId?: string | null) {
  const { data } = useQuery({
    queryKey: ["op-mode", eventId],
    enabled: !!eventId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("operacao_mode")
        .eq("id", eventId!)
        .maybeSingle();
      return (data?.operacao_mode as OperacaoMode | null) ?? "planning";
    },
  });
  return (data ?? null) as OperacaoMode | null;
}

/**
 * Returns the operacao_mode of the user's "active" operacao event.
 * Heuristic: most recent event where the user is part of a frente team.
 * Fallback: "planning".
 */
export function useCurrentOperacaoMode(): OperacaoMode {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["op-current-mode", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: team } = await supabase
        .from("operacao_frente_team")
        .select("frente_id")
        .eq("profile_id", user!.id)
        .eq("active", true);
      const frenteIds = Array.from(new Set((team ?? []).map((t: any) => t.frente_id)));
      if (frenteIds.length === 0) return "planning" as OperacaoMode;
      const { data: frentes } = await supabase
        .from("operacao_frentes")
        .select("event_id")
        .in("id", frenteIds);
      const eventIds = Array.from(new Set((frentes ?? []).map((f: any) => f.event_id))).filter(Boolean);
      if (eventIds.length === 0) return "planning" as OperacaoMode;
      const { data: events } = await supabase
        .from("events")
        .select("id, operacao_mode, start_date")
        .in("id", eventIds)
        .order("start_date", { ascending: false })
        .limit(1);
      return ((events?.[0] as any)?.operacao_mode ?? "planning") as OperacaoMode;
    },
  });
  return (data ?? "planning") as OperacaoMode;
}
