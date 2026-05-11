import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AdAccountLink = {
  id: string;
  connection_id: string;
  ad_account_id: string;
  ad_account_name: string | null;
  ad_account_currency: string | null;
  display_label: string;
  is_primary: boolean;
  enabled: boolean;
};

const LS_KEY = "mp_audience_active_ad_account_id";

export function useAdAccountSelection() {
  const { data: links, isLoading } = useQuery({
    queryKey: ["ad-account-links"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("ad_platform_account_links")
        .select("*")
        .eq("enabled", true)
        .order("is_primary", { ascending: false })
        .order("added_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AdAccountLink[];
    },
  });

  const [activeAdAccountId, setActiveAdAccountIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(LS_KEY); } catch { return null; }
  });

  useEffect(() => {
    if (!links || links.length === 0) return;
    const exists = activeAdAccountId && links.some(l => l.ad_account_id === activeAdAccountId);
    if (!exists) {
      const primary = links.find(l => l.is_primary) ?? links[0];
      setActiveAdAccountIdState(primary.ad_account_id);
      try { localStorage.setItem(LS_KEY, primary.ad_account_id); } catch {}
    }
  }, [links, activeAdAccountId]);

  const setActiveAdAccountId = (id: string) => {
    setActiveAdAccountIdState(id);
    try { localStorage.setItem(LS_KEY, id); } catch {}
  };

  const active = links?.find(l => l.ad_account_id === activeAdAccountId) ?? null;

  return {
    links: links ?? [],
    isLoading,
    activeAdAccountId,
    active,
    setActiveAdAccountId,
    hasMultiple: (links?.length ?? 0) > 1,
  };
}
