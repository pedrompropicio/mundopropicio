// crm-meta-creatives-recover-hires
// ---------------------------------------------------------------------------
// Recupera criativos Meta em ALTA RESOLUÇÃO e re-grava-os no bucket público
// "crm-meta-creatives", por cima dos thumbnails 64x64 que o sync v1 deixou.
//
// Bug original (ver docs/features/crm-meta-creatives-hires-recovery.md):
//   o pipeline `crm-meta-sync-creatives` + `_shared/rehost-creative.ts`
//   re-hospedava o `file_url` que vinha do Graph API no objeto creative
//   (já era a thumbnail). Resultado: linhas com width/height/file_size_bytes
//   a NULL e ficheiros 64x64 no bucket. As originais full-res nunca foram
//   gravadas.
//
// Esta função:
//   1. Recebe lista de meta_image_hash distintos (ou usa default).
//   2. Para cada hash, GET /act_<id>/adimages?hashes=["<hash>"]&fields=...
//   3. Usa o campo `url` (NÃO `permalink_url`) — original full-res.
//   4. Valida width >= 600 px; senão aborta para esse hash (não regrava lixo).
//   5. Descarrega e re-grava em TODOS os storage_path associados ao hash
//      (mantém coerência entre as N linhas que partilham a mesma imagem).
//   6. Faz UPDATE em crm.meta_creatives com width/height/file_size_bytes
//      reais.
//
// Não apaga nada. Só overwrite + UPDATE de dimensões.
//
// POST body:
//   {
//     connection_id: string,        // crm.ad_platform_connections.id
//     ad_account_id: string,        // "act_5094207367314169"
//     image_hashes?: string[],      // default: os 2 hashes conhecidos do bug
//     dry_run?: boolean             // se true: só lista o que faria
//   }
//
// Auth: JWT de utilizador (admin/marketing_manager/manager) OU service_role.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const VERSION = "2026-06-16-v1-recover-hires";
console.log(`[crm-meta-creatives-recover-hires] boot ${VERSION}`);

const GRAPH_API_VERSION = "v20.0";
const BUCKET = "crm-meta-creatives";
const MIN_WIDTH = 600;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const DEFAULT_HASHES = [
  "3f446050828fc719b93093a965d3a7e3",
  "7cc4972a386d8521b899fd1f24a0d479",
];

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

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function extFromMime(mime: string): string {
  return MIME_EXT[mime.toLowerCase()] ?? "jpg";
}

type HashResult = {
  hash: string;
  status: "rehosted" | "skipped" | "failed";
  reason?: string;
  width?: number;
  height?: number;
  file_size_bytes?: number;
  mime?: string;
  paths_overwritten?: string[];
  rows_updated?: number;
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: {
    connection_id?: string;
    ad_account_id?: string;
    image_hashes?: string[];
    dry_run?: boolean;
  } = {};
  try { body = await req.json(); } catch { /* defaults */ }

  if (!body.connection_id) return json({ error: "missing_connection_id" }, 400);
  if (!body.ad_account_id) return json({ error: "missing_ad_account_id" }, 400);

  const hashes = (Array.isArray(body.image_hashes) && body.image_hashes.length > 0
    ? body.image_hashes
    : DEFAULT_HASHES
  ).map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (hashes.length === 0) return json({ error: "no_hashes" }, 400);

  const adAccountId = normalizeAdAccountId(body.ad_account_id);
  const dryRun = body.dry_run === true;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Desencriptar token via RPC SECURITY DEFINER (mesmo padrão de crm-meta-sync-*).
  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: body.connection_id, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    console.error("[recover-hires] decrypt failed:", tokenErr);
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken, company_id: companyId } = tokenRows[0] as {
    access_token: string; company_id: string;
  };

  console.log(`[recover-hires] start company=${companyId} acct=${adAccountId} hashes=${hashes.length} dry_run=${dryRun}`);

  const results: HashResult[] = [];

  for (const hash of hashes) {
    // 1) Buscar todas as linhas associadas a este hash nesta company.
    const { data: rows, error: rowsErr } = await (admin as any)
      .schema("crm")
      .from("meta_creatives")
      .select("id, meta_creative_id, storage_bucket, storage_path, file_url")
      .eq("company_id", companyId)
      .eq("meta_image_hash", hash);
    if (rowsErr) {
      results.push({ hash, status: "failed", reason: `db_query: ${rowsErr.message}` });
      continue;
    }
    if (!rows || rows.length === 0) {
      results.push({ hash, status: "skipped", reason: "no_rows_for_hash" });
      continue;
    }

    // 2) Chamar Graph API /adimages.
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/adimages`);
    url.searchParams.set("hashes", JSON.stringify([hash]));
    url.searchParams.set("fields", "hash,url,permalink_url,width,height");
    url.searchParams.set("access_token", accessToken);

    let graphJson: any;
    try {
      const resp = await fetch(url.toString());
      const text = await resp.text();
      try { graphJson = JSON.parse(text); } catch { graphJson = { raw: text }; }
      if (!resp.ok) {
        results.push({ hash, status: "failed", reason: `graph_http_${resp.status}: ${JSON.stringify(graphJson)}` });
        continue;
      }
    } catch (e) {
      results.push({ hash, status: "failed", reason: `graph_fetch_threw: ${(e as Error).message}` });
      continue;
    }

    const img = Array.isArray(graphJson?.data) ? graphJson.data[0] : null;
    if (!img || typeof img.url !== "string") {
      results.push({ hash, status: "failed", reason: `no_url_in_graph_response: ${JSON.stringify(graphJson)}` });
      continue;
    }

    const w = Number(img.width) || 0;
    const h = Number(img.height) || 0;

    // 3) VALIDAÇÃO OBRIGATÓRIA: width >= 600. Não regravar lixo.
    if (w < MIN_WIDTH) {
      results.push({
        hash,
        status: "failed",
        reason: `width_below_min: got ${w}px, required >= ${MIN_WIDTH}px (no overwrite performed)`,
        width: w,
        height: h,
      });
      continue;
    }

    // 4) Descarregar imagem full-res.
    let imgBytes: Uint8Array;
    let mime = "image/jpeg";
    try {
      const dl = await fetch(img.url);
      if (!dl.ok) {
        results.push({ hash, status: "failed", reason: `download_http_${dl.status}` });
        continue;
      }
      const ct = (dl.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!ct.startsWith("image/")) {
        results.push({ hash, status: "failed", reason: `not_an_image: ${ct || "unknown"}` });
        continue;
      }
      mime = ct;
      imgBytes = new Uint8Array(await dl.arrayBuffer());
      if (imgBytes.byteLength === 0) {
        results.push({ hash, status: "failed", reason: "empty_body" });
        continue;
      }
    } catch (e) {
      results.push({ hash, status: "failed", reason: `download_threw: ${(e as Error).message}` });
      continue;
    }

    if (dryRun) {
      results.push({
        hash,
        status: "skipped",
        reason: "dry_run",
        width: w,
        height: h,
        file_size_bytes: imgBytes.byteLength,
        mime,
        paths_overwritten: rows.map((r: any) => r.storage_path).filter(Boolean),
      });
      continue;
    }

    // 5) Overwrite em TODOS os storage_path do hash (coerência entre rows).
    const ext = extFromMime(mime);
    const pathsWritten: string[] = [];
    let writeError: string | null = null;
    for (const row of rows) {
      // Preserva o storage_path existente quando há; senão constrói por defeito.
      const path = (row.storage_path && typeof row.storage_path === "string")
        ? row.storage_path
        : `${companyId}/${row.meta_creative_id ?? row.id}.${ext}`;
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, imgBytes, {
        contentType: mime,
        upsert: true,
      });
      if (upErr) { writeError = `upload(${path}): ${upErr.message}`; break; }
      pathsWritten.push(path);
    }
    if (writeError) {
      results.push({ hash, status: "failed", reason: writeError, width: w, height: h });
      continue;
    }

    // 6) UPDATE de dimensões em todas as linhas do hash.
    const ids = rows.map((r: any) => r.id);
    const { error: updErr, count } = await (admin as any)
      .schema("crm")
      .from("meta_creatives")
      .update({
        width: w,
        height: h,
        file_size_bytes: imgBytes.byteLength,
        file_mime_type: mime,
        storage_bucket: BUCKET,
        updated_at: new Date().toISOString(),
      }, { count: "exact" })
      .in("id", ids);
    if (updErr) {
      results.push({
        hash,
        status: "failed",
        reason: `db_update: ${updErr.message}`,
        width: w,
        height: h,
        paths_overwritten: pathsWritten,
      });
      continue;
    }

    results.push({
      hash,
      status: "rehosted",
      width: w,
      height: h,
      file_size_bytes: imgBytes.byteLength,
      mime,
      paths_overwritten: pathsWritten,
      rows_updated: count ?? ids.length,
    });
  }

  const summary = {
    version: VERSION,
    company_id: companyId,
    ad_account_id: adAccountId,
    dry_run: dryRun,
    total: results.length,
    rehosted: results.filter((r) => r.status === "rehosted").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
  console.log(`[recover-hires] done ${JSON.stringify({ rehosted: summary.rehosted, failed: summary.failed, skipped: summary.skipped })}`);
  return json(summary);
});
