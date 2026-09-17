// Issue #36 — saúde da ligação Meta para a UI do /audience.
// Lê só crm.ad_platform_connections (colunas já existentes). Sem escritas.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Limiar de frescura dos insights: acima disto os dados estão parados. */
export const STALE_HOURS = 48;
/** Aviso âmbar quando faltarem estes dias (ou menos) para expires_at. */
export const EXPIRY_WARNING_DAYS = 7;

export interface MetaConnectionHealthRow {
  id: string;
  platform: string;
  status: string;
  last_error: string | null;
  last_validated_at: string | null;
  expires_at: string | null;
  consecutive_failures: number | null;
  connection_scope: string | null;
}

export const CONNECTION_STATUS_LABEL: Record<string, string> = {
  active: "activa",
  expired: "expirada",
  revoked: "revogada",
  error: "com erro",
  disconnected: "desligada",
  pending_selection: "à espera de escolha de conta",
  pending_link: "à espera de ligação",
};

export function useMetaConnectionHealth(connectionId: string | null | undefined) {
  return useQuery({
    queryKey: ["meta-connection-health", connectionId],
    enabled: !!connectionId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("ad_platform_connections")
        .select(
          "id, platform, status, last_error, last_validated_at, expires_at, consecutive_failures, connection_scope",
        )
        .eq("id", connectionId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MetaConnectionHealthRow | null;
    },
  });
}

/** Dias inteiros até expires_at; null se não houver data. */
export function daysUntilExpiry(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 86_400_000);
}
