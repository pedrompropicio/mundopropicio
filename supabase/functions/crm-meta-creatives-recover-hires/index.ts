// crm-meta-creatives-recover-hires
// ---------------------------------------------------------------------------
// Recupera criativos Meta em ALTA RESOLUÇÃO e re-grava-os no bucket público
// "crm-meta-creatives", por cima dos thumbnails 64x64 que o sync v1 deixou.
//
// 2 MODOS (mutuamente exclusivos — exatamente um tem de vir no body):
//
//  A) MODO LEGACY (intacto, usado por scripts de backfill):
//     {
//       connection_id: string,
//       ad_account_id: string,
//       image_hashes: string[],
//       dry_run?: boolean
//     }
//     Resposta legacy: { version, company_id, ad_account_id, dry_run,
//       total, rehosted, skipped, failed, results:[ {hash, status, ...} ] }
//
//  B) MODO NOVO (usado pela UI Montagem Assistida — botão "Trazer em alta"):
//     {
//       creative_ids: string[],
//       connection_id?: string,    // opcional; resolvido por company se ausente
//       ad_account_id?: string,    // opcional; resolvido por company se ausente
//       dry_run?: boolean
//     }
//     Resposta nova: { version, company_id, ad_account_id, dry_run,
//       results:[ {creative_id, status, width?, height?, file_size_bytes?,
//                  mime?, file_url?, also_updated_creative_ids?:string[], reason?} ],
//       summary:{ upgraded, skipped, failed } }
//
// Estados por creative_id no modo B:
//   - upgraded                      (imagem rehosted >=600px)
//   - upgraded_video_source         (vídeo MP4 source rehosted)
//   - upgraded_video_thumbnail      (póster em alta rehosted; type='video' MANTIDO)
//   - no_hires_available            (vídeo sem source nem thumb >=600px)
//   - no_source                     (sem meta_image_hash nem meta_video_id)
//   - width_below_min               (imagem na Meta < 600px)
//   - graph_error / download_error / db_error
//
// Auth: JWT (admin/marketing_manager/manager) OU service_role.
// NUNCA escreve query-string em file_url da BD (cache-bust é só na UI).

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const VERSION = "2026-06-28-v2-creative-ids+video";
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
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

function extFromMime(mime: string): string {
  return MIME_EXT[mime.toLowerCase()] ?? "jpg";
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

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

type CreativeResult = {
  creative_id: string;
  status:
    | "upgraded"
    | "upgraded_video_source"
    | "upgraded_video_thumbnail"
    | "no_hires_available"
    | "no_source"
    | "width_below_min"
    | "graph_error"
    | "download_error"
    | "db_error";
  width?: number;
  height?: number;
  file_size_bytes?: number;
  mime?: string;
  file_url?: string;
  also_updated_creative_ids?: string[];
  reason?: string;
};

type CreativeRow = {
  id: string;
  company_id: string;
  type: string | null;
  meta_image_hash: string | null;
  meta_video_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  file_url: string | null;
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: {
    connection_id?: string;
    ad_account_id?: string;
    image_hashes?: string[];
    creative_ids?: string[];
    dry_run?: boolean;
  } = {};
  try { body = await req.json(); } catch { /* defaults */ }

  const dryRun = body.dry_run === true;
  const hasHashes = Array.isArray(body.image_hashes) && body.image_hashes.length > 0;
  const hasCreativeIds = Array.isArray(body.creative_ids) && body.creative_ids.length > 0;

  // Aceitar fallback legacy (sem nenhum dos dois → usar DEFAULT_HASHES).
  const legacyDefault = !hasHashes && !hasCreativeIds && !!body.connection_id && !!body.ad_account_id;

  if (hasHashes && hasCreativeIds) {
    return json({ error: "mode_required", detail: "Pass exactly one of image_hashes[] or creative_ids[]." }, 400);
  }
  if (!hasHashes && !hasCreativeIds && !legacyDefault) {
    return json({ error: "mode_required", detail: "Pass either image_hashes[], creative_ids[], or (connection_id+ad_account_id) for legacy defaults." }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ===========================================================================
  // MODO B — creative_ids[]
  // ===========================================================================
  if (hasCreativeIds) {
    const creativeIds = (body.creative_ids ?? []).map((s) => String(s).trim()).filter(Boolean);
    if (creativeIds.length === 0) return json({ error: "no_creative_ids" }, 400);

    // 1) Buscar todos os criativos pedidos
    const { data: creatives, error: cErr } = await (admin as any)
      .schema("crm")
      .from("meta_creatives")
      .select("id, company_id, type, meta_image_hash, meta_video_id, storage_bucket, storage_path, file_url")
      .in("id", creativeIds);
    if (cErr) return json({ error: "db_query_failed", detail: cErr.message }, 500);
    const rows = (creatives ?? []) as CreativeRow[];
    if (rows.length === 0) return json({ error: "no_rows_for_creative_ids" }, 404);

    // 2) Garantir mesma company
    const companies = new Set(rows.map((r) => r.company_id));
    if (companies.size > 1) return json({ error: "mixed_companies" }, 400);
    const companyId = rows[0].company_id;

    // 3) Resolver conexão Meta ativa (se não vier explícita)
    let connectionId = body.connection_id;
    let adAccountId = body.ad_account_id ? normalizeAdAccountId(body.ad_account_id) : undefined;
    if (!connectionId) {
      const { data: connRow, error: connErr } = await (admin as any)
        .schema("crm")
        .from("ad_platform_connections")
        .select("id, selected_ad_account_id")
        .eq("company_id", companyId)
        .eq("platform", "meta")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (connErr || !connRow?.id) {
        return json({ error: "no_active_meta_connection", detail: connErr?.message }, 400);
      }
      connectionId = connRow.id as string;
      if (!adAccountId && connRow.selected_ad_account_id) {
        adAccountId = normalizeAdAccountId(connRow.selected_ad_account_id as string);
      }
    }
    if (!adAccountId) {
      const { data: acctRow } = await (admin as any)
        .schema("crm")
        .from("ad_platform_connections")
        .select("selected_ad_account_id")
        .eq("id", connectionId)
        .maybeSingle();
      if (!acctRow?.selected_ad_account_id) {
        return json({ error: "no_selected_ad_account" }, 400);
      }
      adAccountId = normalizeAdAccountId(acctRow.selected_ad_account_id as string);
    }

    // 4) Desencriptar token
    const { data: tokenRows, error: tokenErr } = await supabase.rpc(
      "crm_get_meta_decrypted_token",
      { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
    );
    if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
      return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
    }
    const accessToken = (tokenRows[0] as any).access_token as string;

    console.log(`[recover-hires/B] company=${companyId} acct=${adAccountId} n=${rows.length} dry_run=${dryRun}`);

    const results: CreativeResult[] = [];

    // 5a) Agrupar imagens por hash
    const byHash = new Map<string, CreativeRow[]>();
    const videos: CreativeRow[] = [];
    const noSource: CreativeRow[] = [];
    for (const r of rows) {
      const hash = (r.meta_image_hash || "").trim().toLowerCase();
      if (hash) {
        const arr = byHash.get(hash) ?? [];
        arr.push(r);
        byHash.set(hash, arr);
      } else if (r.meta_video_id) {
        videos.push(r);
      } else {
        noSource.push(r);
      }
    }

    // 5b) Processar imagens hash-a-hash (com also_updated_creative_ids)
    for (const [hash, group] of byHash.entries()) {
      // Buscar TODAS as rows da company com esse hash (não só as pedidas) — coerência de overwrite
      const { data: allRowsForHash } = await (admin as any)
        .schema("crm")
        .from("meta_creatives")
        .select("id, meta_creative_id, storage_bucket, storage_path")
        .eq("company_id", companyId)
        .eq("meta_image_hash", hash);
      const allRows = (allRowsForHash ?? []) as Array<{ id: string; meta_creative_id: string | null; storage_bucket: string | null; storage_path: string | null }>;
      const requestedIds = new Set(group.map((g) => g.id));
      const alsoIds = allRows.map((r) => r.id).filter((id) => !requestedIds.has(id));

      // Graph /adimages
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
          for (const g of group) results.push({ creative_id: g.id, status: "graph_error", reason: `graph_http_${resp.status}` });
          continue;
        }
      } catch (e) {
        for (const g of group) results.push({ creative_id: g.id, status: "graph_error", reason: `graph_fetch_threw: ${(e as Error).message}` });
        continue;
      }

      const img = Array.isArray(graphJson?.data) ? graphJson.data[0] : null;
      if (!img || typeof img.url !== "string") {
        for (const g of group) results.push({ creative_id: g.id, status: "graph_error", reason: "no_url_in_graph_response" });
        continue;
      }

      const w = Number(img.width) || 0;
      const h = Number(img.height) || 0;
      if (w < MIN_WIDTH) {
        for (const g of group) results.push({ creative_id: g.id, status: "width_below_min", width: w, height: h, reason: `got ${w}px (<${MIN_WIDTH})` });
        continue;
      }

      // Download
      let imgBytes: Uint8Array;
      let mime = "image/jpeg";
      try {
        const dl = await fetch(img.url);
        if (!dl.ok) {
          for (const g of group) results.push({ creative_id: g.id, status: "download_error", reason: `download_http_${dl.status}` });
          continue;
        }
        const ct = (dl.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        if (!ct.startsWith("image/")) {
          for (const g of group) results.push({ creative_id: g.id, status: "download_error", reason: `not_an_image: ${ct || "unknown"}` });
          continue;
        }
        mime = ct;
        imgBytes = new Uint8Array(await dl.arrayBuffer());
        if (imgBytes.byteLength === 0) {
          for (const g of group) results.push({ creative_id: g.id, status: "download_error", reason: "empty_body" });
          continue;
        }
      } catch (e) {
        for (const g of group) results.push({ creative_id: g.id, status: "download_error", reason: (e as Error).message });
        continue;
      }

      if (dryRun) {
        for (const g of group) {
          results.push({
            creative_id: g.id,
            status: "upgraded",
            width: w, height: h, file_size_bytes: imgBytes.byteLength, mime,
            file_url: g.file_url ?? undefined,
            also_updated_creative_ids: alsoIds.length > 0 ? alsoIds : undefined,
            reason: "dry_run",
          });
        }
        continue;
      }

      // Overwrite em TODAS as rows do hash
      const ext = extFromMime(mime);
      let writeError: string | null = null;
      for (const r of allRows) {
        const path = (r.storage_path && typeof r.storage_path === "string")
          ? r.storage_path
          : `${companyId}/${r.meta_creative_id ?? r.id}.${ext}`;
        const { error: upErr } = await admin.storage.from(BUCKET).upload(path, imgBytes, {
          contentType: mime, upsert: true,
        });
        if (upErr) { writeError = `upload(${path}): ${upErr.message}`; break; }
      }
      if (writeError) {
        for (const g of group) results.push({ creative_id: g.id, status: "download_error", reason: writeError, width: w, height: h });
        continue;
      }

      // UPDATE de dimensões em TODAS as rows do hash
      const ids = allRows.map((r) => r.id);
      const { error: updErr } = await (admin as any)
        .schema("crm")
        .from("meta_creatives")
        .update({
          width: w, height: h,
          file_size_bytes: imgBytes.byteLength,
          file_mime_type: mime,
          storage_bucket: BUCKET,
          updated_at: new Date().toISOString(),
        })
        .in("id", ids);
      if (updErr) {
        for (const g of group) results.push({ creative_id: g.id, status: "db_error", reason: updErr.message, width: w, height: h });
        continue;
      }

      for (const g of group) {
        results.push({
          creative_id: g.id,
          status: "upgraded",
          width: w, height: h, file_size_bytes: imgBytes.byteLength, mime,
          file_url: g.file_url ?? undefined,
          also_updated_creative_ids: alsoIds.length > 0 ? alsoIds : undefined,
        });
      }
    }

    // 5c) Vídeos best-effort
    for (const v of videos) {
      const vid = v.meta_video_id!;
      const vurl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${vid}`);
      vurl.searchParams.set("fields", "thumbnails{uri,width,height,is_preferred},source");
      vurl.searchParams.set("access_token", accessToken);
      let vJson: any;
      try {
        const resp = await fetch(vurl.toString());
        const text = await resp.text();
        try { vJson = JSON.parse(text); } catch { vJson = { raw: text }; }
        if (!resp.ok) {
          results.push({ creative_id: v.id, status: "graph_error", reason: `video_graph_http_${resp.status}` });
          continue;
        }
      } catch (e) {
        results.push({ creative_id: v.id, status: "graph_error", reason: `video_fetch_threw: ${(e as Error).message}` });
        continue;
      }

      const sourceUrl: string | null = typeof vJson?.source === "string" ? vJson.source : null;
      const thumbs: Array<{ uri: string; width: number; height: number; is_preferred?: boolean }> =
        Array.isArray(vJson?.thumbnails?.data) ? vJson.thumbnails.data : [];

      // (1) Tentar source MP4
      if (sourceUrl) {
        try {
          const dl = await fetch(sourceUrl);
          const ct = (dl.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
          if (dl.ok && ct.startsWith("video/")) {
            const bytes = new Uint8Array(await dl.arrayBuffer());
            if (bytes.byteLength > 0) {
              const ext = extFromMime(ct);
              const path = v.storage_path ?? `${companyId}/${v.id}.${ext}`;
              if (!dryRun) {
                const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
                  contentType: ct, upsert: true,
                });
                if (upErr) {
                  results.push({ creative_id: v.id, status: "download_error", reason: `upload: ${upErr.message}` });
                  continue;
                }
                await (admin as any).schema("crm").from("meta_creatives").update({
                  file_size_bytes: bytes.byteLength,
                  file_mime_type: ct,
                  storage_bucket: BUCKET,
                  updated_at: new Date().toISOString(),
                  // NOTE: NÃO mexer em type='video', width/height (sem dimensões do source aqui)
                }).eq("id", v.id);
              }
              results.push({
                creative_id: v.id,
                status: "upgraded_video_source",
                file_size_bytes: bytes.byteLength,
                mime: ct,
                file_url: v.file_url ?? undefined,
                reason: dryRun ? "dry_run" : undefined,
              });
              continue;
            }
          } else {
            await dl.text().catch(() => {});
          }
        } catch (e) {
          // cai no fallback de thumbnail
          console.warn(`[recover-hires/B] video source fetch failed for ${v.id}: ${(e as Error).message}`);
        }
      }

      // (2) Fallback: melhor thumbnail
      const best = (() => {
        if (thumbs.length === 0) return null;
        const preferred = thumbs.find((t) => t.is_preferred && Number(t.width) >= MIN_WIDTH);
        if (preferred) return preferred;
        const sorted = thumbs
          .filter((t) => Number(t.width) > 0)
          .sort((a, b) => Number(b.width) - Number(a.width));
        return sorted[0] ?? null;
      })();
      if (!best || Number(best.width) < MIN_WIDTH) {
        results.push({
          creative_id: v.id,
          status: "no_hires_available",
          width: Number(best?.width) || undefined,
          height: Number(best?.height) || undefined,
          reason: best ? `best_thumb_width_${best.width}_below_${MIN_WIDTH}` : "no_thumbnails",
        });
        continue;
      }

      try {
        const dl = await fetch(best.uri);
        if (!dl.ok) {
          results.push({ creative_id: v.id, status: "download_error", reason: `thumb_http_${dl.status}` });
          continue;
        }
        const ct = (dl.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim().toLowerCase();
        const bytes = new Uint8Array(await dl.arrayBuffer());
        if (bytes.byteLength === 0) {
          results.push({ creative_id: v.id, status: "download_error", reason: "empty_thumb" });
          continue;
        }
        const ext = extFromMime(ct);
        const path = v.storage_path ?? `${companyId}/${v.id}.${ext}`;
        if (!dryRun) {
          const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
            contentType: ct, upsert: true,
          });
          if (upErr) {
            results.push({ creative_id: v.id, status: "download_error", reason: `upload: ${upErr.message}` });
            continue;
          }
          // type='video' MANTIDO — só atualizamos o póster + dimensões da thumbnail
          await (admin as any).schema("crm").from("meta_creatives").update({
            width: Number(best.width) || null,
            height: Number(best.height) || null,
            file_size_bytes: bytes.byteLength,
            file_mime_type: ct,
            storage_bucket: BUCKET,
            updated_at: new Date().toISOString(),
          }).eq("id", v.id);
        }
        results.push({
          creative_id: v.id,
          status: "upgraded_video_thumbnail",
          width: Number(best.width) || undefined,
          height: Number(best.height) || undefined,
          file_size_bytes: bytes.byteLength,
          mime: ct,
          file_url: v.file_url ?? undefined,
          reason: dryRun ? "dry_run" : "video_source_unavailable_used_thumbnail",
        });
      } catch (e) {
        results.push({ creative_id: v.id, status: "download_error", reason: (e as Error).message });
      }
    }

    // 5d) Sem source
    for (const n of noSource) {
      results.push({ creative_id: n.id, status: "no_source", reason: "no_meta_image_hash_and_no_meta_video_id" });
    }

    const upgradedStatuses = new Set(["upgraded", "upgraded_video_source", "upgraded_video_thumbnail"]);
    const skippedStatuses = new Set(["no_hires_available", "no_source", "width_below_min"]);
    const summary = {
      upgraded: results.filter((r) => upgradedStatuses.has(r.status)).length,
      skipped: results.filter((r) => skippedStatuses.has(r.status)).length,
      failed: results.filter((r) => !upgradedStatuses.has(r.status) && !skippedStatuses.has(r.status)).length,
    };

    console.log(`[recover-hires/B] done ${JSON.stringify(summary)}`);
    return json({
      version: VERSION,
      company_id: companyId,
      ad_account_id: adAccountId,
      dry_run: dryRun,
      results,
      summary,
    });
  }

  // ===========================================================================
  // MODO A — LEGACY (image_hashes[] ou defaults) — INTACTO
  // ===========================================================================
  if (!body.connection_id) return json({ error: "missing_connection_id" }, 400);
  if (!body.ad_account_id) return json({ error: "missing_ad_account_id" }, 400);

  const hashes = (Array.isArray(body.image_hashes) && body.image_hashes.length > 0
    ? body.image_hashes
    : DEFAULT_HASHES
  ).map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (hashes.length === 0) return json({ error: "no_hashes" }, 400);

  const adAccountId = normalizeAdAccountId(body.ad_account_id);

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

  console.log(`[recover-hires/A] start company=${companyId} acct=${adAccountId} hashes=${hashes.length} dry_run=${dryRun}`);

  const results: HashResult[] = [];

  for (const hash of hashes) {
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
    if (w < MIN_WIDTH) {
      results.push({ hash, status: "failed", reason: `width_below_min: got ${w}px, required >= ${MIN_WIDTH}px (no overwrite performed)`, width: w, height: h });
      continue;
    }

    let imgBytes: Uint8Array;
    let mime = "image/jpeg";
    try {
      const dl = await fetch(img.url);
      if (!dl.ok) { results.push({ hash, status: "failed", reason: `download_http_${dl.status}` }); continue; }
      const ct = (dl.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!ct.startsWith("image/")) { results.push({ hash, status: "failed", reason: `not_an_image: ${ct || "unknown"}` }); continue; }
      mime = ct;
      imgBytes = new Uint8Array(await dl.arrayBuffer());
      if (imgBytes.byteLength === 0) { results.push({ hash, status: "failed", reason: "empty_body" }); continue; }
    } catch (e) {
      results.push({ hash, status: "failed", reason: `download_threw: ${(e as Error).message}` });
      continue;
    }

    if (dryRun) {
      results.push({
        hash, status: "skipped", reason: "dry_run",
        width: w, height: h, file_size_bytes: imgBytes.byteLength, mime,
        paths_overwritten: rows.map((r: any) => r.storage_path).filter(Boolean),
      });
      continue;
    }

    const ext = extFromMime(mime);
    const pathsWritten: string[] = [];
    let writeError: string | null = null;
    for (const row of rows) {
      const path = (row.storage_path && typeof row.storage_path === "string")
        ? row.storage_path
        : `${companyId}/${row.meta_creative_id ?? row.id}.${ext}`;
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, imgBytes, {
        contentType: mime, upsert: true,
      });
      if (upErr) { writeError = `upload(${path}): ${upErr.message}`; break; }
      pathsWritten.push(path);
    }
    if (writeError) {
      results.push({ hash, status: "failed", reason: writeError, width: w, height: h });
      continue;
    }

    const ids = rows.map((r: any) => r.id);
    const { error: updErr, count } = await (admin as any)
      .schema("crm")
      .from("meta_creatives")
      .update({
        width: w, height: h,
        file_size_bytes: imgBytes.byteLength,
        file_mime_type: mime,
        storage_bucket: BUCKET,
        updated_at: new Date().toISOString(),
      }, { count: "exact" })
      .in("id", ids);
    if (updErr) {
      results.push({ hash, status: "failed", reason: `db_update: ${updErr.message}`, width: w, height: h, paths_overwritten: pathsWritten });
      continue;
    }

    results.push({
      hash, status: "rehosted",
      width: w, height: h, file_size_bytes: imgBytes.byteLength, mime,
      paths_overwritten: pathsWritten, rows_updated: count ?? ids.length,
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
  console.log(`[recover-hires/A] done ${JSON.stringify({ rehosted: summary.rehosted, failed: summary.failed, skipped: summary.skipped })}`);
  return json(summary);
});
