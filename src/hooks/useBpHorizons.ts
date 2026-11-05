import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";

const horizonRows = z.array(z.object({
  event_id: z.string().uuid(),
  bp_horizon_days: z.number().int().nonnegative().nullable(),
}));

/** A RPC P5 não inclui o horizonte; a ausência de cenário conserva o padrão NULL. */
export function useBpHorizons(rootIds: readonly string[]) {
  const { companyId } = useCompany();
  const ids = [...new Set(rootIds)].sort();
  return useQuery({
    queryKey: ["coverage-bp-horizon", companyId, ids],
    enabled: !!companyId && ids.length > 0,
    queryFn: async (): Promise<Record<string, number | null>> => {
      if (!companyId || ids.length === 0) return {};
      const { data, error } = await (supabase as any).from("event_coverage_scenarios")
        .select("event_id,bp_horizon_days").eq("company_id", companyId).in("event_id", ids);
      if (error) throw error;
      const rows = horizonRows.parse(data);
      const horizons: Record<string, number | null> = Object.fromEntries(ids.map(id => [id, null]));
      for (const row of rows) horizons[row.event_id] = row.bp_horizon_days;
      return horizons;
    },
  });
}
