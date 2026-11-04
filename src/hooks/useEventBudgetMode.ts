import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BudgetMode } from "@/lib/budget-mode";

/** Modo efectivo da SSoT: evento → empresa → with_bp (nunca o evento pai). */
export function useEventBudgetMode(eventId?: string | null): { budgetMode: BudgetMode; isLoading: boolean } {
  const { data, isPending } = useQuery({
    queryKey: ["event-budget-mode", eventId],
    enabled: !!eventId,
    queryFn: async (): Promise<BudgetMode> => {
      try {
        const { data, error } = await supabase.rpc("event_budget_mode", { _event_id: eventId! });
        if (error) throw error;
        if (data === "with_bp" || data === "without_bp") return data;
        console.warn("Modo orçamental do evento desconhecido; a usar with_bp", data);
      } catch (error) {
        console.warn("Não foi possível ler o modo orçamental do evento; a usar with_bp", error);
      }
      return "with_bp";
    },
  });

  return { budgetMode: eventId ? data ?? "with_bp" : "with_bp", isLoading: !!eventId && isPending };
}
