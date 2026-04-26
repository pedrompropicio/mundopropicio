import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Quando há um cenário selecionado num relatório, carrega TODOS os forecasts
 * da versão indicada — tanto a do evento âncora (Master ou standalone) como
 * as snapshots cascateadas para os Splits a partir desse mesmo Master.
 *
 * Estratégia:
 *  1. Carregar a row em bp_versions para descobrir cascaded_from_version_id +
 *     buscar irmãos (versões que cascatearam DESTE id se for Master, ou
 *     irmãos com mesmo cascaded_from_version_id se for Split).
 *  2. Carregar event_forecasts.eq("version_id", IN (...)).
 *
 * Devolve [] enquanto sem versionId, para que o relatório fall-back para a
 * Ativa (que já é carregada à parte).
 */
export function useScenarioForecasts(versionId: string | null | undefined) {
  return useQuery({
    queryKey: ["scenario-forecasts", versionId ?? ""],
    enabled: Boolean(versionId),
    queryFn: async () => {
      if (!versionId) return [];

      // 1. Resolve o conjunto de versões equivalentes (Master + Splits cascateados)
      const { data: anchor, error: anchorErr } = await supabase
        .from("bp_versions")
        .select("id, event_id, cascaded_from_version_id")
        .eq("id", versionId)
        .maybeSingle();
      if (anchorErr) throw anchorErr;
      if (!anchor) return [];

      const rootId = anchor.cascaded_from_version_id ?? anchor.id;

      const { data: family, error: familyErr } = await supabase
        .from("bp_versions")
        .select("id")
        .or(`id.eq.${rootId},cascaded_from_version_id.eq.${rootId}`);
      if (familyErr) throw familyErr;

      const ids = (family ?? []).map((v: any) => v.id);
      if (ids.length === 0) return [];

      const { data: forecasts, error: fErr } = await supabase
        .from("event_forecasts")
        .select("*")
        .in("version_id", ids);
      if (fErr) throw fErr;

      return forecasts ?? [];
    },
  });
}
