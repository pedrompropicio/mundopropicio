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

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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
// chegam como undefined sem erro.
const CREATIVE_FIELDS = [
  "id", "name", "body", "title", "object_story_spec",
  "image_url", "video_id", "thumbnail_url", "call_to_action_type",
  "object_type", "image_hash",
].join(",");

interface ParsedCreative {
  type: "image" | "video" | "banner" | "unknown";
  headline: string | null;
  body: string | null;
  cta_type: string | null;
  link_url: string | null;
  thumbnail_url: string | null;
  video_id: string | null;
  image_hash: string | null; // preparado para v2 thumbnail resolution
}

// Parser do object_story_spec. v1 cobre 3 shapes: video_data, link_data,
// image_data. template_data (carousels) e asset_feed_spec (AAA) caem
// no fallback "unknown" com warning log.
function parseCreativeFields(creative: any): ParsedCreative {
  const spec = creative?.object_story_spec ?? {};

  if (spec.video_data) {
    return {
      type: "video",
      headline: spec.video_data.title ?? null,
      body: spec.video_data.message ?? null,
      cta_type: spec.video_data.call_to_action?.type ?? null,
      link_url: spec.video_data.call_to_action?.value?.link ?? null,
      thumbnail_url: spec.video_data.image_url ?? creative.thumbnail_url ?? null,
      video_id: spec.video_data.video_id ?? creative.video_id ?? null,
      image_hash: null,
    };
  }
  if (spec.link_data) {
    return {
      type: "banner",
      headline: spec.link_data.name ?? null, // "name" no link_data é o headline
      body: spec.link_data.message ?? null,
      cta_type: spec.link_data.call_to_action?.type ?? null,
      link_url: spec.link_data.call_to_action?.value?.link ?? spec.link_data.link ?? null,
      thumbnail_url: spec.link_data.picture ?? null,
      video_id: null,
      image_hash: spec.link_data.image_hash ?? null,
    };
  }
  if (spec.image_data) {
    return {
      type: "image",
      headline: null, // image_data não tem headline próprio
      body: spec.image_data.message ?? null,
      cta_type: spec.image_data.call_to_action?.type ?? null,
      link_url: spec.image_data.call_to_action?.value?.link ?? null,
      thumbnail_url: null,
      video_id: null,
      image_hash: spec.image_data.image_hash ?? null,
    };
  }

  // Fallback — sem object_story_spec ou shape não coberto (template_data, asset_feed_spec, etc).
  console.warn(
    `[meta-sync-creatives] Unknown shape for creative ${creative?.id}. ` +
    `Has object_story_spec: ${!!creative?.object_story_spec}. ` +
    `Keys: ${creative?.object_story_spec ? Object.keys(creative.object_story_spec).join(",") : "none"}. ` +
    `v1 cobre image_data/video_data/link_data. Considerar v2 para template_data/asset_feed_spec.`,
  );
  return {
    type: creative?.video_id ? "video" : "unknown",
    headline: creative?.title ?? null,
    body: creative?.body ?? null,
    cta_type: creative?.call_to_action_type ?? null,
    link_url: null,
    thumbnail_url: creative?.thumbnail_url ?? null,
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
      // Graph retorna { "cid1": {...}, "cid2": {...}, ... }
      for (const [cid, data] of Object.entries(j)) {
        if (typeof data === "object" && data && !(data as any).error) {
          out.set(cid, data);
        }
      }
    } catch (e) {
      console.warn(`[meta-sync-creatives] batch ${i / CHUNK + 1} threw:`, (e as Error).message);
    }
  }
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
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
  };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const connectionId = body.connection_id;
  const rawAcct = body.ad_account_id;
  if (!connectionId || !rawAcct) return json({ error: "missing_params", required: ["connection_id", "ad_account_id"] }, 400);
  const adAccountId = normalizeAdAccountId(rawAcct);
  const mode: "incremental" | "full" = body?.mode === "full" ? "full" : "incremental";
  const maxRun = Math.min(Math.max(body?.max_creatives_per_run ?? 200, 1), 2000);
  const triggeredBy = body?.triggered_by ?? (isServiceRole ? "service_role" : "user");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
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

  console.log(`[meta-sync-creatives] start company=${companyId} acct=${adAccountId} mode=${mode} max=${maxRun} triggered_by=${triggeredBy}`);

  // ── 1) Identificar creative IDs a sincronizar ─────────────────────────
  // Step A: distinct meta_creative_id em meta_ad_snapshot.
  const { data: snapRows, error: snapErr } = await (supabase as any)
    .schema("crm")
    .from("meta_ad_snapshot")
    .select("meta_creative_id")
    .eq("company_id", companyId)
    .eq("connection_id", connectionId)
    .eq("ad_account_id", adAccountId)
    .not("meta_creative_id", "is", null);
  if (snapErr) {
    console.error("[meta-sync-creatives] snapshot query error:", snapErr);
    return json({ error: "snapshot_query_failed", detail: snapErr.message }, 500);
  }
  const allSnapIds = Array.from(new Set((snapRows ?? []).map((r: any) => r.meta_creative_id as string).filter(Boolean)));

  // Step B: existentes em meta_creatives para esta company.
  let existingIds = new Set<string>();
  if (mode === "incremental" && allSnapIds.length > 0) {
    const { data: existing } = await (supabase as any)
      .schema("crm")
      .from("meta_creatives")
      .select("meta_creative_id")
      .eq("company_id", companyId)
      .in("meta_creative_id", allSnapIds);
    existingIds = new Set((existing ?? []).map((r: any) => r.meta_creative_id as string).filter(Boolean));
  }
  // mode='full' force re-sync de tudo (mas com onConflict do nothing, existing rows não mudam).

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
    });
  }

  // ── 2) Batch fetch Graph API ──────────────────────────────────────────
  const fetched = await batchFetchCreatives(idsToFetch, accessToken);
  console.log(`[meta-sync-creatives] fetched ${fetched.size}/${idsToFetch.length} from Graph`);

  // ── 3) Parse + construct rows ─────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const rows: any[] = [];
  let skipped = 0;
  for (const cid of idsToFetch) {
    const creative = fetched.get(cid);
    if (!creative) { skipped++; continue; }
    const parsed = parseCreativeFields(creative);
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
      // v1: campos null (sem upload manual)
      storage_path: null,
      file_url: null,
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

  // ── 4) INSERT ON CONFLICT DO NOTHING em chunks ───────────────────────
  // ignoreDuplicates: true preserva rows existentes (uploads UI manuais).
  // v2 fará passo separado para enriquecer rows existentes com campos vazios.
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
        .upsert(slice, { onConflict: "company_id,meta_creative_id", ignoreDuplicates: true })
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

  return json({
    synced_count: insertedCount,
    skipped_count: skipped,
    ad_account_id: adAccountId,
    mode,
    remaining_to_sync: remainingToSync,
    triggered_by: triggeredBy,
    backlog_snapshot: { snap_distinct: allSnapIds.length, existing: existingIds.size, missing: missingIds.length, fetched: idsToFetch.length },
  });
});
