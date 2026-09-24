// artist-ads-meta-create-ig-engagement-audience — cria na conta de anúncios da
// ligação um público de envolvimento com a conta profissional do Instagram
// (D-ERP95 adenda 24/09/2026). ESCREVE NA META: só com OK do Pedro.
// POST { connection_id, ig_user_id, retention_days?=60, name }
// verify_jwt=true · só admin/platform_admin na empresa do artista.
// Formato (docs Engagement Custom Audiences): rule.inclusions com event_sources
// [{id, type:'ig_business'}], retention_seconds, filtro event = ig_business_profile_all,
// prefill=1. SEM subtype: desde 09/2018 a Meta não aceita subtype nos públicos
// de envolvimento (excepto vídeo).
import { adminClient, auditLog, corsHeaders, json } from "../_shared/artist-meta.ts";
import { META_GRAPH_VERSION, artistMetaConnWithToken } from "../_shared/artist-ads.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: { connection_id?: string; ig_user_id?: string; retention_days?: number; name?: string };
  try { body = await req.json(); } catch (_e) { return json({ error: "body inválido" }, 400); }
  const igId = String(body.ig_user_id ?? "").trim();
  if (!/^\d{5,30}$/.test(igId)) return json({ error: "ig_user_id inválido" }, 400);
  const days = body.retention_days == null ? 60 : Number(body.retention_days);
  if (!Number.isInteger(days) || days < 1 || days > 365) return json({ error: "retention_days entre 1 e 365" }, 400);
  const name = String(body.name ?? "").trim();
  if (name.length < 3 || name.length > 200) return json({ error: "name entre 3 e 200 caracteres" }, 400);

  const admin = adminClient();
  const c = await artistMetaConnWithToken(admin, req, String(body.connection_id ?? ""), ["admin"]);
  if (!c.ok) return json({ error: c.error }, c.status);
  const act = c.conn.selected_ad_account_id;
  if (!act) return json({ error: "a ligação não tem conta de anúncios escolhida" }, 400);

  const rule = {
    inclusions: {
      operator: "or",
      rules: [{
        event_sources: [{ id: igId, type: "ig_business" }],
        retention_seconds: days * 86400,
        filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: "ig_business_profile_all" }] },
      }],
    },
  };
  const form = new URLSearchParams({
    name,
    rule: JSON.stringify(rule),
    prefill: "1",
    access_token: c.token,
  });
  try {
    const r = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${act}/customaudiences`, {
      method: "POST", body: form, signal: AbortSignal.timeout(30_000),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || j?.error || !j?.id) {
      return json({ error: j?.error?.message ?? `Meta respondeu ${r.status}`, meta_code: j?.error?.code ?? null }, 502);
    }
    await auditLog(admin, {
      entity_type: "artist", entity_id: c.conn.artist_id, action: "artist_ads_meta_ig_audience_created",
      changed_by: c.userId ?? "service_role", company_id: c.conn.company_id,
      metadata: { connection_id: c.conn.id, ad_account_id: act, audience_id: j.id, ig_user_id: igId, retention_days: days, name },
    });
    return json({ ok: true, id: String(j.id), name });
  } catch (e) {
    return json({ error: `falha a contactar a Meta: ${(e as Error).message}` }, 502);
  }
});
