// crm-meta-rehost-images-targeted
// POST { connection_id, ad_account_id, creative_ids: string[] }
//
// Re-host DIRIGIDO de imagens. Aplica a correção v5 (alta resolução via
// /adimages) a uma lista EXPLÍCITA de crm.meta_creatives.id. NUNCA processa
// a conta toda. Vídeos e peças sem hash são skipped. Reutiliza
// _shared/rehost-creative.ts sem o alterar (upsert no MESMO path → sobrepõe
// o ficheiro pequeno, sem criar órfãos).

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { rehostCreative } from "../_shared/rehost-creative.ts";

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const MAX_PER_CALL = 50;
const IMAGE_TYPES = new Set(["image", "banner", "carousel", "dpa"]);

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

interface AdImageInfo { url: string; width: number | null; height: number | null; }

async function resolveImageHashes(
  adAccountId: string,
  hashes: string[],
  accessToken: string,
): Promise<Map<string, AdImageInfo>> {
  const out = new Map<string, AdImageInfo>();
  if (hashes.length === 0) return out;
  const CHUNK = 10;
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const slice = hashes.slice(i, i + CHUNK);
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/adimages`);
    url.searchParams.set("hashes", JSON.stringify(slice));
    url.searchParams.set("fields", "hash,url,permalink_url,width,height");
    url.searchParams.set("access_token", accessToken);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(url.toString());
        if (r.status === 429 || r.status >= 500) {
          if (attempt === 0) continue;
          console.warn(`[rehost-images-targeted] /adimages batch ${i / CHUNK + 1} status=${r.status}`);
          break;
        }
        const j = await r.json();
        if (!r.ok || j.error) {
          console.warn(`[rehost-images-targeted] /adimages batch ${i / CHUNK + 1} err:`, j.error?.message ?? r.status);
          break;
        }
        for (const item of (j.data ?? [])) {
          const resolved = item.url ?? item.permalink_url;
          if (item.hash && resolved) {
            out.set(item.hash, {
              url: resolved,
              width: typeof item.width === "number" ? item.width : null,
              height: typeof item.height === "number" ? item.height : null,
            });
          }
        }
        break;
      } catch (e) {
        if (attempt === 0) continue;
        console.warn(`[rehost-images-targeted] /adimages batch ${i / CHUNK + 1} threw:`, (e as Error).message);
        break;
      }
    }
  }
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[rehost-images-targeted] BUILD_VERSION=rehost-targeted-v1");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { connection_id?: string; ad_account_id?: string; creative_ids?: string[] };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const connectionId = body.connection_id?.trim();
  const adAccountRaw = body.ad_account_id?.trim();
  const creativeIdsRaw = Array.isArray(body.creative_ids) ? body.creative_ids : [];
  if (!connectionId || !adAccountRaw || creativeIdsRaw.length === 0) {
    return json({ error: "missing_params", required: ["connection_id", "ad_account_id", "creative_ids[]"] }, 400);
  }
  const creativeIds = Array.from(new Set(creativeIdsRaw.filter((s) => typeof s === "string" && s.length > 0))).slice(0, MAX_PER_CALL);
  if (creativeIds.length === 0) return json({ error: "no_valid_creative_ids" }, 400);

  const adAccountId = normalizeAdAccountId(adAccountRaw);
  const isServiceRole = isServiceRoleJWT(authHeader);

  // supabase client com o JWT do request (para a RPC SECURITY DEFINER funcionar
  // em ambos os modes — user JWT ou service_role).
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    console.error("[rehost-images-targeted] decrypt failed:", tokenErr);
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken, company_id: companyId } = tokenRows[0] as {
    access_token: string; company_id: string;
  };

  // 1) Lê as peças (service_role) — só do company decifrado.
  const { data: rows, error: rowsErr } = await adminClient
    .schema("crm")
    .from("meta_creatives")
    .select("id, company_id, type, meta_image_hash, file_url, meta_creative_id, storage_path")
    .in("id", creativeIds)
    .eq("company_id", companyId);

  if (rowsErr) {
    console.error("[rehost-images-targeted] select failed:", rowsErr);
    return json({ error: "select_failed", detail: rowsErr.message }, 500);
  }

  const results: Array<Record<string, unknown>> = [];
  const found = new Set((rows ?? []).map((r) => r.id));

  // Marca ids pedidos que não pertencem ao company / não existem.
  for (const id of creativeIds) {
    if (!found.has(id)) {
      results.push({ creative_id: id, status: "skipped", reason: "not_found_or_other_company" });
    }
  }

  // 2) Filtra imagens com hash; vídeos e sem hash são skipped.
  const toProcess: typeof rows = [];
  for (const r of rows ?? []) {
    if (!r.type || !IMAGE_TYPES.has(r.type)) {
      results.push({ creative_id: r.id, status: "skipped", reason: "not_image_or_no_hash", type: r.type });
      continue;
    }
    if (!r.meta_image_hash) {
      results.push({ creative_id: r.id, status: "skipped", reason: "not_image_or_no_hash", type: r.type });
      continue;
    }
    toProcess.push(r);
  }

  // 3) /adimages para todos os hashes únicos.
  const uniqueHashes = Array.from(new Set(toProcess.map((r) => r.meta_image_hash as string)));
  const resolved = await resolveImageHashes(adAccountId, uniqueHashes, accessToken);

  let rehosted = 0, skipped = results.filter((r) => r.status === "skipped").length, failed = 0;

  // 4–6) Re-host + UPDATE.
  for (const r of toProcess) {
    const hash = r.meta_image_hash as string;
    const info = resolved.get(hash);
    if (!info) {
      results.push({ creative_id: r.id, status: "skipped", reason: "hash_not_resolved" });
      skipped++;
      continue;
    }

    const pathKey = (r.meta_creative_id as string | null) ?? r.id;
    const res = await rehostCreative(
      adminClient,
      { company_id: r.company_id as string, path_key: pathKey, type: r.type as string, file_url: info.url },
      { supabaseUrl: SUPABASE_URL },
    );

    if (res.status === "rehosted") {
      const { error: upErr } = await adminClient
        .schema("crm")
        .from("meta_creatives")
        .update({
          file_url: res.file_url,
          storage_path: res.storage_path,
          width: info.width,
          height: info.height,
          file_mime_type: res.mime,
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      if (upErr) {
        failed++;
        results.push({ creative_id: r.id, status: "failed", reason: `db_update: ${upErr.message}`, old_file_url: r.file_url });
      } else {
        rehosted++;
        results.push({
          creative_id: r.id,
          status: "rehosted",
          old_file_url: r.file_url,
          new_file_url: res.file_url,
          width: info.width,
          height: info.height,
        });
      }
    } else if (res.status === "skipped") {
      skipped++;
      results.push({ creative_id: r.id, status: "skipped", reason: res.reason ?? "rehost_skipped", old_file_url: r.file_url });
    } else {
      failed++;
      results.push({ creative_id: r.id, status: "failed", reason: res.reason ?? "rehost_failed", old_file_url: r.file_url });
    }
  }

  console.log(`[rehost-images-targeted] done company=${companyId} processed=${results.length} rehosted=${rehosted} skipped=${skipped} failed=${failed} service_role=${isServiceRole}`);

  return json({
    processed: results.length,
    rehosted,
    skipped,
    failed,
    results,
  });
});
