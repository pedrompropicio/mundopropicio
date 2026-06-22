console.log("[diag-image-resolution] BUILD_VERSION=diag-v1");

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FIELDS_FULL = "hash,name,width,height,url,permalink_url,url_128,original_width,original_height";
const FIELDS_FALLBACK = "hash,name,width,height,url,permalink_url";

async function headSize(url: string): Promise<{ size: number | null; type: string | null; method: string }> {
  if (!url) return { size: null, type: null, method: "none" };
  try {
    const h = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (h.ok) {
      const len = h.headers.get("content-length");
      return {
        size: len ? Number(len) : null,
        type: h.headers.get("content-type"),
        method: "HEAD",
      };
    }
  } catch (_) { /* fall through */ }
  try {
    const r = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, redirect: "follow" });
    const cr = r.headers.get("content-range"); // "bytes 0-0/12345"
    let size: number | null = null;
    if (cr) {
      const m = cr.match(/\/(\d+)$/);
      if (m) size = Number(m[1]);
    }
    if (size == null) {
      const len = r.headers.get("content-length");
      if (len && r.status === 200) size = Number(len);
    }
    try { await r.body?.cancel(); } catch (_) { /* */ }
    return { size, type: r.headers.get("content-type"), method: "GET-range" };
  } catch (e) {
    return { size: null, type: null, method: `error:${(e as Error).message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY");

    if (!ENCRYPTION_MASTER_KEY) {
      return new Response(JSON.stringify({ error: "ENCRYPTION_MASTER_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { connection_id, ad_account_id, image_hashes } = body ?? {};
    if (!connection_id || !ad_account_id || !Array.isArray(image_hashes) || image_hashes.length === 0) {
      return new Response(JSON.stringify({ error: "connection_id, ad_account_id, image_hashes[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: decrypted, error: decErr } = await admin.rpc("crm_get_meta_decrypted_token", {
      p_connection_id: connection_id,
      p_master_key: ENCRYPTION_MASTER_KEY,
    });
    if (decErr || !decrypted) {
      return new Response(JSON.stringify({ error: "decrypt failed", detail: decErr?.message ?? null, decrypted }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const row = Array.isArray(decrypted) ? decrypted[0] : decrypted;
    const accessToken = row?.access_token;
    const company_id = row?.company_id;
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "no access_token from RPC", row }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adAcct = String(ad_account_id).startsWith("act_") ? ad_account_id : `act_${ad_account_id}`;
    const hashesParam = encodeURIComponent(JSON.stringify(image_hashes));

    async function callGraph(fields: string) {
      const url = `https://graph.facebook.com/v18.0/${adAcct}/adimages?hashes=${hashesParam}&fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;
      const r = await fetch(url);
      const text = await r.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch (_) { /* */ }
      return { ok: r.ok && !json?.error, status: r.status, json, text };
    }

    let fields_used = FIELDS_FULL;
    let graph = await callGraph(FIELDS_FULL);
    if (!graph.ok) {
      const fallback = await callGraph(FIELDS_FALLBACK);
      if (fallback.ok) {
        graph = fallback;
        fields_used = FIELDS_FALLBACK;
      } else {
        return new Response(JSON.stringify({
          error: "graph call failed for both field sets",
          full_attempt: { status: graph.status, body: graph.json ?? graph.text },
          fallback_attempt: { status: fallback.status, body: fallback.json ?? fallback.text },
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const data: any[] = graph.json?.data ?? [];
    const out = await Promise.all(data.map(async (img: any) => {
      const [u, p] = await Promise.all([
        headSize(img.url),
        headSize(img.permalink_url),
      ]);
      return {
        hash: img.hash,
        name: img.name,
        width: img.width,
        height: img.height,
        original_width: img.original_width ?? null,
        original_height: img.original_height ?? null,
        url: img.url,
        permalink_url: img.permalink_url,
        url_byte_size: u.size,
        url_content_type: u.type,
        url_probe_method: u.method,
        permalink_byte_size: p.size,
        permalink_content_type: p.type,
        permalink_probe_method: p.method,
        campos_usados: fields_used,
      };
    }));

    return new Response(JSON.stringify({
      ok: true,
      company_id,
      ad_account_id: adAcct,
      fields_used,
      requested_hashes: image_hashes,
      returned_count: out.length,
      results: out,
      raw_graph_meta: { status: graph.status, has_paging: !!graph.json?.paging },
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, stack: (e as Error).stack }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
