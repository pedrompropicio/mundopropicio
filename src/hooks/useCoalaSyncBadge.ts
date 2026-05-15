import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Conta runs de sync Coala em estado `needs_review` cujas configs estão ativas.
 * Atualiza em tempo real via subscription a coala_sync_runs.
 */
export function useCoalaSyncBadge(enabled: boolean = true) {
  const qc = useQueryClient();

  const q = useQuery({
    enabled,
    queryKey: ["coala-sync-badge"],
    queryFn: async () => {
      // Buscar IDs das configs ativas
      const { data: cfgs, error: cfgErr } = await supabase
        .from("coala_sync_config" as any)
        .select("id")
        .eq("enabled", true);
      if (cfgErr) throw cfgErr;
      const ids = (cfgs ?? []).map((c: any) => c.id);
      if (!ids.length) return 0;

      const { count, error } = await supabase
        .from("coala_sync_runs" as any)
        .select("*", { count: "exact", head: true })
        .eq("status", "needs_review")
        .in("config_id", ids);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel("coala-sync-runs-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "coala_sync_runs" },
        () => qc.invalidateQueries({ queryKey: ["coala-sync-badge"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [enabled, qc]);

  return q.data ?? 0;
}
