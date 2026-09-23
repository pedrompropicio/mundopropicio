// soundcharts-audience-probe — sonda de leitura (estudo de mercado).
// Só leitura: NÃO grava nada na base (nem sync_runs). Só devolve o JSON cru.
// Autorização: apenas service_role.
//
// POST {
//   artists: [{ name: string, uuid: string | null }],
//   sections: ["report","located","spotify_cities"],
//   platforms: ["instagram","tiktok","youtube"]
// }

import {
  adminClient,
  authorize,
  corsHeaders,
  json,
  ScClient,
  SoundchartsHttpError,
} from "../_shared/soundcharts.ts";

const FUNCTION_NAME = "soundcharts-audience-probe";
const MAX_ARTISTS = 12;
const VALID_SECTIONS = new Set(["report", "located", "spotify_cities", "identifiers"]);

function errPayload(e: unknown): { status: number | null; detail: string } {
  if (e instanceof SoundchartsHttpError) return { status: e.status, detail: e.detail };
  const msg = e instanceof Error ? e.message : String(e);
  return { status: null, detail: msg.slice(0, 400) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = adminClient();

  try {
    const caller = await authorize(req, admin, []);
    if (!caller.allowed || !caller.isServiceRole) {
      return json({ error: "Forbidden" }, 403);
    }

    let payload: any = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const artistsIn = Array.isArray(payload?.artists) ? payload.artists : [];
    if (artistsIn.length === 0) return json({ error: "artists obrigatório" }, 400);
    if (artistsIn.length > MAX_ARTISTS) {
      return json({ error: `máximo ${MAX_ARTISTS} artistas por pedido` }, 400);
    }

    const sections: string[] = (Array.isArray(payload?.sections) ? payload.sections : [])
      .map((s: unknown) => String(s))
      .filter((s: string) => VALID_SECTIONS.has(s));
    const platforms: string[] = (Array.isArray(payload?.platforms) ? payload.platforms : [])
      .map((p: unknown) => String(p).trim().toLowerCase())
      .filter(Boolean);

    let searchLimit = 3;
    const rawLimit = Number(payload?.search_limit);
    if (Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 20) {
      searchLimit = rawLimit;
    }

    const client = await ScClient.create();
    const results: any[] = [];

    for (const a of artistsIn) {
      const inputName = typeof a?.name === "string" ? a.name.trim() : "";
      let uuid: string | null = typeof a?.uuid === "string" && a.uuid.trim()
        ? a.uuid.trim()
        : null;
      let candidates: any[] | undefined;

      const out: any = { input_name: inputName, uuid: null };

      // Resolução do UUID por nome (primeiro resultado; devolve 3 candidatos).
      if (!uuid && inputName) {
        try {
          const body = await client.get(
            `/api/v2/artist/search/${encodeURIComponent(inputName)}?offset=0&limit=${searchLimit}`,
          );
          const items = Array.isArray(body?.items) ? body.items : [];
          candidates = items.slice(0, searchLimit).map((r: any) => ({
            uuid: r?.uuid ?? null,
            name: r?.name ?? null,
            countryCode: r?.countryCode ?? r?.country?.code ?? null,
          }));
          uuid = candidates[0]?.uuid ?? null;
        } catch (e) {
          out.search = { error: errPayload(e) };
        }
      }

      out.uuid = uuid;
      if (candidates) out.candidates = candidates;

      if (!uuid) {
        out.note = "uuid não resolvido — secções ignoradas";
        results.push(out);
        continue;
      }

      if (sections.includes("report")) {
        out.report = {};
        for (const platform of platforms) {
          try {
            out.report[platform] = await client.get(
              `/api/v2/artist/${uuid}/audience/${platform}/report/latest`,
            );
          } catch (e) {
            out.report[platform] = { error: errPayload(e) };
          }
        }
      }

      if (sections.includes("located")) {
        out.located = {};
        for (const platform of platforms) {
          try {
            out.located[platform] = await client.get(
              `/api/v2.37/artist/${uuid}/social/${platform}/followers/`,
            );
          } catch (e) {
            out.located[platform] = { error: errPayload(e) };
          }
        }
      }

      if (sections.includes("identifiers")) {
        try {
          out.identifiers = await client.get(
            `/api/v2.9/artist/${uuid}/identifiers?offset=0&limit=100`,
          );
        } catch (e) {
          out.identifiers = { error: errPayload(e) };
        }
      }

      if (sections.includes("spotify_cities")) {
        try {
          out.spotify_cities = await client.get(
            `/api/v2/artist/${uuid}/streaming/spotify`,
          );
        } catch (e) {
          out.spotify_cities = { error: errPayload(e) };
        }
      }

      results.push(out);
    }

    return json({ api_calls: client.calls, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${FUNCTION_NAME}]`, msg);
    return json({ error: msg }, 500);
  }
});
