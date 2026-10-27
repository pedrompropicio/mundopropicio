import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isEventStage, parseChecklist, stageMapFromRows, type EventStage } from "@/lib/event-stage";

export const EVENT_STAGES_KEY = ["event-stage-list"] as const;
export const eventStageKey = (id: string) => ["event-stage", id] as const;
export const eventChecklistKey = (id: string) => ["event-close-checklist", id] as const;

/** Lista: uma única chamada a event_stage_list (empresa ativa). */
export function useEventStages() {
  return useQuery({
    queryKey: EVENT_STAGES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("event_stage_list");
      if (error) throw error;
      return stageMapFromRows(data as any);
    },
    staleTime: 30_000,
  });
}

export function useEventStage(eventId: string | null | undefined) {
  return useQuery({
    queryKey: eventStageKey(eventId ?? ""),
    enabled: !!eventId,
    queryFn: async (): Promise<EventStage | null> => {
      const { data, error } = await supabase.rpc("event_stage", { p_event_id: eventId! });
      if (error) throw error;
      return isEventStage(data) ? data : null;
    },
  });
}

export function useEventCloseChecklist(eventId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: eventChecklistKey(eventId ?? ""),
    enabled: !!eventId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("event_close_checklist", { p_event_id: eventId! });
      if (error) throw error;
      return parseChecklist(data);
    },
  });
}

type Action = "close" | "reopen" | "mark" | "unmark";

export function useEventStageAction(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, reason }: { action: Action; reason?: string }) => {
      const r = reason?.trim() || undefined;
      const res =
        action === "close" ? await supabase.rpc("close_event", { p_event_id: eventId, p_reason: r })
        : action === "reopen" ? await supabase.rpc("reopen_event_closure", { p_event_id: eventId, p_reason: r ?? "" })
        : action === "mark" ? await supabase.rpc("mark_event_historical", { p_event_id: eventId, p_reason: r })
        : await supabase.rpc("unmark_event_historical", { p_event_id: eventId });
      if (res.error) throw res.error;
      return res.data;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: EVENT_STAGES_KEY });
      qc.invalidateQueries({ queryKey: ["event-stage"] });
      qc.invalidateQueries({ queryKey: ["event-close-checklist"] });
      qc.invalidateQueries({ queryKey: ["event", eventId] });
    },
  });
}
