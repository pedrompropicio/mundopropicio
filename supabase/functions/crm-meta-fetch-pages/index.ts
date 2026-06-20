// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-meta-fetch-pages
// POST { connection_id } → busca Pages do utilizador via Graph API,
// inclui Instagram Business Account associado a cada Page (quando existe).
// Retorna { pages: [{ id, name, picture_url, instagram_business_account: {id, username} | null }] }

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
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { connection_id?: string; page_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { connection_id, page_id: hintedPageId } = body;
  if (!connection_id) return json({ error: "missing_connection_id" }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connection_id, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken } = tokenRows[0] as { access_token: string };

  // Helper: resolve uma Page directamente pelo seu node. Útil para Pages dentro
  // de Business Manager/portfólio empresarial, que podem não aparecer em
  // /me/accounts ou aparecer sem instagram_business_account anexado.
  async function fetchPageNode(pageId: string): Promise<any | null> {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}`);
    u.searchParams.set("fields", "id,name,picture{url},instagram_business_account{id,username,profile_picture_url}");
    u.searchParams.set("access_token", accessToken);
    try {
      const rr = await fetch(u);
      const jj: any = await rr.json();
      if (!rr.ok || jj.error) {
        console.warn("[crm-meta-fetch-pages] page node fetch failed", pageId, jj?.error?.message);
        return null;
      }
      return jj;
    } catch (e) {
      console.warn("[crm-meta-fetch-pages] page node fetch threw", pageId, String(e));
      return null;
    }
  }

  function shapePage(p: any) {
    return {
      id: p.id,
      name: p.name,
      picture_url: p.picture?.data?.url ?? null,
      instagram_business_account: p.instagram_business_account
        ? {
            id: p.instagram_business_account.id,
            username: p.instagram_business_account.username,
            profile_picture_url: p.instagram_business_account.profile_picture_url ?? null,
          }
        : null,
    };
  }

  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts`);
  url.searchParams.set("fields", "id,name,picture{url},instagram_business_account{id,username,profile_picture_url}");
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", accessToken);

  let r: Response;
  try { r = await fetch(url); }
  catch (e) { return json({ error: "graph_fetch_failed", detail: String(e) }, 502); }
  const j: any = await r.json();
  if (!r.ok || j.error) {
    return json({ error: "graph_api_error", status: r.status, detail: j.error?.message }, 502);
  }

  const pagesById = new Map<string, any>();
  for (const p of (j.data ?? [])) {
    pagesById.set(p.id, shapePage(p));
  }

  // Se nos foi indicada uma page (tipicamente conn.selected_page_id), garante
  // que existe na resposta E que vem sempre resolvida via node directo — para
  // apanhar IG ligado por Business Manager que /me/accounts não devolve.
  if (hintedPageId) {
    const existing = pagesById.get(hintedPageId);
    if (!existing || !existing.instagram_business_account) {
      const node = await fetchPageNode(hintedPageId);
      if (node) pagesById.set(hintedPageId, shapePage(node));
    }
  }

  // Para qualquer outra Page sem IG, tenta resolver via node directo (em
  // paralelo, com tecto razoável para não estourar o Graph).
  const needsNode = Array.from(pagesById.values())
    .filter((p) => !p.instagram_business_account && p.id !== hintedPageId)
    .slice(0, 25);
  if (needsNode.length > 0) {
    const results = await Promise.all(needsNode.map((p) => fetchPageNode(p.id)));
    results.forEach((node, i) => {
      if (node) pagesById.set(needsNode[i].id, shapePage(node));
    });
  }

  return json({ pages: Array.from(pagesById.values()) });
});

