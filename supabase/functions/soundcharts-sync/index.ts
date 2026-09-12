// soundcharts-sync — sincroniza métricas de audiência (Soundcharts) para
// public.artist_metrics_daily.
//
// Endpoints (confirmados no OpenAPI oficial em 11/set/2026):
//   GET /api/v2/artist/{uuid}/audience/{platform}            → "Get audience"
//        items[] = { date, followerCount, likeCount, ... }
//   GET /api/v2/artist/{uuid}/streaming/{platform}/listening  → "Get streaming audience"
//        items[] = { date, value }  (ouvintes mensais no Spotify)
//
// Limite oficial por pedido: não há limite de período documentado, mas
// `limit` tem máximo de 100 resultados por pedido. Como as séries são diárias,
// o período pedido é partido em blocos consecutivos de 90 dias (≤ 100 pontos),
// juntando os pontos sem duplicar datas.
//
// Parâmetros opcionais: start_date, end_date (YYYY-MM-DD) e platforms[].
// Sem eles o comportamento é o de sempre (últimos 30 dias, 4 plataformas).
//
// Só backend. Não cria cron. Não altera tabelas.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  deduceTriggerSource,
  finishSyncRun,
  resolveStatus,
  startSyncRun,
} from "../_shared/sync-run.ts";

const FUNCTION_NAME = "soundcharts-sync";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SC_BASE = "https://customer.api.soundcharts.com";
const SC_TOKEN_URL = "https://account.soundcharts.com/oauth/token";

const SOCIAL_METRIC: Record<string, string> = {
  tiktok: "followers",
  instagram: "followers",
  youtube: "subscribers",
};

const ALL_PLATFORMS = ["tiktok", "instagram", "youtube", "spotify"];
const MAX_BLOCK_DAYS = 90; // ≤ 100 pontos diários por pedido (limit máx. 100)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addDays(d: string, n: number): string {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Blocos consecutivos [start,end] dentro do limite de pontos por pedido. */
function buildWindows(startDate: string | null, endDate: string) {
  if (!startDate) return [{ start: null as string | null, end: endDate }];
  const out: Array<{ start: string | null; end: string }> = [];
  let cur = startDate;
  while (cur <= endDate) {
    const blockEnd = addDays(cur, MAX_BLOCK_DAYS - 1);
    const end = blockEnd < endDate ? blockEnd : endDate;
    out.push({ start: cur, end });
    cur = addDays(end, 1);
  }
  return out;
}

async function getSoundchartsToken(): Promise<string> {
  const id = Deno.env.get("SOUNDCHARTS_CLIENT_ID");
  const secret = Deno.env.get("SOUNDCHARTS_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Soundcharts credentials not configured");

  const res = await fetch(SC_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    // nunca ecoar credenciais
    throw new Error(`Soundcharts auth failed (HTTP ${res.status})`);
  }
  const body = await res.json();
  const token = body?.access_token ?? body?.token;
  if (!token) throw new Error("Soundcharts auth failed (no access_token)");
  return token as string;
}

type Caller = { allowed: boolean; reason?: string };

async function authorize(req: Request, admin: SupabaseClient): Promise<Caller> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  if (!bearer) return { allowed: false, reason: "missing token" };

  // JWT já verificado pelo gateway (verify_jwt = true): basta ler o claim role
  try {
    const payload = JSON.parse(atob(bearer.split(".")[1] ?? ""));
    if (payload?.role === "service_role") return { allowed: true };
  } catch (_e) {
    // token não-JWT: segue para validação de utilizador
  }

  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data?.user) return { allowed: false, reason: "invalid token" };

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  const ok = (roles ?? []).some((r: { role: string }) =>
    r.role === "admin" || r.role === "platform_admin"
  );
  return ok ? { allowed: true } : { allowed: false, reason: "insufficient role" };
}

interface MetricRow {
  company_id: string;
  artist_id: string;
  channel_id: string | null;
  platform: string;
  metric: string;
  metric_date: string;
  value: number;
  source: string;
  source_ref: string;
  captured_at: string;
}

interface SeriesStats {
  points: number;
  first_date: string;
  first_value: number;
  last_date: string;
  last_value: number;
  min: number;
  max: number;
  biggest_jump: {
    date: string;
    value_before: number;
    value_after: number;
    change_pct: number | null;
  } | null;
}

function statsFor(points: Array<{ date: string; value: number }>): SeriesStats {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  let min = sorted[0].value;
  let max = sorted[0].value;
  let jump: SeriesStats["biggest_jump"] = null;
  let jumpAbs = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].value < min) min = sorted[i].value;
    if (sorted[i].value > max) max = sorted[i].value;
    if (i > 0) {
      const before = sorted[i - 1].value;
      const after = sorted[i].value;
      const abs = Math.abs(after - before);
      if (abs > jumpAbs) {
        jumpAbs = abs;
        jump = {
          date: sorted[i].date,
          value_before: before,
          value_after: after,
          change_pct: before === 0
            ? null
            : Math.round(((after - before) / before) * 10000) / 100,
        };
      }
    }
  }
  return {
    points: sorted.length,
    first_date: sorted[0].date,
    first_value: sorted[0].value,
    last_date: sorted[sorted.length - 1].date,
    last_value: sorted[sorted.length - 1].value,
    min,
    max,
    biggest_jump: jump,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Registo técnico da execução (nunca faz a sincronização falhar).
  const startedMs = Date.now();
  let runId: string | null = null;
  let runDryRun = false;

  try {
    const auth = await authorize(req, admin);
    if (!auth.allowed) return json({ error: "Forbidden" }, 403);


    let payload: {
      artist_id?: string;
      dry_run?: boolean;
      start_date?: string;
      end_date?: string;
      platforms?: string[];
    } = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }
    const dryRun = payload.dry_run === true;
    const onlyArtist = payload.artist_id ?? null;

    if (payload.start_date != null && !isDate(payload.start_date)) {
      return json({ error: "start_date inválido (YYYY-MM-DD)" }, 400);
    }
    if (payload.end_date != null && !isDate(payload.end_date)) {
      return json({ error: "end_date inválido (YYYY-MM-DD)" }, 400);
    }
    const endDate = isDate(payload.end_date) ? payload.end_date : today();
    const startDate = isDate(payload.start_date) ? payload.start_date : null;
    if (startDate && startDate > endDate) {
      return json({ error: "start_date depois de end_date" }, 400);
    }

    let platforms = ALL_PLATFORMS;
    if (Array.isArray(payload.platforms) && payload.platforms.length) {
      const asked = payload.platforms.map((p) => String(p).toLowerCase());
      const invalid = asked.filter((p) => !ALL_PLATFORMS.includes(p));
      if (invalid.length) {
        return json({ error: `plataformas inválidas: ${invalid.join(", ")}` }, 400);
      }
      platforms = ALL_PLATFORMS.filter((p) => asked.includes(p));
    }

    const windows = buildWindows(startDate, endDate);

    runDryRun = dryRun;
    runId = await startSyncRun(admin, {
      function_name: FUNCTION_NAME,
      trigger_source: deduceTriggerSource(req),
      dry_run: dryRun,
      artist_id: onlyArtist,
    });

    // 1. canais agregadores
    let chQuery = admin
      .from("artist_channels")
      .select("id, artist_id, platform, external_id")
      .eq("platform", "aggregator");
    if (onlyArtist) chQuery = chQuery.eq("artist_id", onlyArtist);
    const { data: aggChannels, error: chErr } = await chQuery;
    if (chErr) throw new Error(`artist_channels: ${chErr.message}`);

    const targets = (aggChannels ?? []).filter((c) => c.external_id);
    if (!targets.length) {
      const emptyBody = {
        artists_processed: 0,
        soundcharts_calls: 0,
        rows_written: {},
        errors: [],
        note: "Nenhum artista com canal 'aggregator' e external_id.",
      };
      // correu sem erro mas não gravou nada
      await finishSyncRun(admin, runId, startedMs, {
        status: "no_data",
        details: emptyBody,
      });
      return json(emptyBody);
    }

    const artistIds = [...new Set(targets.map((c) => c.artist_id))];

    const { data: artists, error: aErr } = await admin
      .from("artists")
      .select("id, company_id, name")
      .in("id", artistIds);
    if (aErr) throw new Error(`artists: ${aErr.message}`);
    const companyById = new Map((artists ?? []).map((a) => [a.id, a.company_id]));
    const nameById = new Map((artists ?? []).map((a) => [a.id, a.name as string]));

    // canais por plataforma (para channel_id)
    const { data: allChannels, error: acErr } = await admin
      .from("artist_channels")
      .select("id, artist_id, platform, is_primary")
      .in("artist_id", artistIds);
    if (acErr) throw new Error(`artist_channels(all): ${acErr.message}`);
    const channelKey = (artistId: string, platform: string) => `${artistId}|${platform}`;
    const channelByKey = new Map<string, string>();
    for (const c of allChannels ?? []) {
      const k = channelKey(c.artist_id, c.platform);
      if (!channelByKey.has(k) || c.is_primary) channelByKey.set(k, c.id);
    }

    const token = await getSoundchartsToken();
    let calls = 0;
    const errors: Array<{ artist_id: string; platform: string; status?: number; error: string }> = [];
    const rows: MetricRow[] = [];
    const lastCrawl: Record<string, string | null> = {};
    const platformStatus: Record<string, "ok" | "no_data" | "error"> = {};

    const fetchSc = async (path: string) => {
      calls++;
      const res = await fetch(`${SC_BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      return await res.json();
    };

    /** Percorre todos os blocos e devolve os itens crus, sem duplicar datas. */
    const fetchSeries = async (basePath: string) => {
      const seen = new Set<string>();
      const items: Array<Record<string, unknown>> = [];
      let crawl: string | null = null;
      for (const w of windows) {
        const qs = new URLSearchParams({
          endDate: w.end,
          limit: "100",
          sort: "asc",
        });
        if (w.start) qs.set("startDate", w.start);
        const body = await fetchSc(`${basePath}?${qs.toString()}`);
        crawl = body?.related?.lastCrawlDate ?? crawl;
        for (const it of body?.items ?? []) {
          const d = it?.date ? String(it.date).slice(0, 10) : null;
          if (!d || seen.has(d)) continue;
          seen.add(d);
          items.push(it);
        }
      }
      return { items, crawl };
    };

    for (const ch of targets) {
      const companyId = companyById.get(ch.artist_id);
      if (!companyId) {
        errors.push({ artist_id: ch.artist_id, platform: "-", error: "artista sem company_id" });
        continue;
      }
      const scUuid = ch.external_id as string;

      // 2a. audience social
      for (const platform of platforms.filter((p) => p !== "spotify")) {
        try {
          const { items, crawl } = await fetchSeries(
            `/api/v2/artist/${scUuid}/audience/${platform}`,
          );
          lastCrawl[platform] = crawl;
          const metric = SOCIAL_METRIC[platform];
          let pushed = 0;
          for (const item of items) {
            const value = (item as { followerCount?: number }).followerCount;
            const date = (item as { date?: string }).date;
            if (value == null || !date) continue;
            pushed++;
            rows.push({
              company_id: companyId,
              artist_id: ch.artist_id,
              channel_id: channelByKey.get(channelKey(ch.artist_id, platform)) ?? null,
              platform,
              metric,
              metric_date: String(date).slice(0, 10),
              value: Number(value),
              source: "aggregator",
              source_ref: "soundcharts",
              captured_at: new Date().toISOString(),
            });
          }
          platformStatus[platform] = pushed > 0 ? "ok" : "no_data";
        } catch (e) {
          const status = (e as { status?: number }).status;
          platformStatus[platform] = "error";
          errors.push({
            artist_id: ch.artist_id,
            platform,
            status,
            error: e instanceof Error ? e.message : "erro",
          });
        }
      }

      // 2b. streaming audience (Spotify monthly listeners)
      if (platforms.includes("spotify")) {
        try {
          const { items, crawl } = await fetchSeries(
            `/api/v2/artist/${scUuid}/streaming/spotify/listening`,
          );
          lastCrawl["spotify"] = crawl;
          let pushed = 0;
          for (const item of items) {
            const value = (item as { value?: number }).value;
            const date = (item as { date?: string }).date;
            if (value == null || !date) continue;
            pushed++;
            rows.push({
              company_id: companyId,
              artist_id: ch.artist_id,
              channel_id: channelByKey.get(channelKey(ch.artist_id, "spotify")) ?? null,
              platform: "spotify",
              metric: "monthly_listeners",
              metric_date: String(date).slice(0, 10),
              value: Number(value),
              source: "aggregator",
              source_ref: "soundcharts",
              captured_at: new Date().toISOString(),
            });
          }
          platformStatus["spotify"] = pushed > 0 ? "ok" : "no_data";
        } catch (e) {
          const status = (e as { status?: number }).status;
          platformStatus["spotify"] = "error";
          errors.push({
            artist_id: ch.artist_id,
            platform: "spotify",
            status,
            error: e instanceof Error ? e.message : "erro",
          });
        }
      }
    }

    // dedup pela chave única antes do upsert
    const byKey = new Map<string, MetricRow>();
    for (const r of rows) {
      byKey.set(`${r.artist_id}|${r.platform}|${r.metric}|${r.metric_date}|${r.source}`, r);
    }
    // a API devolve descendente e ignora o sort: ordenar por data do nosso lado
    const unique = [...byKey.values()].sort((a, b) =>
      a.platform === b.platform
        ? (a.metric === b.metric
          ? a.metric_date.localeCompare(b.metric_date)
          : a.metric.localeCompare(b.metric))
        : a.platform.localeCompare(b.platform)
    );

    const summary: Record<string, {
      rows: number;
      min_date: string;
      max_date: string;
      max_date_value: number;
    }> = {};
    const seriesPoints = new Map<string, Array<{ date: string; value: number }>>();
    for (const r of unique) {
      const k = `${r.platform}.${r.metric}`;
      const cur = summary[k];
      if (!cur) {
        summary[k] = {
          rows: 1,
          min_date: r.metric_date,
          max_date: r.metric_date,
          max_date_value: r.value,
        };
      } else {
        cur.rows++;
        if (r.metric_date < cur.min_date) cur.min_date = r.metric_date;
        if (r.metric_date >= cur.max_date) {
          cur.max_date = r.metric_date;
          cur.max_date_value = r.value;
        }
      }
      const sk = `${r.artist_id}|${k}`;
      const arr = seriesPoints.get(sk) ?? [];
      arr.push({ date: r.metric_date, value: r.value });
      seriesPoints.set(sk, arr);
    }

    // resumo por artista × plataforma/métrica (deteta mistura de perfis)
    const seriesSummary: Record<string, Record<string, SeriesStats>> = {};
    for (const [sk, pts] of seriesPoints) {
      const [artistId, key] = sk.split("|");
      const label = `${nameById.get(artistId) ?? artistId}`;
      seriesSummary[label] = seriesSummary[label] ?? {};
      seriesSummary[label][key] = statsFor(pts);
    }

    let written = 0;
    if (!dryRun && unique.length) {
      for (let i = 0; i < unique.length; i += 500) {
        const chunk = unique.slice(i, i + 500);
        const { error: upErr } = await admin
          .from("artist_metrics_daily")
          .upsert(chunk, {
            onConflict: "artist_id,platform,metric,metric_date,source",
          });
        if (upErr) throw new Error(`upsert artist_metrics_daily: ${upErr.message}`);
        written += chunk.length;
      }
    }

    const body = {
      dry_run: dryRun,
      window: { start_date: startDate, end_date: endDate, blocks: windows.length },
      platforms,
      artists_processed: artistIds.length,
      soundcharts_calls: calls,
      rows_prepared: unique.length,
      rows_written: dryRun ? 0 : written,
      rows_by_platform_metric: summary,
      series_by_artist: seriesSummary,
      platform_status: platformStatus,
      last_crawl_date: lastCrawl,
      errors,
    };

    // em dry_run conta-se o que ficaria gravado, para distinguir 'no_data' real
    const effectiveRows = dryRun ? unique.length : written;
    await finishSyncRun(admin, runId, startedMs, {
      status: resolveStatus(effectiveRows, errors.length),
      api_calls: calls,
      rows_written: dryRun ? 0 : written,
      details: body,
    });

    return json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[soundcharts-sync]", msg);
    await finishSyncRun(admin, runId, startedMs, {
      status: "error",
      error_text: msg,
      details: { dry_run: runDryRun },
    });
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
