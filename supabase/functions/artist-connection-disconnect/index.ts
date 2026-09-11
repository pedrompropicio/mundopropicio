// artist-connection-disconnect — desliga a ligação oficial de um canal de
// artista: apaga a ligação (e o token cifrado) e marca o canal como revogado.
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
    action: "instagram_disconnected",
    changed_by: caller.userId ?? "service_role",
    company_id: channel.company_id,
    metadata: { connection_deleted: deleted === true, handle: channel.handle },
  });

  return json({ ok: true, channel_id: channel.id, connection_deleted: deleted === true });
});
