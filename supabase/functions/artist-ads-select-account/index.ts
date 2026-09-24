// artist-ads-select-account — escolhe a conta de anúncios de uma ligação de
// tráfego do artista, entre as que o Meta devolveu (available_ad_accounts).
// D-ERP57. JWT obrigatório; papéis ADS_ROLES.

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

  let body: { connection_id?: string; ad_account_id?: string };
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: "body inválido" }, 400);
  }
  const connectionId = (body.connection_id ?? "").trim();
  const adAccountId = (body.ad_account_id ?? "").trim();
  if (!connectionId) return json({ error: "connection_id obrigatório" }, 400);
  if (!adAccountId) return json({ error: "ad_account_id obrigatório" }, 400);

  const { data: conn, error: cErr } = await loadAdsConnection(admin, connectionId);
  if (cErr) return json({ error: cErr.message }, 500);
  if (!conn) return json({ error: "ligação não encontrada" }, 404);
  if (!conn.artist_id) return json({ error: "ligação não é de artista" }, 400);

  const scope = await artistInCallerScope(admin, conn.artist_id, caller);
  if (!scope.ok) return json({ error: scope.error }, scope.status);

  const options = (conn.available_ad_accounts ?? []) as Array<
    { id?: string; account_id?: string; name?: string; currency?: string }
  >;
  const chosen = options.find(
    (a) => a.id === adAccountId || a.account_id === adAccountId,
  );
  if (!chosen) {
    return json({ error: "conta não está entre as contas disponíveis" }, 400);
  }

  // D-ERP143: uma ligação por conta — recusar se outra ligação do mesmo
  // artista/plataforma já tem esta conta.
  const chosenId = chosen.id ?? chosen.account_id;
  const { data: dup } = await (admin as any)
    .schema("crm")
    .from("ad_platform_connections")
    .select("id")
    .eq("company_id", conn.company_id)
    .eq("artist_id", conn.artist_id)
    .eq("platform", conn.platform)
    .eq("selected_ad_account_id", chosenId)
    .neq("id", connectionId)
    .maybeSingle();
  if (dup) {
    return json({
      error: "esta conta já tem uma ligação própria para este artista",
      existing_connection_id: dup.id,
    }, 409);
  }

  const { error: upErr } = await (admin as any)
    .schema("crm")
    .from("ad_platform_connections")
    .update({
      selected_ad_account_id: chosen.id ?? chosen.account_id,
      selected_ad_account_name: chosen.name ?? null,
      selected_ad_account_currency: chosen.currency ?? null,
      status: "active",
      last_error: null,
    })
    .eq("id", connectionId);

  if (upErr) return json({ error: upErr.message }, 500);

  await auditLog(admin, {
    entity_type: "artist",
    entity_id: conn.artist_id,
    action: "artist_ads_account_selected",
    changed_by: caller.userId ?? "service_role",
    company_id: conn.company_id,
    metadata: {
      platform: conn.platform,
      connection_id: connectionId,
      ad_account_id: chosen.id ?? chosen.account_id,
    },
  });

  return json({
    ok: true,
    connection_id: connectionId,
    selected_ad_account_id: chosen.id ?? chosen.account_id,
    selected_ad_account_name: chosen.name ?? null,
    status: "active",
  });
});
