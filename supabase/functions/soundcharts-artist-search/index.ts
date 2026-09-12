// soundcharts-artist-search — pesquisa de artistas na Soundcharts.
//
// POST { q: string, limit?: number (<=10) }
// GET /api/v2/artist/search/{q}?limit=...
//
// Só leitura. Conta as chamadas à API em sync_runs.api_calls (quota ~1000/mês).

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

const FUNCTION_NAME = "soundcharts-artist-search";
const ROLES = ["admin", "platform_admin", "manager", "editor"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = adminClient();
  const startedMs = Date.now();
  let runId: string | null = null;
  const sc = { calls: 0 };

  try {
    const caller = await authorize(req, admin, ROLES);
    if (!caller.allowed) return json({ error: "Forbidden" }, 403);

    let payload: { q?: string; limit?: number } = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const q = typeof payload.q === "string" ? payload.q.trim() : "";
    if (q.length < 2) return json({ error: "q obrigatório (mínimo 2 caracteres)" }, 400);
    const limit = Math.min(Math.max(Number(payload.limit ?? 10) || 10, 1), 10);

    runId = await startSyncRun(admin, {
      function_name: FUNCTION_NAME,
      trigger_source: deduceTriggerSource(req),
      dry_run: true, // só leitura: nunca escreve métricas
    });

    const client = await ScClient.create();
    const body = await client.get(
      `/api/v2/artist/search/${encodeURIComponent(q)}?limit=${limit}`,
    );
    sc.calls = client.calls;

    const raw = Array.isArray(body?.items) ? body.items : [];
    const mapped = raw.map(mapScArtist).filter((a) => a.soundcharts_uuid);
    const companyIds = caller.isServiceRole
      ? "all"
      : await callerCompanyIds(admin, caller.userId!);
    const results = await markExisting(admin, mapped, companyIds);

    const out = { query: q, limit, soundcharts_calls: client.calls, results };
    await finishSyncRun(admin, runId, startedMs, {
      status: resolveStatus(results.length, 0),
      api_calls: client.calls,
      rows_written: 0,
      details: { query: q, limit, results: results.length },
    });
    return json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${FUNCTION_NAME}]`, msg);
    await finishSyncRun(admin, runId, startedMs, {
      status: "error",
      api_calls: sc.calls,
      error_text: msg,
    });
    return json({ error: msg }, 500);
  }
});
