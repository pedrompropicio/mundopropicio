// crm-meta-peek-video-ids — READ-ONLY
// POST { company_id, meta_creative_ids: string[] }
// Para cada meta_creative_id: GET ao Graph (v21.0) para obter video_id e o seu status.
// NUNCA escreve no DB nem no Meta. Espelha auth/token do crm-meta-publish-execute.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v21.0";
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

async function graphGET(path: string, accessToken: string): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !j?.error, status: r.status, data: j };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { company_id?: string; meta_creative_ids?: string[] };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const companyId = body.company_id;
  const ids = Array.isArray(body.meta_creative_ids) ? body.meta_creative_ids.filter((x) => typeof x === "string" && x) : [];
  if (!companyId || ids.length === 0) {
    return json({ error: "missing_params", required: ["company_id", "meta_creative_ids[]"] }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Conexão Meta ativa (mesmo padrão do publish-execute)
  const { data: linkRow, error: linkErr } = await (admin as any)
    .schema("crm").from("ad_platform_account_links")
    .select("connection_id, ad_account_id, is_primary, enabled")
    .eq("enabled", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (linkErr) return json({ error: "ad_account_query_failed", detail: linkErr.message }, 500);
  if (!linkRow) return json({ error: "no_active_meta_connection" }, 412);

  const connectionId = linkRow.connection_id as string;

  const { data: tokenRows, error: tokenErr } = await admin.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "decrypt_failed", detail: tokenErr?.message ?? null }, 500);
  }
  const accessToken = (tokenRows[0] as { access_token: string }).access_token;

  const resultados: Array<{
    meta_creative_id: string;
    video_id: string | null;
    video_status: string | null;
    erro: string | null;
  }> = [];

  for (const cid of ids) {
    try {
      const r1 = await graphGET(
        `/${cid}?fields=${encodeURIComponent("object_story_spec{video_data{video_id}},video_id")}`,
        accessToken,
      );
      if (!r1.ok) {
        resultados.push({
          meta_creative_id: cid, video_id: null, video_status: null,
          erro: `creative_get_failed: ${r1.status} ${JSON.stringify(r1.data?.error ?? r1.data).slice(0, 300)}`,
        });
        continue;
      }
      const vid: string | null =
        r1.data?.object_story_spec?.video_data?.video_id ??
        r1.data?.video_id ?? null;

      if (!vid) {
        resultados.push({
          meta_creative_id: cid, video_id: null, video_status: null,
          erro: `no_video_id_in_creative: keys=${Object.keys(r1.data ?? {}).join(",")}`,
        });
        continue;
      }

      let video_status: string | null = null;
      let erro: string | null = null;
      try {
        const r2 = await graphGET(`/${vid}?fields=status`, accessToken);
        if (r2.ok) {
          const s = r2.data?.status;
          video_status = typeof s === "string" ? s : (s?.video_status ?? s?.status ?? JSON.stringify(s).slice(0, 80));
        } else {
          erro = `status_get_failed: ${r2.status} ${JSON.stringify(r2.data?.error ?? r2.data).slice(0, 200)}`;
        }
      } catch (e: any) {
        erro = `status_exception: ${e?.message ?? String(e)}`;
      }

      resultados.push({ meta_creative_id: cid, video_id: vid, video_status, erro });
    } catch (e: any) {
      resultados.push({
        meta_creative_id: cid, video_id: null, video_status: null,
        erro: `exception: ${e?.message ?? String(e)}`,
      });
    }
  }

  return json({ ok: true, count: resultados.length, resultados });
});
