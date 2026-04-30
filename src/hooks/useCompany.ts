import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Company {
  id: string;
  legal_name: string;
  display_name: string;
  slug: string;
  tax_id: string | null;
  country: string;
  currency: string;
  timezone: string;
  logo_url: string | null;
  favicon_url: string | null;
  theme_config: Record<string, any> | null;
  address: Record<string, any> | null;
  contact_email: string | null;
  status: string;
}

const ACTIVE_COMPANY_CACHE_KEY = "mp_active_company_id";

/**
 * Returns the current user's company (the active one in DB) and whether the user
 * is a platform_admin. For platform_admin, this resolves to the active_company_id
 * they selected in the switcher; for normal users it's their fixed company_id.
 *
 * The localStorage cache is only used to avoid flicker on boot for platform_admin;
 * the server is always the source of truth.
 */
export function useCompany() {
  const { user, role } = useAuth();
  const isPlatformAdmin = role === ("platform_admin" as any);

  const query = useQuery({
    queryKey: ["current-company", user?.id],
    enabled: !!user,
    // Tenant scope must always reflect the server. A stale value here causes
    // the entire app to render data from the wrong company on boot or after
    // a switch — keep it fresh and refetch on mount/focus.
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Company | null> => {
      if (!user) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, active_company_id")
        .eq("id", user.id)
        .maybeSingle();

      const p = profile as any;
      const effectiveId: string | null = isPlatformAdmin
        ? p?.active_company_id ?? p?.company_id ?? null
        : p?.company_id ?? null;

      if (!effectiveId) return null;

      try {
        if (isPlatformAdmin && typeof window !== "undefined") {
          localStorage.setItem(ACTIVE_COMPANY_CACHE_KEY, effectiveId);
        }
      } catch {}

      const { data, error } = await supabase
        .from("companies" as any)
        .select("*")
        .eq("id", effectiveId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Company) ?? null;
    },
  });

  return {
    company: query.data ?? null,
    companyId: query.data?.id ?? null,
    isLoading: query.isLoading,
    isPlatformAdmin,
    refetch: query.refetch,
  };
}

/**
 * Lightweight helper that resolves the current company id without React.
 * Mirrors the SQL `current_company_id()` logic for code paths outside React.
 */
export async function getCurrentCompanyId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, active_company_id")
    .eq("id", data.user.id)
    .maybeSingle();
  const p = profile as any;
  return p?.active_company_id ?? p?.company_id ?? null;
}

/**
 * Lists every company in the catalog. RLS shows only the user's own company
 * to non-platform_admin users; platform_admin sees all.
 */
export function useCompaniesList(enabled: boolean) {
  return useQuery({
    queryKey: ["companies-list"],
    enabled,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Company[]> => {
      const { data, error } = await supabase
        .from("companies" as any)
        .select("*")
        .eq("status", "active")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as unknown as Company[];
    },
  });
}

/**
 * Mutation to switch the active company (platform_admin only).
 * Calls the SQL RPC `set_active_company(uuid)` and invalidates all queries
 * because the entire dataset changes between tenants.
 */
export function useSetActiveCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string) => {
      const { data, error } = await supabase.rpc("set_active_company" as any, {
        target_company_id: companyId,
      } as any);
      if (error) throw error;
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(ACTIVE_COMPANY_CACHE_KEY, companyId);
        }
      } catch {}
      return data as string;
    },
    onSuccess: async (newCompanyId) => {
      // 1) Cancel any in-flight queries from the previous tenant so their late
      //    responses don't overwrite the new tenant's data after invalidation.
      await qc.cancelQueries();
      // 2) Drop ALL cached data immediately — every query is tenant-scoped.
      //    removeQueries is stronger than invalidate: it deletes the cache so
      //    consumers re-render with `isLoading=true` instead of stale data.
      qc.removeQueries();
      // 3) Force the current-company query to refetch FIRST, so downstream
      //    queries that depend on `companyId` see the new value before firing.
      await qc.refetchQueries({
        queryKey: ["current-company"],
        type: "active",
      });
      // 4) Now refetch everything else that's mounted.
      await qc.invalidateQueries({ refetchType: "active" });
    },
  });
}
