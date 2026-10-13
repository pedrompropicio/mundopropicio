// artist-ads-balance-probe (D-ERP267, fase de sonda) — só service_role, só leitura.
// Faz GETs (TikTok/Meta) ou consultas GAQL (Google) com o token da ligação do
// artista e devolve status + corpo. Nunca devolve tokens. Não grava nada.
import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";
import { tiktokHost } from "../_shared/tiktok-ads.ts";
import { getGoogleAdsAccessToken, googleAdsSearch, type GoogleAdsCtx } from "../_shared/google-ads.ts";

const MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY") ?? "";
const GRAPH = "https://graph.facebook.com/v25.0";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!isServiceRoleRequest(req)) return json({ error: "service_role_only" }, 403);
  const body = await req.json().catch(() => null);
  const connId = body?.connection_id;
  const calls: any[] = Array.isArray(body?.calls) ? body.calls.slice(0, 12) : [];
  if (typeof connId !== "string" || calls.length === 0) return json({ error: "connection_id + calls" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: conn } = await (admin as any).schema("crm").from("ad_platform_connections")
    .select("id, platform, selected_ad_account_id, login_customer_id, connection_scope").eq("id", connId).maybeSingle();
  if (!conn || conn.connection_scope !== "artist") return json({ error: "ligacao_nao_encontrada" }, 404);

  let token = "";
  if (conn.platform === "meta" || conn.platform === "tiktok") {
    const rpc = conn.platform === "meta" ? "crm_get_meta_decrypted_token" : "crm_get_tiktok_decrypted_token";
    const { data: rows } = await (admin as any).rpc(rpc, { p_connection_id: connId, p_master_key: MASTER_KEY });
    token = Array.isArray(rows) && rows[0]?.access_token ? String(rows[0].access_token) : "";
    if (!token) return json({ error: "token_indecifravel" }, 422);
  }
  const scrub = (t: string) => (token ? t.split(token).join("***") : t);

  const out: unknown[] = [];
  for (const c of calls) {
    try {
      if (conn.platform === "tiktok") {
        const host = tiktokHost() ?? "https://business-api.tiktok.com/open_api/v1.3/";
        const qs = new URLSearchParams(Object.fromEntries(Object.entries(c.params ?? {}).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]))).toString();
        const r = await fetch(`${host}${String(c.path).replace(/^\//, "")}?${qs}`, { headers: { "Access-Token": token } });
        out.push({ path: c.path, params: c.params, status: r.status, body: JSON.parse(scrub(await r.text()) || "null") });
      } else if (conn.platform === "meta") {
        const u = new URL(`${GRAPH}/${String(c.path).replace(/^\//, "")}`);
        for (const [k, v] of Object.entries(c.params ?? {})) u.searchParams.set(k, String(v));
        u.searchParams.set("access_token", token);
        const r = await fetch(u);
        out.push({ path: c.path, params: c.params, status: r.status, body: JSON.parse(scrub(await r.text()) || "null") });
      } else if (conn.platform === "google") {
        const ctx: GoogleAdsCtx = {
          accessToken: await getGoogleAdsAccessToken(),
          developerToken: Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "",
          loginCustomerId: String(conn.login_customer_id || Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") || "").replace(/-/g, ""),
          customerId: String(conn.selected_ad_account_id ?? "").replace(/-/g, ""),
        };
        const rows = await googleAdsSearch(ctx, String(c.query));
        out.push({ query: c.query, status: 200, rows });
      }
    } catch (e) {
      out.push({ call: c, status: 0, error: scrub(String(e)).slice(0, 800) });
    }
  }
  return json({ ok: true, platform: conn.platform, account: conn.selected_ad_account_id, resultados: out });
});
