import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface MasterForecastInfo {
  id: string;
  category_id: string;
  description: string;
  amount: number;
}

/**
 * Detects whether an event is a sub-event of a tour and returns
 * the Master event's expense BP categories.
 * Used to trigger the "Reforço local vs Rateio Master" dialog.
 */
export function useMasterCategoryDetection(
  eventId: string | undefined,
  events: { id: string; parent_event_id?: string | null; event_type?: string }[]
) {
  const selectedEvent = events.find((e) => e.id === eventId);
  const parentEventId = selectedEvent?.parent_event_id ?? null;

  // Check if parent is a tour
  const parentEvent = parentEventId ? events.find((e) => e.id === parentEventId) : null;
  const isTourChild = !!parentEvent && parentEvent.event_type === "tour";

  // Fetch Master BP expense categories
  const { data: masterExpenseForecasts = [] } = useQuery({
    queryKey: ["master_expense_forecasts_for_reinforcement", parentEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, category_id, description, amount")
        .eq("event_id", parentEventId!)
        .eq("type", "expense")
        .not("category_id", "is", null);
      if (error) throw error;
      return (data ?? []) as MasterForecastInfo[];
    },
    enabled: isTourChild && !!parentEventId,
    staleTime: 30_000,
  });

  const masterCategoryIds = useMemo(
    () => [...new Set(masterExpenseForecasts.map((f) => f.category_id))],
    [masterExpenseForecasts]
  );

  const getMasterForecastForCategory = (categoryId: string): MasterForecastInfo | undefined =>
    masterExpenseForecasts.find((f) => f.category_id === categoryId);

  return {
    isTourChild,
    parentEventId,
    masterCategoryIds,
    masterExpenseForecasts,
    getMasterForecastForCategory,
    /** Check if a category triggers the reinforcement dialog */
    shouldShowReinforcementDialog: (categoryId: string, type: string) =>
      isTourChild && type === "expense" && !!categoryId && masterCategoryIds.includes(categoryId),
  };
}
