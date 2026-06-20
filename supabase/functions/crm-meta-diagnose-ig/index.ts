// TEMP diagnostic: inspects Graph API for a given Meta connection.
// POST { connection_id, page_id? } → reports /me/accounts, page node (IG fields),
// connected_instagram_account, and /debug_token (scopes only). Redacts tokens.
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function redact(obj: any): any {
  if (obj == null) return obj;
  if (typeof obj === "string") {
    // redact any long token-looking string
    if (obj.length > 30 && /^[A-Za-z0-9_\-]+$/.test(obj)) return "***REDACTED***";
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(redact);
  if (typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (/token|secret|signature/i.test(k)) out[k] = typeof v === "string" ? "***REDACTED***" : redact(v);
      else out[k] = redact(v);
    }
    return out;
  }
  return obj;
}

async function call(url: URL) {
  try {
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok, body: redact(j) };
  } catch (e) {
    return { status: 0, ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "missing_authorization" }, 401);

  let body: { connection_id?: string; page_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { connection_id, page_id } = body;
  if (!connection_id) return json({ error: "missing_connection_id" }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connection_id, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const accessToken = (tokenRows[0] as any).access_token as string;

  const pid = page_id ?? "106895597787";

  // a) /me/accounts
  const ua = new URL(`https://graph.facebook.com/${GRAPH}/me/accounts`);
  ua.searchParams.set("fields", "id,name,instagram_business_account{id,username}");
  ua.searchParams.set("limit", "200");
  ua.searchParams.set("access_token", accessToken);
  const a = await call(ua);

  // b) /{page_id}?fields=...instagram_business_account
  const ub = new URL(`https://graph.facebook.com/${GRAPH}/${pid}`);
  ub.searchParams.set("fields", "id,name,instagram_business_account{id,username}");
  ub.searchParams.set("access_token", accessToken);
  const b = await call(ub);

  // c) /{page_id}?fields=connected_instagram_account
  const uc = new URL(`https://graph.facebook.com/${GRAPH}/${pid}`);
  uc.searchParams.set("fields", "id,name,connected_instagram_account{id,username}");
  uc.searchParams.set("access_token", accessToken);
  const c = await call(uc);

  // d) /debug_token — needs app token; try with user token (Meta accepts user token as access_token too)
  const ud = new URL(`https://graph.facebook.com/${GRAPH}/debug_token`);
  ud.searchParams.set("input_token", accessToken);
  ud.searchParams.set("access_token", accessToken);
  const d = await call(ud);

  // Summary
  const pageInAccounts = Array.isArray((a.body as any)?.data)
    ? (a.body as any).data.find((p: any) => p.id === pid)
    : null;
  const scopes = (d.body as any)?.data?.scopes ?? null;
  const requiredScopes = ["instagram_basic", "pages_show_list", "pages_read_engagement", "business_management"];
  const scopeReport = scopes
    ? Object.fromEntries(requiredScopes.map((s) => [s, scopes.includes(s)]))
    : null;

  return json({
    connection_id,
    page_id: pid,
    a_me_accounts: a,
    b_page_node_ig_business: b,
    c_page_node_connected_ig: c,
    d_debug_token: d,
    summary: {
      page_in_me_accounts: !!pageInAccounts,
      page_in_me_accounts_has_ig: !!pageInAccounts?.instagram_business_account,
      page_node_instagram_business_account: (b.body as any)?.instagram_business_account ?? null,
      page_node_connected_instagram_account: (c.body as any)?.connected_instagram_account ?? null,
      token_type: (d.body as any)?.data?.type ?? null,
      token_app_id: (d.body as any)?.data?.app_id ?? null,
      token_is_valid: (d.body as any)?.data?.is_valid ?? null,
      token_scopes_all: scopes,
      token_scopes_required_check: scopeReport,
    },
  });
});
