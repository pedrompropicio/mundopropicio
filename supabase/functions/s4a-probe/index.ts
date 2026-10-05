// s4a-probe (D-ERP135) — sonda da cadeia S4A: um GET a meta/latest-date.
// verify_jwt=true; service_role ou admin/platform_admin da empresa do artista.
// Não grava dados de negócio nem sync_runs. Nunca devolve tokens.

import { adminClient, corsHeaders, json } from "../_shared/artist-meta.ts";
import { authorizeArtistAdmin, getS4aAccessToken, S4aError } from "../_shared/s4a.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const body = await req.json().catch(() => null);
  const artistId = body?.artist_id;
  if (typeof artistId !== "string" || !UUID_RE.test(artistId)) return json({ ok: false, error: "artist_id inválido" }, 400);

  const admin = adminClient();
  const auth = await authorizeArtistAdmin(req, admin, artistId, true);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  let tok;
  try {
    tok = await getS4aAccessToken(admin, artistId);
  } catch (e) {
    const code = e instanceof S4aError ? e.code : "erro";
    return json({ ok: false, error: code }, 409);
  }

  // D-ERP172: modo sonda de caminhos (só GET a generic.wg.spotify.com; nada gravado).
  if (Array.isArray(body?.paths)) {
    const { data: ch } = await admin.from("artist_channels").select("external_id")
      .eq("artist_id", artistId).eq("platform", "spotify").limit(1).maybeSingle();
    const ext = ch?.external_id ?? "";
    const out: unknown[] = [];
    for (const p of body.paths.slice(0, 40)) {
      if (typeof p !== "string" || !p.startsWith("/")) continue;
      const url = `https://generic.wg.spotify.com${p.replaceAll("{artist}", ext)}`;
      let st = 0; let txt = "";
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${tok.accessToken}`, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
        st = r.status; txt = await r.text();
      } catch (_e) { /* */ }
      out.push({ path: p, status: st, body: txt.slice(0, body?.full ? 60000 : 600) });
      await new Promise((r) => setTimeout(r, 250));
    }
    return json({ ok: true, artist_ext: ext, resultados: out });
  }

  let status = 0;
  let latest: unknown = null;
  try {
    const res = await fetch("https://generic.wg.spotify.com/s4x-insights-api/v1/meta/latest-date", {
      headers: { Authorization: `Bearer ${tok.accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    status = res.status;
    const j = await res.json().catch(() => null);
    latest = j?.latestDate ?? j?.latest_date ?? j?.date ?? null;
  } catch (_e) { /* status 0 */ }

  return json({
    ok: status === 200,
    status_http: status,
    ...(latest ? { latest_date: latest } : {}),
    token_rodado: tok.rotated,
    expires_at: tok.expiresAt,
  });
});
