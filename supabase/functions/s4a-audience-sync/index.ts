// s4a-audience-sync (D-ERP172) — audiência por país/cidade do Spotify for Artists.
// verify_jwt=true. Sem artist_id → todos os artistas com ligação spotify activa
// (só service_role, cron 08:45 UTC). sync_runs por artista. Nunca regista tokens.
//
// A) /audience-engagement-view/v1/artist/{ext}/locations?time_filter=28day
//    → artist_audience_demographics dimension 'country', dim_key = ISO-2 (como
//      a leitura manual de 20/09; a API não devolve nome), TODOS os países.
// B) /audience-engagement-view/v1/artist/{ext}/top-cities?time_filter=28day
//    → dimension 'city', dim_key "Cidade, Estado" (UF → br_estados.nome);
//      fora do Brasil "Cidade, <ISO país>".
//    Idempotência sem DDL: apaga o snapshot (artist, platform, audience_type,
//    dimension, timeframe, snapshot_date, source) e volta a inserir.
// E) /song-stats-view/v1/artist/{ext}/recording/{track}/streams/country/timeline
//    ?countries=BR,PT → artist_song_metrics_daily s4a_streams_day_br / _pt
//    (source 's4a_api'), desde o lançamento. Upsert pela chave única existente.
//    Não há coluna de país: o resto dos países aguarda DDL (decisão do Pedro).
// C/D) country|city/aggregate por música (28 dias até D) → artist_audience_demographics
//    com song_id, audience_type 'streams' (adenda 05/10).

import { adminClient, corsHeaders, json } from "../_shared/artist-meta.ts";
import { authorizeArtistAdmin, getS4aAccessToken, S4aError } from "../_shared/s4a.ts";
import { deduceTriggerSource, finishSyncRun, resolveStatus, startSyncRun } from "../_shared/sync-run.ts";
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";

const FN = "s4a-audience-sync";
const BASE = "https://generic.wg.spotify.com";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAUSE_MS = 300;
const TIMELINE_COUNTRIES = ["BR", "PT"] as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any
type Admin = any;

class StopArtist extends Error {
  constructor(public status: number, public path: string) { super(`S4A HTTP ${status}`); }
}

function s4aClient(admin: Admin, artistId: string) {
  let token: string | null = null;
  let calls = 0;
  let first = true;
  async function get(url: string): Promise<{ status: number; body: any }> {
    if (!first) await sleep(PAUSE_MS);
    first = false;
    if (!token) token = (await getS4aAccessToken(admin, artistId)).accessToken;
    for (let attempt = 0; attempt < 2; attempt++) {
      calls++;
      let status = 0;
      let body: any = null;
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: AbortSignal.timeout(25_000),
        });
        status = res.status;
        body = await res.json().catch(() => null);
      } catch (_e) { status = 0; }
      if (status === 401 && attempt === 0) {
        token = (await getS4aAccessToken(admin, artistId)).accessToken;
        continue;
      }
      if (status === 200) return { status, body };
      if (status === 429 || status >= 500 || status === 0 || status === 401) {
        throw new StopArtist(status, new URL(url).pathname);
      }
      return { status, body };
    }
    throw new StopArtist(401, new URL(url).pathname);
  }
  return { get, calls: () => calls };
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

async function syncArtist(admin: Admin, artist: any, dryRun: boolean, trigger: "cron" | "manual" | "api", provaCidades: boolean) {
  const started = Date.now();
  const runId = await startSyncRun(admin, {
    function_name: FN, trigger_source: trigger, dry_run: dryRun,
    company_id: artist.company_id, artist_id: artist.id,
  });
  const notes: string[] = [];
  const counts: Record<string, number> = {};
  const prova: Record<string, unknown> = {};
  let written = 0;
  let errors = 0;
  let D: string | null = null;
  const c = s4aClient(admin, artist.id);

  try {
    const { data: ch } = await admin.from("artist_channels").select("external_id")
      .eq("artist_id", artist.id).eq("platform", "spotify").limit(1).maybeSingle();
    const ext = ch?.external_id;
    if (!ext) throw new S4aError("sem_external_id_spotify");

    const ld = await c.get(`${BASE}/s4x-insights-api/v1/meta/latest-date`);
    D = ld.body?.latestDate ?? ld.body?.latest_date ?? ld.body?.date ?? null;
    if (!D || !DATE_RE.test(String(D))) throw new S4aError("latest_date_invalida");

    const { data: estados } = await admin.from("br_estados").select("uf, nome");
    const ufNome = new Map<string, string>((estados ?? []).map((e: any) => [e.uf, e.nome]));

    const demo = (dimension: string, dim_key: string, value: number) => ({
      company_id: artist.company_id, artist_id: artist.id, platform: "spotify",
      audience_type: "listeners", dimension, dim_key, value, timeframe: "last_28_days",
      snapshot_date: D, source: "platform_api", unit: "count",
    });

    // A) países
    const loc = await c.get(`${BASE}/audience-engagement-view/v1/artist/${ext}/locations?time_filter=28day`);
    const countryRows: any[] = [];
    if (loc.status !== 200) { errors++; notes.push(`locations HTTP ${loc.status}`); }
    else for (const g of (loc.body?.geography ?? []) as any[]) {
      const iso = String(g?.name ?? "").trim().toUpperCase();
      const v = num(g?.num);
      if (iso && v !== null) countryRows.push(demo("country", iso, v));
    }

    // B) cidades
    const cit = await c.get(`${BASE}/audience-engagement-view/v1/artist/${ext}/top-cities?time_filter=28day`);
    const cityRows: any[] = [];
    const ufsSemNome = new Set<string>();
    if (cit.status !== 200) { errors++; notes.push(`top-cities HTTP ${cit.status}`); }
    else for (const g of (cit.body?.geography ?? []) as any[]) {
      const name = String(g?.name ?? "").trim();
      const v = num(g?.num);
      if (!name || v === null) continue;
      const country = String(g?.country ?? "").toUpperCase();
      const region = String(g?.region ?? "").toUpperCase();
      let suffix = country || "?";
      if (country === "BR") {
        const nome = ufNome.get(region);
        if (nome) suffix = nome; else { ufsSemNome.add(region); suffix = region || "BR"; }
      }
      cityRows.push(demo("city", `${name}, ${suffix}`, v));
    }
    if (ufsSemNome.size) notes.push(`UF sem nome em br_estados: ${[...ufsSemNome].join(",")}`);
    counts.country = countryRows.length;
    counts.city = cityRows.length;

    if (!dryRun) {
      for (const [dim, rows] of [["country", countryRows], ["city", cityRows]] as const) {
        if (!rows.length) continue;
        const { error: dErr } = await admin.from("artist_audience_demographics").delete()
          .eq("artist_id", artist.id).eq("platform", "spotify").eq("audience_type", "listeners")
          .eq("dimension", dim).eq("timeframe", "last_28_days").eq("snapshot_date", D).eq("source", "platform_api").is("song_id", null);
        if (dErr) { errors++; notes.push(`apagar ${dim} falhou: ${dErr.message}`); continue; }
        const { error } = await admin.from("artist_audience_demographics").insert(rows);
        if (error) { errors++; notes.push(`gravar ${dim} falhou: ${error.message}`); } else written += rows.length;
      }
    } else {
      prova.paises = countryRows.slice(0, 10).map((r) => [r.dim_key, r.value]);
      prova.cidades = cityRows.slice(0, 10).map((r) => [r.dim_key, r.value]);
    }

    // E) série diária BR/PT por música activa com track no catálogo
    const cat = await c.get(`${BASE}/catalog-view/v1/artist/${ext}/songs?time-filter=28day`);
    const catIds = new Set<string>(((cat.body?.songs ?? []) as any[]).map((s) => String(s?.id ?? "")).filter(Boolean));
    const { data: songs } = await admin.from("artist_songs").select("id, title, release_date")
      .eq("artist_id", artist.id).eq("tracking_status", "ativo");
    const songIds = (songs ?? []).map((s: any) => s.id);
    const { data: idents } = songIds.length
      ? await admin.from("artist_song_identifiers").select("song_id, external_id").eq("platform", "spotify").in("song_id", songIds)
      : { data: [] };
    const capturedAt = new Date().toISOString();
    const metricRows: any[] = [];
    for (const s of songs ?? []) {
      const track = (idents ?? []).filter((i: any) => i.song_id === s.id).map((i: any) => String(i.external_id)).find((x: string) => catIds.has(x));
      if (!track) continue;
      if (!s.release_date) { notes.push(`"${s.title}": sem release_date — sem série por país`); continue; }
      const from = s.release_date > D ? D : s.release_date;
      const tl = await c.get(`${BASE}/song-stats-view/v1/artist/${ext}/recording/${track}/streams/country/timeline?fromDate=${from}&toDate=${D}&countries=${TIMELINE_COUNTRIES.join(",")}`);
      if (tl.status !== 200) { errors++; notes.push(`"${s.title}": timeline HTTP ${tl.status}`); continue; }
      for (const t of (tl.body?.countryTimelines ?? []) as any[]) {
        const cc = String(t?.countryCode ?? "").toLowerCase();
        if (!TIMELINE_COUNTRIES.includes(cc.toUpperCase() as any)) continue;
        for (const p of (t?.timelinePoint ?? []) as any[]) {
          const d = String(p?.date ?? "").slice(0, 10);
          const v = num(p?.num);
          if (!DATE_RE.test(d) || v === null) continue;
          metricRows.push({
            company_id: artist.company_id, artist_id: artist.id, song_id: s.id, platform: "spotify",
            metric: `s4a_streams_day_${cc}`, metric_date: d, value: v, source: "s4a_api",
            source_ref: `s4a country/timeline ${from}–${D}`, captured_at: capturedAt,
          });
        }
      }
      // C/D) geografia por música, janela 28 dias até D (D-ERP172 adenda).
      const d27 = (() => { const t = new Date(D + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() - 27); return t.toISOString().slice(0, 10); })();
      const f28 = s.release_date > d27 ? (s.release_date > D ? D : s.release_date) : d27;
      const songDemo = (dimension: string, dim_key: string, value: number) => ({
        company_id: artist.company_id, artist_id: artist.id, song_id: s.id, platform: "spotify",
        audience_type: "streams", dimension, dim_key, value, timeframe: "last_28_days",
        snapshot_date: D, source: "platform_api", unit: "count",
      });
      for (const dim of ["country", "city"] as const) {
        const r = await c.get(`${BASE}/song-stats-view/v1/artist/${ext}/recording/${track}/streams/${dim}/aggregate?fromDate=${f28}&toDate=${D}`);
        if (r.status !== 200) { errors++; notes.push(`"${s.title}": ${dim}/aggregate HTTP ${r.status}`); continue; }
        const rows: any[] = [];
        for (const g of (r.body?.geography ?? []) as any[]) {
          const name = String(g?.name ?? "").trim();
          const v = num(g?.num);
          if (!name || v === null) continue;
          if (dim === "country") { rows.push(songDemo("country", name.toUpperCase(), v)); continue; }
          const country = String(g?.country ?? "").toUpperCase();
          const region = String(g?.region ?? "").toUpperCase();
          let suffix = country || "?";
          if (country === "BR") { const nome = ufNome.get(region); if (nome) suffix = nome; else { ufsSemNome.add(region); suffix = region || "BR"; } }
          rows.push(songDemo("city", `${name}, ${suffix}`, v));
        }
        counts[`song_${dim}`] = (counts[`song_${dim}`] ?? 0) + rows.length;
        if (dryRun || !rows.length) continue;
        const { error: dErr } = await admin.from("artist_audience_demographics").delete()
          .eq("artist_id", artist.id).eq("song_id", s.id).eq("platform", "spotify").eq("audience_type", "streams")
          .eq("dimension", dim).eq("snapshot_date", D).eq("source", "platform_api");
        if (dErr) { errors++; notes.push(`"${s.title}": apagar ${dim} falhou: ${dErr.message}`); continue; }
        const { error } = await admin.from("artist_audience_demographics").insert(rows);
        if (error) { errors++; notes.push(`"${s.title}": gravar ${dim} falhou: ${error.message}`); } else written += rows.length;
      }
    }
    counts.streams_day_pais = metricRows.length;
    if (!dryRun && metricRows.length) {
      for (let i = 0; i < metricRows.length; i += 500) {
        const chunk = metricRows.slice(i, i + 500);
        const { error } = await admin.from("artist_song_metrics_daily")
          .upsert(chunk, { onConflict: "song_id,platform,metric,metric_date,source" });
        if (error) { errors++; notes.push(`gravar série país falhou: ${error.message}`); } else written += chunk.length;
      }
    }
  } catch (e) {
    errors++;
    if (e instanceof StopArtist) notes.push(`S4A HTTP ${e.status} em ${e.path} — artista parado`);
    else if (e instanceof S4aError) notes.push(`S4A: ${e.code}`);
    else notes.push(`erro: ${(e as Error)?.message ?? "desconhecido"}`);
  }

  const status = resolveStatus(written, errors);
  await finishSyncRun(admin, runId, started, {
    status, api_calls: c.calls(), rows_written: written,
    details: { D, counts, notes }, error_text: errors ? notes[notes.length - 1] ?? null : null,
  });
  return { artist_id: artist.id, D, dry_run: dryRun, status: dryRun ? "dry_run" : status, api_calls: c.calls(), counts, rows_written: dryRun ? 0 : written, notes, ...(Object.keys(prova).length ? { prova } : {}) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const artistId = body?.artist_id;
  const dryRun = body?.dry_run !== false;
  const provaCidades = body?.prova_cidades === true;
  if (artistId !== undefined && (typeof artistId !== "string" || !UUID_RE.test(artistId))) {
    return json({ ok: false, error: "artist_id inválido" }, 400);
  }
  const admin = adminClient();

  let artists: any[] = [];
  if (artistId) {
    const auth = await authorizeArtistAdmin(req, admin, artistId, true);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    const { data } = await admin.from("artists").select("id, company_id").eq("id", artistId).maybeSingle();
    if (data) artists = [data];
  } else {
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    // #283 resto (D-ERP229): service role verificada no Auth (isServiceRoleRequest), nunca pelo payload.
    const isSr = await isServiceRoleRequest(req);
    if (!isSr) return json({ ok: false, error: "modo todos só para service_role" }, 403);
    const { data: conns } = await admin.from("artist_channel_connections")
      .select("artist_id, company_id").eq("provider", "spotify").eq("status", "active");
    artists = [...new Map((conns ?? []).map((x: any) => [x.artist_id, { id: x.artist_id, company_id: x.company_id }])).values()];
  }

  const trigger = deduceTriggerSource(req);
  const results = [];
  for (const a of artists) results.push(await syncArtist(admin, a, dryRun, trigger, provaCidades));
  return json({ ok: true, dry_run: dryRun, artistas: results.length, resultados: results });
});
