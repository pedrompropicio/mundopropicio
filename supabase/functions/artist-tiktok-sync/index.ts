// artist-tiktok-sync — recolha oficial do TikTok (Display API) para o módulo
// Carreira Artística: perfil (seguidores/seguindo/gostos/nº vídeos) e vídeos do
// próprio artista com as respectivas métricas.
//
// Fonte primária dos vídeos do próprio artista (D-ERP56). Autorização:
// service_role (cron) ou admin/platform_admin. Nunca inventa valores: métrica
// ausente não é gravada.
//
// Escreve em: artist_metrics_daily, artist_content, artist_content_metrics_daily.

import {
  deduceTriggerSource,
  finishSyncRun,
  resolveStatus,
  startSyncRun,
} from "../_shared/sync-run.ts";
import {
  adminClient,
  auditLog,
  authorize,
  corsHeaders,
  json,
  toCount,
} from "../_shared/artist-meta.ts";
import {
  TT_VIDEO_LIMIT,
  tiktokCreds,
  ttErrorText,
  ttRefresh,
  ttTokenInvalid,
  ttUserInfo,
  ttVideoPage,
} from "../_shared/artist-tiktok.ts";

const FUNCTION_NAME = "artist-tiktok-sync";
const PLATFORM = "tiktok";
const SOURCE = "platform_api";
const REFRESH_MARGIN_MS = 6 * 60 * 60 * 1000; // renova com <6 h de vida

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = adminClient();
  const caller = await authorize(req, admin, ["admin", "platform_admin"]);
  if (!caller.allowed) return json({ error: caller.reason ?? "not authorized" }, 403);

  const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!masterKey) return json({ error: "ENCRYPTION_MASTER_KEY não configurada" }, 500);
  const { creds, error: credErr } = tiktokCreds();
  if (credErr) return json({ error: credErr }, 500);

  let body: { artist_id?: string; connection_id?: string; dry_run?: boolean } = {};
  try {
    body = await req.json();
  } catch (_e) { /* body opcional */ }
  const dryRun = body.dry_run !== false;

  let q = admin
    .from("artist_channel_connections")
    .select("id, artist_id, artist_channel_id, company_id, external_account_id, external_account_username, expires_at, token_type")
    .eq("provider", PLATFORM)
    .eq("status", "active");
  if (body.artist_id) q = q.eq("artist_id", body.artist_id);
  if (body.connection_id) q = q.eq("id", body.connection_id);

  const startedMs = Date.now();
  const runId = await startSyncRun(admin, {
    function_name: FUNCTION_NAME,
    trigger_source: deduceTriggerSource(req),
    dry_run: dryRun,
    artist_id: body.artist_id ?? null,
  });

  const { data: connections, error: cErr } = await q;
  if (cErr) {
    await finishSyncRun(admin, runId, startedMs, { status: "error", error_text: cErr.message });
    return json({ error: cErr.message }, 500);
  }
  if (!connections?.length) {
    const emptyBody = {
      ok: true,
      dry_run: dryRun,
      connections: 0,
      artists: [],
      note: "sem ligações TikTok activas",
    };
    await finishSyncRun(admin, runId, startedMs, { status: "no_data", details: emptyBody });
    return json(emptyBody);
  }

  const today = ymd(new Date());
  let apiCalls = 0;
  let rowsWritten = 0;
  const errors: Array<{ connection_id: string; error: string }> = [];
  const summary: Array<Record<string, unknown>> = [];

  const markExpired = async (conn: { id: string; artist_channel_id: string }, msg: string) => {
    if (dryRun) return;
    await admin.rpc("artist_mark_connection_status", {
      p_connection_id: conn.id,
      p_status: "expired",
      p_error: msg,
    });
    await admin
      .from("artist_channels")
      .update({ auth_status: "expired" })
      .eq("id", conn.artist_channel_id);
  };

  try {
    for (const conn of connections) {
      const per: Record<string, unknown> = {
        connection_id: conn.id,
        artist_id: conn.artist_id,
        tiktok_username: conn.external_account_username,
        account_metrics: {} as Record<string, number>,
        content: 0,
        content_metrics: 0,
        notes: [] as string[],
      };
      const notes = per.notes as string[];

      try {
        const { data: tok, error: tErr } = await admin.rpc("artist_get_connection_token", {
          p_connection_id: conn.id,
          p_master_key: masterKey,
        });
        if (tErr) throw new Error(tErr.message);
        const t = Array.isArray(tok) ? tok[0] : tok;
        if (!t?.access_token) throw new Error("token não disponível");

        let token: string = t.access_token;
        const exp = t.expires_at ? Date.parse(t.expires_at) : null;
        const needsRefresh = exp === null || exp - Date.now() < REFRESH_MARGIN_MS;

        // --------------------------------------------------- renovação
        if (needsRefresh) {
          if (!t.refresh_token) {
            notes.push("sem refresh token guardado — é preciso religar o TikTok");
          } else if (dryRun) {
            notes.push("renovaria o access token (menos de 6 h de vida)");
          } else {
            const r = await ttRefresh(creds!, t.refresh_token);
            apiCalls++;
            if (!r.ok) {
              await markExpired(conn, r.error);
              throw new Error(`renovação falhou: ${r.error}`);
            }
            token = r.tokens.access_token;
            const { error: upErr } = await admin.rpc("artist_upsert_channel_connection", {
              p_artist_channel_id: conn.artist_channel_id,
              p_company_id: conn.company_id,
              p_artist_id: conn.artist_id,
              p_provider: PLATFORM,
              p_access_token: r.tokens.access_token,
              p_master_key: masterKey,
              p_external_account_id: conn.external_account_id ?? r.tokens.open_id ?? null,
              p_external_account_username: conn.external_account_username ?? null,
              p_external_page_id: null,
              p_external_page_name: null,
              p_token_type: conn.token_type ?? "tiktok_user",
              p_scopes: null,
              p_expires_at: r.tokens.expires_at,
              p_connected_by: null,
              p_refresh_token: r.tokens.refresh_token,
              p_refresh_expires_at: r.tokens.refresh_expires_at,
            });
            if (upErr) throw new Error(`gravar token renovado: ${upErr.message}`);
            notes.push("access token renovado");
          }
        }

        // ------------------------------------------------------- perfil
        const me = await ttUserInfo(token);
        apiCalls++;
        if (!me.ok) {
          const msg = ttErrorText(me.body, me.status);
          if (ttTokenInvalid(me.body, me.status)) {
            await markExpired(conn, msg);
            throw new Error(`token inválido — é preciso religar o TikTok (${msg})`);
          }
          throw new Error(msg);
        }
        const openId = String(me.user?.open_id ?? conn.external_account_id ?? "");

        const metricRows: Array<Record<string, unknown>> = [];
        for (const [field, metric] of [
          ["follower_count", "followers"],
          ["following_count", "following"],
          ["likes_count", "likes"],
          ["video_count", "video_count"],
        ] as const) {
          const v = toCount(me.user?.[field]);
          if (v === null) {
            notes.push(`perfil: ${metric} não exposta`);
            continue;
          }
          (per.account_metrics as Record<string, number>)[metric] = v;
          metricRows.push({
            company_id: conn.company_id,
            artist_id: conn.artist_id,
            channel_id: conn.artist_channel_id,
            platform: PLATFORM,
            metric,
            metric_date: today,
            value: v,
            source: SOURCE,
            source_ref: openId || null,
          });
        }

        // ------------------------------------------------------- vídeos
        const videos: any[] = [];
        let cursor: number | null = null;
        let guard = 0;
        while (videos.length < TT_VIDEO_LIMIT && guard < 20) {
          guard++;
          const page = await ttVideoPage(token, cursor);
          apiCalls++;
          if (!page.ok) {
            const msg = ttErrorText(page.body, page.status);
            if (ttTokenInvalid(page.body, page.status)) {
              await markExpired(conn, msg);
              throw new Error(`token inválido ao ler vídeos (${msg})`);
            }
            notes.push(`vídeos indisponíveis: ${msg}`);
            break;
          }
          videos.push(...page.videos);
          if (!page.hasMore || !page.cursor) break;
          cursor = Number(page.cursor);
        }
        const list = videos.slice(0, TT_VIDEO_LIMIT);

        const contentRows = list.map((v) => ({
          company_id: conn.company_id,
          artist_id: conn.artist_id,
          platform: PLATFORM,
          external_id: String(v.id),
          content_type: "video",
          source: SOURCE,
          title: v?.title ? String(v.title).slice(0, 300) : null,
          caption_excerpt: v?.video_description
            ? String(v.video_description).slice(0, 200)
            : null,
          permalink: v?.share_url ?? null,
          thumbnail_url: v?.cover_image_url ?? null,
          published_at: Number.isFinite(Number(v?.create_time))
            ? new Date(Number(v.create_time) * 1000).toISOString()
            : null,
          duration_seconds: toCount(v?.duration),
          author_handle: conn.external_account_username ?? null,
        }));
        per.content = contentRows.length;

        // ----------------------------------------------------- gravação
        if (!dryRun) {
          if (metricRows.length) {
            const { error } = await admin
              .from("artist_metrics_daily")
              .upsert(metricRows, {
                onConflict: "artist_id,platform,metric,metric_date,source",
              });
            if (error) throw new Error(`artist_metrics_daily: ${error.message}`);
            rowsWritten += metricRows.length;
          }

          if (contentRows.length) {
            const { data: saved, error } = await admin
              .from("artist_content")
              .upsert(contentRows, { onConflict: "artist_id,platform,external_id" })
              .select("id, external_id");
            if (error) throw new Error(`artist_content: ${error.message}`);
            rowsWritten += contentRows.length;

            const byExternal = new Map(
              (saved ?? []).map((r: { id: string; external_id: string }) => [r.external_id, r.id]),
            );

            const cmRows: Array<Record<string, unknown>> = [];
            for (const v of list) {
              const contentId = byExternal.get(String(v.id));
              if (!contentId) continue;
              for (const [field, metric] of [
                ["view_count", "views"],
                ["like_count", "likes"],
                ["comment_count", "comments"],
                ["share_count", "shares"],
              ] as const) {
                const value = toCount(v?.[field]);
                if (value === null) continue;
                cmRows.push({
                  company_id: conn.company_id,
                  content_id: contentId,
                  artist_id: conn.artist_id,
                  platform: PLATFORM,
                  metric,
                  metric_date: today,
                  value,
                  source: SOURCE,
                });
              }
            }
            if (cmRows.length) {
              const { error: cmErr } = await admin
                .from("artist_content_metrics_daily")
                .upsert(cmRows, { onConflict: "content_id,metric,metric_date,source" });
              if (cmErr) throw new Error(`artist_content_metrics_daily: ${cmErr.message}`);
              rowsWritten += cmRows.length;
            }
            per.content_metrics = cmRows.length;
          }

          await admin.rpc("artist_mark_connection_status", {
            p_connection_id: conn.id,
            p_status: "active",
            p_error: null,
          });
        } else {
          per.metrics_prepared = metricRows.length;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ connection_id: conn.id, error: msg });
        notes.push(`erro: ${msg}`);
        if (!dryRun && !msg.includes("token inválido") && !msg.includes("renovação falhou")) {
          await admin.rpc("artist_mark_connection_status", {
            p_connection_id: conn.id,
            p_status: "error",
            p_error: msg,
          });
        }
      }

      summary.push(per);
    }

    // ligação estimada vídeo→música por menção textual (nunca em dry_run)
    let estimatedSongLinks = 0;
    const songLinkNotes: string[] = [];
    if (!dryRun) {
      const artistIds = [...new Set(connections.map((c) => c.artist_id).filter(Boolean))];
      for (const aid of artistIds) {
        const { data: linked, error: linkErr } = await admin.rpc("artist_content_link_songs", {
          p_artist_id: aid,
          p_dry_run: false,
        });
        if (linkErr) {
          songLinkNotes.push(`ligação vídeo→música falhou (${aid}): ${linkErr.message}`);
        } else {
          estimatedSongLinks += (linked ?? []).filter((r: any) => r.song_id).length;
        }
      }
    }

    if (!dryRun) {
      await auditLog(admin, {
        entity_type: "artist_tiktok_sync",
        entity_id: body.artist_id ?? body.connection_id ?? "all",
        action: "sync",
        changed_by: caller.userId ?? "service_role",
        metadata: {
          connections: connections.length,
          rows_written: rowsWritten,
          errors: errors.length,
        },
      });
    }

    const resBody = {
      ok: errors.length === 0,
      dry_run: dryRun,
      connections: connections.length,
      api_calls: apiCalls,
      rows_written: dryRun ? 0 : rowsWritten,
      estimated_song_links: estimatedSongLinks,
      song_link_notes: songLinkNotes,
      errors,
      artists: summary,
    };

    await finishSyncRun(admin, runId, startedMs, {
      status: dryRun
        ? (errors.length ? "partial" : "no_data")
        : resolveStatus(rowsWritten, errors.length),
      api_calls: apiCalls,
      rows_written: dryRun ? 0 : rowsWritten,
      details: resBody,
    });

    return json(resBody);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishSyncRun(admin, runId, startedMs, {
      status: "error",
      api_calls: apiCalls,
      rows_written: rowsWritten,
      error_text: msg,
    });
    return json({ error: msg }, 500);
  }
});
