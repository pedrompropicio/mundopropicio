import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BP_FINAL_CLOSE_PREFIX, type FinalCloseBpVersion } from "@/lib/bp-final-close";
import { fetchAllPaged } from "@/lib/supabase-paging";

export function useFinalCloseBpVersions() {
  return useQuery({
    queryKey: ["bp-final-close-versions"],
    queryFn: () => fetchAllPaged<FinalCloseBpVersion>((from, to) => supabase
      .from("bp_versions")
      .select("id, event_id, version_number, state, description, snapshot_payload")
      .like("description", BP_FINAL_CLOSE_PREFIX + "%")
      .in("state", ["active", "superseded"])
      .order("id", { ascending: true })
      .range(from, to)),
  });
}
