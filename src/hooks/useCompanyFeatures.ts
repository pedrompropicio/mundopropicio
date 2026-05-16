import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import type { FeatureKey } from "@/lib/features";

interface CompanyFeatureRow {
  feature_key: string;
  enabled: boolean;
}

/**
 * Returns the set of enabled feature keys for the current active company.
 * Cached for 5 minutes — features change rarely.
 */
export function useCompanyFeaturesSet() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["company-features", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Set<string>> => {
      if (!companyId) return new Set();
      const { data, error } = await supabase
        .from("company_features" as any)
        .select("feature_key, enabled")
        .eq("company_id", companyId)
        .eq("enabled", true);
      if (error) throw error;
      return new Set(((data ?? []) as unknown as CompanyFeatureRow[]).map((r) => r.feature_key));
    },
  });
}

/**
 * Returns the Set directly (empty while loading). For most UI gates this is enough
 * because items just stay hidden until the data arrives.
 */
export function useCompanyFeatures(): Set<string> {
  return useCompanyFeaturesSet().data ?? new Set<string>();
}

export function useHasFeature(key: FeatureKey): boolean {
  return useCompanyFeatures().has(key);
}
