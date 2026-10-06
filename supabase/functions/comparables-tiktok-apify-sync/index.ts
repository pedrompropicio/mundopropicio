// comparables-tiktok-apify-sync — seguidores TikTok EXATOS dos comparáveis (pedido chat 5).
// A Soundcharts arredonda o TikTok (degraus de 100/100.000); o ator Apify
// clockworks/tiktok-profile-scraper devolve authorMeta.fans exato.
//
// POST { artist_id?: uuid (artista do elenco; default = todos com comparáveis), dry_run?: false }
// 1) comparáveis = artist_comparables.comparable_artist_id
// 2) @ do TikTok: artist_channels (platform tiktok, handle); se faltar, lê UMA vez os
//    identifiers na Soundcharts e grava o canal (account_type null, auth_status 'none').
// 3) Apify run-sync (1 corrida para todos), grava artist_metrics_daily
//    (platform tiktok, metric followers, source 'apify', source_ref 'apify:<run_id>').
// Regista em sync_runs (api_calls = chamadas Apify + Soundcharts; custo USD em details).
// Nunca imprime o token.

import { adminClient, authorize, corsHeaders, json, ScClient } from "../_shared/soundcharts.ts";
import { deduceTriggerSource, finishSyncRun, resolveStatus, startSyncRun } from "../_shared/sync-run.ts";

const FN = "comparables-tiktok-apify-sync";
const ROLES = ["admin", "platform_admin", "manager", "editor"];
const ACTOR = "clockworks~tiktok-profile-scraper";

function handleFromUrl(u: string | null | undefined): string | null {
  const m = String(u ?? "").match(/tiktok\.com\/@([A-Za-z0-9._]+)/i);
  return m ? m[1] : null;
}
const lisbonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = adminClient();
  const caller = await authorize(req, admin, ROLES);
  if (!caller.allowed) return json({ error: "Forbidden" }, 403);
  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) return json({ ok: false, motivo: "APIFY_TOKEN em falta" }, 428);

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dry_run === true;
  const started = Date.now();
  const runId = await startSyncRun(admin, { function_name: FN, trigger_source: deduceTriggerSource(req), dry_run: dryRun });
  let calls = 0;
  const notes: string[] = [];
  try {
    let q = admin.from("artist_comparables").select("comparable_artist_id, company_id");
    if (body?.artist_id) q = q.eq("artist_id", body.artist_id);
    const { data: comps, error: cErr } = await q;
    if (cErr) throw new Error(`artist_comparables: ${cErr.message}`);
    const ids = [...new Set((comps ?? []).map((c: any) => String(c.comparable_artist_id)))];
    if (!ids.length) {
      await finishSyncRun(admin, runId, started, { status: "no_data", details: { motivo: "sem comparáveis" } });
      return json({ ok: true, rows: 0, motivo: "sem comparáveis" });
    }
    const { data: arts } = await admin.from("artists").select("id, name, company_id").in("id", ids);
    const { data: chans } = await admin.from("artist_channels").select("artist_id, platform, handle, url, external_id").in("artist_id", ids);

    const handle = new Map<string, string>();
    for (const c of chans ?? []) {
      if (c.platform !== "tiktok") continue;
      const h = (c.handle ? String(c.handle).replace(/^@/, "") : null) ?? handleFromUrl(c.url);
      if (h) handle.set(c.artist_id, h);
    }
    // Resolve @ em falta pela Soundcharts (identifiers) — uma vez por artista, depois fica gravado.
    let sc: ScClient | null = null;
    for (const a of arts ?? []) {
      if (handle.has(a.id)) continue;
      const agg = (chans ?? []).find((c: any) => c.artist_id === a.id && c.platform === "aggregator" && c.external_id);
      if (!agg) { notes.push(`${a.name}: sem UUID Soundcharts nem canal TikTok`); continue; }
      sc = sc ?? await ScClient.create();
      try {
        const r = await sc.get(`/api/v2/artist/${agg.external_id}/identifiers?offset=0&limit=100`);
        const it = (r?.items ?? []).find((x: any) => String(x?.platformCode ?? x?.platform ?? "").toLowerCase() === "tiktok");
        const h = handleFromUrl(it?.url) ?? (it?.identifier ? String(it.identifier).replace(/^@/, "") : null);
        if (!h) { notes.push(`${a.name}: Soundcharts sem identificador TikTok`); continue; }
        handle.set(a.id, h);
        if (!dryRun) {
          const { error } = await admin.from("artist_channels").insert({
            company_id: a.company_id, artist_id: a.id, platform: "tiktok", handle: h,
            url: `https://www.tiktok.com/@${h}`, auth_status: "none", is_primary: false,
            notes: "Resolvido pelos identifiers da Soundcharts (comparables-tiktok-apify-sync)",
          });
          if (error) notes.push(`${a.name}: canal TikTok não gravado (${error.message})`);
        }
      } catch (e) {
        notes.push(`${a.name}: identifiers Soundcharts falhou (${String((e as Error)?.message ?? e).slice(0, 120)})`);
      }
    }
    calls += sc?.calls ?? 0;

    const alvo = (arts ?? []).filter((a: any) => handle.has(a.id));
    if (!alvo.length) throw new Error("nenhum comparável com @ TikTok");
    calls++;
    const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        profiles: alvo.map((a: any) => handle.get(a.id)),
        resultsPerPage: 1, profileScrapeSections: ["videos"], profileSorting: "latest",
        shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadAvatars: false,
        shouldDownloadSubtitles: false, shouldDownloadSlideshowImages: false,
      }),
      signal: AbortSignal.timeout(240_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`apify HTTP ${res.status}: ${text.slice(0, 300)}`);
    const items: any[] = (() => { try { const j = JSON.parse(text); return Array.isArray(j) ? j : []; } catch { return []; } })();
    const apifyRun = res.headers.get("x-apify-run-id") ?? res.headers.get("x-apify-actor-run-id");

    // Custo real da corrida (para a estimativa mensal).
    let usd: number | null = null;
    if (apifyRun) {
      try {
        const r = await fetch(`https://api.apify.com/v2/actor-runs/${apifyRun}`, { headers: { Authorization: `Bearer ${token}` } });
        const j = await r.json();
        usd = typeof j?.data?.usageTotalUsd === "number" ? j.data.usageTotalUsd : null;
      } catch { /* sem custo */ }
    }

    const fans = new Map<string, number>();
    for (const it of items) {
      const m = it?.authorMeta ?? {};
      const name = String(m.name ?? m.uniqueId ?? "").toLowerCase();
      const f = Number(m.fans ?? m.followers);
      if (name && Number.isFinite(f) && f > 0 && !fans.has(name)) fans.set(name, f);
    }
    const day = lisbonToday();
    const rows = alvo.flatMap((a: any) => {
      const f = fans.get(String(handle.get(a.id)).toLowerCase());
      if (f == null) { notes.push(`${a.name} (@${handle.get(a.id)}): sem fans no resultado Apify`); return []; }
      return [{
        company_id: a.company_id, artist_id: a.id, platform: "tiktok", metric: "followers",
        metric_date: day, value: f, source: "apify", source_ref: `apify:${apifyRun ?? "run-sync"}`,
        captured_at: new Date().toISOString(),
      }];
    });
    if (!dryRun && rows.length) {
      const { error } = await admin.from("artist_metrics_daily").upsert(rows, { onConflict: "artist_id,platform,metric,metric_date,source" });
      if (error) throw new Error(`artist_metrics_daily: ${error.message}`);
    }
    const out = {
      ok: true, dry_run: dryRun, dia: day, rows: dryRun ? 0 : rows.length,
      valores: rows.map((r: any) => ({ artist: (arts ?? []).find((a: any) => a.id === r.artist_id)?.name, handle: handle.get(r.artist_id), followers: r.value })),
      apify_run: apifyRun, apify_usd: usd, notes,
    };
    await finishSyncRun(admin, runId, started, {
      status: resolveStatus(dryRun ? 0 : rows.length, notes.length ? 1 : 0), api_calls: calls,
      rows_written: dryRun ? 0 : rows.length, details: out, error_text: notes.length ? notes.join("; ").slice(0, 1000) : null,
    });
    return json(out);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    await finishSyncRun(admin, runId, started, { status: "error", api_calls: calls, error_text: msg, details: { notes } });
    return json({ ok: false, error: msg, notes }, 500);
  }
});
