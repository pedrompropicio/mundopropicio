// artist-youtube-sync — sync diário do canal de YouTube do artista pela API
// (ligação OAuth provider 'google', D-ERP134).
//
// (a) GET youtube/v3/channels?part=statistics,snippet&mine=true → confirma o
//     external_id; grava subscribers / video_count / views_total (metric_date = hoje).
// (b) GET youtubeanalytics v2 reports, dimensions=day, D-27..D (D = ontem UTC)
//     → yt_views_day, yt_minutes_watched_day, yt_subscribers_gained_day,
//       yt_subscribers_lost_day (metric_date = dia; zeros gravam-se).
// platform 'youtube', source 'platform_api'. dry_run por omissão TRUE.
// Auth: service_role ou admin/platform_admin/manager/marketing_manager da
// empresa do artista (user_roles). Nunca regista tokens.

import { adminClient } from "../_shared/artist-meta.ts";
import { deduceTriggerSource, finishSyncRun, resolveStatus, startSyncRun } from "../_shared/sync-run.ts";

const FN = "artist-youtube-sync";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(["admin", "manager", "marketing_manager"]);
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
type Admin = any;

function isServiceRole(bearer: string): boolean {
  try {
    if (JSON.parse(atob(bearer.split(".")[1] ?? ""))?.role === "service_role") return true;
  } catch (_e) { /* não-JWT */ }
  return bearer === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "\u0000");
}

async function userCompanies(admin: Admin, bearer: string) {
  const { data: u, error } = await admin.auth.getUser(bearer);
  if (error || !u?.user) return null;
  const { data: roles } = await admin.from("user_roles").select("role, company_id").eq("user_id", u.user.id);
  const platform = (roles ?? []).some((r: any) => r.role === "platform_admin");
  const companies = new Set<string>(
    (roles ?? []).filter((r: any) => ROLES.has(r.role) && r.company_id).map((r: any) => r.company_id),
  );
  return { platform, companies };
}

class YtError extends Error {}

async function getToken(admin: Admin, connId: string, key: string): Promise<string> {
  const { data, error } = await admin.rpc("artist_get_connection_token", { p_connection_id: connId, p_master_key: key });
  const t = Array.isArray(data) ? data[0] : data;
  if (error || !t?.access_token) throw new YtError("leitura do token falhou");
  const fresh = t.expires_at && new Date(t.expires_at).getTime() > Date.now() + 5 * 60_000;
  if (fresh) return t.access_token;
  if (!t.refresh_token) throw new YtError("ligação sem refresh_token — voltar a ligar");

  const clientId = Deno.env.get("GOOGLE_YT_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_YT_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new YtError("cliente OAuth Google não configurado");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: clientId, client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.access_token) {
    if (j?.error === "invalid_grant") {
      await admin.from("artist_channel_connections").update({
        status: "expired", last_error: "YouTube: autorização revogada ou expirada — voltar a ligar",
      }).eq("id", connId);
      throw new YtError("YouTube: autorização revogada ou expirada — voltar a ligar");
    }
    throw new YtError(`renovação do token falhou (HTTP ${res.status})`);
  }
  const expiresAt = new Date(Date.now() + (Number(j.expires_in) || 3600) * 1000).toISOString();
  const { error: stErr } = await admin.rpc("artist_channel_store_rotated_tokens", {
    p_connection_id: connId, p_master_key: key, p_access_token: j.access_token,
    p_refresh_token: j.refresh_token ?? t.refresh_token, p_expires_at: expiresAt,
  });
  if (stErr) throw new YtError("token renovado mas não gravado");
  return j.access_token;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function syncOne(admin: Admin, conn: any, dryRun: boolean, key: string) {
  const notes: string[] = [];
  let apiCalls = 0;
  const { data: ch } = await admin.from("artist_channels")
    .select("id, external_id").eq("id", conn.artist_channel_id).maybeSingle();
  if (!ch?.external_id) throw new YtError("canal youtube sem external_id");

  const token = await getToken(admin, conn.id, key);
  const H = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  apiCalls++;
  const r1 = await fetch("https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&mine=true",
    { headers: H, signal: AbortSignal.timeout(20_000) });
  const j1 = await r1.json().catch(() => null);
  if (!r1.ok) throw new YtError(`channels falhou (HTTP ${r1.status})`);
  const item = (j1?.items ?? []).find((i: any) => i?.id === ch.external_id);
  if (!item) throw new YtError("o canal da conta Google não é o external_id registado — nada gravado");

  const today = new Date();
  const hoje = ymd(today);
  const base = {
    company_id: conn.company_id, artist_id: conn.artist_id, channel_id: ch.id,
    platform: "youtube", source: "platform_api", source_ref: "youtube_api",
    captured_at: today.toISOString(),
  };
  const rows: any[] = [];
  const st = item.statistics ?? {};
  if (st.hiddenSubscriberCount) notes.push("subscritores ocultos no canal — subscribers não gravado");
  else if (st.subscriberCount != null) rows.push({ ...base, metric: "subscribers", metric_date: hoje, value: Number(st.subscriberCount) });
  if (st.videoCount != null) rows.push({ ...base, metric: "video_count", metric_date: hoje, value: Number(st.videoCount) });
  if (st.viewCount != null) rows.push({ ...base, metric: "views_total", metric_date: hoje, value: Number(st.viewCount) });

  const D = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
  const F = new Date(D.getTime() - 27 * 86_400_000);
  const q = new URLSearchParams({
    ids: "channel==MINE", startDate: ymd(F), endDate: ymd(D),
    metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost", dimensions: "day",
  });
  apiCalls++;
  const r2 = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${q}`,
    { headers: H, signal: AbortSignal.timeout(30_000) });
  const j2 = await r2.json().catch(() => null);
  if (!r2.ok) notes.push(`analytics falhou (HTTP ${r2.status})`);
  else {
    const cols: string[] = (j2?.columnHeaders ?? []).map((c: any) => c?.name);
    const map: Record<string, string> = {
      views: "yt_views_day", estimatedMinutesWatched: "yt_minutes_watched_day",
      subscribersGained: "yt_subscribers_gained_day", subscribersLost: "yt_subscribers_lost_day",
    };
    const di = cols.indexOf("day");
    for (const row of j2?.rows ?? []) {
      const day = String(row[di]);
      for (const [src, metric] of Object.entries(map)) {
        const i = cols.indexOf(src);
        if (i < 0 || row[i] == null) continue;
        rows.push({ ...base, metric, metric_date: day, value: Number(row[i]) });
      }
    }
    if (!(j2?.rows ?? []).length) notes.push("analytics sem linhas no período");
  }

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.metric] = (counts[r.metric] ?? 0) + 1;
  let written = 0;
  if (!dryRun && rows.length) {
    const { error } = await admin.from("artist_metrics_daily")
      .upsert(rows, { onConflict: "artist_id,platform,metric,metric_date,source" });
    if (error) throw new YtError(`upsert falhou: ${error.message}`);
    written = rows.length;
    await admin.from("artist_channel_connections").update({ last_error: null }).eq("id", conn.id);
  }
  return {
    artist_id: conn.artist_id, channel: item.snippet?.title ?? null, janela: { de: ymd(F), ate: ymd(D) },
    counts, amostra: rows.slice(0, 3).map(({ metric, metric_date, value }) => ({ metric, metric_date, value })),
    written, api_calls: apiCalls, notes,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "método" }, 405);
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "sem sessão" }, 401);
  const body = await req.json().catch(() => ({}));
  const artistId = body?.artist_id ?? null;
  if (artistId !== null && (typeof artistId !== "string" || !UUID_RE.test(artistId))) {
    return json({ ok: false, error: "artist_id inválido" }, 400);
  }
  const dryRun = body?.dry_run !== false;
  const key = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!key) return json({ ok: false, error: "ENCRYPTION_MASTER_KEY não configurada" }, 500);

  const admin = adminClient();
  const sr = isServiceRole(bearer);
  let allowed: ((companyId: string) => boolean) = () => true;
  if (!sr) {
    const u = await userCompanies(admin, bearer);
    if (!u) return json({ ok: false, error: "sessão inválida" }, 401);
    allowed = (c) => u.platform || u.companies.has(c);
  }

  let qb = admin.from("artist_channel_connections")
    .select("id, artist_id, company_id, artist_channel_id, status").eq("provider", "google").eq("status", "active");
  if (artistId) qb = qb.eq("artist_id", artistId);
  const { data: conns, error } = await qb;
  if (error) return json({ ok: false, error: "leitura das ligações falhou" }, 500);
  const list = (conns ?? []).filter((c: any) => allowed(c.company_id));
  if (artistId && !list.length) {
    return json({ ok: false, error: (conns ?? []).length ? "papel insuficiente" : "sem ligação google activa" },
      (conns ?? []).length ? 403 : 404);
  }

  const trigger = deduceTriggerSource(req);
  const results: unknown[] = [];
  for (const c of list) {
    const started = Date.now();
    const runId = await startSyncRun(admin, {
      function_name: FN, trigger_source: trigger, dry_run: dryRun, company_id: c.company_id, artist_id: c.artist_id,
    });
    try {
      const r = await syncOne(admin, c, dryRun, key);
      await finishSyncRun(admin, runId, started, {
        status: resolveStatus(r.written, r.notes.some((n) => n.includes("falhou")) ? 1 : 0),
        api_calls: r.api_calls, rows_written: r.written, details: { counts: r.counts, notes: r.notes, janela: r.janela },
      });
      results.push({ ok: true, ...r });
    } catch (e) {
      const msg = e instanceof YtError ? e.message : "erro inesperado";
      if (!(e instanceof YtError)) console.error(`[${FN}]`, (e as Error)?.message);
      await finishSyncRun(admin, runId, started, { status: "error", error_text: msg });
      results.push({ ok: false, artist_id: c.artist_id, error: msg });
    }
  }
  return json({ ok: true, dry_run: dryRun, artistas: results.length, results });
});
