import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
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

/**
 * Returns the current user's company (from profiles.company_id) and a flag
 * indicating whether the user is a platform_admin (cross-company).
 *
 * Companies catalog is universally readable (RLS allows authenticated reads)
 * but profiles.company_id determines tenancy.
 */
export function useCompany() {
  const { user, role } = useAuth();
  const isPlatformAdmin = role === ("platform_admin" as any);

  const query = useQuery({
    queryKey: ["current-company", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Company | null> => {
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();
      const companyId = (profile as any)?.company_id;
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("companies" as any)
        .select("*")
        .eq("id", companyId)
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
 * Used by storage helpers and other non-component code paths.
 */
export async function getCurrentCompanyId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", data.user.id)
    .maybeSingle();
  return (profile as any)?.company_id ?? null;
}
