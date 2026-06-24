// crm-meta-upload-creative
// Empurra um criativo guardado em crm.meta_creatives para a conta Meta:
//   IMAGEM → POST /act_{adacct}/adimages (bytes) → grava meta_image_hash
//   VÍDEO  → POST /act_{adacct}/advideos (file_url) → grava meta_video_id
// Idempotente: se já tem o id respetivo e force!=true, devolve o existente.
//
// Input: { company_id, creative_id, force? }
// Auth user JWT obrigatório.
//
// OBSERVABILIDADE (v2): erros de negócio devolvem HTTP 200 com { ok:false, error, detail, fb_error? }
// para que supabase.functions.invoke entregue o body ao front em vez de mascarar como erro de transporte.
// Auth real continua 401.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const BUILD_VERSION = "upload-creative-v2-observability 2026-06-24";
const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
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

// Erro de negócio: log + HTTP 200 com ok:false (para o body chegar ao front)
const bizErr = (payload: { error: string; detail?: unknown; fb_error?: unknown }) => {
  console.log("[upload-creative] FAIL", JSON.stringify(payload));
  return json({ ok: false, ...payload }, 200);
};

function normalizeAdAccountId(raw: string): string {
  const v = String(raw || "").trim();
  return v.startsWith("act_") ? v.slice(4) : v;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  console.log(`[crm-meta-upload-creative] BUILD_VERSION=${BUILD_VERSION}`);

  // Auth user JWT (mantém 401 real)
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ ok: false, error: "missing_authorization" }, 401);
  }
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, error: "auth_failed", detail: userErr?.message }, 401);

  let body: { company_id?: string; creative_id?: string; force?: boolean } = {};
  try { body = await req.json(); } catch {}
  const companyId = body.company_id;
  const creativeId = body.creative_id;
  const force = !!body.force;
  if (!companyId || !creativeId) return bizErr({ error: "missing_params" });

  const admin = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sbCrm = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "crm" as never },
  });

  // 1) Criativo
  const { data: cre, error: creErr } = await (sbCrm as any)
    .from("meta_creatives")
    .select("id, company_id, type, file_url, file_mime_type, storage_bucket, storage_path, meta_image_hash, meta_video_id")
    .eq("id", creativeId)
    .maybeSingle();
  if (creErr || !cre) return bizErr({ error: "creative_not_found", detail: creErr?.message });
  if (cre.company_id !== companyId) return bizErr({ error: "company_mismatch" });
  const type = String(cre.type ?? "").toLowerCase();
  if (type !== "image" && type !== "video") return bizErr({ error: "tipo_invalido", detail: type });

  // Idempotência
  if (!force) {
    if (type === "image" && cre.meta_image_hash) {
      return json({ ok: true, creative_id: creativeId, type, meta_image_hash: cre.meta_image_hash, skipped: "already_uploaded" });
    }
    if (type === "video" && cre.meta_video_id) {
      return json({ ok: true, creative_id: creativeId, type, meta_video_id: cre.meta_video_id, skipped: "already_uploaded" });
    }
  }

  // 2) Conexão Meta + ad_account
  const { data: conn, error: connErr } = await sbCrm
    .from("ad_platform_connections")
    .select("id")
    .eq("company_id", companyId).eq("platform", "meta").eq("status", "active")
    .maybeSingle();
  if (connErr || !conn?.id) return bizErr({ error: "connection_not_found", detail: connErr?.message });

  const { data: linkRows, error: linkErr } = await (sbCrm as any)
    .from("ad_platform_account_links")
    .select("connection_id, ad_account_id, is_primary, enabled")
    .eq("connection_id", conn.id)
    .eq("enabled", true)
    .order("is_primary", { ascending: false });
  if (linkErr) return bizErr({ error: "ad_account_query_failed", detail: linkErr.message });
  const linkRow = (linkRows ?? [])[0];
  if (!linkRow?.ad_account_id) return bizErr({ error: "sem_ad_account" });
  const adAccountId = normalizeAdAccountId(linkRow.ad_account_id as string);

  // 3) Token desencriptado
  const { data: tokRows, error: tokErr } = await admin.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: conn.id, p_master_key: KEY,
  });
  if (tokErr || !Array.isArray(tokRows) || tokRows.length === 0) {
    return bizErr({ error: "token_decrypt_failed", detail: tokErr?.message });
  }
  const token = (tokRows[0] as { access_token: string }).access_token;

  // 4) Upload por tipo
  try {
    if (type === "image") {
      // Descarrega bytes (do storage se possível, caso contrário do file_url)
      let bytes: Uint8Array | null = null;
      let mime = cre.file_mime_type || "image/jpeg";
      if (cre.storage_bucket && cre.storage_path) {
        const { data: dl, error: dlErr } = await admin.storage
          .from(cre.storage_bucket).download(cre.storage_path);
        if (dlErr || !dl) return bizErr({ error: "download_falhou", detail: dlErr?.message });
        bytes = new Uint8Array(await dl.arrayBuffer());
        if (dl.type) mime = dl.type;
      } else if (cre.file_url) {
        const r = await fetch(cre.file_url);
        if (!r.ok) return bizErr({ error: "download_falhou", detail: `http_${r.status}` });
        bytes = new Uint8Array(await r.arrayBuffer());
        const ct = r.headers.get("content-type");
        if (ct) mime = ct.split(";")[0].trim();
      } else {
        return bizErr({ error: "sem_origem_de_bytes" });
      }
      const fileName = (cre.storage_path?.split("/").pop()) || `${creativeId}.jpg`;
      const fd = new FormData();
      fd.append("access_token", token);
      fd.append("filename", new Blob([bytes!], { type: mime }), fileName);

      const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/act_${adAccountId}/adimages`;
      const resp = await fetch(url, { method: "POST", body: fd });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok || j?.error) {
        console.log("[upload-creative] adimages_falhou raw", JSON.stringify({
          adAccountId, graph_api_version: GRAPH_API_VERSION, http_status: resp.status, fb_response: j,
        }));
        return bizErr({
          error: "adimages_falhou",
          detail: j?.error?.message ?? `http_${resp.status}`,
          fb_error: j?.error ?? null,
        });
      }
      const images = j?.images ?? {};
      const firstKey = Object.keys(images)[0];
      const hash = firstKey ? images[firstKey]?.hash : null;
      if (!hash) return bizErr({ error: "adimages_sem_hash", detail: JSON.stringify(j) });

      const { error: uErr } = await (sbCrm as any).from("meta_creatives")
        .update({ meta_image_hash: hash, updated_at: new Date().toISOString() })
        .eq("id", creativeId);
      if (uErr) return bizErr({ error: "db_update_falhou", detail: uErr.message });

      return json({ ok: true, creative_id: creativeId, type, meta_image_hash: hash });
    }

    // VÍDEO: usa file_url público
    if (!cre.file_url) return bizErr({ error: "sem_file_url" });
    const fd = new FormData();
    fd.append("access_token", token);
    fd.append("file_url", cre.file_url);
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/act_${adAccountId}/advideos`;
    const resp = await fetch(url, { method: "POST", body: fd });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok || j?.error) {
      console.log("[upload-creative] advideos_falhou raw", JSON.stringify({
        adAccountId, graph_api_version: GRAPH_API_VERSION, http_status: resp.status, fb_response: j,
      }));
      return bizErr({
        error: "advideos_falhou",
        detail: j?.error?.message ?? `http_${resp.status}`,
        fb_error: j?.error ?? null,
      });
    }
    const videoId = j?.id ? String(j.id) : null;
    if (!videoId) return bizErr({ error: "advideos_sem_id", detail: JSON.stringify(j) });

    const { error: uErr } = await (sbCrm as any).from("meta_creatives")
      .update({ meta_video_id: videoId, updated_at: new Date().toISOString() })
      .eq("id", creativeId);
    if (uErr) return bizErr({ error: "db_update_falhou", detail: uErr.message });

    return json({ ok: true, creative_id: creativeId, type, meta_video_id: videoId, nota: "vídeo entra em processamento no Meta" });
  } catch (e) {
    return bizErr({ error: "threw", detail: (e as Error).message });
  }
});
