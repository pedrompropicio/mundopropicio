// artist-connection-disconnect — desliga a ligação oficial de um canal de
// artista: apaga a ligação (e o token cifrado) e marca o canal como revogado.
//
// No TikTok revoga primeiro o token na plataforma (/v2/oauth/revoke/); uma
// revogação falhada NÃO impede o desligar do nosso lado.
//
// JWT obrigatório. Papéis: admin, platform_admin, manager, editor.

import {
  adminClient,
  auditLog,
  authorize,
  callerCompanyIds,
  corsHeaders,
  json,
} from "../_shared/artist-meta.ts";
import { tiktokCreds, ttRevoke } from "../_shared/artist-tiktok.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = adminClient();
  const caller = await authorize(req, admin, [
    "admin",
    "platform_admin",
    "manager",
    "editor",
  ]);
  if (!caller.allowed) return json({ error: caller.reason ?? "not authorized" }, 403);

  let body: { artist_channel_id?: string };
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: "body inválido" }, 400);
  }
  const channelId = (body.artist_channel_id ?? "").trim();
  if (!channelId) return json({ error: "artist_channel_id obrigatório" }, 400);

  const { data: channel } = await admin
    .from("artist_channels")
    .select("id, company_id, artist_id, platform, handle")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel) return json({ error: "canal não encontrado" }, 404);

  if (!caller.isServiceRole) {
    const companies = await callerCompanyIds(admin, caller.userId!);
    if (companies !== "all" && !companies.includes(channel.company_id)) {
      return json({ error: "canal fora da empresa do utilizador" }, 403);
    }
  }

  // TikTok: revogar na plataforma ANTES de apagar o token do nosso lado.
  // Falha de revogação é registada mas não impede o desligar.
  let revoke: { attempted: boolean; ok: boolean; error?: string } = {
    attempted: false,
    ok: false,
  };
  const { data: connection } = await admin
    .from("artist_channel_connections")
    .select("id, provider")
    .eq("artist_channel_id", channel.id)
    .maybeSingle();

  if (connection?.provider === "tiktok") {
    revoke.attempted = true;
    const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY");
    const { creds, error: credErr } = tiktokCreds();
    if (!masterKey) {
      revoke.error = "ENCRYPTION_MASTER_KEY não configurada";
    } else if (credErr) {
      revoke.error = credErr;
    } else {
      const { data: tok, error: tErr } = await admin.rpc("artist_get_connection_token", {
        p_connection_id: connection.id,
        p_master_key: masterKey,
      });
      const t = Array.isArray(tok) ? tok[0] : tok;
      if (tErr || !t?.access_token) {
        revoke.error = tErr?.message ?? "token não disponível";
      } else {
        const r = await ttRevoke(creds!, t.access_token);
        revoke.ok = r.ok;
        if (!r.ok) revoke.error = r.error;
      }
    }
    if (!revoke.ok) console.error("revogação TikTok falhou:", revoke.error);
  }

  const { data: deleted, error: delErr } = await admin.rpc(
    "artist_delete_channel_connection",
    { p_artist_channel_id: channel.id },
  );
  if (delErr) return json({ error: delErr.message }, 500);

  const { error: updErr } = await admin
    .from("artist_channels")
    .update({ auth_status: "revoked" })
    .eq("id", channel.id);
  if (updErr) return json({ error: updErr.message }, 500);

  await auditLog(admin, {
    entity_type: "artist_channel",
    entity_id: channel.id,
    action: connection?.provider === "tiktok" ? "tiktok_disconnected" : "instagram_disconnected",
    changed_by: caller.userId ?? "service_role",
    company_id: channel.company_id,
    metadata: {
      connection_deleted: deleted === true,
      handle: channel.handle,
      provider: connection?.provider ?? null,
      platform_revoked: revoke.attempted ? revoke.ok : null,
      revoke_error: revoke.error ?? null,
    },
  });

  return json({
    ok: true,
    channel_id: channel.id,
    connection_deleted: deleted === true,
    platform_revoked: revoke.attempted ? revoke.ok : null,
    revoke_error: revoke.error ?? null,
  });
});
