// crm-tiktok-probe — D-ERP177 adenda. Prova de leitura (só GET) da TikTok
// Marketing API com o token OAuth da ligação. Nunca imprime nem devolve o token.
// verify_jwt = true; ADS_ROLES ou service_role.

import { adminClient, authorize, corsHeaders, json } from "../_shared/artist-meta.ts";
import { ADS_ROLES } from "../_shared/artist-ads.ts";
import { loadTikTokConnection, tiktokGET, tiktokHost } from "../_shared/tiktok-ads.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = adminClient();
  const caller = await authorize(req, admin, ADS_ROLES);
  if (!caller.allowed) return json({ error: caller.reason ?? "not authorized" }, 403);
  const body = await req.json().catch(() => ({}));
  const connectionId = String(body?.connection_id ?? "");
  const host = tiktokHost();
  if (!host) return json({ error: "secret TIKTOK_API_HOST em falta" }, 500);
  const conn = await loadTikTokConnection(admin as any, {
    connectionId, masterKey: Deno.env.get("ENCRYPTION_MASTER_KEY")!, exigirToken: true,
  });
  if (!conn.ok) return json(conn, conn.status);
  const adv = String(body?.advertiser_id ?? conn.advertiserId);
  const tok = conn.accessToken!;
  const info = await tiktokGET<any>(host, "advertiser/info/", {
    advertiser_ids: JSON.stringify([adv]), fields: JSON.stringify(["name", "currency", "timezone", "display_timezone", "status"]),
  }, tok);
  const camps = await tiktokGET<any>(host, "campaign/get/", { advertiser_id: adv, page_size: "10" }, tok);
  const i = info.ok ? (info.data?.list ?? [])[0] ?? null : null;
  return json({
    connection_id: conn.connectionId, advertiser_id: adv,
    advertiser_info: info.ok ? { name: i?.name, currency: i?.currency, timezone: i?.timezone ?? i?.display_timezone, status: i?.status } : { erro: (info as any).message, code: (info as any).code },
    campanhas: camps.ok ? { total: camps.data?.page_info?.total_number ?? null, nesta_pagina: (camps.data?.list ?? []).length, nomes: (camps.data?.list ?? []).map((c: any) => `${c.campaign_name} [${c.operation_status ?? c.secondary_status ?? ""}]`) } : { erro: (camps as any).message, code: (camps as any).code },
  });
});
