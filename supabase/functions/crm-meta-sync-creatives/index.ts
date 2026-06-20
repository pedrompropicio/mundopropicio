// cold-start trigger: 2026-06-01-v2 secret rotation
// Force re-deploy 2026-05-17 — Lovable não detectou auto-deploy
// inicial após push a2b2ed93 (Sprint Meta Creatives Sync v1).
// crm-meta-sync-creatives (Sprint Meta Creatives Sync v1)
// POST { connection_id, ad_account_id, mode?, max_creatives_per_run?, triggered_by? }
//
// Popula crm.meta_creatives via Meta Graph API para criativos referenciados
// em meta_ad_snapshot que ainda não existem na tabela. Resolve a dor do
// Sprint 3c-4: criativos criados directamente no Meta Ads Manager nunca
// chegavam a meta_creatives (que era populada só via UI upload), e por
// isso os mockups vinham com body/headline/cta_type/link_url=null.
//
// Auth dual-mode:
// - service_role JWT (cron) — userId=null, created_by=null
// - user JWT (manual) — userId=auth.uid()
//
// v1 NÃO inclui: resolução de image_hash → file_url, auto-trigger de
// crm-meta-creative-analyze, refresh full periódico, template_data/AAA.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { REHOST_BUCKET, rehostCreative } from "../_shared/rehost-creative.ts";

const GRAPH_API_VERSION = "v18.0";
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

// Inspect JWT payload to detect service_role (cron) vs user JWT.
function isServiceRoleJWT(authHeader: string): boolean {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length < 2) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.role === "service_role";
  } catch { return false; }
}

// Graph API fields. Pedimos tudo o que o parser pode usar; campos opcionais
// chegam como undefined sem erro. v2 adiciona asset_feed_spec + product_set_id
// para DPA, e expande object_story_spec implicitamente (Graph retorna sub-objects).
const CREATIVE_FIELDS = [
  "id", "name", "body", "title", "object_story_spec",
  "image_url", "video_id", "thumbnail_url", "call_to_action_type",
  "object_type", "image_hash",
  "asset_feed_spec", "product_set_id",
  // Anúncios Instagram cujo object_story_spec só tem page_id/instagram_user_id:
  // o asset visual não está no spec — vive nestas referências de topo (post/media IG).
  "effective_object_story_id", "source_instagram_media_id", "instagram_permalink_url",
].join(",");

interface ParsedCreative {
  type: "image" | "video" | "banner" | "carousel" | "dpa" | "unknown";
  headline: string | null;
  body: string | null;
  cta_type: string | null;
  link_url: string | null;
  // URL do asset principal (image_url do video, picture do link, etc).
  // Renomeado de thumbnail_url em v2: o INSERT mapeia directo para crm.meta_creatives.file_url.
  file_url: string | null;
  video_id: string | null;
  image_hash: string | null; // preparado para v2 image_hash batch resolution
  // Anúncios Instagram (object_story_spec só com page_id/instagram_user_id): o
  // asset não está no spec → referências ao post/media IG para resolver o poster
  // pós-parser quando o topo não tem video_id/image_hash/image_url.
  ig_object_story_id?: string | null;
  ig_media_id?: string | null;
}

// Parser do object_story_spec. v2 cobre 5 shapes em ordem de especificidade:
// 1) carousel (link_data.child_attachments OU template_data.child_attachments)
// 2) dpa (asset_feed_spec + product_set_id)
// 3) video_data
// 4) link_data (sem child_attachments)
// 5) image_data
// Fallback "unknown" cai aqui só se nenhum match — top-level thumbnail/image_url
// como último recurso. Ordem importa: carousels têm link_data embutido, queremos
// detectar tipo "rico" antes do banner simples.
function parseCreativeFields(creative: any): ParsedCreative {
  const spec = creative?.object_story_spec ?? {};

  // 1. Carousel — child_attachments em link_data ou template_data
  const childAttachments = spec.link_data?.child_attachments ?? spec.template_data?.child_attachments;
  if (Array.isArray(childAttachments) && childAttachments.length > 0) {
    const first = childAttachments[0] ?? {};
    return {
      type: "carousel",
      headline: first.name ?? null,
      body: first.description ?? null,
      cta_type: first.call_to_action?.type ?? spec.link_data?.call_to_action?.type ?? null,
      link_url: first.link ?? spec.link_data?.link ?? null,
      file_url: first.image_url ?? first.picture ?? null,
      video_id: null,
      image_hash: first.image_hash ?? null,
    };
  }

  // 2. DPA — asset_feed_spec + product_set_id (top-level ou template_data)
  const productSetId = creative?.product_set_id ?? spec.template_data?.product_set_id;
  if (creative?.asset_feed_spec && productSetId) {
    const afs = creative.asset_feed_spec;
    return {
      type: "dpa",
      headline: afs.titles?.[0]?.text ?? null,
      body: afs.bodies?.[0]?.text ?? null,
      cta_type: afs.call_to_action_types?.[0] ?? null,
      link_url: afs.link_urls?.[0]?.website_url ?? null,
      file_url: afs.images?.[0]?.url ?? null,
      video_id: null,
      image_hash: afs.images?.[0]?.hash ?? null,
    };
  }

  // 3. Video
  if (spec.video_data) {
    return {
      type: "video",
      headline: spec.video_data.title ?? null,
      body: spec.video_data.message ?? null,
      cta_type: spec.video_data.call_to_action?.type ?? null,
      link_url: spec.video_data.call_to_action?.value?.link ?? null,
      file_url: spec.video_data.image_url ?? creative.thumbnail_url ?? null,
      video_id: spec.video_data.video_id ?? creative.video_id ?? null,
      image_hash: null,
    };
  }

  // 4. Link (banner — sem child_attachments, já filtrados acima)
  if (spec.link_data) {
    return {
      type: "banner",
      headline: spec.link_data.name ?? null, // "name" no link_data é o headline
      body: spec.link_data.message ?? null,
      cta_type: spec.link_data.call_to_action?.type ?? null,
      link_url: spec.link_data.call_to_action?.value?.link ?? spec.link_data.link ?? null,
      file_url: spec.link_data.picture ?? null,
      video_id: null,
      image_hash: spec.link_data.image_hash ?? null,
    };
  }

  // 5. Image
  if (spec.image_data) {
    return {
      type: "image",
      headline: null, // image_data não tem headline próprio
      body: spec.image_data.message ?? null,
      cta_type: spec.image_data.call_to_action?.type ?? null,
      link_url: spec.image_data.call_to_action?.value?.link ?? null,
      file_url: null, // resolvido via image_hash batch (post-parser)
      video_id: null,
      image_hash: spec.image_data.image_hash ?? null,
    };
  }

  // 6a. Advantage+ / Instagram com asset_feed_spec mas SEM product_set_id —
  // criativo dinâmico fora de catálogo (DPA). Tem asset_feed_spec, por isso o
  // caso 6 (Instagram-native) rejeitava-o; e não tem product_set_id, por isso o
  // caso 2 (DPA) também não o apanha. Aqui extraímos defensivamente o asset.
  if (creative?.asset_feed_spec && !productSetId) {
    const afs = creative.asset_feed_spec;
    const videoId = afs.videos?.[0]?.video_id ?? creative.video_id ?? null;
    const imageHash = afs.images?.[0]?.hash ?? creative.image_hash ?? null;
    const fileUrl =
      afs.images?.[0]?.url ??
      afs.videos?.[0]?.thumbnail_url ??
      creative.image_url ??
      creative.thumbnail_url ??
      null;
    const afsType: ParsedCreative["type"] =
      videoId ? "video" : (imageHash || fileUrl) ? "image" : "unknown";
    return {
      type: afsType,
      headline: afs.titles?.[0]?.text ?? creative.title ?? null,
      body: afs.bodies?.[0]?.text ?? creative.body ?? null,
      cta_type: afs.call_to_action_types?.[0] ?? creative.call_to_action_type ?? null,
      link_url: afs.link_urls?.[0]?.website_url ?? creative.instagram_permalink_url ?? null,
      file_url: fileUrl,
      video_id: videoId,
      image_hash: imageHash,
      ig_object_story_id: creative?.effective_object_story_id ?? null,
      ig_media_id: creative?.source_instagram_media_id ?? null,
    };
  }

  // 6. Instagram-native — object_story_spec só com identidade (page_id /
  // instagram_user_id / instagram_actor_id) e SEM media inline (video_data/
  // image_data/link_data/template_data já filtrados acima). O asset visual vive
  // no NÍVEL DE TOPO do creative (video_id / image_hash / image_url / thumbnail_url)
  // e/ou nas referências ao post/media IG (effective_object_story_id /
  // source_instagram_media_id) — resolvidas pós-parser com as funções existentes
  // (resolveVideoThumbnail / resolveImageHashes) + resolveStoryMediaUrl.
  const hasIdentity =
    spec.page_id != null || spec.instagram_user_id != null || spec.instagram_actor_id != null;
  if (hasIdentity) {
    const topVideoId = creative?.video_id ?? null;
    const topImageHash = creative?.image_hash ?? null;
    const topFileUrl = creative?.image_url ?? creative?.thumbnail_url ?? null;
    // type: vídeo se houver video_id; imagem se houver hash/url; senão fica por
    // determinar (resolução por post IG ajusta para "image" se trouxer poster).
    const igType: ParsedCreative["type"] =
      topVideoId ? "video" : (topImageHash || topFileUrl) ? "image" : "unknown";
    return {
      type: igType,
      headline: creative?.title ?? null,
      body: creative?.body ?? null,
      cta_type: creative?.call_to_action_type ?? null,
      link_url: creative?.instagram_permalink_url ?? null,
      file_url: topFileUrl,
      video_id: topVideoId,
      image_hash: topImageHash,
      ig_object_story_id: creative?.effective_object_story_id ?? null,
      ig_media_id: creative?.source_instagram_media_id ?? null,
    };
  }

  // Fallback — shape sem object_story_spec ou shape exótico
  console.warn(
    `[meta-sync-creatives] Unknown shape for creative ${creative?.id}. ` +
    `Has object_story_spec: ${!!creative?.object_story_spec}. ` +
    `Keys: ${creative?.object_story_spec ? Object.keys(creative.object_story_spec).join(",") : "none"}. ` +
    `top_keys: ${Object.keys(creative ?? {}).join(",")}. ` +
    `has_asset_feed_spec: ${!!creative?.asset_feed_spec}. ` +
    `afs_keys: ${creative?.asset_feed_spec ? Object.keys(creative.asset_feed_spec).join(",") : "none"}. ` +
    `has_product_set_id: ${!!productSetId}. ` +
    `has_effective_object_story_id: ${!!creative?.effective_object_story_id}. ` +
    `v2 cobre carousel/dpa/video/banner/image/ig-native/afs-no-dpa. Shape exótico fica em fallback.`,
  );
  return {
    type: creative?.video_id ? "video" : "unknown",
    headline: creative?.title ?? null,
    body: creative?.body ?? null,
    cta_type: creative?.call_to_action_type ?? null,
    link_url: null,
    file_url: creative?.thumbnail_url ?? creative?.image_url ?? null,
    video_id: creative?.video_id ?? null,
    image_hash: creative?.image_hash ?? null,
  };
}

// Batch fetch Graph API: até 50 ids por request via ?ids=cid1,cid2,...
// Em caso de erro num batch, regista warning e continua (não aborta tudo).
async function batchFetchCreatives(ids: string[], accessToken: string): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/`);
    url.searchParams.set("ids", slice.join(","));
    url.searchParams.set("fields", CREATIVE_FIELDS);
    url.searchParams.set("access_token", accessToken);
    try {
      const r = await fetch(url.toString());
      const j = await r.json();
      if (!r.ok || j.error) {
        console.warn(`[meta-sync-creatives] batch ${i / CHUNK + 1} fetch error:`, j.error?.message ?? r.status);
        continue;
      }
      // Graph retorna { "cid1": {...}, "cid2": {...}, ... }. Um criativo individual
      // pode vir com { error: {...} } (asset sem permissão, vídeo ainda em
      // processamento, etc.) — antes era descartado em SILÊNCIO e o criativo ficava
      // eternamente "missing". Agora regista-se o erro para diagnóstico.
      for (const [cid, data] of Object.entries(j)) {
        if (typeof data === "object" && data && !(data as any).error) {
          out.set(cid, data);
        } else if ((data as any)?.error) {
          const err = (data as any).error;
          console.warn(
            `[meta-sync-creatives] graph_creative_error cid=${cid}`,
            { message: err?.message ?? null, code: err?.code ?? null, subcode: err?.error_subcode ?? null },
          );
        }
      }
    } catch (e) {
      console.warn(`[meta-sync-creatives] batch ${i / CHUNK + 1} threw:`, (e as Error).message);
    }
  }
  return out;
}

// v2: resolve thumbnail URL de um video_id via Graph API. Fallback quando o
// branch video_data não capturou file_url directamente. Retry 1x em 429/500,
// retorna null em falha (não bloqueia o sync).
async function resolveVideoThumbnail(videoId: string, accessToken: string): Promise<string | null> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${videoId}`);
  url.searchParams.set("fields", "picture,thumbnails");
  url.searchParams.set("access_token", accessToken);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url.toString());
      if (r.status === 429 || r.status >= 500) {
        if (attempt === 0) continue;
        console.warn(`[meta-sync-creatives][v2] resolveVideoThumbnail ${videoId} status=${r.status} after retry`);
        return null;
      }
      const j = await r.json();
      if (!r.ok || j.error) {
        console.warn(`[meta-sync-creatives][v2] resolveVideoThumbnail ${videoId} err:`, j.error?.message ?? r.status);
        return null;
      }
      return j.picture ?? j.thumbnails?.data?.[0]?.uri ?? null;
    } catch (e) {
      if (attempt === 0) continue;
      console.warn(`[meta-sync-creatives][v2] resolveVideoThumbnail ${videoId} threw:`, (e as Error).message);
      return null;
    }
  }
  return null;
}

// IG-native: resolve o poster (imagem) de um anúncio Instagram a partir da
// referência ao post/media — effective_object_story_id (post de página
// "{page}_{post}") ou source_instagram_media_id. GET /{id}?fields=full_picture,
// picture devolve uma imagem servível (re-hospedável). Mesmo padrão de retry do
// resolveVideoThumbnail; null em falha (não bloqueia o sync).
async function resolveStoryMediaUrl(objectId: string, accessToken: string): Promise<string | null> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${objectId}`);
  url.searchParams.set("fields", "full_picture,picture");
  url.searchParams.set("access_token", accessToken);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url.toString());
      if (r.status === 429 || r.status >= 500) {
        if (attempt === 0) continue;
        console.warn(`[meta-sync-creatives][ig] resolveStoryMediaUrl ${objectId} status=${r.status} after retry`);
        return null;
      }
      const j = await r.json();
      if (!r.ok || j.error) {
        console.warn(`[meta-sync-creatives][ig] resolveStoryMediaUrl ${objectId} err:`, j.error?.message ?? r.status);
        return null;
      }
      return j.full_picture ?? j.picture ?? null;
    } catch (e) {
      if (attempt === 0) continue;
      console.warn(`[meta-sync-creatives][ig] resolveStoryMediaUrl ${objectId} threw:`, (e as Error).message);
      return null;
    }
  }
  return null;
}

// v2: batch resolve image_hash → URL via Graph API (chunks de 10).
// Endpoint /act_{id}/adimages?hashes=[...]. Retry 1x por chunk em 429/500.
// Retorna Map vazio se input vazio. Hashes sem match silenciosos (ausentes do map).
async function resolveImageHashes(adAccountId: string, hashes: string[], accessToken: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (hashes.length === 0) return out;
  const CHUNK = 10;
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const slice = hashes.slice(i, i + CHUNK);
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/adimages`);
    url.searchParams.set("hashes", JSON.stringify(slice));
    url.searchParams.set("fields", "hash,url,permalink_url");
    url.searchParams.set("access_token", accessToken);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(url.toString());
        if (r.status === 429 || r.status >= 500) {
          if (attempt === 0) continue;
          console.warn(`[meta-sync-creatives][v2] resolveImageHashes batch ${i / CHUNK + 1} status=${r.status} after retry`);
          break;
        }
        const j = await r.json();
        if (!r.ok || j.error) {
          console.warn(`[meta-sync-creatives][v2] resolveImageHashes batch ${i / CHUNK + 1} err:`, j.error?.message ?? r.status);
          break;
        }
        for (const item of (j.data ?? [])) {
          const resolved = item.url ?? item.permalink_url;
          if (item.hash && resolved) out.set(item.hash, resolved);
        }
        break;
      } catch (e) {
        if (attempt === 0) continue;
        console.warn(`[meta-sync-creatives][v2] resolveImageHashes batch ${i / CHUNK + 1} threw:`, (e as Error).message);
        break;
      }
    }
  }
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[crm-meta-sync-creatives] BUILD_VERSION=ig-native-v4 deployed", new Date().toISOString());
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  const isServiceRole = isServiceRoleJWT(authHeader);

  let body: {
    connection_id?: string;
    ad_account_id?: string;
    mode?: "incremental" | "full";
    max_creatives_per_run?: number;
    triggered_by?: string;
    force_resync?: boolean;
    // Event-aware sync: quando true (default), sincroniza criativos de TODAS as
    // campanhas EXCETO as ligadas a eventos JÁ OCORRIDOS (ver Step 0). Campanhas
    // sem evento ligado (linked_event_id IS NULL) são SEMPRE incluídas — os
    // criativos pertencem às campanhas, não aos eventos. Passar false = sync total.
    exclude_past_events?: boolean;
  };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const connectionId = body.connection_id;
  const rawAcct = body.ad_account_id;
  if (!connectionId || !rawAcct) return json({ error: "missing_params", required: ["connection_id", "ad_account_id"] }, 400);
  const adAccountId = normalizeAdAccountId(rawAcct);
  const mode: "incremental" | "full" = body?.mode === "full" ? "full" : "incremental";
  const maxRun = Math.min(Math.max(body?.max_creatives_per_run ?? 40, 1), 2000);
  const triggeredBy = body?.triggered_by ?? (isServiceRole ? "service_role" : "user");
  // Default true: o sync exclui criativos cujas campanhas são TODAS de eventos passados.
  const excludePastEvents = body?.exclude_past_events !== false;

  // v2: force_resync requer service_role JWT. Skipa set-diff E faz UPSERT real
  // (ignoreDuplicates=false), re-escrevendo rows existentes com parsers v2.
  // Bloqueia user JWT para evitar dispar accidental via UI.
  const forceResync = body?.force_resync === true;
  if (forceResync && !isServiceRole) {
    return json({
      error: "force_resync_requires_service_role",
      hint: "Call this endpoint via Supabase Edge Function invocation with service_role key, not user JWT.",
    }, 403);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Service-role client — necessário para escrever no storage (bucket próprio)
  // no re-host de criativos. Bypassa RLS; usado só para upload + getPublicUrl.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolver userId — null se service_role (cron); auth.uid() se user JWT.
  let userId: string | null = null;
  if (!isServiceRole) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch { userId = null; }
  }

  // Decrypt token + companyId via RPC (SECURITY DEFINER — funciona em ambos os modes).
  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    console.error("[meta-sync-creatives] decrypt failed:", tokenErr);
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken, company_id: companyId } = tokenRows[0] as {
    access_token: string; company_id: string;
  };

  console.log(`[meta-sync-creatives] start company=${companyId} acct=${adAccountId} mode=${mode} max=${maxRun} triggered_by=${triggeredBy} force_resync=${forceResync} exclude_past_events=${excludePastEvents}`);
  if (forceResync) {
    console.log("[meta-sync-creatives][v2] force_resync_mode", { enabled: true });
  }

  // ── 0) Event-aware scoping: EXCLUIR eventos JÁ OCORRIDOS ───────────────
  // Os criativos pertencem às CAMPANHAS (criativo→anúncio→campanha); a ligação
  // campanha→evento (linked_event_id) é conceitual. Por isso sincronizamos TODAS
  // as campanhas EXCETO as ligadas a eventos passados.
  //
  // "Evento já ocorrido" = status='completed' OU a sua ÚLTIMA data efetiva passou.
  // Última data efetiva (events.date do PAI não é fiável — fica com a data de
  // criação): se o evento TEM filhos (parent_event_id a apontar para ele) usa
  // MAX(date dos filhos); senão usa o próprio date. (event_type: simple / multi_day
  // / festival; pais multi_day/festival agrupam filhos com a data real de cada
  // cidade/dia.)
  //
  // Resultado: pastCampaignSet = campanhas ligadas a eventos passados. No Step A,
  // um criativo é incluído se aparecer em PELO MENOS UMA campanha NÃO passada
  // (campanha sem evento conta como não-passada). Só fica de fora o criativo cujas
  // campanhas são TODAS de eventos passados.
  const pastCampaignSet = new Set<string>();
  let pastEventCount = 0;
  let companyCampaignCount = 0;
  if (excludePastEvents) {
    const { data: allCamps, error: campErr } = await (supabase as any)
      .schema("crm")
      .from("meta_campaign_snapshot")
      .select("external_campaign_id, linked_event_id")
      .eq("company_id", companyId);
    if (campErr) {
      console.error("[meta-sync-creatives] campaigns query error:", campErr);
      return json({ error: "campaigns_query_failed", detail: campErr.message }, 500);
    }
    companyCampaignCount = (allCamps ?? []).length;
    const linkedEventIds = Array.from(new Set(
      (allCamps ?? []).map((c: any) => c.linked_event_id).filter(Boolean),
    )) as string[];

    const pastEventIds = new Set<string>();
    if (linkedEventIds.length > 0) {
      const todayIso = new Date().toISOString().slice(0, 10);
      // Eventos ligados (a sua data/status) + filhos (para MAX(date) da hierarquia).
      const [{ data: linkedEvents, error: leErr }, { data: childEvents, error: ceErr }] = await Promise.all([
        supabase.from("events").select("id, date, status, parent_event_id").in("id", linkedEventIds),
        supabase.from("events").select("parent_event_id, date").in("parent_event_id", linkedEventIds),
      ]);
      if (leErr || ceErr) {
        console.error("[meta-sync-creatives] events query error:", leErr ?? ceErr);
        return json({ error: "events_query_failed", detail: (leErr ?? ceErr)?.message }, 500);
      }
      // MAX(date) dos filhos por evento-pai.
      const childMaxDate = new Map<string, string>();
      for (const c of (childEvents ?? [])) {
        const p = c.parent_event_id as string | null;
        const d = c.date as string | null;
        if (!p || !d) continue;
        const cur = childMaxDate.get(p);
        if (!cur || d > cur) childMaxDate.set(p, d);
      }
      for (const e of (linkedEvents ?? [])) {
        const effectiveDate = childMaxDate.get(e.id) ?? (e.date as string | null);
        // Passado = completed OU última data efetiva < hoje. Sem data e não
        // completed → indeterminado → NÃO passado (conservador: inclui).
        const isPast = e.status === "completed" || (effectiveDate != null && effectiveDate < todayIso);
        if (isPast) pastEventIds.add(e.id);
      }
      pastEventCount = pastEventIds.size;
    }
    for (const c of (allCamps ?? [])) {
      if (c.linked_event_id && pastEventIds.has(c.linked_event_id)) {
        pastCampaignSet.add(String(c.external_campaign_id));
      }
    }
    console.log(`[meta-sync-creatives] event_scope company_campaigns=${companyCampaignCount} past_events=${pastEventCount} past_campaigns=${pastCampaignSet.size}`);
  }

  // ── 1) Identificar creative IDs a sincronizar ─────────────────────────
  // Step A: distinct meta_creative_id em meta_ad_snapshot. Varrimento paginado
  // (range de 1000) para não cair no cap default de linhas; exclui em memória os
  // ads cujas campanhas estão em pastCampaignSet. Um criativo entra se tiver pelo
  // menos um ad numa campanha NÃO passada.
  const includedCreativeIds = new Set<string>();
  let excludedAdRows = 0;
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: snapRows, error: snapErr } = await (supabase as any)
        .schema("crm")
        .from("meta_ad_snapshot")
        .select("external_ad_id, meta_creative_id, external_campaign_id")
        .eq("company_id", companyId)
        .eq("connection_id", connectionId)
        .eq("ad_account_id", adAccountId)
        .not("meta_creative_id", "is", null)
        .order("external_ad_id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (snapErr) {
        console.error("[meta-sync-creatives] snapshot query error:", snapErr);
        return json({ error: "snapshot_query_failed", detail: snapErr.message }, 500);
      }
      const batch = snapRows ?? [];
      for (const r of batch) {
        if (excludePastEvents && r.external_campaign_id && pastCampaignSet.has(String(r.external_campaign_id))) {
          excludedAdRows++;
          continue;
        }
        if (r.meta_creative_id) includedCreativeIds.add(r.meta_creative_id as string);
      }
      if (batch.length < PAGE) break;
      from += PAGE;
    }
  }
  const allSnapIds: string[] = Array.from(includedCreativeIds);
  if (excludePastEvents) {
    console.log(`[meta-sync-creatives] step_a included_creatives=${allSnapIds.length} excluded_ad_rows=${excludedAdRows}`);
  }

  // Step B: existentes em meta_creatives para esta company.
  // v2: force_resync skipa o set-diff (processa TODOS os IDs do snapshot).
  let existingIds = new Set<string>();
  if (mode === "incremental" && !forceResync && allSnapIds.length > 0) {
    // Leitura paginada de TODOS os meta_creative_id desta company; filtramos em memória
    // contra o snapshot. Evita .in() gigante que rebenta limites do PostgREST e devolve vazio.
    const snapSet = new Set(allSnapIds);
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: existing, error: exErr } = await (supabase as any)
        .schema("crm")
        .from("meta_creatives")
        .select("meta_creative_id")
        .eq("company_id", companyId)
        .order("meta_creative_id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (exErr) {
        console.error("[meta-sync-creatives] step_b existing query failed:", exErr);
        return json({ error: "existing_query_failed", detail: exErr.message }, 500);
      }
      const batch = existing ?? [];
      for (const r of batch) {
        const id = r.meta_creative_id as string | null;
        if (id && snapSet.has(id)) existingIds.add(id);
      }
      if (batch.length < PAGE) break;
      from += PAGE;
    }
  }
  // mode='full' force re-sync de tudo (mas com onConflict do nothing, existing rows não mudam).
  // force_resync='true' faz UPSERT real (ignoreDuplicates=false na fase 4).

  const missingIds = allSnapIds.filter((id) => !existingIds.has(id));
  const idsToFetch = missingIds.slice(0, maxRun);
  const remainingToSync = Math.max(0, missingIds.length - idsToFetch.length);

  console.log(`[meta-sync-creatives] snap_distinct=${allSnapIds.length} existing=${existingIds.size} missing=${missingIds.length} fetching=${idsToFetch.length} remaining=${remainingToSync}`);

  if (idsToFetch.length === 0) {
    // Nada a fazer; actualiza state e retorna.
    const nowIso = new Date().toISOString();
    await (supabase as any).schema("crm").from("meta_sync_state").upsert({
      company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId, level: "creatives",
      last_sync_at: nowIso, last_synced_rows_count: 0,
      last_error: null, last_error_at: null,
      ...(mode === "full" ? { last_full_sync_at: nowIso } : {}),
    }, { onConflict: "company_id,connection_id,ad_account_id,level" });
    return json({
      synced_count: 0, skipped_count: 0, ad_account_id: adAccountId, mode,
      remaining_to_sync: remainingToSync, triggered_by: triggeredBy,
      exclude_past_events: excludePastEvents,
      past_event_count: pastEventCount,
      past_campaign_count: pastCampaignSet.size,
    });
  }

  // ── 2) Batch fetch Graph API ──────────────────────────────────────────
  const fetched = await batchFetchCreatives(idsToFetch, accessToken);
  console.log(`[meta-sync-creatives] fetched ${fetched.size}/${idsToFetch.length} from Graph`);

  // ── 3) Parse + construct rows (+ v2 stats tracking) ──────────────────
  const nowIso = new Date().toISOString();
  const rows: any[] = [];
  let skipped = 0;

  // v2: stats tracking incrementado ao longo da pipeline.
  const stats = {
    total_processed: 0,
    by_type: { video: 0, carousel: 0, dpa: 0, link: 0, image: 0, unknown: 0 },
    file_url_resolved_direct: 0,
    file_url_resolved_via_video_thumbnail: 0,
    file_url_resolved_via_hash: 0,
    file_url_resolved_via_ig_story: 0,
    file_url_still_null: 0,
    rehosted: 0,
    rehost_skipped: 0,
    rehost_failed: 0,
    meta_api_calls: { video_thumbnail_count: 0, adimages_batch_count: 0, ig_story_count: 0 },
    errors: [] as { meta_creative_id: string; error_msg: string }[],
  };

  const notFetchedIds: string[] = []; // cids pedidos mas que a Graph não devolveu
  for (const cid of idsToFetch) {
    const creative = fetched.get(cid);
    if (!creative) {
      // Não veio da Graph (erro de asset individual — ver graph_creative_error —
      // ou ausente da resposta). NÃO é inserido → fica "missing" e é re-tentado em
      // cada run. Registamos os ids para diagnóstico inequívoco.
      skipped++;
      if (notFetchedIds.length < 50) notFetchedIds.push(cid);
      continue;
    }
    const parsed = parseCreativeFields(creative);

    stats.total_processed++;
    // Map type → by_type key ("banner" do parser → "link" no stats).
    const typeKey = parsed.type === "banner" ? "link" : parsed.type;
    if (typeKey in stats.by_type) (stats.by_type as any)[typeKey]++;

    if (parsed.file_url !== null) stats.file_url_resolved_direct++;

    // v2: video thumbnail fallback — gating: só chama API se parser não capturou.
    // Defesa em depth para vídeos onde Meta não retorna image_url/thumbnail_url no spec.
    if (parsed.type === "video" && parsed.file_url === null && parsed.video_id) {
      stats.meta_api_calls.video_thumbnail_count++;
      try {
        const resolved = await resolveVideoThumbnail(parsed.video_id, accessToken);
        if (resolved) {
          parsed.file_url = resolved;
          stats.file_url_resolved_via_video_thumbnail++;
        }
      } catch (e) {
        if (stats.errors.length < 10) {
          stats.errors.push({ meta_creative_id: cid, error_msg: `video_thumbnail: ${(e as Error).message}` });
        }
      }
    }

    // IG-native fallback: se ainda sem file_url E o topo não tinha video_id/hash,
    // resolve o poster a partir do post/media IG (effective_object_story_id ou
    // source_instagram_media_id). Só corre quando há referência — gating à mesma
    // semântica do video thumbnail (uma chamada Graph só quando necessário).
    const igRef = parsed.ig_object_story_id ?? parsed.ig_media_id ?? null;
    if (parsed.file_url === null && igRef) {
      stats.meta_api_calls.ig_story_count++;
      try {
        const resolved = await resolveStoryMediaUrl(igRef, accessToken);
        if (resolved) {
          parsed.file_url = resolved;
          stats.file_url_resolved_via_ig_story++;
          // O poster é uma imagem — se o tipo tinha ficado indeterminado, fixa-o.
          if (parsed.type === "unknown") parsed.type = "image";
        }
      } catch (e) {
        if (stats.errors.length < 10) {
          stats.errors.push({ meta_creative_id: cid, error_msg: `ig_story: ${(e as Error).message}` });
        }
      }
    }

    rows.push({
      company_id: companyId,
      meta_creative_id: cid,
      name: creative.name ?? `[Meta] ${cid}`,
      type: parsed.type,
      headline: parsed.headline,
      body: parsed.body,
      cta_type: parsed.cta_type,
      link_url: parsed.link_url,
      meta_image_hash: parsed.image_hash,
      // v2: file_url vem do parser (video_data.image_url, link_data.picture, carousel child, dpa images[0], etc).
      // Para image_data e qualquer outro com hash mas sem file_url, batch resolve abaixo.
      // storage_bucket é NOT NULL na DB (default 'crm-meta-creatives'). Garantimos
      // sempre um valor já aqui para nenhum caminho (incluindo rehost falhado) chegar
      // ao UPSERT com null e disparar 23502 a abortar o chunk inteiro.
      storage_bucket: REHOST_BUCKET,
      storage_path: null,
      file_url: parsed.file_url ?? null,
      file_mime_type: null,
      file_size_bytes: null,
      width: null,
      height: null,
      duration_seconds: null,
      created_by: userId, // null se cron service_role; UUID se user JWT
      created_at: nowIso,
      updated_at: nowIso,
    });
  }
  if (notFetchedIds.length > 0) {
    console.warn(
      `[meta-sync-creatives] graph_not_fetched count=${notFetchedIds.length}`,
      { meta_creative_ids: notFetchedIds },
    );
  }

  // ── 3b) v2: batch resolve image_hash → URL para rows ainda sem file_url ──
  // Só chama API para hashes onde file_url ficou null depois dos passos 1-5
  // (evita chamadas desnecessárias para criativos já resolvidos directamente).
  const rowsNeedingHash = rows.filter((r) => r.file_url === null && r.meta_image_hash);
  const hashesToResolve = Array.from(new Set(rowsNeedingHash.map((r) => r.meta_image_hash as string)));
  if (hashesToResolve.length > 0) {
    stats.meta_api_calls.adimages_batch_count = Math.ceil(hashesToResolve.length / 10);
    try {
      const resolvedMap = await resolveImageHashes(adAccountId, hashesToResolve, accessToken);
      for (const row of rowsNeedingHash) {
        const resolved = resolvedMap.get(row.meta_image_hash);
        if (resolved) {
          row.file_url = resolved;
          stats.file_url_resolved_via_hash++;
        }
      }
    } catch (e) {
      if (stats.errors.length < 10) {
        stats.errors.push({ meta_creative_id: "<batch>", error_msg: `image_hash_batch: ${(e as Error).message}` });
      }
    }
  }

  // ── 3c) Re-host: descarrega o file_url da Meta e re-upload para o bucket
  // próprio, persistindo um URL estável (ver _shared/rehost-creative.ts). Corre
  // só sobre as rows desta run (criativos novos do set-diff) — não toca no que
  // já está em meta_creatives. Erros isolados: falha de um não aborta a run.
  // Para type=video o file_url é o poster (imagem); o vídeo fica na Meta.
  for (const row of rows) {
    // ISOLAMENTO POR ASSET: rehostCreative não deve lançar, mas se lançar (ex.
    // poster de vídeo problemático) NÃO pode abortar a run — antes este loop não
    // tinha try/catch e o UPSERT só ocorre depois dele, por isso UM asset a
    // lançar deixava o lote inteiro (e estes criativos) eternamente por sincronizar.
    let res: Awaited<ReturnType<typeof rehostCreative>>;
    try {
      res = await rehostCreative(
        adminClient,
        { company_id: companyId, path_key: row.meta_creative_id, type: row.type, file_url: row.file_url },
        { supabaseUrl: SUPABASE_URL },
      );
    } catch (e) {
      res = { status: "failed", reason: `rehost_threw: ${(e as Error).message}` };
    }
    if (res.status === "rehosted") {
      row.file_url = res.file_url!;
      row.storage_bucket = REHOST_BUCKET;
      row.storage_path = res.storage_path!;
      if (row.type !== "video" && res.mime) row.file_mime_type = res.mime;
      stats.rehosted++;
    } else if (res.status === "failed") {
      stats.rehost_failed++;
      if (stats.errors.length < 10) {
        stats.errors.push({ meta_creative_id: row.meta_creative_id, error_msg: `rehost: ${res.reason}` });
      }
      // Diagnóstico do asset: type + url + razão ajudam a distinguir acesso
      // (download_http_403/login HTML) de formato (not_an_image: video/mp4) de
      // leitura (download_body_threw). O criativo É inserido na mesma (com o url
      // original da Meta) — a falha de re-host não impede a sincronização.
      console.warn("[meta-sync-creatives] rehost_failed", {
        meta_creative_id: row.meta_creative_id,
        type: row.type,
        file_url: row.file_url,
        reason: res.reason,
      });
    } else {
      stats.rehost_skipped++;
    }
  }

  // Contagem final de rows que continuam sem file_url (irreparáveis nesta sync).
  stats.file_url_still_null = rows.filter((r) => r.file_url === null).length;

  // ── 4) UPSERT em chunks ──────────────────────────────────────────────
  // v2: ignoreDuplicates=!forceResync. Default (force_resync=false) preserva
  // rows existentes (uploads UI manuais, runs anteriores). force_resync=true
  // re-escreve rows existentes com parsers v2 (recoveryde 805 órfãos).
  let insertedCount = 0;
  if (rows.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const idx = Math.floor(i / CHUNK) + 1;
      const chunks = Math.ceil(rows.length / CHUNK);
      const { data: inserted, error: upErr } = await (supabase as any)
        .schema("crm")
        .from("meta_creatives")
        .upsert(slice, { onConflict: "company_id,meta_creative_id", ignoreDuplicates: !forceResync })
        .select("id");
      if (upErr) {
        console.error(`[meta-sync-creatives] upsert chunk ${idx}/${chunks} failed:`, upErr);
        await (supabase as any).schema("crm").from("meta_sync_state").upsert({
          company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId, level: "creatives",
          last_error: upErr.message, last_error_at: new Date().toISOString(),
        }, { onConflict: "company_id,connection_id,ad_account_id,level" });
        return json({ error: "persist_failed", detail: upErr.message, chunk: idx, total_chunks: chunks }, 500);
      }
      insertedCount += (inserted?.length ?? 0);
      console.log(`[meta-sync-creatives] chunk ${idx}/${chunks}: ${slice.length} processed, ${inserted?.length ?? 0} inserted`);
    }
  }

  // ── 5) Update meta_sync_state ─────────────────────────────────────────
  const completedAt = new Date().toISOString();
  const stateUpd: Record<string, unknown> = {
    company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId, level: "creatives",
    last_sync_at: completedAt, last_synced_rows_count: insertedCount,
    last_error: null, last_error_at: null,
  };
  if (mode === "full") stateUpd.last_full_sync_at = completedAt;
  await (supabase as any).schema("crm").from("meta_sync_state").upsert(stateUpd, {
    onConflict: "company_id,connection_id,ad_account_id,level",
  });

  console.log(`[meta-sync-creatives] done: inserted=${insertedCount} skipped=${skipped} remaining=${remainingToSync}`);
  console.log("[meta-sync-creatives][v2] parse_stats", {
    ...stats,
    mode: forceResync ? "force_resync" : mode,
  });

  return json({
    synced_count: insertedCount,
    skipped_count: skipped,
    ad_account_id: adAccountId,
    mode,
    force_resync: forceResync,
    exclude_past_events: excludePastEvents,
    past_event_count: pastEventCount,
    past_campaign_count: pastCampaignSet.size,
    remaining_to_sync: remainingToSync,
    triggered_by: triggeredBy,
    backlog_snapshot: { snap_distinct: allSnapIds.length, existing: existingIds.size, missing: missingIds.length, fetched: idsToFetch.length },
    parse_stats: stats,
  });
});
