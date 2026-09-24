// artist-ads-meta-interest-search — pesquisa de interesses Meta para o
// construtor de planos de música (D-ERP95 adenda 24/09/2026).
// POST { connection_id, q } · verify_jwt=true · papéis de tráfego (ADS_ROLES)
// na empresa do artista por user_roles. Só leitura na Meta.
import { adminClient, corsHeaders, json } from "../_shared/artist-meta.ts";
import { ADS_ROLES, META_GRAPH_VERSION, artistMetaConnWithToken } from "../_shared/artist-ads.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: { connection_id?: string; q?: string };
  try { body = await req.json(); } catch (_e) { return json({ error: "body inválido" }, 400); }
  const q = String(body.q ?? "").trim();
  if (q.length < 2 || q.length > 100) return json({ error: "q entre 2 e 100 caracteres" }, 400);
  const admin = adminClient();
  const c = await artistMetaConnWithToken(admin, req, String(body.connection_id ?? ""), ADS_ROLES);
  if (!c.ok) return json({ error: c.error }, c.status);
  const u = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/search`);
  u.searchParams.set("type", "adinterest");
  u.searchParams.set("q", q);
  u.searchParams.set("locale", "pt_BR");
  u.searchParams.set("limit", "25");
  u.searchParams.set("access_token", c.token);
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(20_000) });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || j?.error) return json({ error: j?.error?.message ?? `Meta respondeu ${r.status}`, meta_code: j?.error?.code ?? null }, 502);
    const interests = ((j?.data ?? []) as any[]).map((i) => ({
      id: String(i.id), name: i.name,
      audience_size_lower_bound: i.audience_size_lower_bound ?? null,
      audience_size_upper_bound: i.audience_size_upper_bound ?? null,
      path: i.path ?? [],
    }));
    return json({ ok: true, q, interests });
  } catch (e) {
    return json({ error: `falha a contactar a Meta: ${(e as Error).message}` }, 502);
  }
});
