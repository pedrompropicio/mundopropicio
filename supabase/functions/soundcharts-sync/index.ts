// soundcharts-sync — sincroniza métricas de audiência (Soundcharts) para
// public.artist_metrics_daily.
//
// Endpoints (confirmados no OpenAPI oficial em 11/set/2026):
//   GET /api/v2/artist/{uuid}/audience/{platform}            → "Get audience"
//        items[] = { date, followerCount, likeCount, ... }
//   GET /api/v2/artist/{uuid}/streaming/{platform}/listening  → "Get streaming audience"
//        items[] = { date, value }  (ouvintes mensais no Spotify)
//
// Só backend. Não cria cron. Não altera tabelas.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const auth = await authorize(req, admin);
    if (!auth.allowed) return json({ error: "Forbidden" }, 403);

    let payload: { artist_id?: string; dry_run?: boolean } = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }
    const dryRun = payload.dry_run === true;
    const onlyArtist = payload.artist_id ?? null;

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
      return json({
        artists_processed: 0,
        soundcharts_calls: 0,
        rows_written: {},
        errors: [],
        note: "Nenhum artista com canal 'aggregator' e external_id.",
      });
    }

    const artistIds = [...new Set(targets.map((c) => c.artist_id))];

    const { data: artists, error: aErr } = await admin
      .from("artists")
      .select("id, company_id")
      .in("id", artistIds);
    if (aErr) throw new Error(`artists: ${aErr.message}`);
    const companyById = new Map((artists ?? []).map((a) => [a.id, a.company_id]));

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
    const endDate = today();
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

    for (const ch of targets) {
      const companyId = companyById.get(ch.artist_id);
      if (!companyId) {
        errors.push({ artist_id: ch.artist_id, platform: "-", error: "artista sem company_id" });
        continue;
      }
      const scUuid = ch.external_id as string;

      // 2a. audience social
      for (const platform of ["tiktok", "instagram", "youtube"]) {
        try {
          const body = await fetchSc(
            `/api/v2/artist/${scUuid}/audience/${platform}?endDate=${endDate}&limit=100&sort=asc`,
          );
          lastCrawl[platform] = body?.related?.lastCrawlDate ?? null;
          const metric = SOCIAL_METRIC[platform];
          let pushed = 0;
          for (const item of body?.items ?? []) {
            const value = item?.followerCount;
            const date = item?.date;
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
      try {
        const body = await fetchSc(
          `/api/v2/artist/${scUuid}/streaming/spotify/listening?endDate=${endDate}&limit=100&sort=asc`,
        );
        lastCrawl["spotify"] = body?.related?.lastCrawlDate ?? null;
        let pushed = 0;
        for (const item of body?.items ?? []) {
          const value = item?.value;
          const date = item?.date;
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

    // dedup pela chave única antes do upsert
    const byKey = new Map<string, MetricRow>();
    for (const r of rows) {
      byKey.set(`${r.artist_id}|${r.platform}|${r.metric}|${r.metric_date}|${r.source}`, r);
    }
    const unique = [...byKey.values()];

    const summary: Record<string, number> = {};
    for (const r of unique) {
      const k = `${r.platform}.${r.metric}`;
      summary[k] = (summary[k] ?? 0) + 1;
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

    return json({
      dry_run: dryRun,
      artists_processed: artistIds.length,
      soundcharts_calls: calls,
      rows_prepared: unique.length,
      rows_written: dryRun ? 0 : written,
      rows_by_platform_metric: summary,
      errors,
    });
  } catch (e) {
    console.error("[soundcharts-sync]", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
