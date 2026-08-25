import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Rótulo da "casa" de um evento — a empresa configurada em `events.company_id`.
 *
 * `ordering_partner_id`/`paying_partner_id` a NULL significam sempre "a empresa
 * configurada no evento". Num sistema multi-tenant esse rótulo não pode ser
 * hardcoded ("MP"), por isso resolve-se aqui via `companies`.
 * Fallback: "Empresa".
 */
export function useEventHouseLabel(eventId: string | null | undefined): string {
  const { data } = useQuery({
    queryKey: ["event-house-label", eventId ?? ""],
    enabled: !!eventId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: evt, error } = await supabase
        .from("events")
        .select("company_id, companies:company_id(display_name, legal_name)")
        .eq("id", eventId!)
        .maybeSingle();
      if (error) throw error;
      const c = (evt as any)?.companies;
      return (c?.display_name || c?.legal_name || null) as string | null;
    },
  });
  return data || "Empresa";
}
