// Utilitários das CONTAS DE TRÁFEGO DO PRÓPRIO ARTISTA (D-ERP57).
//
// Domínio distinto da captação de dados (artist_channel_connections, só
// leitura): aqui gerem-se contas de anúncios do artista, guardadas em
// crm.ad_platform_connections com connection_scope = 'artist'.
//
// Usa o MESMO app Meta e os MESMOS scopes que a ligação Meta do CRM.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { callerCompanyIds } from "./artist-meta.ts";

/** Papéis autorizados a ligar/escolher/desligar contas de tráfego. */
export const ADS_ROLES = [
  "admin",
  "platform_admin",
  "manager",
  "marketing_manager",
];

/**
 * Scopes do OAuth de anúncios de ARTISTA (só artist-ads-meta-oauth-start).
 * Base = scopes da ligação Meta do CRM + instagram_basic (D-ERP133), para
 * anunciar posts do Instagram do artista. O CRM tem a sua própria lista em
 * src/pages/crm/Connections.tsx — não partilha esta constante.
 */
export const META_ADS_SCOPES =
  "public_profile,ads_management,ads_read,business_management,pages_show_list,pages_read_engagement,instagram_basic";

export const META_DIALOG_VERSION = "v18.0";
export const META_GRAPH_VERSION = "v18.0";

export function adsCallbackUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/artist-ads-meta-oauth-callback`;
}

/** Devolve o artista + empresa, validando que o caller tem acesso à empresa. */
export async function artistInCallerScope(
  admin: SupabaseClient,
  artistId: string,
  caller: { userId?: string; isServiceRole?: boolean },
): Promise<
  | { ok: true; artist: { id: string; company_id: string; name: string } }
  | { ok: false; status: number; error: string }
> {
  const { data: artist, error } = await admin
    .from("artists")
    .select("id, company_id, name")
    .eq("id", artistId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!artist) return { ok: false, status: 404, error: "artista não encontrado" };

  if (!caller.isServiceRole) {
    const companies = await callerCompanyIds(admin, caller.userId!);
    if (companies !== "all" && !companies.includes(artist.company_id)) {
      return { ok: false, status: 403, error: "artista fora da empresa do utilizador" };
    }
  }
  return { ok: true, artist: artist as { id: string; company_id: string; name: string } };
}

/** Ligação de tráfego (linha de crm.ad_platform_connections) por id. */
export async function loadAdsConnection(admin: SupabaseClient, id: string) {
  return await (admin as any)
    .schema("crm")
    .from("ad_platform_connections")
    .select(
      "id, company_id, artist_id, connection_scope, platform, status, available_ad_accounts",
    )
    .eq("id", id)
    .maybeSingle();
}
