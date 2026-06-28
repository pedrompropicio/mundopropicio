// crm-meta-create-reels-ad
// PT-PT. Cria UM anúncio de vídeo (Reels) num ADSET QUE JÁ EXISTE no Meta,
// reutilizando um criativo da biblioteca local (crm.meta_creatives) que já
// foi carregado para o Meta (meta_video_id preenchido por crm-meta-upload-creative-v2).
//
// REGRAS DURAS:
//   • status="PAUSED" HARDCODED. Nunca aceitar status do caller. Ativação é
//     decisão humana via crm-meta-publish-activate.
//   • dry_run default = TRUE. Só faz POST real ao Meta se vier explicitamente
//     dry_run:false no body.
//   • NÃO mexe no adset (placements são herdados do adset existente).
//   • NÃO sobe vídeo (assume meta_video_id já existe).
//   • Token NUNCA em texto: desencriptado via RPC crm_get_meta_decrypted_token,
//     idêntico ao caminho usado por crm-meta-publish-execute.
//
// Reutiliza FIELMENTE o caminho de buildSingleAssetCreative do
// crm-meta-publish-execute (linhas ~518-528): object_story_spec.video_data
// = { video_id, message, title, call_to_action: { type, value:{ link } } }
// + instagram_actor_id quando existir. image_url/image_hash são omitidos de
// propósito (Meta gera a capa a partir do video_id).

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0"; // mesma versão do publish-execute
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeAdAccountId(raw: string): string {
  const c = raw.trim();
  return c.startsWith("act_") ? c : `act_${c}`;
}

type GraphError = { message?: string; code?: number; error_subcode?: number; type?: string };

async function graphPOST(
  path: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<{ ok: true; data: any } | { ok: false; status: number; error: GraphError | null; raw: any }> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}${path}`;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    params.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  params.set("access_token", accessToken);
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) {
    return { ok: false, status: r.status, error: j?.error ?? null, raw: j };
  }
  return { ok: true, data: j };
}

// CTAs válidos (subset do publish-execute, suficiente para Reels de bilheteira).
const META_VALID_CTAS = new Set([
  "BUY_TICKETS", "GET_EVENT_TICKETS", "BUY_NOW", "ORDER_NOW", "GET_OFFER",
  "BOOK_NOW", "LEARN_MORE", "SEE_MORE", "SHOP_NOW", "SIGN_UP", "WATCH_MORE",
  "LISTEN_NOW", "APPLY_NOW", "NO_BUTTON",
]);
function normalizeCta(raw: string | undefined): string {
  const v = String(raw || "BUY_TICKETS").toUpperCase().trim();
  return META_VALID_CTAS.has(v) ? v : "BUY_TICKETS";
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[meta-create-reels-ad] BUILD_VERSION=create-reels-ad-v1");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: {
    company_id?: string;
    external_adset_id?: string;
    creative_id?: string;
    link?: string;
    message?: string;
    title?: string;
    cta?: string;
    dry_run?: boolean;
  };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const companyId = body.company_id;
  const externalAdsetId = body.external_adset_id;
  const creativeId = body.creative_id;
  const link = body.link;
  const message = body.message;
  const titleIn = typeof body.title === "string" ? body.title : "";
  const cta = normalizeCta(body.cta);
  // SALVAGUARDA P0: dry_run default = TRUE. Só escreve no Meta se vier explicitamente false.
  const dryRun = body.dry_run !== false;

  const missing: string[] = [];
  if (!companyId) missing.push("company_id");
  if (!externalAdsetId) missing.push("external_adset_id");
  if (!creativeId) missing.push("creative_id");
  if (!link) missing.push("link");
  if (!message) missing.push("message");
  if (missing.length > 0) return json({ error: "missing_params", required: missing }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Helper de telemetria (service_role).
  async function logDebug(fields: Record<string, unknown>) {
    try {
      await (admin as any).schema("crm").from("create_reels_ad_debug").insert({
        company_id: companyId,
        creative_id: creativeId,
        external_adset_id: externalAdsetId,
        dry_run: dryRun,
        ...fields,
      });
    } catch (e) {
      console.error("[meta-create-reels-ad] debug_insert_failed", e);
    }
  }

  // 1) Carregar o criativo (RLS user — valida pertença ao company).
  const { data: creativeRow, error: creativeErr } = await (supabase as any)
    .schema("crm").from("meta_creatives")
    .select("id, company_id, type, meta_video_id, meta_image_hash, name")
    .eq("id", creativeId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (creativeErr) {
    await logDebug({ ok: false, detail: "creative_query_failed: " + creativeErr.message });
    return json({ error: "creative_query_failed", detail: creativeErr.message }, 500);
  }
  if (!creativeRow) {
    await logDebug({ ok: false, detail: "creative_not_found" });
    return json({ error: "creative_not_found" }, 404);
  }
  const tipo = String((creativeRow as any).type ?? "").toLowerCase();
  if (tipo !== "video") {
    await logDebug({ ok: false, detail: `criativo_nao_e_video: type=${tipo}` });
    return json({ error: "criativo_nao_e_video", detail: `type=${tipo}` }, 400);
  }
  const metaVideoId: string | null = (creativeRow as any).meta_video_id ?? null;
  if (!metaVideoId) {
    await logDebug({ ok: false, detail: "video_sem_meta_video_id" });
    return json({
      error: "video_ainda_nao_esta_no_meta",
      detail: "Sobe/processa o criativo primeiro via crm-meta-upload-creative-v2.",
    }, 409);
  }

  // 2) Conexão Meta ativa (mesmo caminho do publish-execute: link primário enabled).
  const { data: linkRow, error: linkErr } = await (supabase as any)
    .schema("crm").from("ad_platform_account_links")
    .select("connection_id, ad_account_id, is_primary, enabled")
    .eq("enabled", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (linkErr) {
    await logDebug({ ok: false, detail: "ad_account_query_failed: " + linkErr.message });
    return json({ error: "ad_account_query_failed", detail: linkErr.message }, 500);
  }
  if (!linkRow) {
    await logDebug({ ok: false, detail: "no_active_meta_connection" });
    return json({ error: "no_active_meta_connection" }, 412);
  }
  const connectionId = (linkRow as any).connection_id as string;
  const adAccountId = normalizeAdAccountId((linkRow as any).ad_account_id as string);

  // 3) Página FB + Instagram associados à conexão (REUTILIZA a lógica do publish-execute).
  const { data: connRow, error: connErr } = await (admin as any)
    .schema("crm").from("ad_platform_connections")
    .select("selected_page_id, selected_instagram_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (connErr) {
    await logDebug({ ok: false, detail: "connection_query_failed: " + connErr.message });
    return json({ error: "connection_query_failed", detail: connErr.message }, 500);
  }
  const selectedPageId: string | null = (connRow as any)?.selected_page_id ?? null;
  const selectedInstagramId: string | null = (connRow as any)?.selected_instagram_id ?? null;
  if (!selectedPageId) {
    await logDebug({ ok: false, detail: "sem_pagina_facebook" });
    return json({
      error: "sem_pagina_facebook",
      message: "A conexão Meta não tem página de Facebook selecionada.",
    }, 412);
  }

  // 4) Desencripta access_token (IDÊNTICO ao publish-execute).
  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    await logDebug({ ok: false, detail: "decrypt_failed: " + (tokenErr?.message ?? "no_rows") });
    return json({ error: "decrypt_failed", detail: tokenErr?.message ?? null }, 403);
  }
  const accessToken = (tokenRows[0] as { access_token: string }).access_token;

  // 5) Monta creative — réplica fiel do ramo isVideo de buildSingleAssetCreative
  //    em supabase/functions/crm-meta-publish-execute/index.ts (linhas 518-528).
  const title = titleIn || ((creativeRow as any).name ?? "");
  const videoData: Record<string, unknown> = {
    video_id: metaVideoId,
    message,
    title,
    call_to_action: { type: cta, value: { link } },
  };
  const objectStorySpec: Record<string, unknown> = {
    page_id: selectedPageId,
    video_data: videoData,
  };
  if (selectedInstagramId) objectStorySpec.instagram_actor_id = selectedInstagramId;
  const creative = { object_story_spec: objectStorySpec };

  // 6) Payload do ad. status="PAUSED" HARDCODED (não vem do caller).
  //    Razão: este caminho NUNCA pode publicar criativos activos automaticamente.
  //    Ativação é feita explicitamente pelo utilizador via crm-meta-publish-activate.
  const adName = `[MP Audience] Reels - ${(creativeRow as any).name ?? "criativo"} - ${new Date().toISOString().slice(0, 19)}`;
  const adPayload: Record<string, unknown> = {
    name: adName,
    adset_id: externalAdsetId,
    status: "PAUSED", // HARDCODED — não aceitar status do caller.
    creative,
  };

  // 7) Dry-run: NÃO chama o Meta, devolve payload completo para inspeção.
  if (dryRun) {
    await logDebug({ ok: true, payload: adPayload });
    return json({
      ok: true,
      dry_run: true,
      resolved: {
        ad_account_id: adAccountId,
        adset_id: externalAdsetId,
        page_id: selectedPageId,
        instagram_actor_id: selectedInstagramId,
        meta_video_id: metaVideoId,
      },
      payload: adPayload,
    });
  }

  // 8) Escrita real: POST /<ad_account_id>/ads.
  const r = await graphPOST(`/${adAccountId}/ads`, adPayload, accessToken);
  if (!r.ok) {
    await logDebug({
      ok: false,
      http_status: r.status,
      detail: r.error?.message ?? `HTTP ${r.status}`,
      fb_error: r.error ?? null,
      payload: adPayload,
    });
    // Padrão das outras crm-meta-*: HTTP 200 com ok:false.
    return json({
      ok: false,
      error: "graph_create_ad_failed",
      detail: r.error?.message ?? `HTTP ${r.status}`,
      fb_error: r.error,
      raw: r.raw,
    });
  }

  const adId = (r.data as any)?.id as string;
  await logDebug({ ok: true, ad_id: adId, http_status: 200, payload: adPayload });
  return json({
    ok: true,
    dry_run: false,
    ad_id: adId,
    status: "PAUSED",
  });
});
