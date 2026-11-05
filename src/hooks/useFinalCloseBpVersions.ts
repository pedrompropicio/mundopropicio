import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FinalCloseBpVersion } from "@/lib/bp-final-close";
import { fetchAllPaged } from "@/lib/supabase-paging";

export function useFinalCloseBpVersions() {
  return useQuery({
    queryKey: ["bp-final-close-versions"],
    queryFn: () => fetchAllPaged<FinalCloseBpVersion>((from, to) => supabase
      .from("bp_versions")
      .select("id, event_id, version_number, state, is_final_close, description, snapshot_payload")
      .eq("is_final_close", true)
      .in("state", ["active", "superseded"])
      .order("id", { ascending: true })
      .range(from, to)),
  });
}
