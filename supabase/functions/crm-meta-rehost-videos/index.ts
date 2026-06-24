// crm-meta-rehost-videos
// Job direcionado: para os criativos de vídeo da Meta cujos bytes do MP4
// ainda vivem na Meta (file_url é o poster, não o ficheiro), resolve o
// video_id via Graph API, baixa o source MP4 e re-hospeda no bucket próprio
// 'crm-meta-creatives'. Atualiza o MESMO registo em crm.meta_creatives.
//
// Reusa o padrão de auth/token do crm-meta-sync-creatives (RPC
// crm_get_meta_decrypted_token + ad_platform_connections) e o bucket do
// _shared/rehost-creative.ts. Não reutiliza rehostCreative() porque esse
// rejeita não-imagem — aqui o upload é MP4 byte-a-byte, inline.
//
// Input: { company_id: string, creative_ids?: string[] }
// Output: { ok: [...], falhou: [{id, name, motivo}] }

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { REHOST_BUCKET } from "../_shared/rehost-creative.ts";

const BUILD_VERSION = "rehost-videos-v1 2026-06-24";
const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function gget(url: URL): Promise<any> {
  const r = await fetch(url.toString());
  return await r.json();
}

// Resolve video_id a partir de object_story_spec OU asset_feed_spec.
async function resolveVideoId(metaCreativeId: string, token: string): Promise<string | null> {
  const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${metaCreativeId}`);
  u.searchParams.set("fields", "object_story_spec,asset_feed_spec");
  u.searchParams.set("access_token", token);
  const j = await gget(u);
  if (j?.error) {
    console.warn(`[rehost-videos] creative_lookup_err cid=${metaCreativeId}:`, j.error?.message);
    return null;
  }
  const vidFromOss = j?.object_story_spec?.video_data?.video_id ?? null;
  if (vidFromOss) return String(vidFromOss);
  const vidFromAfs = j?.asset_feed_spec?.videos?.[0]?.video_id ?? null;
  if (vidFromAfs) return String(vidFromAfs);
  return null;
}

interface VideoMeta { source: string | null; width: number | null; height: number | null; }
async function resolveVideoSource(videoId: string, token: string): Promise<VideoMeta> {
  const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${videoId}`);
  // width/height não existem em /video — só /source. Pedimos só source.
  u.searchParams.set("fields", "source");
  u.searchParams.set("access_token", token);
  const j = await gget(u);
  if (j?.error) {
    console.warn(`[rehost-videos] video_lookup_err vid=${videoId}:`, j.error?.message);
    return { source: null, width: null, height: null };
  }
  return {
    source: j?.source ?? null,
    width: typeof j?.width === "number" ? j.width : null,
    height: typeof j?.height === "number" ? j.height : null,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  console.log(`[crm-meta-rehost-videos] BUILD_VERSION=${BUILD_VERSION} ${new Date().toISOString()}`);

  let body: { company_id?: string; creative_ids?: string[] } = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }

  const companyId = body.company_id;
  if (!companyId) return json({ error: "missing_company_id" }, 400);
  const explicitIds = Array.isArray(body.creative_ids) ? body.creative_ids.filter(Boolean) : [];

  const sb = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sbCrm = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "crm" as never },
  });

  // 1) Conexão Meta activa da empresa
  const { data: conn, error: connErr } = await sbCrm
    .from("ad_platform_connections")
    .select("id")
    .eq("company_id", companyId).eq("platform", "meta").eq("status", "active")
    .maybeSingle();
  if (connErr || !conn?.id) {
    return json({ error: "connection_not_found", detail: connErr?.message }, 404);
  }

  // 2) Token desencriptado via RPC SECURITY DEFINER
  const { data: tokRows, error: tokErr } = await sb.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: conn.id, p_master_key: KEY,
  });
  if (tokErr || !Array.isArray(tokRows) || tokRows.length === 0) {
    return json({ error: "token_decrypt_failed", detail: tokErr?.message }, 403);
  }
  const token = (tokRows[0] as { access_token: string }).access_token;

  // 3) Seleccionar alvos
  let query = (sbCrm as any)
    .from("meta_creatives")
    .select("id, meta_creative_id, name, file_url, type, link_url")
    .eq("company_id", companyId);

  if (explicitIds.length > 0) {
    query = query.in("id", explicitIds);
  } else {
    query = query
      .ilike("link_url", "%ivete-clareou%")
      .eq("type", "video")
      .not("name", "ilike", "%product.name%")
      .not("meta_creative_id", "is", null)
      .not("file_url", "ilike", "%.mp4%");
  }

  const { data: targets, error: qErr } = await query;
  if (qErr) return json({ error: "query_failed", detail: qErr.message }, 500);

  console.log(`[crm-meta-rehost-videos] company=${companyId} targets=${targets?.length ?? 0}`);

  const ok: { id: string; name: string; file_url: string; width: number | null; height: number | null }[] = [];
  const falhou: { id: string; name: string; motivo: string }[] = [];

  for (const r of targets ?? []) {
    const id = r.id as string;
    const name = (r.name as string) ?? "";
    const metaCid = r.meta_creative_id as string | null;
    if (!metaCid) { falhou.push({ id, name, motivo: "no_meta_creative_id" }); continue; }

    try {
      const videoId = await resolveVideoId(metaCid, token);
      if (!videoId) { falhou.push({ id, name, motivo: "video_id_unresolved" }); continue; }

      const meta = await resolveVideoSource(videoId, token);
      if (!meta.source) { falhou.push({ id, name, motivo: "no_source_url" }); continue; }

      const resp = await fetch(meta.source);
      if (!resp.ok) { falhou.push({ id, name, motivo: `download_http_${resp.status}` }); continue; }
      const ct = (resp.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const bytes = new Uint8Array(await resp.arrayBuffer());
      if (bytes.byteLength === 0) { falhou.push({ id, name, motivo: "empty_body" }); continue; }
      // Tolerante: alguns CDNs devolvem application/octet-stream para mp4
      const mime = ct.startsWith("video/") ? ct : "video/mp4";

      const path = `${companyId}/${metaCid}.mp4`;
      const { error: upErr } = await sb.storage.from(REHOST_BUCKET)
        .upload(path, bytes, { contentType: mime, upsert: true });
      if (upErr) { falhou.push({ id, name, motivo: `upload: ${upErr.message}` }); continue; }

      const { data: pub } = sb.storage.from(REHOST_BUCKET).getPublicUrl(path);
      const newUrl = pub.publicUrl;

      const upd: Record<string, unknown> = {
        file_url: newUrl,
        file_mime_type: "video/mp4",
        storage_bucket: REHOST_BUCKET,
        storage_path: path,
        updated_at: new Date().toISOString(),
      };
      if (meta.width != null) upd.width = meta.width;
      if (meta.height != null) upd.height = meta.height;

      const { error: uErr } = await (sbCrm as any)
        .from("meta_creatives").update(upd).eq("id", id);
      if (uErr) { falhou.push({ id, name, motivo: `db_update: ${uErr.message}` }); continue; }

      ok.push({ id, name, file_url: newUrl, width: meta.width, height: meta.height });
      console.log(`[crm-meta-rehost-videos] ok cid=${metaCid} bytes=${bytes.byteLength}`);
    } catch (e) {
      falhou.push({ id, name, motivo: `threw: ${(e as Error).message}` });
    }
  }

  return json({
    build_version: BUILD_VERSION,
    company_id: companyId,
    total_targets: targets?.length ?? 0,
    ok,
    falhou,
  });
});
