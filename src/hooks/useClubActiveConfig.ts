import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClubConfig, configReady } from "@/lib/club-config-source";

export function useClubActiveConfig(siteId: string) {
  const query = useQuery({
    queryKey: ["club-points-config-active", siteId],
    placeholderData: undefined,
    queryFn: async () => {
      const { data, error } = await supabase.from("club_points_config")
        .select("site_id,event_id,status,version,effective_at,join_points,referral_points,referral_cap,crew_points,purchase_points,purchase_enabled,levels")
        .eq("site_id", siteId).eq("status", "active").maybeSingle();
      if (error) throw error;
      return data as ClubConfig | null;
    },
  });
  return { ...query, ready: configReady(query, siteId) };
}