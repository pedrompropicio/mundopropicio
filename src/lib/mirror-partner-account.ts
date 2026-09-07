/**
 * Conta-espelho de sócio (AEP).
 *
 * `financial_accounts.mirror_partner_aporte = true` + `financial_accounts.partner_id`
 * (→ `event_partners`): um trigger na BD cria automaticamente um aporte
 * (rubrica 10.1.01) de valor igual a cada despesa paga por essa conta,
 * atribuído a esse sócio.
 *
 * Este helper carrega, numa única query, o mapa conta → nome do sócio, para os
 * ecrãs de pagamento poderem avisar ANTES de confirmar. Nunca por clique.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MirrorPartnerAccount {
  accountId: string;
  accountName: string;
  partnerName: string;
}

export type MirrorPartnerAccountMap = Record<string, MirrorPartnerAccount>;

export async function fetchMirrorPartnerAccounts(): Promise<MirrorPartnerAccountMap> {
  const { data: accounts, error } = await (supabase.from("financial_accounts") as any)
    .select("id, name, partner_id, mirror_partner_aporte")
    .eq("mirror_partner_aporte", true);
  if (error) throw error;

  const rows = (accounts ?? []) as {
    id: string;
    name: string;
    partner_id: string | null;
  }[];
  if (rows.length === 0) return {};

  const partnerIds = Array.from(new Set(rows.map((r) => r.partner_id).filter(Boolean))) as string[];
  const names: Record<string, string> = {};
  if (partnerIds.length > 0) {
    const { data: partners, error: pErr } = await supabase
      .from("event_partners")
      .select("id, suppliers(name)")
      .in("id", partnerIds);
    if (pErr) throw pErr;
    for (const p of (partners ?? []) as any[]) {
      names[p.id] = p.suppliers?.name ?? "sócio";
    }
  }

  const map: MirrorPartnerAccountMap = {};
  for (const r of rows) {
    map[r.id] = {
      accountId: r.id,
      accountName: r.name,
      partnerName: (r.partner_id && names[r.partner_id]) || "sócio",
    };
  }
  return map;
}

/** Mapa conta-espelho → sócio. Carregado uma vez, partilhado por queryKey. */
export function useMirrorPartnerAccounts() {
  return useQuery({
    queryKey: ["mirror-partner-accounts"],
    queryFn: fetchMirrorPartnerAccounts,
    staleTime: 5 * 60 * 1000,
  });
}
