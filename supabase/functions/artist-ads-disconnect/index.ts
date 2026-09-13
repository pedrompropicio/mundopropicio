// artist-ads-disconnect — desliga uma ligação de tráfego do artista: marca
// disconnected_at, status 'revoked' e apaga o token guardado. D-ERP57.
// JWT obrigatório; papéis ADS_ROLES.

import {
  adminClient,
  auditLog,
  authorize,
  corsHeaders,
  json,
} from "../_shared/artist-meta.ts";
import {
  ADS_ROLES,
  artistInCallerScope,
  loadAdsConnection,
} from "../_shared/artist-ads.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = adminClient();
  const caller = await authorize(req, admin, ADS_ROLES);
  if (!caller.allowed) return json({ error: caller.reason ?? "not authorized" }, 403);

  let body: { connection_id?: string };
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: "body inválido" }, 400);
  }
  const connectionId = (body.connection_id ?? "").trim();
  if (!connectionId) return json({ error: "connection_id obrigatório" }, 400);

  const { data: conn, error: cErr } = await loadAdsConnection(admin, connectionId);
  if (cErr) return json({ error: cErr.message }, 500);
  if (!conn) return json({ error: "ligação não encontrada" }, 404);
  if (!conn.artist_id) return json({ error: "ligação não é de artista" }, 400);

  const scope = await artistInCallerScope(admin, conn.artist_id, caller);
  if (!scope.ok) return json({ error: scope.error }, scope.status);

  const { error: upErr } = await (admin as any)
    .schema("crm")
    .from("ad_platform_connections")
    .update({
      status: "revoked",
      disconnected_at: new Date().toISOString(),
      access_token_encrypted: null,
      token_type: null,
      expires_at: null,
      last_error: null,
    })
    .eq("id", connectionId);

  if (upErr) return json({ error: upErr.message }, 500);

  await auditLog(admin, {
    entity_type: "artist",
    entity_id: conn.artist_id,
    action: "artist_ads_disconnected",
    changed_by: caller.userId ?? "service_role",
    company_id: conn.company_id,
    metadata: { platform: conn.platform, connection_id: connectionId },
  });

  return json({ ok: true, connection_id: connectionId, status: "revoked" });
});
