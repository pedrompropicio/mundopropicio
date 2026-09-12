// soundcharts-artist-similar — sugestões de artistas parecidos (Soundcharts).
//
// POST { artist_id: uuid }
// Lê o UUID Soundcharts em artist_channels (platform='aggregator') e chama
// GET /api/v2/artist/{uuid}/related. Devolve até 10, mesma estrutura da pesquisa.

import {
  adminClient,
  authorize,
  callerCompanyIds,
  corsHeaders,
  json,
  mapScArtist,
  markExisting,
  ScClient,
} from "../_shared/soundcharts.ts";
import {
  deduceTriggerSource,
  finishSyncRun,
  resolveStatus,
  startSyncRun,
} from "../_shared/sync-run.ts";

const FUNCTION_NAME = "soundcharts-artist-similar";
const ROLES = ["admin", "platform_admin", "manager", "editor"];
const MAX = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = adminClient();
  const startedMs = Date.now();
  let runId: string | null = null;
  let calls = 0;

  try {
    const caller = await authorize(req, admin, ROLES);
    if (!caller.allowed) return json({ error: "Forbidden" }, 403);

    let payload: { artist_id?: string } = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }
    const artistId = typeof payload.artist_id === "string" ? payload.artist_id : "";
    if (!artistId) return json({ error: "artist_id obrigatório" }, 400);

    const { data: artist, error: aErr } = await admin
      .from("artists")
      .select("id, name, company_id")
      .eq("id", artistId)
      .maybeSingle();
    if (aErr) throw new Error(`artists: ${aErr.message}`);
    if (!artist) return json({ error: "artista não encontrado" }, 404);

    if (!caller.isServiceRole) {
      const companyIds = await callerCompanyIds(admin, caller.userId!);
      if (companyIds !== "all" && !companyIds.includes(artist.company_id)) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    const { data: ch } = await admin
      .from("artist_channels")
      .select("external_id")
      .eq("artist_id", artistId)
      .eq("platform", "aggregator")
      .not("external_id", "is", null)
      .maybeSingle();
    if (!ch?.external_id) {
      return json({ error: "artista sem canal 'aggregator' com UUID Soundcharts" }, 400);
    }

    runId = await startSyncRun(admin, {
      function_name: FUNCTION_NAME,
      trigger_source: deduceTriggerSource(req),
      dry_run: true,
      artist_id: artistId,
      company_id: artist.company_id,
    });

    const client = await ScClient.create();
    const body = await client.get(
      `/api/v2/artist/${ch.external_id}/related?limit=${MAX}`,
    );
    calls = client.calls;

    const raw = Array.isArray(body?.items) ? body.items : [];
    const mapped = raw.map(mapScArtist)
      .filter((a: { soundcharts_uuid: string }) => a.soundcharts_uuid)
      .slice(0, MAX);
    const companyIds = caller.isServiceRole
      ? "all"
      : await callerCompanyIds(admin, caller.userId!);
    const results = await markExisting(admin, mapped, companyIds);

    await finishSyncRun(admin, runId, startedMs, {
      status: resolveStatus(results.length, 0),
      api_calls: calls,
      rows_written: 0,
      details: { artist_id: artistId, results: results.length },
    });

    return json({
      artist_id: artistId,
      artist_name: artist.name,
      soundcharts_calls: calls,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${FUNCTION_NAME}]`, msg);
    await finishSyncRun(admin, runId, startedMs, {
      status: "error",
      api_calls: calls,
      error_text: msg,
    });
    return json({ error: msg }, 500);
  }
});
