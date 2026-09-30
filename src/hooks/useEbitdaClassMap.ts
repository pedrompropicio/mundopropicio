import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isEbitdaClass, type EbitdaClassMap } from "@/lib/ebitda";

/** category_id → classe EBITDA (só contas classificadas; RLS limita à empresa). */
export function useEbitdaClassMap() {
  return useQuery({
    queryKey: ["ebitda-class-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("id, ebitda_class")
        .not("ebitda_class", "is", null);
      if (error) throw error;
      const map: EbitdaClassMap = {};
      for (const r of (data ?? []) as any[]) if (isEbitdaClass(r.ebitda_class)) map[r.id] = r.ebitda_class;
      return map;
    },
    staleTime: 5 * 60_000,
  });
}
