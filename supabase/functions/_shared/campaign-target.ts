// campaign-target.ts — RESOLVEDOR ÚNICO DE ALVO DE CAMPANHA (D-ERP95, F2b)
//
// O motor de campanhas é único e aceita DOIS alvos:
//   kind 'event' — comportamento histórico, byte a byte. Este ramo é uma
//                  EXTRACÇÃO do que o crm-meta-publish-execute já fazia:
//                  mesmas queries (ad_platform_account_links → connections →
//                  crm_get_meta_decrypted_token → events), mesma ordem, mesmos
//                  códigos de erro e mesmos valores devolvidos.
//   kind 'song'  — conta, token, Página e Instagram vêm da connection do plano
//                  (crm.ad_platform_connections, connection_scope='artist').
//                  Sem pixel: campanhas de música não têm evento de compra.
//
// Ordem de erros do ramo 'event': o antigo passo 2c (sem_link_destino) corria
// ENTRE a resolução da Página e a decifra do token. Para não alterar a ordem
// das respostas de eventos, quem chama pode passar `onAccountResolved`, que é
// executado exactamente nesse ponto; devolver uma Response aí aborta a
// resolução com essa resposta.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.39.0";

export type TargetKind = "event" | "song";

export type CampaignTarget = {
  kind: TargetKind;
  company_id: string;
  /** Nome do evento, ou título-base da música (public.artist_song_base_title). */
  display_name: string;
  /** Data do evento (pode ser ""), ou AAAA-MM-DD do arranque do plano de música. */
  date_label: string;
  ad_account_id: string;
  ad_account_numeric: string;
  connection_id: string;
  page_id: string | null;
  instagram_user_id: string | null;
  pixel_id: string | null;
  access_token: string;
  /** Moeda da conta de anúncios (só resolvida no alvo música). */
  currency: string | null;
  naming: {
    /** Nome da campanha já formatado. */
    campaign: string;
    /** Prefixo a aplicar a conjuntos e anúncios ("" no alvo evento, "[MP] " no alvo música). */
    prefix: string;
  };
  /** Sufixo url_tags a aplicar ao criativo (só alvo música). */
  utm: string | null;
};

export type ResolveOpts = {
  /** Autorizado a gravar page_id/instagram_id resolvidos na connection (preflight e publicação real; nunca em dry_run). */
  allowWrites?: boolean;
  /** Versão da Graph API a usar nas resoluções por HTTP. */
  graphVersion?: string;
  /** Corre no ponto exacto onde o passo 2c do caminho de evento corria. */
  onAccountResolved?: () => Response | null | undefined;
};

export type ResolveResult =
  | { ok: true; target: CampaignTarget }
  | { ok: false; response: Response };

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
    },
  });
}

function normalizeAdAccountId(raw: string): string {
  const c = String(raw).trim();
  return c.startsWith("act_") ? c : `act_${c}`;
}

/** Slug para UTMs: sem acentos, minúsculas, só [a-z0-9-]. */
export function utmSlug(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Rótulo em português do objectivo de uma campanha de música. */
export function songObjectiveLabel(objetivo: string): string {
  switch (String(objetivo).toUpperCase()) {
    case "AWARENESS": return "Alcance";
    case "ENGAGEMENT": return "Visualizações";
    default: return "Tráfego";
  }
}

type PlanRow = {
  id: string;
  company_id: string;
  event_id: string | null;
  artist_id: string | null;
  song_id: string | null;
  connection_id: string | null;
  objetivo: string | null;
  start_time: string | null;
};

// ─────────────────────────────────────────────────────────── ALVO EVENTO
async function resolveEvent(
  user: SupabaseClient,
  admin: SupabaseClient,
  planRow: PlanRow,
  masterKey: string,
  opts: ResolveOpts,
): Promise<ResolveResult> {
  // 2) Conexão Meta ativa para este company → connection_id + ad_account_id.
  const { data: linkRow, error: linkErr } = await (user as any)
    .schema("crm").from("ad_platform_account_links")
    .select("connection_id, ad_account_id, is_primary, enabled")
    .eq("enabled", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (linkErr) return { ok: false, response: jsonResponse({ error: "ad_account_query_failed", detail: linkErr.message }, 500) };
  if (!linkRow) return { ok: false, response: jsonResponse({ error: "no_active_meta_connection" }, 412) };

  const connectionId = linkRow.connection_id as string;
  const adAccountId = normalizeAdAccountId(linkRow.ad_account_id as string);

  // 2b) Página de Facebook e (opcional) Instagram da conexão.
  const { data: connRow, error: connErr } = await (admin as any)
    .schema("crm").from("ad_platform_connections")
    .select("selected_page_id, selected_instagram_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (connErr) return { ok: false, response: jsonResponse({ error: "connection_query_failed", detail: connErr.message }, 500) };
  const selectedPageId: string | null = (connRow as any)?.selected_page_id ?? null;
  const selectedInstagramId: string | null = (connRow as any)?.selected_instagram_id ?? null;
  if (!selectedPageId) {
    return { ok: false, response: jsonResponse({ error: "sem_pagina_facebook", message: "A conexão Meta não tem página de Facebook selecionada." }, 412) };
  }

  // 2c) Ponto histórico do check de link de destino.
  const hook = opts.onAccountResolved?.();
  if (hook) return { ok: false, response: hook };

  // 3) Decifra access_token.
  const { data: tokenRows, error: tokenErr } = await user.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: masterKey },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return { ok: false, response: jsonResponse({ error: "decrypt_failed", detail: tokenErr?.message ?? null }, 403) };
  }
  const accessToken = (tokenRows[0] as { access_token: string }).access_token;

  // 4) Dados do evento (nome da campanha + pixel para conversões).
  const { data: eventRow, error: eventErr } = await admin
    .from("events").select("name, date, meta_pixel_id").eq("id", planRow.event_id!).maybeSingle();
  console.log("[publish-execute] EVENT_DEBUG", JSON.stringify({
    event_id_usado: planRow.event_id,
    eventRow_raw: eventRow,
    eventErr: eventErr ?? "no_error",
    admin_schema_note: "admin createClient sem db.schema => default public",
  }));
  let eventRowFinal: any = eventRow;
  if (!eventRow && !eventErr) {
    const { data: eventRowPub, error: eventErrPub } = await (admin as any)
      .schema("public").from("events")
      .select("name, date, meta_pixel_id").eq("id", planRow.event_id!).maybeSingle();
    console.log("[publish-execute] EVENT_DEBUG_PUBLIC_FALLBACK", JSON.stringify({
      eventRowPub, eventErrPub: eventErrPub ?? "no_error",
    }));
    eventRowFinal = eventRowPub;
  }
  const nomeEvento = (eventRowFinal as any)?.name ?? "Evento";
  const dataEvento = (eventRowFinal as any)?.date ?? "";

  return {
    ok: true,
    target: {
      kind: "event",
      company_id: planRow.company_id,
      display_name: nomeEvento,
      date_label: dataEvento,
      ad_account_id: adAccountId,
      ad_account_numeric: adAccountId.replace(/^act_/, ""),
      connection_id: connectionId,
      page_id: selectedPageId,
      instagram_user_id: selectedInstagramId,
      pixel_id: (eventRowFinal as any)?.meta_pixel_id ?? null,
      access_token: accessToken,
      currency: null,
      // Naming histórico, literal.
      naming: { campaign: `[MP Audience] ${nomeEvento}${dataEvento ? ` - ${dataEvento}` : ""}`, prefix: "" },
      utm: null,
    },
  };
}

// ──────────────────────────────────────────────────────────── ALVO MÚSICA
async function graphGET(
  path: string, params: Record<string, string>, token: string, version: string,
): Promise<{ ok: boolean; data: any; status: number }> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`https://graph.facebook.com/${version}${path}?${qs.toString()}`);
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !j?.error, data: j, status: r.status };
}

/** Página mais usada no histórico de anúncios da connection (prefixo de effective_object_story_id). */
export async function derivePageIdFromAdHistory(
  admin: SupabaseClient, connectionId: string,
): Promise<string | null> {
  const { data } = await (admin as any)
    .schema("crm").from("meta_ad_snapshot")
    .select("raw")
    .eq("connection_id", connectionId)
    .limit(2000);
  const counts = new Map<string, number>();
  for (const row of (data ?? [])) {
    const osi = (row as any)?.raw?.creative?.effective_object_story_id;
    if (typeof osi !== "string" || !osi.includes("_")) continue;
    const pid = osi.split("_")[0];
    if (!/^[0-9]{5,}$/.test(pid)) continue;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  let best: string | null = null; let bestN = 0;
  for (const [pid, n] of counts) if (n > bestN) { best = pid; bestN = n; }
  return best;
}

async function resolveSong(
  admin: SupabaseClient,
  planRow: PlanRow,
  masterKey: string,
  opts: ResolveOpts,
): Promise<ResolveResult> {
  const version = opts.graphVersion ?? "v18.0";
  if (!planRow.connection_id) {
    return { ok: false, response: jsonResponse({ ok: false, error: "sem_connection", message: "O plano de música não indica a ligação de anúncios do artista." }, 412) };
  }

  const { data: conn, error: connErr } = await (admin as any)
    .schema("crm").from("ad_platform_connections")
    .select("id, company_id, artist_id, connection_scope, platform, status, selected_ad_account_id, selected_ad_account_currency, selected_page_id, selected_instagram_id")
    .eq("id", planRow.connection_id)
    .maybeSingle();
  if (connErr) return { ok: false, response: jsonResponse({ error: "connection_query_failed", detail: connErr.message }, 500) };
  if (!conn) return { ok: false, response: jsonResponse({ ok: false, error: "connection_nao_encontrada" }, 412) };
  if (conn.connection_scope !== "artist" || conn.artist_id !== planRow.artist_id) {
    return { ok: false, response: jsonResponse({ ok: false, error: "connection_nao_e_do_artista" }, 412) };
  }
  if (conn.status !== "active") {
    return { ok: false, response: jsonResponse({ ok: false, error: "connection_inativa", status_ligacao: conn.status, message: "A ligação de anúncios do artista não está activa — reconecta antes de publicar." }, 412) };
  }
  if (!conn.selected_ad_account_id) {
    return { ok: false, response: jsonResponse({ ok: false, error: "sem_conta_de_anuncios", message: "A ligação do artista não tem conta de anúncios escolhida." }, 412) };
  }
  const adAccountId = normalizeAdAccountId(conn.selected_ad_account_id as string);

  // Token da connection do artista.
  const { data: tokenRows, error: tokenErr } = await admin.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: planRow.connection_id, p_master_key: masterKey },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return { ok: false, response: jsonResponse({ error: "decrypt_failed", detail: tokenErr?.message ?? null }, 403) };
  }
  const accessToken = (tokenRows[0] as { access_token: string }).access_token;

  // Página: da connection; em falta, derivada do histórico de anúncios.
  let pageId: string | null = conn.selected_page_id ?? null;
  if (!pageId) {
    pageId = await derivePageIdFromAdHistory(admin, planRow.connection_id);
    if (pageId && opts.allowWrites) {
      await (admin as any).schema("crm").from("ad_platform_connections")
        .update({ selected_page_id: pageId }).eq("id", planRow.connection_id);
    }
  }

  // Instagram: da connection; em falta, pela Graph API (só quando é permitido gravar).
  let igId: string | null = conn.selected_instagram_id ?? null;
  if (!igId && opts.allowWrites) {
    if (pageId) {
      const r = await graphGET(`/${pageId}`, { fields: "instagram_business_account" }, accessToken, version);
      igId = r.ok ? (r.data?.instagram_business_account?.id ?? null) : null;
    }
    if (!igId) {
      const r = await graphGET(`/${adAccountId}`, { fields: "instagram_accounts{id,username}" }, accessToken, version);
      igId = r.ok ? (r.data?.instagram_accounts?.data?.[0]?.id ?? null) : null;
    }
    if (igId) {
      await (admin as any).schema("crm").from("ad_platform_connections")
        .update({ selected_instagram_id: igId }).eq("id", planRow.connection_id);
    }
  }

  // Título-base da música (fonte única: public.artist_song_base_title).
  const { data: song } = await (admin as any)
    .from("artist_songs").select("id, title").eq("id", planRow.song_id).maybeSingle();
  const rawTitle = (song as any)?.title ?? "";
  const { data: baseTitle } = await admin.rpc("artist_song_base_title", { _title: rawTitle });
  const tituloBase = String(baseTitle ?? rawTitle ?? "").trim() || "musica";

  const dateLabel = (planRow.start_time ? new Date(planRow.start_time) : new Date())
    .toISOString().slice(0, 10);
  const label = songObjectiveLabel(planRow.objetivo ?? "TRAFFIC");
  const campaignName = `[MP] [${tituloBase.toUpperCase()}] [${label}] ${dateLabel}`;

  return {
    ok: true,
    target: {
      kind: "song",
      company_id: planRow.company_id,
      display_name: tituloBase,
      date_label: dateLabel,
      ad_account_id: adAccountId,
      ad_account_numeric: adAccountId.replace(/^act_/, ""),
      connection_id: planRow.connection_id,
      page_id: pageId,
      instagram_user_id: igId,
      pixel_id: null,
      access_token: accessToken,
      currency: conn.selected_ad_account_currency ?? null,
      naming: { campaign: campaignName, prefix: "[MP] " },
      utm: `utm_source=meta&utm_medium=paid&utm_campaign=${utmSlug(campaignName)}`,
    },
  };
}

/**
 * Resolvedor único. O alvo é decidido pelo plano: song_id preenchido → música;
 * caso contrário → evento (comportamento histórico).
 */
export async function resolveTarget(
  admin: SupabaseClient,
  planRow: PlanRow,
  extra: { user: SupabaseClient; masterKey: string } & ResolveOpts,
): Promise<ResolveResult> {
  const { user, masterKey, ...opts } = extra;
  if (planRow.song_id) return await resolveSong(admin, planRow, masterKey, opts);
  return await resolveEvent(user, admin, planRow, masterKey, opts);
}
