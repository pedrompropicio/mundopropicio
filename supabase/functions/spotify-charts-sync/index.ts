// spotify-charts-sync (D-ERP261) — charts diários regionais Spotify BR e PT.
// verify_jwt=true; só service_role. Usa o Bearer web do S4A (nunca registado).
// Corpo: {} → D-1 e até 3 dias anteriores em falta; {from,to} → backfill (1 pedido/s).
import { adminClient, corsHeaders, json } from "../_shared/artist-meta.ts";
import { getS4aAccessToken } from "../_shared/s4a.ts";
import { deduceTriggerSource, finishSyncRun, startSyncRun } from "../_shared/sync-run.ts";
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";

const FN = "spotify-charts-sync";
const COUNTRIES = ["BR", "PT"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const addDays = (d: string, n: number) => {
  const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);
};

// deno-lint-ignore no-explicit-any
function toRow(country: string, date: string, e: any) {
  const d = e?.chartEntryData ?? {}; const t = e?.trackMetadata ?? {};
  const id = String(t.trackUri ?? "").replace(/^spotify:track:/, "");
  const streams = Number(d.rankingMetric?.value);
  if (!d.currentRank || !id || !Number.isFinite(streams)) return null;
  const prev = Number(d.previousRank);
  return {
    country, chart_date: date, position: d.currentRank, track_name: String(t.trackName ?? ""),
    // deno-lint-ignore no-explicit-any
    artists: ((t.artists ?? []) as any[]).map((a) => ({ name: a?.name ?? null, uri: a?.spotifyUri ?? null })),
    spotify_track_id: id, streams, prev_position: prev > 0 ? prev : null,
    days_on_chart: Number.isFinite(Number(d.appearancesOnChart)) ? Number(d.appearancesOnChart) : null,
    captured_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  if (!(await isServiceRoleRequest(req))) return json({ ok: false, error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();

  const yesterday = addDays(new Date().toISOString().slice(0, 10), -1);
  let dates: string[] = [];
  if (DATE_RE.test(body?.from ?? "")) {
    const to = DATE_RE.test(body?.to ?? "") ? body.to : yesterday;
    for (let d = body.from; d <= to && dates.length < 120; d = addDays(d, 1)) dates.push(d);
  } else {
    const want = [0, 1, 2, 3].map((n) => addDays(yesterday, -n));
    const { data } = await admin.from("spotify_chart_daily").select("country, chart_date")
      .in("chart_date", want).eq("position", 200);
    const have = new Set((data ?? []).map((r: { country: string; chart_date: string }) => `${r.country}|${r.chart_date}`));
    dates = want.filter((d) => d === yesterday || COUNTRIES.some((c) => !have.has(`${c}|${d}`)));
  }

  // token S4A: o primeiro artista com ligação Spotify que funcione
  const { data: chs } = await admin.from("artist_channels").select("artist_id")
    .eq("platform", "spotify").not("external_id", "is", null);
  let token: string | null = null; let artistId: string | null = null;
  for (const c of (chs ?? []) as Array<{ artist_id: string }>) {
    try { token = (await getS4aAccessToken(admin, c.artist_id)).accessToken; artistId = c.artist_id; break; } catch (_e) { /* próximo */ }
  }
  const started = Date.now();
  const runId = await startSyncRun(admin, { function_name: FN, trigger_source: deduceTriggerSource(req), dry_run: false, artist_id: artistId });
  if (!token) {
    await finishSyncRun(admin, runId, started, { status: "error", rows_written: 0, details: { error: "sem_token_s4a" } });
    return json({ ok: false, error: "sem_token_s4a" }, 409);
  }

  const out: Array<{ country: string; date: string; status: number; rows: number }> = [];
  let rows = 0; let calls = 0; let errors = 0;
  for (const date of dates) for (const country of COUNTRIES) {
    if (calls++) await sleep(1000);
    let st = 0; let n = 0;
    try {
      const r = await fetch(`https://charts-spotify-com-service.spotify.com/auth/v0/charts/regional-${country.toLowerCase()}-daily/${date}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      st = r.status;
      if (st === 200) {
        const j = await r.json().catch(() => null);
        const recs = ((j?.entries ?? []) as unknown[]).map((e) => toRow(country, date, e)).filter(Boolean);
        if (recs.length) {
          const { error } = await admin.from("spotify_chart_daily").upsert(recs, { onConflict: "country,chart_date,position" });
          if (error) { errors++; st = -1; } else n = recs.length;
        }
      } else if (st !== 404) errors++;
    } catch (_e) { errors++; }
    rows += n; out.push({ country, date, status: st, rows: n });
  }
  const status = rows === 0 ? (errors ? "error" : "no_data") : errors ? "partial" : "success";
  await finishSyncRun(admin, runId, started, { status, api_calls: calls, rows_written: rows, details: { dates, out } });
  return json({ ok: errors === 0, status, rows_written: rows, resultados: out });
});
