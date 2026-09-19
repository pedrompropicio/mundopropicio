// _shared/tiktok-ads.ts — camada TikTok Business API do MOTOR ÚNICO (F5).
//
// Partilhado por crm-tiktok-publish-execute e crm-tiktok-publish-activate.
// ALTERAR AQUI implica re-deploy das DUAS funções.
//
// HOST: SEMPRE por variável de ambiente TIKTOK_API_HOST. Nunca se escolhe host
// por condicional no código (sem `if (sandbox)`). Valor de sandbox:
//   TIKTOK_API_HOST=https://sandbox-ads.tiktok.com/open_api/v1.3/
// Produção seria o mesmo formato com o host de produção — a decisão é de
// ambiente, não de código.
//
// AUTENTICAÇÃO: token + advertiser_id, sem OAuth. O token sai de
// crm.ad_platform_connections.access_token_encrypted (decifrado por RPC) e o
// advertiser_id de selected_ad_account_id. Em falta → erro identificável
// (`sem_token_tiktok` / `sem_advertiser_id`), nunca excepção genérica.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const TIKTOK_SANDBOX_HOST = "https://sandbox-ads.tiktok.com/open_api/v1.3/";

/** Host da API. Sem TIKTOK_API_HOST definido, a função chamadora recusa. */
export function tiktokHost(): string | null {
  const h = (Deno.env.get("TIKTOK_API_HOST") ?? "").trim();
  if (!h) return null;
  return h.endsWith("/") ? h : `${h}/`;
}

export type TikTokResult<T = any> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: number | null; message: string; raw: any };

/** POST JSON na TikTok Business API. `path` é relativo ao host (ex.: "campaign/create/"). */
export async function tiktokPOST<T = any>(
  host: string,
  path: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<TikTokResult<T>> {
  let r: Response;
  try {
    r = await fetch(`${host}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Access-Token": accessToken },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, status: 0, code: null, message: `falha de rede: ${String(e)}`, raw: null };
  }
  const j: any = await r.json().catch(() => ({}));
  // A TikTok devolve HTTP 200 com code != 0 em erro de negócio.
  if (!r.ok || Number(j?.code ?? -1) !== 0) {
    return {
      ok: false,
      status: r.status,
      code: j?.code ?? null,
      message: String(j?.message ?? `HTTP ${r.status}`),
      raw: j,
    };
  }
  return { ok: true, data: (j?.data ?? {}) as T };
}

/** GET na TikTok Business API. */
export async function tiktokGET<T = any>(
  host: string,
  path: string,
  params: Record<string, string>,
  accessToken: string,
): Promise<TikTokResult<T>> {
  const qs = new URLSearchParams(params).toString();
  let r: Response;
  try {
    r = await fetch(`${host}${path}?${qs}`, { headers: { "Access-Token": accessToken } });
  } catch (e) {
    return { ok: false, status: 0, code: null, message: `falha de rede: ${String(e)}`, raw: null };
  }
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || Number(j?.code ?? -1) !== 0) {
    return { ok: false, status: r.status, code: j?.code ?? null, message: String(j?.message ?? `HTTP ${r.status}`), raw: j };
  }
  return { ok: true, data: (j?.data ?? {}) as T };
}

/**
 * Objectivo do plano (AWARENESS | TRAFFIC | ENGAGEMENT) → TikTok.
 * Mesmos três objectivos do alvo música no Meta; nada mais é aceite.
 */
export function mapSongObjectiveTikTok(objetivo: string): {
  objective_type: string;
  optimization_goal: string;
  billing_event: string;
  promotion_type: string;
} | null {
  switch (String(objetivo ?? "").toUpperCase()) {
    case "AWARENESS":
      return { objective_type: "REACH", optimization_goal: "REACH", billing_event: "CPM", promotion_type: "WEBSITE" };
    case "TRAFFIC":
      return { objective_type: "TRAFFIC", optimization_goal: "CLICK", billing_event: "CPC", promotion_type: "WEBSITE" };
    case "ENGAGEMENT":
      return { objective_type: "VIDEO_VIEWS", optimization_goal: "VIDEO_VIEW", billing_event: "CPV", promotion_type: "WEBSITE" };
    default:
      return null;
  }
}

/** ISO-2 / nome de região → location_ids TikTok, via `tool/region/`. */
export async function resolveLocationIds(
  host: string,
  accessToken: string,
  advertiserId: string,
  objectiveType: string,
  paises: string[],
  regioes: Array<{ nome?: string; key?: string }>,
): Promise<{ location_ids: string[]; avisos: Array<{ codigo: string; detalhe: string }> }> {
  const avisos: Array<{ codigo: string; detalhe: string }> = [];
  const r = await tiktokGET<{ region_info?: any[] }>(
    host,
    "tool/region/",
    { advertiser_id: advertiserId, objective_type: objectiveType },
    accessToken,
  );
  if (!r.ok) {
    return { location_ids: [], avisos: [{ codigo: "geo_nao_resolvida", detalhe: r.message }] };
  }
  const info: any[] = Array.isArray(r.data?.region_info) ? r.data!.region_info! : [];
  const out: string[] = [];

  for (const iso of paises) {
    const alvo = String(iso).toUpperCase();
    const m = info.find((x) =>
      String(x?.region_level ?? "").toUpperCase() === "COUNTRY" &&
      String(x?.region_code ?? "").toUpperCase() === alvo
    );
    if (m?.location_id != null) out.push(String(m.location_id));
    else avisos.push({ codigo: "geo_pais_nao_resolvido", detalhe: alvo });
  }

  for (const reg of regioes) {
    const nome = String(reg?.nome ?? reg?.key ?? "").trim().toLowerCase();
    if (!nome) continue;
    const m = info.find((x) =>
      String(x?.region_level ?? "").toUpperCase() !== "COUNTRY" &&
      String(x?.name ?? "").trim().toLowerCase() === nome
    );
    if (m?.location_id != null) out.push(String(m.location_id));
    else avisos.push({ codigo: "geo_regiao_nao_resolvida", detalhe: nome });
  }

  return { location_ids: [...new Set(out)], avisos };
}

/** Prova por hash (SHA-256) dos payloads do dry-run — mesma função nas duas edge functions. */
export async function payloadsHash(payloads: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payloads));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Registo genérico e multi-plataforma das acções (crm.ads_entity_actions_log). */
export async function logAdsAction(
  admin: SupabaseClient,
  row: {
    company_id: string;
    connection_id: string;
    ad_account_id: string;
    plan_id: string;
    artist_id?: string | null;
    song_id?: string | null;
    entity_type: "campaign" | "adgroup" | "ad";
    external_id: string;
    entity_name?: string | null;
    action: "create" | "activate" | "pause";
    prev_status?: string | null;
    new_status?: string | null;
    updates_jsonb?: Record<string, unknown> | null;
    success: boolean;
    error_message?: string | null;
    platform_response_jsonb?: Record<string, unknown> | null;
    performed_by?: string | null;
    approved_by?: string | null;
  },
): Promise<string | null> {
  const { error } = await (admin as any).schema("crm").from("ads_entity_actions_log").insert({
    platform: "tiktok",
    ...row,
  });
  return error ? error.message : null;
}

/**
 * Teto por conta, multi-plataforma. Fonte única: public.artist_ads_budget_cap_get
 * (uma linha por plataforma). Fechado por omissão: sem linha de teto para a
 * ligação TikTok, o motor recusa.
 */
export async function checkTetoTikTok(
  user: SupabaseClient,
  opts: { artistId: string; connectionId: string; moeda?: string | null; pedidoDiario: number },
): Promise<{
  ok: boolean;
  error?: string;
  teto?: number | null;
  pedido: number;
  ja_comprometido?: number | null;
  disponivel?: number | null;
  moeda?: string | null;
}> {
  const { data, error } = await user.rpc("artist_ads_budget_cap_get", { p_artist_id: opts.artistId });
  if (error) return { ok: false, error: "teto_query_falhou", pedido: opts.pedidoDiario };
  const linha = ((data ?? []) as any[]).find(
    (r) => String(r?.platform) === "tiktok" && String(r?.connection_id) === opts.connectionId,
  );
  if (!linha || linha.has_cap !== true) return { ok: false, error: "sem_teto", pedido: opts.pedidoDiario };

  const capMoeda = String(linha.cap_currency ?? "").toUpperCase();
  const contaMoeda = String(linha.account_currency ?? "").toUpperCase();
  const pedidoMoeda = String(opts.moeda ?? "").toUpperCase();
  // O teto é verificado NA MOEDA DA CONTA: plano, conta e teto têm de coincidir.
  if (contaMoeda && capMoeda && contaMoeda !== capMoeda) {
    return { ok: false, error: "moeda_do_teto_diferente_da_conta", teto: Number(linha.daily_cap), pedido: opts.pedidoDiario, moeda: capMoeda };
  }
  if (pedidoMoeda && capMoeda && pedidoMoeda !== capMoeda) {
    return { ok: false, error: "moeda_diferente_do_teto", teto: Number(linha.daily_cap), pedido: opts.pedidoDiario, moeda: capMoeda };
  }

  const disponivel = linha.available_daily == null ? null : Number(linha.available_daily);
  if (disponivel != null && opts.pedidoDiario > disponivel + 1e-9) {
    return {
      ok: false, error: "acima_do_teto", teto: Number(linha.daily_cap), pedido: opts.pedidoDiario,
      ja_comprometido: linha.committed_daily == null ? null : Number(linha.committed_daily),
      disponivel, moeda: capMoeda,
    };
  }
  return {
    ok: true, teto: Number(linha.daily_cap), pedido: opts.pedidoDiario,
    ja_comprometido: linha.committed_daily == null ? null : Number(linha.committed_daily),
    disponivel, moeda: capMoeda,
  };
}

/** Orçamento diário (em unidades de moeda) de uma lista de conjuntos. */
export function dailyFromAdsetsTikTok(list: any[], lifetime: boolean, dias: number): number {
  const cents = (list ?? []).reduce((s: number, a: any) => s + Math.max(0, Number(a?.orcamento_cents ?? 0)), 0);
  return (lifetime ? cents / Math.max(1, dias) : cents) / 100;
}

/** Papel declarado no JWT — só para distinguir service_role de sessão. */
export function jwtRole(authHeader: string): string | null {
  try {
    const tok = authHeader.replace(/^Bearer\s+/i, "");
    const p = tok.split(".")[1];
    if (!p) return null;
    const pad = p.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(pad + "=".repeat((4 - pad.length % 4) % 4)));
    return typeof claims?.role === "string" ? claims.role : null;
  } catch {
    return null;
  }
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Carrega a ligação de tráfego TikTok do artista e decifra o token.
 * Erros identificáveis: ligacao_nao_encontrada / ligacao_nao_tiktok /
 * ligacao_inactiva / sem_advertiser_id / sem_token_tiktok.
 */
export async function loadTikTokConnection(
  admin: SupabaseClient,
  opts: { connectionId: string; masterKey: string; exigirToken: boolean },
): Promise<
  | { ok: true; connectionId: string; advertiserId: string; accessToken: string | null; moedaConta: string | null; status: string }
  | { ok: false; error: string; message: string; status: number }
> {
  const { data: conn, error } = await (admin as any)
    .schema("crm").from("ad_platform_connections")
    .select("id, platform, status, connection_scope, artist_id, selected_ad_account_id, selected_ad_account_currency, access_token_encrypted, expires_at")
    .eq("id", opts.connectionId)
    .maybeSingle();
  if (error) return { ok: false, error: "ligacao_query_falhou", message: error.message, status: 500 };
  if (!conn) return { ok: false, error: "ligacao_nao_encontrada", message: "A ligação de anúncios do plano não existe.", status: 404 };
  if (String((conn as any).platform) !== "tiktok") {
    return { ok: false, error: "ligacao_nao_tiktok", message: "A ligação do plano não é TikTok.", status: 422 };
  }
  const advertiserId = String((conn as any).selected_ad_account_id ?? "").trim();
  const temToken = !!(conn as any).access_token_encrypted;

  if (!advertiserId) {
    return {
      ok: false, error: "sem_advertiser_id", status: 422,
      message: "A ligação TikTok não tem conta de anúncios escolhida (advertiser_id). Escolhe a conta antes de publicar.",
    };
  }
  if (opts.exigirToken && !temToken) {
    return {
      ok: false, error: "sem_token_tiktok", status: 422,
      message: "A ligação TikTok não tem token de acesso guardado. Liga a conta (token + advertiser_id) antes de publicar.",
    };
  }

  let accessToken: string | null = null;
  if (temToken) {
    const { data: rows, error: tErr } = await (admin as any).rpc("crm_get_meta_decrypted_token", {
      p_connection_id: opts.connectionId,
      p_master_key: opts.masterKey,
    });
    const tok = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any)?.access_token : null;
    if (tErr || !tok) {
      if (opts.exigirToken) {
        return { ok: false, error: "token_tiktok_indecifravel", message: "Não foi possível decifrar o token da ligação TikTok.", status: 422 };
      }
    } else {
      accessToken = String(tok);
    }
  }

  return {
    ok: true,
    connectionId: String((conn as any).id),
    advertiserId,
    accessToken,
    moedaConta: (conn as any).selected_ad_account_currency ?? null,
    status: String((conn as any).status ?? ""),
  };
}
