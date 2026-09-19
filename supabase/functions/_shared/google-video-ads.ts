// _shared/google-video-ads.ts — camada Google Ads (campanhas de VÍDEO/YouTube)
// do MOTOR ÚNICO (F4, D-ERP108).
//
// Partilhado por crm-google-video-publish-execute e
// crm-google-video-publish-activate. ALTERAR AQUI implica re-deploy das DUAS.
//
// AUTENTICAÇÃO: exactamente a do sync (crm-google-sync-campaigns) —
// service account (GOOGLE_SA_KEY_JSON) + developer token
// (GOOGLE_ADS_DEVELOPER_TOKEN) + login-customer-id do MCC guardado na ligação
// (crm.ad_platform_connections.login_customer_id) e customer_id em
// selected_ad_account_id. Não há OAuth por utilizador.
//
// Fronteira: este módulo é crm-* (lê crm.ad_platform_connections). As funções
// artist-* nunca o importam.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  GOOGLE_ADS_API_VERSION,
  getGoogleAdsAccessToken,
  googleAdsPost,
  type GoogleAdsCtx,
} from "./google-ads.ts";

export { GOOGLE_ADS_API_VERSION, googleAdsPost };
export type { GoogleAdsCtx };

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

/** Papel declarado no JWT — só para distinguir service_role de sessão. */
export function jwtRole(authHeader: string): string | null {
  try {
    const tok = authHeader.replace(/^Bearer\s+/i, "");
    const p = tok.split(".")[1];
    if (!p) return null;
    const pad = p.replace(/-/g, "+").replace(/_/g, "/");
    const js = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
    return JSON.parse(js)?.role ?? null;
  } catch {
    return null;
  }
}

/** Prova por hash (SHA-256) dos payloads do dry-run. */
export async function payloadsHash(payloads: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payloads));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Ligação ────────────────────────────────────────────────────────────────

export type LigacaoGoogle =
  | {
    ok: true;
    connectionId: string;
    customerId: string;
    loginCustomerId: string;
    moedaConta: string | null;
    status: string;
  }
  | { ok: false; status: number; error: string; message: string };

export async function loadGoogleConnection(
  admin: SupabaseClient,
  opts: { connectionId: string },
): Promise<LigacaoGoogle> {
  const { data, error } = await (admin as any)
    .schema("crm")
    .from("ad_platform_connections")
    .select("id, platform, status, selected_ad_account_id, selected_ad_account_currency, login_customer_id")
    .eq("id", opts.connectionId)
    .maybeSingle();
  if (error) {
    return { ok: false, status: 500, error: "ligacao_query_falhou", message: error.message };
  }
  if (!data) {
    return { ok: false, status: 404, error: "ligacao_nao_encontrada", message: "Ligação de anúncios não encontrada." };
  }
  if (String((data as any).platform) !== "google") {
    return { ok: false, status: 422, error: "ligacao_nao_google", message: "A ligação indicada não é do Google Ads." };
  }
  const customerId = String((data as any).selected_ad_account_id ?? "").replace(/-/g, "");
  if (!customerId) {
    return {
      ok: false,
      status: 422,
      error: "conta_google_invalida",
      message: "A ligação não tem conta do Google Ads escolhida (selected_ad_account_id).",
    };
  }
  return {
    ok: true,
    connectionId: String((data as any).id),
    customerId,
    loginCustomerId: String((data as any).login_customer_id ?? Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "")
      .replace(/-/g, ""),
    moedaConta: (data as any).selected_ad_account_currency ?? null,
    status: String((data as any).status ?? ""),
  };
}

/** Contexto de chamada. Falha de credenciais → erro identificável, nunca excepção. */
export async function googleCtx(
  conn: { customerId: string; loginCustomerId: string },
): Promise<{ ok: true; ctx: GoogleAdsCtx } | { ok: false; error: string; message: string }> {
  const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";
  if (!developerToken) {
    return {
      ok: false,
      error: "sem_token_google",
      message: "Falta o developer token do Google Ads (GOOGLE_ADS_DEVELOPER_TOKEN).",
    };
  }
  let accessToken: string;
  try {
    accessToken = await getGoogleAdsAccessToken();
  } catch (e) {
    return {
      ok: false,
      error: "sem_token_google",
      message: `Não foi possível autenticar no Google Ads: ${(e as Error).message}`,
    };
  }
  return {
    ok: true,
    ctx: {
      accessToken,
      developerToken,
      loginCustomerId: conn.loginCustomerId,
      customerId: conn.customerId,
    },
  };
}

// ── Objectivo → campanha/grupo de vídeo ────────────────────────────────────

export type AlvoGoogle = {
  /** Campo de estratégia de lance no recurso Campaign. */
  bidding: "targetCpv" | "targetCpm";
  /** Tipo do grupo de anúncios. */
  adGroupType: string;
  /** Formato do anúncio criado. */
  adFormat: "video_responsive_ad";
};

/**
 * REACH → TARGET_CPM; VIDEO_VIEWS → TARGET_CPV.
 *
 * Tipo do grupo: em v24 os formatos legados (VideoTrueViewInStreamAdInfo,
 * VideoBumperInStreamAdInfo) NÃO são criáveis por API — só VideoResponsiveAd é.
 * Logo o grupo é sempre VIDEO_RESPONSIVE e o anúncio video_responsive_ad, com o
 * vídeo do YouTube ligado por asset. TRAFFIC não existe em campanhas VIDEO sem
 * Demand Gen → devolve null (a função chamadora responde
 * objetivo_nao_suportado_google).
 */
export function mapSongObjectiveGoogle(objetivo: string): AlvoGoogle | null {
  switch (String(objetivo ?? "").toUpperCase()) {
    case "VIDEO_VIEWS":
      return { bidding: "targetCpv", adGroupType: "VIDEO_RESPONSIVE", adFormat: "video_responsive_ad" };
    case "REACH":
    case "AWARENESS":
      return { bidding: "targetCpm", adGroupType: "VIDEO_RESPONSIVE", adFormat: "video_responsive_ad" };
    default:
      return null;
  }
}

/** Faixas de idade do Google a partir de idade_min/idade_max do plano. */
export function ageRangeTypes(min?: number | null, max?: number | null): string[] {
  const faixas: Array<{ t: string; de: number; a: number }> = [
    { t: "AGE_RANGE_18_24", de: 18, a: 24 },
    { t: "AGE_RANGE_25_34", de: 25, a: 34 },
    { t: "AGE_RANGE_35_44", de: 35, a: 44 },
    { t: "AGE_RANGE_45_54", de: 45, a: 54 },
    { t: "AGE_RANGE_55_64", de: 55, a: 64 },
    { t: "AGE_RANGE_65_UP", de: 65, a: 200 },
  ];
  const lo = Number.isFinite(Number(min)) ? Number(min) : 18;
  const hi = Number.isFinite(Number(max)) ? Number(max) : 65;
  const out = faixas.filter((f) => f.a >= lo && f.de <= hi).map((f) => f.t);
  // 18–65 = tudo: não se cria critério (targeting largo por omissão).
  return out.length === faixas.length ? [] : out;
}

export const LANGUAGE_CONSTANTS: Record<string, string> = {
  pt: "1014",
  es: "1003",
  en: "1000",
};

// ── Geografia ──────────────────────────────────────────────────────────────

/** País ISO-2 → geoTargetConstants (critério de país). */
export const COUNTRY_GEO_TARGETS: Record<string, string> = {
  BR: "2076",
  PT: "2620",
  US: "2840",
  ES: "2724",
};

/**
 * Nomes de estado → geoTargetConstants, via GeoTargetConstantService.suggest
 * (locale pt, country_code do plano, target_type State).
 */
export async function suggestGeoTargets(
  ctx: GoogleAdsCtx,
  nomes: string[],
  countryCode: string,
): Promise<{ ids: string[]; avisos: Array<{ codigo: string; detalhe: string }> }> {
  const avisos: Array<{ codigo: string; detalhe: string }> = [];
  const ids: string[] = [];
  if (nomes.length === 0) return { ids, avisos };
  let resp: any;
  try {
    resp = await googleAdsPost<any>(ctx, `/geoTargetConstants:suggest`, {
      locale: "pt",
      countryCode,
      locationNames: { names: nomes },
    });
  } catch (e) {
    return {
      ids,
      avisos: [{ codigo: "geo_nao_resolvida", detalhe: descreveErroGoogle((e as any)?.raw ?? String(e)).mensagem }],
    };
  }
  const sug: any[] = resp?.geoTargetConstantSuggestions ?? [];
  for (const nome of nomes) {
    const chave = semAcentos(nome);
    const m = sug.find((s) => {
      const g = s?.geoTargetConstant ?? {};
      if (String(g?.targetType ?? "").toLowerCase() !== "state") return false;
      const nomeG = semAcentos(String(g?.name ?? ""));
      const canon = semAcentos(String(g?.canonicalName ?? ""));
      return nomeG === chave || canon.startsWith(`${chave},`);
    });
    const rn = m?.geoTargetConstant?.resourceName ?? null;
    if (rn) {
      const id = String(rn).split("/").pop()!;
      if (!ids.includes(id)) ids.push(id);
    } else {
      avisos.push({ codigo: "geo_regiao_nao_resolvida", detalhe: nome });
    }
  }
  return { ids, avisos };
}

function semAcentos(v: string): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^state of\s+/i, "")
    .replace(/^estado d[eoa]\s+/i, "")
    .trim()
    .toLowerCase();
}

// ── Erros ──────────────────────────────────────────────────────────────────

/** Erro do Google → código curto em português + mensagem legível. */
export function descreveErroGoogle(raw: unknown): { codigo: string; mensagem: string } {
  let texto = "";
  let errs: any[] = [];
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    texto = JSON.stringify(obj ?? "");
    errs = (obj as any)?.error?.details?.[0]?.errors ??
      (obj as any)?.[0]?.error?.details?.[0]?.errors ?? [];
  } catch {
    texto = String(raw ?? "");
  }
  const mensagem = errs.length
    ? errs.map((e: any) => e?.message).filter(Boolean).join(" · ")
    : (() => {
      try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        return String((obj as any)?.error?.message ?? texto).slice(0, 2000);
      } catch {
        return texto.slice(0, 2000);
      }
    })();

  if (/DEVELOPER_TOKEN_NOT_APPROVED|DEVELOPER_TOKEN_PROHIBITED|test account|TEST_ACCOUNT/i.test(texto)) {
    return {
      codigo: "developer_token_sem_acesso_basico",
      mensagem:
        "O developer token do Google Ads só tem acesso de teste — é preciso pedir o acesso Basic para publicar em contas reais. " +
        mensagem,
    };
  }
  if (/VIDEO_NOT_FOUND|video is not|VIDEO_NOT_ACCESSIBLE|PRIVATE|INVALID_YOUTUBE|YOUTUBE_VIDEO/i.test(texto)) {
    return {
      codigo: "video_nao_elegivel",
      mensagem: `O vídeo do YouTube não está acessível (tem de estar público ou não listado). ${mensagem}`,
    };
  }
  if (/CUSTOMER_NOT_FOUND|CUSTOMER_NOT_ENABLED|NOT_ADS_USER|USER_PERMISSION_DENIED/i.test(texto)) {
    return { codigo: "conta_google_invalida", mensagem: `A conta do Google Ads não está acessível. ${mensagem}` };
  }
  if (/UNAUTHENTICATED|invalid_grant|invalid authentication/i.test(texto)) {
    return { codigo: "sem_token_google", mensagem: `Falha de autenticação no Google Ads. ${mensagem}` };
  }
  return { codigo: "google_rejeitou", mensagem: mensagem || "O Google recusou o pedido." };
}

// ── Teto e registo ─────────────────────────────────────────────────────────

/** Teto por conta (public.artist_ads_budget_cap_get), plataforma 'google'. */
export async function checkTetoGoogle(
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
    (r) => String(r?.platform) === "google" && String(r?.connection_id) === opts.connectionId,
  );
  if (!linha || linha.has_cap !== true) return { ok: false, error: "sem_teto", pedido: opts.pedidoDiario };

  const capMoeda = String(linha.cap_currency ?? "").toUpperCase();
  const contaMoeda = String(linha.account_currency ?? "").toUpperCase();
  const pedidoMoeda = String(opts.moeda ?? "").toUpperCase();
  if (contaMoeda && capMoeda && contaMoeda !== capMoeda) {
    return {
      ok: false,
      error: "moeda_do_teto_diferente_da_conta",
      teto: Number(linha.daily_cap),
      pedido: opts.pedidoDiario,
      moeda: capMoeda,
    };
  }
  if (pedidoMoeda && capMoeda && pedidoMoeda !== capMoeda) {
    return {
      ok: false,
      error: "moeda_diferente_do_teto",
      teto: Number(linha.daily_cap),
      pedido: opts.pedidoDiario,
      moeda: capMoeda,
    };
  }
  const disponivel = linha.available_daily == null ? null : Number(linha.available_daily);
  if (disponivel != null && opts.pedidoDiario > disponivel + 1e-9) {
    return {
      ok: false,
      error: "acima_do_teto",
      teto: Number(linha.daily_cap),
      pedido: opts.pedidoDiario,
      ja_comprometido: linha.committed_daily == null ? null : Number(linha.committed_daily),
      disponivel,
      moeda: capMoeda,
    };
  }
  return {
    ok: true,
    teto: Number(linha.daily_cap),
    pedido: opts.pedidoDiario,
    ja_comprometido: linha.committed_daily == null ? null : Number(linha.committed_daily),
    disponivel,
    moeda: capMoeda,
  };
}

/** Orçamento diário (em unidades de moeda) de uma lista de conjuntos. */
export function dailyFromAdsetsGoogle(list: any[], lifetime: boolean, dias: number): number {
  const cents = (list ?? []).reduce((s: number, a: any) => s + Math.max(0, Number(a?.orcamento_cents ?? 0)), 0);
  return (lifetime ? cents / Math.max(1, dias) : cents) / 100;
}

/** Registo das acções em crm.ads_entity_actions_log (platform='google'). */
export async function logAdsActionGoogle(
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
    platform: "google",
    ...row,
  });
  return error ? error.message : null;
}
