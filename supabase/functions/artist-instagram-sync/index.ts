// artist-instagram-sync — recolhe métricas oficiais do Instagram para as
// tabelas do módulo Carreira Artística. Trata as duas origens:
//   provider = 'instagram' → Instagram API with Instagram Login (ligação
//     directa do artista, token de utilizador, graph.instagram.com, nó `me`);
//   provider = 'meta'      → Instagram API with Facebook Login (token de Página,
//     graph.facebook.com, nó do ig user id).
//
// Autorização: service_role (uso interno/cron futuro) ou admin/platform_admin.
// Graph API v25.0 (versão actual). `impressions` está descontinuada desde a
// v22.0 — usa-se `views`. Nunca inventa valores: métrica ausente não é gravada.
//
// Escreve em: artist_metrics_daily, artist_audience_demographics,
// artist_content, artist_content_metrics_daily.

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
  GRAPH,
  graphGet,
  IG_GRAPH,
  json,
  metaErrorCode,
  toCount,
} from "../_shared/artist-meta.ts";

const FUNCTION_NAME = "artist-instagram-sync";
const PLATFORM = "instagram";
const SOURCE = "platform_api";
const MEDIA_LIMIT = 25;
const INVOKE_BUDGET_MS = 110_000;

/** Métricas de conta pedidas uma a uma (tolerante a métricas indisponíveis). */
const ACCOUNT_INSIGHTS = [
  "reach",
  "views",
  "accounts_engaged",
  "total_interactions",
  "profile_links_taps",
];

const MEDIA_INSIGHTS = [
  "reach",
  "views",
  "likes",
  "comments",
  "shares",
  "saved",
  "total_interactions",
];

// Timeframes: last_14_days / last_30_days / last_90_days / prev_month deixaram de
// ser suportados na v20.0 — só se enviam this_week e this_month.
// `engaged_audience_demographics` só vem se houver >= 100 interações no período,
// por isso tenta-se this_week e, se vier vazio, this_month uma vez.
// `reached_audience_demographics` já não consta da referência: pede-se UMA vez e,
// se a API a recusar, não se repete por breakdown.
const DEMOGRAPHIC_METRICS: Array<
  { metric: string; audience_type: string; timeframes: string[] }
> = [
  { metric: "follower_demographics", audience_type: "followers", timeframes: ["this_month"] },
  {
    metric: "engaged_audience_demographics",
    audience_type: "engaged",
    timeframes: ["this_week", "this_month"],
  },
  { metric: "reached_audience_demographics", audience_type: "reached", timeframes: ["this_week"] },
];
const BREAKDOWNS = ["city", "country", "age", "gender"] as const;

/** Corpo cru da resposta, truncado e sem qualquer token (o token só vai no URL). */
function rawSample(body: unknown): string {
  try {
    return JSON.stringify(body ?? null).slice(0, 1000);
  } catch (_e) {
    return "(corpo não serializável)";
  }
}

/** A API recusa a métrica em si (não é falta de dados)? */
function metricUnsupported(body: any): boolean {
  const msg = String(body?.error?.message ?? "").toLowerCase();
  return /metric|metrics\[/.test(msg) &&
    /(not supported|unsupported|does not exist|invalid|no longer)/.test(msg);
}

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

  let body: { artist_id?: string; connection_id?: string; dry_run?: boolean; max_media?: number } = {};
  try {
    body = await req.json();
  } catch (_e) { /* body opcional */ }
  const dryRun = body.dry_run !== false;
  const maxMedia = Number.isFinite(body.max_media) && (body.max_media ?? 0) > 0
    ? Math.min(Math.floor(body.max_media as number), 200)
    : MEDIA_LIMIT;

  // Duas origens: 'instagram' = ligação directa (Instagram Login, token do
  // utilizador em graph.instagram.com); 'meta' = Facebook Login (token de Página).
  let q = admin
    .from("artist_channel_connections")
    .select("id, artist_id, artist_channel_id, company_id, provider, external_account_id, external_account_username")
    .in("provider", ["instagram", "meta"])
    .eq("status", "active");
  if (body.artist_id) q = q.eq("artist_id", body.artist_id);
  if (body.connection_id) q = q.eq("id", body.connection_id);

  // Registo técnico da execução (nunca faz a sincronização falhar).
  const startedMs = Date.now();
  const runId = await startSyncRun(admin, {
    function_name: FUNCTION_NAME,
    trigger_source: deduceTriggerSource(req),
    dry_run: dryRun,
    artist_id: body.artist_id ?? null,
  });

  const { data: connections, error: cErr } = await q;
  if (cErr) {
    // falhou antes de gravar
    await finishSyncRun(admin, runId, startedMs, {
      status: "error",
      error_text: cErr.message,
    });
    return json({ error: cErr.message }, 500);
  }
  if (!connections?.length) {
    const emptyBody = {
      ok: true,
      dry_run: dryRun,
      connections: 0,
      artists: [],
      note: "sem ligações activas",
    };
    await finishSyncRun(admin, runId, startedMs, {
      status: "no_data",
      details: emptyBody,
    });
    return json(emptyBody);
  }

  const today = ymd(new Date());
  const yesterday = ymd(new Date(Date.now() - 86_400_000));

  let graphCalls = 0;
  let rowsWritten = 0;
  const errors: Array<{ connection_id: string; error: string }> = [];
  const summary: Array<Record<string, unknown>> = [];

  try {
  for (const conn of connections) {
    const per: Record<string, unknown> = {
      connection_id: conn.id,
      artist_id: conn.artist_id,
      instagram_username: conn.external_account_username,
      account_metrics: {} as Record<string, number>,
      insights: {} as Record<string, number>,
      demographics: 0,
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
      const token: string = t.access_token;
      const igId: string = conn.external_account_id ?? "";
      if (!igId) throw new Error("ligação sem instagram_user_id");

      // Ligação directa (Instagram Login): graph.instagram.com e nó `me`.
      const direct = conn.provider === "instagram";
      const base = direct ? IG_GRAPH : GRAPH;
      const node = direct ? "me" : igId;
      per.provider = conn.provider;

      const metricRows: Array<Record<string, unknown>> = [];
      const demoRows: Array<Record<string, unknown>> = [];

      // ---------------------------------------------------------- conta
      const acc = await graphGet(
        node,
        { fields: "followers_count,follows_count,media_count,username" },
        token,
        base,
      );
      graphCalls++;
      if (!acc.ok) {
        const code = metaErrorCode(acc.body);
        if (code === 190) {
          if (!dryRun) {
            await admin.rpc("artist_mark_connection_status", {
              p_connection_id: conn.id,
              p_status: "expired",
              p_error: acc.body?.error?.message ?? "token inválido (190)",
            });
            await admin
              .from("artist_channels")
              .update({ auth_status: "expired" })
              .eq("id", conn.artist_channel_id);
          }
          throw new Error("token expirado (190) — é preciso religar o Instagram");
        }
        throw new Error(acc.body?.error?.message ?? `HTTP ${acc.status}`);
      }

      for (const [field, metric] of [
        ["followers_count", "followers"],
        ["follows_count", "following"],
        ["media_count", "media_count"],
      ] as const) {
        const v = toCount(acc.body?.[field]);
        if (v === null) {
          notes.push(`conta: ${metric} não exposta`);
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
          source_ref: igId,
        });
      }

      // ------------------------------------------------- insights diários
      for (const metric of ACCOUNT_INSIGHTS) {
        const ins = await graphGet(
          `${node}/insights`,
          { metric, period: "day", since: yesterday, until: today },
          token,
          base,
        );
        graphCalls++;
        if (!ins.ok) {
          notes.push(`insight ${metric} indisponível: ${ins.body?.error?.message ?? ins.status}`);
          continue;
        }
        for (const entry of ins.body?.data ?? []) {
          const name = entry?.name ?? metric;
          const values = entry?.values ?? [];
          if (!values.length && entry?.total_value) {
            const v = toCount(entry.total_value.value);
            if (v === null) continue;
            (per.insights as Record<string, number>)[name] = v;
            metricRows.push({
              company_id: conn.company_id,
              artist_id: conn.artist_id,
              channel_id: conn.artist_channel_id,
              platform: PLATFORM,
              metric: name,
              metric_date: yesterday,
              value: v,
              source: SOURCE,
              source_ref: igId,
            });
            continue;
          }
          for (const point of values) {
            const v = toCount(point?.value);
            const day = point?.end_time ? String(point.end_time).slice(0, 10) : yesterday;
            if (v === null) continue;
            (per.insights as Record<string, number>)[name] = v;
            metricRows.push({
              company_id: conn.company_id,
              artist_id: conn.artist_id,
              channel_id: conn.artist_channel_id,
              platform: PLATFORM,
              metric: name,
              metric_date: day,
              value: v,
              source: SOURCE,
              source_ref: igId,
            });
          }
        }
      }

      // ---------------------------------------------------- demografia
      // Um corpo cru por métrica (truncado a 1000 caracteres, sem token) para
      // se distinguir "total_value vazio" de "resposta sem dados".
      const demoRaw: Record<string, { timeframe: string; breakdown: string; body: string }> = {};

      for (const dm of DEMOGRAPHIC_METRICS) {
        let unsupported = false;

        for (const breakdown of BREAKDOWNS) {
          if (unsupported) break;
          let rowsForPair = 0;
          let lastTimeframe = dm.timeframes[0];

          for (const timeframe of dm.timeframes) {
            lastTimeframe = timeframe;
            const dem = await graphGet(
              `${node}/insights`,
              {
                metric: dm.metric,
                period: "lifetime",
                timeframe,
                metric_type: "total_value",
                breakdown,
              },
              token,
              base,
            );
            graphCalls++;
            if (!demoRaw[dm.metric]) {
              demoRaw[dm.metric] = { timeframe, breakdown, body: rawSample(dem.body) };
            }

            if (!dem.ok) {
              if (metricUnsupported(dem.body)) {
                // nota única: não se repete a chamada pelos outros breakdowns
                unsupported = true;
                notes.push(
                  `demografia ${dm.metric}: métrica não suportada nesta versão da API (${GRAPH_VERSION}) — ${
                    String(dem.body?.error?.message ?? dem.status).slice(0, 300)
                  }`,
                );
              } else {
                notes.push(
                  `demografia ${dm.metric}/${breakdown} erro: ${
                    String(dem.body?.error?.message ?? dem.status).slice(0, 300)
                  }`,
                );
              }
              break;
            }

            for (const entry of dem.body?.data ?? []) {
              const results = entry?.total_value?.breakdowns?.[0]?.results ?? [];
              for (const r of results) {
                const v = toCount(r?.value);
                const key = (r?.dimension_values ?? []).join(" / ");
                if (v === null || !key) continue;
                rowsForPair++;
                demoRows.push({
                  company_id: conn.company_id,
                  artist_id: conn.artist_id,
                  platform: PLATFORM,
                  audience_type: dm.audience_type,
                  dimension: breakdown,
                  dim_key: key,
                  value: v,
                  timeframe,
                  snapshot_date: today,
                  source: SOURCE,
                });
              }
            }
            if (rowsForPair > 0) break; // não tenta o timeframe seguinte
          }

          if (!unsupported && rowsForPair === 0) {
            notes.push(
              `demografia ${dm.metric}/${breakdown} sem dados (abaixo do mínimo de 100 interações no período; timeframes tentados: ${
                dm.timeframes.join(", ")
              }, último ${lastTimeframe})`,
            );
          }
        }
      }
      per.demographics_raw = demoRaw;

      // ------------------------------------------------------ conteúdos
      const media = await graphGet(
        `${node}/media`,
        {
          fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp",
          limit: String(maxMedia),
        },
        token,
        base,
      );
      graphCalls++;

      const contentRows: Array<Record<string, unknown>> = [];
      const mediaList = media.ok ? (media.body?.data ?? []) : [];
      if (!media.ok) {
        notes.push(`publicações indisponíveis: ${media.body?.error?.message ?? media.status}`);
      }

      for (const m of mediaList) {
        const productType = String(m?.media_product_type ?? "").toUpperCase();
        const mediaType = String(m?.media_type ?? "").toUpperCase();
        const contentType = productType === "REELS"
          ? "reel"
          : productType === "STORY"
          ? "story"
          : mediaType === "CAROUSEL_ALBUM"
          ? "carousel"
          : mediaType === "VIDEO"
          ? "video"
          : mediaType === "IMAGE"
          ? "post"
          : "outro";
        contentRows.push({
          company_id: conn.company_id,
          artist_id: conn.artist_id,
          platform: PLATFORM,
          external_id: String(m.id),
          content_type: contentType,
          permalink: m?.permalink ?? null,
          caption_excerpt: m?.caption ? String(m.caption).slice(0, 200) : null,
          thumbnail_url: m?.thumbnail_url ?? m?.media_url ?? null,
          published_at: m?.timestamp ?? null,
        });
      }

      per.content = contentRows.length;
      per.demographics = demoRows.length;

      // ------------------------------------------------------- gravação
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
        if (demoRows.length) {
          const { error } = await admin
            .from("artist_audience_demographics")
            .upsert(demoRows, {
              onConflict:
                "artist_id,platform,audience_type,dimension,dim_key,snapshot_date",
            });
          if (error) throw new Error(`artist_audience_demographics: ${error.message}`);
          rowsWritten += demoRows.length;
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
          let mediaProcessed = 0;
          for (const m of mediaList) {
            if (Date.now() - startedMs > INVOKE_BUDGET_MS) {
              notes.push(
                `paragem por orçamento de tempo após ${mediaProcessed} publicações — repetir com max_media`,
              );
              break;
            }
            const contentId = byExternal.get(String(m.id));
            if (!contentId) continue;
            mediaProcessed++;
            const ins = await graphGet(
              `${m.id}/insights`,
              { metric: MEDIA_INSIGHTS.join(",") },
              token,
              base,
            );
            graphCalls++;
            if (!ins.ok) {
              notes.push(
                `métricas da publicação ${m.id} indisponíveis: ${ins.body?.error?.message ?? ins.status}`,
              );
              continue;
            }
            for (const entry of ins.body?.data ?? []) {
              const v = toCount(entry?.values?.[0]?.value ?? entry?.total_value?.value);
              if (v === null) continue;
              cmRows.push({
                company_id: conn.company_id,
                content_id: contentId,
                artist_id: conn.artist_id,
                platform: PLATFORM,
                metric: entry?.name ?? "desconhecida",
                metric_date: today,
                value: v,
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
      if (!dryRun && !msg.includes("190")) {
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
      entity_type: "artist_instagram_sync",
      entity_id: body.artist_id ?? body.connection_id ?? "all",
      action: "sync",
      changed_by: caller.userId ?? "service_role",
      metadata: { connections: connections.length, rows_written: rowsWritten, errors: errors.length },
    });
  }

  const resBody = {
    ok: errors.length === 0,
    dry_run: dryRun,
    params: { max_media: maxMedia },
    graph_version: "v25.0",
    connections: connections.length,
    graph_calls: graphCalls,
    rows_written: dryRun ? 0 : rowsWritten,
    estimated_song_links: estimatedSongLinks,
    song_link_notes: songLinkNotes,
    errors,
    artists: summary,
  };

  // em dry_run conta-se o que ficaria gravado, para distinguir 'no_data' real
  const effectiveRows = dryRun
    ? summary.reduce((s, p) => s + Number(p.metrics_prepared ?? 0), 0)
    : rowsWritten;
  await finishSyncRun(admin, runId, startedMs, {
    status: resolveStatus(effectiveRows, errors.length),
    api_calls: graphCalls,
    rows_written: dryRun ? 0 : rowsWritten,
    details: resBody,
  });

  return json(resBody);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[artist-instagram-sync]", msg);
    await finishSyncRun(admin, runId, startedMs, {
      status: rowsWritten > 0 ? "partial" : "error",
      api_calls: graphCalls,
      rows_written: dryRun ? 0 : rowsWritten,
      error_text: msg,
    });
    return json({ error: "sync_failed" }, 500);
  }
});
