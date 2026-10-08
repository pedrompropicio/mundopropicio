// TEMP D-ERP187 adenda 2 — recupera a ligação cca45b10 pelo caminho page_direct. Apagar após uso.
import { adminClient, auditLog, authorize, callerCompanyIds, corsHeaders, graphGet, json } from "../_shared/artist-meta.ts";

const CONN = "cca45b10-67d4-402b-9615-3d4545d79216";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = adminClient();
  const caller = await authorize(req, admin, ["admin", "platform_admin", "manager", "editor"]);
  if (!caller.allowed || caller.isServiceRole) return json({ error: "not authorized" }, 403);
  const { data: conn } = await admin.from("artist_channel_connections")
    .select("id, company_id, artist_id, artist_channel_id, provider, access_token_encrypted, scopes, expires_at, connected_by")
    .eq("id", CONN).maybeSingle();
  if (!conn || conn.provider !== "meta") return json({ error: "ligação inválida" }, 404);
  const comps = await callerCompanyIds(admin, caller.userId!);
  if (comps !== "all" && !comps.includes(conn.company_id)) return json({ error: "fora da empresa" }, 403);

  const { data: ch } = await admin.from("artist_channels").select("id, external_id, platform").eq("id", conn.artist_channel_id).maybeSingle();
  const { data: ig } = await admin.from("artist_channel_connections").select("external_account_id")
    .eq("artist_id", conn.artist_id).eq("provider", "instagram").not("external_account_id", "is", null)
    .order("connected_at", { ascending: false }).limit(1).maybeSingle();
  const wantedIg = String(ig?.external_account_id ?? "");
  if (!ch?.external_id || !/^\d+$/.test(ch.external_id) || !wantedIg) return json({ error: "sem external_id/IG" }, 400);

  const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY")!;
  const openpgp = await import("https://esm.sh/openpgp@5.11.2/dist/openpgp.mjs");
  const bin = Uint8Array.from(atob(conn.access_token_encrypted), (c) => c.charCodeAt(0));
  const msg = await openpgp.readMessage({ binaryMessage: bin });
  const { data: dec } = await openpgp.decrypt({ message: msg, passwords: [masterKey], format: "binary" });
  const userToken = new TextDecoder().decode(dec as Uint8Array);

  const direct = await graphGet(ch.external_id, { fields: "id,name,access_token,instagram_business_account{id,username}" }, userToken);
  const p = direct.body;
  if (!direct.ok || String(p?.instagram_business_account?.id ?? "") !== wantedIg) {
    return json({ error: "page_direct sem correspondência", status: direct.status, ig: p?.instagram_business_account ?? null, err: p?.error?.message ?? null }, 400);
  }
  const usePage = !!p.access_token;
  const { data: id, error } = await admin.rpc("artist_upsert_channel_connection", {
    p_artist_channel_id: conn.artist_channel_id, p_company_id: conn.company_id, p_artist_id: conn.artist_id,
    p_provider: "meta", p_access_token: usePage ? p.access_token : userToken, p_master_key: masterKey,
    p_external_account_id: wantedIg, p_external_account_username: p.instagram_business_account?.username ?? null,
    p_external_page_id: p.id, p_external_page_name: p.name ?? null,
    p_token_type: usePage ? "page" : "user", p_scopes: conn.scopes,
    p_expires_at: usePage ? null : conn.expires_at, p_connected_by: conn.connected_by,
  });
  if (error) return json({ error: error.message }, 500);
  await admin.from("artist_channels").update({ auth_status: "authorized" }).eq("id", conn.artist_channel_id);
  await auditLog(admin, {
    entity_type: "artist_channel", entity_id: conn.artist_channel_id, action: "meta_channel_oauth_recovered",
    changed_by: caller.userId!, company_id: conn.company_id,
    metadata: { connection_id: id, path: "page_direct", page_id: p.id, page_name: p.name ?? null, token_type: usePage ? "page" : "user", instagram_user_id: wantedIg },
  });
  return json({ ok: true, connection_id: id, path: "page_direct", page_id: p.id, page_name: p.name, ig: p.instagram_business_account, token_type: usePage ? "page" : "user" });
});
