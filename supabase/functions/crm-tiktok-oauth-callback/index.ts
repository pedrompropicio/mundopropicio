// crm-tiktok-oauth-callback — D-ERP177. Retorno do OAuth da TikTok Marketing API.
// Público (verify_jwt = false): a autorização é o state de uso único.
// Troca auth_code por access_token, guarda-o cifrado (pgp_sym, mesma cifra do Meta)
// e redirecciona para as ligações do ERP com ?tiktok=ok|erro.
// Nunca regista nem devolve tokens ou secrets.

import { createClient } from "npm:@supabase/supabase-js@2";

const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://www.mpgestaoeventos.com";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Ligação TikTok BR do Litto: tem de autorizar este advertiser.
const EXPECTED_ADVERTISER: Record<string, string> = {
  "947ee0c7-60a4-49f6-9882-561237c3483a": "7689229625189138438",
};

function back(status: "ok" | "erro", reason?: string) {
  const u = new URL("/audience/connections", APP_BASE_URL);
  u.searchParams.set("tiktok", status);
  if (reason) u.searchParams.set("reason", reason.slice(0, 120));
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}
function page(msg: string, status = 400) {
  const esc = msg.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Ligação TikTok</title><body style="font-family:sans-serif;padding:2rem"><h1>Ligação TikTok falhou</h1><p>${esc}</p><p><a href="${APP_BASE_URL}/audience/connections?tiktok=erro">Voltar às ligações</a></p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const authCode = url.searchParams.get("auth_code") ?? url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";

  const missing = ["TIKTOK_BUSINESS_APP_ID", "TIKTOK_BUSINESS_APP_SECRET", "TIKTOK_API_HOST", "ENCRYPTION_MASTER_KEY"]
    .filter((k) => !(Deno.env.get(k) ?? "").trim());
  if (missing.length) return page(`secret ${missing.join(", ")} em falta`, 500);

  if (!UUID_RE.test(state)) return page("state inválido ou expirado");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows, error: cErr } = await admin.rpc("crm_tiktok_consume_oauth_state", { p_state_id: state });
  const st = Array.isArray(rows) ? rows[0] : rows;
  if (cErr || !st?.valid || !st.connection_id) return page("state inválido ou expirado");
  const connectionId = String(st.connection_id);

  const crm = (admin as any).schema("crm").from("ad_platform_connections");
  const fail = async (reason: string) => {
    await crm.update({ status: "error", last_error: `oauth: ${reason}`.slice(0, 500) }).eq("id", connectionId);
    return back("erro", reason);
  };

  if (!authCode) return await fail(url.searchParams.get("error_description") ?? "auth_code ausente");

  let host = Deno.env.get("TIKTOK_API_HOST")!.trim();
  if (!host.endsWith("/")) host += "/";
  let j: any = null;
  try {
    const r = await fetch(`${host}oauth2/access_token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: Deno.env.get("TIKTOK_BUSINESS_APP_ID")!.trim(),
        secret: Deno.env.get("TIKTOK_BUSINESS_APP_SECRET")!.trim(),
        auth_code: authCode,
      }),
    });
    j = await r.json().catch(() => null);
  } catch (e) {
    return await fail(`falha de rede: ${String(e).slice(0, 80)}`);
  }
  if (!j || Number(j.code ?? -1) !== 0 || !j.data?.access_token) {
    return await fail(`TikTok code ${j?.code ?? "?"}: ${String(j?.message ?? "sem resposta")}`);
  }

  const advertiserIds: string[] = (j.data.advertiser_ids ?? []).map((x: unknown) => String(x));
  const expected = EXPECTED_ADVERTISER[connectionId];
  if (expected && !advertiserIds.includes(expected)) {
    return await fail(`a autorização não inclui o advertiser ${expected}`);
  }

  const { error: sErr } = await admin.rpc("crm_tiktok_store_token", {
    p_connection_id: connectionId,
    p_access_token: String(j.data.access_token),
    p_master_key: Deno.env.get("ENCRYPTION_MASTER_KEY")!,
    p_oauth_meta: { scope: j.data.scope ?? null, advertiser_ids: advertiserIds, authorized_at: new Date().toISOString() },
    p_user_id: st.user_id ?? null,
  });
  if (sErr) return await fail(`gravação falhou: ${sErr.message}`);

  console.log("[crm-tiktok-oauth-callback] ok", JSON.stringify({ connection_id: connectionId, advertisers: advertiserIds.length }));
  return back("ok");
});
