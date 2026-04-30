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
  const { user, role, loading: authLoading } = useAuth();
  const isPlatformAdmin = role === ("platform_admin" as any);
  const canResolveCompany = !!user && !authLoading && !!role;

  const query = useQuery({
    queryKey: ["current-company", user?.id, role],
    enabled: canResolveCompany,
    // Tenant scope must always reflect the server. A stale value here causes
    // the entire app to render data from the wrong company on boot or after
    // a switch — keep it fresh and refetch on mount/focus.
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Company | null> => {
      if (!user || !role) return null;

      // Use the same server-side resolver that RLS uses. This prevents the
      // header selector from showing the profile's base company while page data
      // is already scoped to the selected active company.
      const { data: resolvedCompanyId, error: resolveError } = await supabase.rpc(
        "current_company_id" as any,
      );
      if (resolveError) throw resolveError;

      const effectiveId = (resolvedCompanyId as string | null) ?? null;

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
    // Only block on the very first load (no cached data yet). Background refetches
    // (refetchOnMount/refetchOnWindowFocus) must NOT bring the fullscreen gate back
    // — that's what was leaving platform_admin stuck on "A sincronizar empresa ativa…".
    isLoading: canResolveCompany && query.isLoading && !query.data,
    isError: query.isError,
    error: query.error as Error | null,
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
  if (typeof (supabase as any).rpc === "function") {
    const { data: resolvedCompanyId } = await supabase.rpc("current_company_id" as any);
    return (resolvedCompanyId as string | null) ?? null;
  }

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
    mutationKey: ["set-active-company"],
    onMutate: async () => {
      await qc.cancelQueries();
    },
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
      // 1) Force the current-company query to refetch FIRST, so the header,
      //    branding and the database RLS scope agree before pages render.
      await qc.refetchQueries({
        queryKey: ["current-company"],
        type: "active",
      });
      // 2) Reset tenant-scoped cached data. Unlike removeQueries(), resetQueries
      //    also affects active queries, so old-company rows are cleared while
      //    the new company is loading.
      await qc.resetQueries({
        predicate: (query) => {
          const rootKey = query.queryKey[0];
          return rootKey !== "current-company" && rootKey !== "companies-list";
        },
      });
    },
  });
}
