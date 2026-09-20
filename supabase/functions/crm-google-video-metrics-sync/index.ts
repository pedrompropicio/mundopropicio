// crm-google-video-metrics-sync  (PASSO 1 da captação de métricas de vídeo)
//
// Só LEITURA na Google Ads API + escrita em COLUNAS PRÓPRIAS (cada escritor é
// dono das suas colunas; nunca dois syncs a escrever o mesmo jsonb):
//   crm.google_campaign_insights_daily.video_metrics
//   crm.google_campaign.settings + crm.google_campaign.reach
//   crm.google_ad_group               (campanhas VIDEO; tabela exclusiva)
// raw/metrics/impressions/clicks/spend_cents/currency/last_synced_at são do
// crm-google-sync-campaigns (cron 3h) e NUNCA são escritas aqui em linhas que
// já existem — era isso que apagava as métricas de vídeo de 3 em 3 horas.
//
// Âmbito: ligações google com connection_scope='artist' (hoje só a do Litto).
// NÃO altera o crm-google-sync-campaigns (caminho de eventos intacto), nem
// nenhuma RPC. Nomes de métricas são CONFIRMADOS em runtime pelo
// GoogleAdsFieldService antes de serem pedidos (nada é adivinhado).
//
// Versão da API: v24 (a mesma do sync).

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { getGoogleAdsAccessToken } from "../_shared/google-ads.ts";
import { finishSyncRun, resolveStatus, startSyncRun } from "../_shared/sync-run.ts";

const API_VERSION = "v24";
const BASE = `https://googleads.googleapis.com/${API_VERSION}`;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DEV_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
const LOGIN_CID_FALLBACK = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Row = Record<string, any>;

interface Ctx {
  accessToken: string;
  loginCustomerId: string;
  customerId: string;
}

async function gaql(ctx: Ctx, query: string): Promise<Row[]> {
  const resp = await fetch(`${BASE}/customers/${ctx.customerId}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "developer-token": DEV_TOKEN!,
      "login-customer-id": ctx.loginCustomerId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    console.error(`[gaql] ${resp.status} customer=${ctx.customerId} body=${text.slice(0, 2000)}`);
    throw new Error(`google_ads_api ${resp.status}: ${text.slice(0, 2000)}`);
  }
  const parsed = JSON.parse(text);
  const chunks = Array.isArray(parsed) ? parsed : [parsed];
  const out: Row[] = [];
  for (const c of chunks) if (Array.isArray(c?.results)) out.push(...c.results);
  return out;
}

/** GoogleAdsFieldService — confirma nomes e `selectable` antes de pedir. */
async function searchFields(ctx: Ctx, like: string): Promise<Row[]> {
  const resp = await fetch(`${BASE}/googleAdsFields:search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "developer-token": DEV_TOKEN!,
      "login-customer-id": ctx.loginCustomerId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query:
        // GoogleAdsFieldService NÃO aceita cláusula FROM (só o GoogleAdsService).
        `SELECT name, selectable, filterable, data_type, metrics, segments WHERE name LIKE '${like}'`,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`google_ads_fields ${resp.status}: ${text.slice(0, 2000)}`);
  const parsed = JSON.parse(text);
  return Array.isArray(parsed?.results) ? parsed.results : [];
}

const PROBE_LIKES = [
  "%video%",
  "%average_cpv%",
  "%engagements%",
  "%unique_users%",
  "%average_impression_frequency_per_user%",
  "campaign.%",
  "campaign_criterion.%",
  "ad_group.%",
  "ad_group_ad.%",
  "ad_group_ad_asset_view.%",
  "asset.%",
];

/** Nomes selecionáveis existentes na versão atual da API. */
async function probeSelectable(
  ctx: Ctx,
): Promise<{ selectable: Set<string>; found: string[]; metricas: string[] }> {
  const selectable = new Set<string>();
  const found: string[] = [];
  for (const like of PROBE_LIKES) {
    const rows = await searchFields(ctx, like);
    for (const r of rows) {
      const name = String(r.name ?? "");
      if (!name) continue;
      if (r.selectable === true) {
        selectable.add(name);
        if (!like.endsWith(".%")) found.push(name);
      }
    }
  }
  // métricas de interesse realmente existentes nesta versão (para diagnóstico)
  const metricas = Array.from(selectable)
    .filter((n) =>
      /^metrics\.(video|.*cpv|engagements|unique_users|average_impression_frequency)/.test(n)
    )
    .sort();
  console.log(`[probe] selectable=${selectable.size} métricas: ${metricas.join(", ")}`);
  return { selectable, found: found.sort(), metricas };
}

/** Métricas de vídeo desejadas → só as que a API confirma. */
const VIDEO_METRIC_CANDIDATES = [
  "metrics.video_views",
  "metrics.video_trueview_views",
  "metrics.video_view_rate",
  "metrics.video_trueview_view_rate",
  "metrics.video_quartile_p25_rate",
  "metrics.video_quartile_p50_rate",
  "metrics.video_quartile_p75_rate",
  "metrics.video_quartile_p100_rate",
  "metrics.average_cpv",
  "metrics.trueview_average_cpv",
  "metrics.engagements",
];

const REACH_METRIC_CANDIDATES = [
  "metrics.unique_users",
  "metrics.average_impression_frequency_per_user",
];

const CAMPAIGN_CONFIG_CANDIDATES = [
  "campaign.advertising_channel_type",
  "campaign.advertising_channel_sub_type",
  "campaign.status",
  "campaign.frequency_caps",
  "campaign.video_brand_safety_suitability",
  "campaign.start_date_time",
  "campaign.end_date_time",
  "campaign.bidding_strategy_type",
  "campaign.target_cpm.target_frequency_goal",
  "campaign.video_campaign_settings.video_ad_inventory_control.allow_in_stream",
  "campaign.video_campaign_settings.video_ad_inventory_control.allow_in_feed",
  "campaign.video_campaign_settings.video_ad_inventory_control.allow_shorts",
];

const CRITERION_CANDIDATES = [
  "campaign_criterion.criterion_id",
  "campaign_criterion.type",
  "campaign_criterion.negative",
  "campaign_criterion.location.geo_target_constant",
  "campaign_criterion.language.language_constant",
  "campaign_criterion.age_range.type",
  "campaign_criterion.gender.type",
  "campaign_criterion.device.type",
  "campaign_criterion.bid_modifier",
];

/** Nível ANÚNCIO (D-ERP111). Só os nomes que o GoogleAdsFieldService confirmar. */
const AD_CANDIDATES = [
  "ad_group_ad.ad.id",
  "ad_group_ad.ad.name",
  "ad_group_ad.ad.type",
  "ad_group_ad.ad.resource_name",
  "ad_group_ad.ad.final_urls",
  "ad_group_ad.status",
  "ad_group_ad.resource_name",
];

/** Vídeo do YouTube de cada anúncio, via ad_group_ad_asset_view + asset. */
const AD_ASSET_CANDIDATES = [
  "ad_group_ad_asset_view.field_type",
  "ad_group_ad_asset_view.ad_group_ad",
  "asset.id",
  "asset.youtube_video_asset.youtube_video_id",
  "asset.youtube_video_asset.youtube_video_title",
];



function keep(list: string[], selectable: Set<string>): string[] {
  return list.filter((n) => selectable.has(n));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function range(days: number): { since: string; until: string } {
  const until = new Date();
  const since = new Date(until.getTime() - days * 86400000);
  return { since: isoDate(since), until: isoDate(until) };
}
function microsToCents(v: unknown): number {
  if (v == null) return 0;
  return Math.round(Number(v) / 10000);
}
function num(v: unknown): number {
  return v == null ? 0 : Number(v);
}
/** "metrics.video_quartile_p25_rate" → "videoQuartileP25Rate" (chave do JSON). */
function apiKeyToJson(field: string): string {
  const leaf = field.split(".").slice(1).join("_");
  return leaf.replace(/_([a-z0-9])/g, (_m, c) => String(c).toUpperCase());
}
function geoId(v: unknown): string | null {
  const m = v == null ? null : String(v).match(/(\d+)\s*$/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // auth: service_role (cron) ou JWT de utilizador autenticado
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  let isServiceRole = token === SERVICE_ROLE;
  if (!isServiceRole) {
    try {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        if (payload?.role === "service_role") isServiceRole = true;
      }
    } catch (_e) { /* tenta como user token */ }
  }
  if (!isServiceRole) {
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supa.auth.getClaims(token);
    if (error || !data?.claims?.sub) return json({ error: "unauthorized" }, 401);
  }

  if (!DEV_TOKEN) return json({ error: "missing_secret_GOOGLE_ADS_DEVELOPER_TOKEN" }, 500);

  let body: {
    connection_id?: string;
    company_id?: string;
    days?: number;
    probe_only?: boolean;
  } = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) body = await req.json();
  } catch (_e) { /* body opcional */ }

  const days = Math.min(90, Math.max(1, Math.floor(Number(body.days ?? 30))));
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let accessToken: string;
  try {
    accessToken = await getGoogleAdsAccessToken();
  } catch (e) {
    return json({ error: "google_oauth_failed", detail: (e as Error).message }, 500);
  }

  let q = (supabase as any)
    .schema("crm")
    .from("ad_platform_connections")
    .select(
      "id, company_id, artist_id, selected_ad_account_id, selected_ad_account_currency, external_business_id, login_customer_id",
    )
    .eq("platform", "google")
    .eq("connection_scope", "artist")
    .in("status", ["active", "pending_link"]);
  if (body.connection_id) q = q.eq("id", body.connection_id);
  if (body.company_id) q = q.eq("company_id", body.company_id);
  const { data: conns, error: connErr } = await q;
  if (connErr) return json({ error: "connections_query_failed", detail: connErr.message }, 500);
  if (!conns || conns.length === 0) return json({ error: "no_artist_google_connection" }, 404);

  const startedMs = Date.now();
  const runId = await startSyncRun(supabase, {
    function_name: "crm-google-video-metrics-sync",
    trigger_source: "api",
    dry_run: body.probe_only === true,
    company_id: conns[0]?.company_id ?? null,
    artist_id: conns[0]?.artist_id ?? null,
  });

  const notes: string[] = [];
  let rowsWritten = 0;
  let apiCalls = 0;
  let errorCount = 0;
  const perConnection: Record<string, Record<string, unknown>> = {};
  let confirmed: Record<string, string[]> = {};

  const { since, until } = range(days);
  const nowIso = new Date().toISOString();

  for (const conn of conns) {
    const customerId = String(conn.selected_ad_account_id || conn.external_business_id || "")
      .replace(/-/g, "");
    const loginCustomerId = String(conn.login_customer_id || LOGIN_CID_FALLBACK || "")
      .replace(/-/g, "");
    if (!customerId || !loginCustomerId) {
      errorCount++;
      notes.push(`ligação ${conn.id}: missing_customer_or_login_id`);
      continue;
    }
    const ctx: Ctx = { accessToken, loginCustomerId, customerId };
    const per: Record<string, unknown> = {};

    // ---- 1) Confirmação de nomes (GoogleAdsFieldService) --------------------
    let selectable = new Set<string>();
    try {
      apiCalls += PROBE_LIKES.length;
      const probe = await probeSelectable(ctx);
      selectable = probe.selectable;
      per.metricas_disponiveis = probe.metricas;
    } catch (e) {
      errorCount++;
      notes.push(`ligação ${conn.id}: probe de campos falhou (${(e as Error).message})`);
      perConnection[conn.id] = per;
      continue;
    }

    const videoFields = keep(VIDEO_METRIC_CANDIDATES, selectable);
    const reachFields = keep(REACH_METRIC_CANDIDATES, selectable);
    const configFields = keep(CAMPAIGN_CONFIG_CANDIDATES, selectable);
    const critFields = keep(CRITERION_CANDIDATES, selectable);
    const adFields = keep(AD_CANDIDATES, selectable);
    const adAssetFields = keep(AD_ASSET_CANDIDATES, selectable);
    confirmed = {
      video: videoFields,
      alcance: reachFields,
      configuracao: configFields,
      criterios: critFields,
      anuncio: adFields,
      anuncio_asset: adAssetFields,
    };
    per.metricas_video = videoFields;
    per.metricas_alcance = reachFields;
    per.campos_anuncio = adFields;
    per.campos_anuncio_asset = adAssetFields;
    // campos de vídeo do próprio anúncio existentes nesta versão (diagnóstico
    // e fonte da via alternativa ao ad_group_ad_asset_view)
    const adVideoFields = Array.from(selectable)
      .filter((n) => /^ad_group_ad\.ad\.(video_responsive_ad|video_ad)\./.test(n))
      .sort();
    per.campos_video_do_anuncio = adVideoFields;
    console.log(`[confirmado] video=${videoFields.join(",")} alcance=${reachFields.join(",")}`);

    // nome da métrica de visualizações nesta versão (pode ter mudado)
    const viewsField = videoFields.find((f) =>
      f === "metrics.video_views" || f === "metrics.video_trueview_views"
    ) ?? null;
    per.campo_visualizacoes = viewsField;

    if (body.probe_only === true) {
      perConnection[conn.id] = per;
      continue;
    }

    // ---- 2+3) Diário por campanha com métricas de vídeo (backfill `days`) ---
    try {
      apiCalls++;
      const selectVideo = videoFields.length ? `,\n    ${videoFields.join(",\n    ")}` : "";
      const rows = await gaql(
        ctx,
        `
  SELECT
    campaign.id,
    campaign.name,
    customer.currency_code,
    segments.date,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions,
    metrics.conversions_value${selectVideo}
  FROM campaign
  WHERE segments.date BETWEEN '${since}' AND '${until}'
`,
      );

      // Constrói o objecto `video_metrics` (coluna PRÓPRIA desta função) só com
      // as métricas que a API confirmou. Ausentes ficam de fora — nunca a zero.
      const vmFrom = (m: Row, views: number): Row => {
        const vm: Row = {
          api_version: API_VERSION,
          recolhido_em: nowIso,
          video_views: views,
        };
        if (viewsField) vm.campo_visualizacoes = viewsField;
        const put = (field: string, alvo: string, transform?: (v: number) => number) => {
          if (!videoFields.includes(field)) return;
          const v = m[apiKeyToJson(field)];
          if (v == null) return;
          vm[alvo] = transform ? transform(Number(v)) : Number(v);
        };
        put("metrics.video_view_rate", "view_rate");
        put("metrics.video_trueview_view_rate", "view_rate");
        put("metrics.video_quartile_p25_rate", "quartil_p25");
        put("metrics.video_quartile_p50_rate", "quartil_p50");
        put("metrics.video_quartile_p75_rate", "quartil_p75");
        put("metrics.video_quartile_p100_rate", "quartil_p100");
        put("metrics.average_cpv", "cpv_medio_micros");
        put("metrics.trueview_average_cpv", "cpv_medio_micros");
        put("metrics.engagements", "engagements");
        return vm;
      };

      const byKey = new Map<string, Row>();
      for (const r of rows) {
        const id = r.campaign?.id != null ? String(r.campaign.id) : null;
        const date = r.segments?.date ? String(r.segments.date).slice(0, 10) : null;
        if (!id || !date) continue;
        const m = r.metrics ?? {};
        const views = viewsField ? Math.round(num(m[apiKeyToJson(viewsField)])) : 0;
        const key = `${id}|${date}`;
        const prev = byKey.get(key);
        const impressions = num(m.impressions);
        const clicks = num(m.clicks);
        const spend = microsToCents(m.costMicros);
        if (prev) {
          prev.impressions += impressions;
          prev.clicks += clicks;
          prev.spend_cents += spend;
          prev.conversions += num(m.conversions);
          prev.conversions_value_cents += microsToCents(num(m.conversionsValue) * 1_000_000);
          prev.video_metrics.video_views += views;
          if (prev.video_metrics.engagements != null && m[apiKeyToJson("metrics.engagements")] != null) {
            prev.video_metrics.engagements += num(m[apiKeyToJson("metrics.engagements")]);
          }
          continue;
        }
        byKey.set(key, {
          connection_id: conn.id,
          company_id: conn.company_id,
          customer_id: customerId,
          external_campaign_id: id,
          campaign_name: r.campaign?.name ?? null,
          date_start: date,
          date_stop: date,
          impressions,
          clicks,
          spend_cents: spend,
          conversions: num(m.conversions),
          conversions_value_cents: microsToCents(num(m.conversionsValue) * 1_000_000),
          cpc_cents: null,
          cpm_cents: null,
          ctr: null,
          currency: r.customer?.currencyCode ?? conn.selected_ad_account_currency ?? null,
          raw: r,
          video_metrics: vmFrom(m, views),
          last_synced_at: nowIso,
          updated_at: nowIso,
        });
      }
      const daily = Array.from(byKey.values());
      for (const row of daily) {
        row.cpc_cents = row.clicks > 0 ? row.spend_cents / row.clicks : null;
        row.cpm_cents = row.impressions > 0 ? (row.spend_cents / row.impressions) * 1000 : null;
        row.ctr = row.impressions > 0 ? row.clicks / row.impressions : null;
      }
      // Linha existente: UPDATE só de `video_metrics` (as restantes colunas são
      // do crm-google-sync-campaigns). Linha inexistente: insere completa.
      let atualizadas = 0;
      let inseridas = 0;
      for (const row of daily) {
        const { data: upd, error: uErr } = await (supabase as any)
          .schema("crm")
          .from("google_campaign_insights_daily")
          .update({ video_metrics: row.video_metrics })
          .eq("connection_id", conn.id)
          .eq("external_campaign_id", row.external_campaign_id)
          .eq("date_start", row.date_start)
          .select("external_campaign_id");
        if (uErr) throw new Error("daily_update_failed: " + uErr.message);
        if ((upd ?? []).length > 0) {
          atualizadas++;
          rowsWritten++;
          continue;
        }
        const { error: iErr } = await (supabase as any)
          .schema("crm")
          .from("google_campaign_insights_daily")
          .upsert([row], { onConflict: "connection_id,external_campaign_id,date_start" });
        if (iErr) throw new Error("daily_insert_failed: " + iErr.message);
        inseridas++;
        rowsWritten++;
      }
      per.dias_atualizados = atualizadas;
      per.dias_inseridos = inseridas;
    } catch (e) {
      errorCount++;
      notes.push(`ligação ${conn.id}: diário de vídeo falhou (${(e as Error).message})`);
    }

    // ---- 4) Configuração da campanha + critérios → google_campaign.raw -----
    const configByCampaign = new Map<string, Row>();
    try {
      apiCalls++;
      const rows = await gaql(
        ctx,
        `
  SELECT
    campaign.id,
    ${configFields.join(",\n    ")}
  FROM campaign
`,
      );
      for (const r of rows) {
        const id = r.campaign?.id != null ? String(r.campaign.id) : null;
        if (id) configByCampaign.set(id, { campanha: r.campaign ?? {}, criterios: [] });
      }
    } catch (e) {
      errorCount++;
      notes.push(`ligação ${conn.id}: configuração da campanha falhou (${(e as Error).message})`);
    }

    try {
      apiCalls++;
      const rows = await gaql(
        ctx,
        `
  SELECT
    campaign.id,
    ${critFields.join(",\n    ")}
  FROM campaign_criterion
`,
      );
      // nomes canónicos das localizações
      const geoIds = new Set<string>();
      for (const r of rows) {
        const g = geoId(r.campaignCriterion?.location?.geoTargetConstant);
        if (g) geoIds.add(g);
      }
      const geoNames = new Map<string, { name: string; canonical: string }>();
      const idsArr = Array.from(geoIds);
      for (let i = 0; i < idsArr.length; i += 200) {
        apiCalls++;
        const chunk = idsArr.slice(i, i + 200);
        try {
          const gr = await gaql(
            ctx,
            `SELECT geo_target_constant.id, geo_target_constant.name, geo_target_constant.canonical_name FROM geo_target_constant WHERE geo_target_constant.id IN (${
              chunk.join(",")
            })`,
          );
          for (const r of gr) {
            const g = r.geoTargetConstant ?? {};
            if (g.id != null) {
              geoNames.set(String(g.id), {
                name: String(g.name ?? ""),
                canonical: String(g.canonicalName ?? ""),
              });
            }
          }
        } catch (e) {
          notes.push(`ligação ${conn.id}: nomes de geografia não resolvidos (${(e as Error).message})`);
        }
      }

      for (const r of rows) {
        const id = r.campaign?.id != null ? String(r.campaign.id) : null;
        if (!id) continue;
        const entry = configByCampaign.get(id) ?? { campanha: {}, criterios: [] };
        const cc = r.campaignCriterion ?? {};
        const gid = geoId(cc.location?.geoTargetConstant);
        entry.criterios.push({
          criterion_id: cc.criterionId ?? null,
          tipo: cc.type ?? null,
          negativo: cc.negative === true,
          bid_modifier: cc.bidModifier ?? null,
          localizacao: gid
            ? {
              geo_target_constant_id: gid,
              nome: geoNames.get(gid)?.name ?? null,
              nome_canonico: geoNames.get(gid)?.canonical ?? null,
            }
            : null,
          lingua: cc.language?.languageConstant ?? null,
          faixa_etaria: cc.ageRange?.type ?? null,
          genero: cc.gender?.type ?? null,
          dispositivo: cc.device?.type ?? null,
        });
        configByCampaign.set(id, entry);
      }
      per.campanhas_com_config = configByCampaign.size;
    } catch (e) {
      errorCount++;
      notes.push(`ligação ${conn.id}: critérios da campanha falharam (${(e as Error).message})`);
    }

    // ---- 5) Alcance e frequência por período fechado (7d e 30d) ------------
    const reachByCampaign = new Map<string, Row>();
    if (reachFields.length) {
      for (const p of [7, 30]) {
        const r7 = range(p);
        try {
          apiCalls++;
          const rows = await gaql(
            ctx,
            `
  SELECT
    campaign.id,
    ${reachFields.join(",\n    ")}
  FROM campaign
  WHERE segments.date BETWEEN '${r7.since}' AND '${r7.until}'
`,
          );
          for (const r of rows) {
            const id = r.campaign?.id != null ? String(r.campaign.id) : null;
            if (!id) continue;
            const acc = reachByCampaign.get(id) ?? {};
            acc[`ultimos_${p}_dias`] = {
              periodo: `${r7.since}..${r7.until}`,
              recolhido_em: nowIso,
              unique_users: r.metrics?.uniqueUsers != null ? Number(r.metrics.uniqueUsers) : null,
              average_impression_frequency_per_user:
                r.metrics?.averageImpressionFrequencyPerUser != null
                  ? Number(r.metrics.averageImpressionFrequencyPerUser)
                  : null,
            };
            reachByCampaign.set(id, acc);
          }
        } catch (e) {
          errorCount++;
          notes.push(
            `ligação ${conn.id}: alcance ${p}d recusado (${(e as Error).message.slice(0, 500)})`,
          );
        }
      }
    } else {
      notes.push(`ligação ${conn.id}: métricas de alcance não selecionáveis nesta versão`);
    }

    // escreve configuração e alcance em COLUNAS PRÓPRIAS de crm.google_campaign
    // (`settings` e `reach`). Nunca toca em raw, metrics nem last_synced_at —
    // essas são do crm-google-sync-campaigns.
    const idsToUpdate = new Set<string>([
      ...configByCampaign.keys(),
      ...reachByCampaign.keys(),
    ]);
    if (idsToUpdate.size > 0) {
      let updated = 0;
      for (const id of idsToUpdate) {
        const cfg = configByCampaign.get(id);
        const reach = reachByCampaign.get(id);
        const patch: Row = {};
        if (cfg) {
          patch.settings = {
            recolhido_em: nowIso,
            api_version: API_VERSION,
            campanha: cfg.campanha,
            criterios: cfg.criterios,
          };
        }
        if (reach) patch.reach = reach;
        if (Object.keys(patch).length === 0) continue;
        const { data: upd, error: uErr } = await (supabase as any)
          .schema("crm")
          .from("google_campaign")
          .update(patch)
          .eq("connection_id", conn.id)
          .eq("external_campaign_id", id)
          .select("external_campaign_id");
        if (uErr) {
          errorCount++;
          notes.push(`ligação ${conn.id}: update campanha ${id} falhou (${uErr.message})`);
        } else if ((upd ?? []).length > 0) {
          updated++;
          rowsWritten++;
        }
      }
      per.campanhas_atualizadas = updated;
    }

    // ---- 6) Ad groups das campanhas VIDEO ---------------------------------
    try {
      apiCalls++;
      const rows = await gaql(
        ctx,
        `
  SELECT
    campaign.id,
    ad_group.id,
    ad_group.name,
    ad_group.status,
    ad_group.type,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions,
    metrics.conversions_value
  FROM ad_group
  WHERE campaign.advertising_channel_type = 'VIDEO'
    AND segments.date BETWEEN '${since}' AND '${until}'
`,
      );
      const byId = new Map<string, Row>();
      for (const r of rows) {
        const ag = r.adGroup ?? {};
        const id = ag.id != null ? String(ag.id) : null;
        if (!id) continue;
        const m = r.metrics ?? {};
        const prev = byId.get(id);
        if (prev) {
          prev.impressions += num(m.impressions);
          prev.clicks += num(m.clicks);
          prev.cost_micros += num(m.costMicros);
          prev.conversions += num(m.conversions);
          prev.conversions_value += num(m.conversionsValue);
          continue;
        }
        byId.set(id, {
          connection_id: conn.id,
          company_id: conn.company_id,
          customer_id: customerId,
          external_campaign_id: r.campaign?.id != null ? String(r.campaign.id) : null,
          external_ad_group_id: id,
          resource_name: ag.resourceName ?? null,
          name: ag.name ?? "(sem nome)",
          status: ag.status ?? null,
          // `type` é o que diz o formato do vídeo (bumper, in-stream, etc.)
          type: ag.type ?? null,
          impressions: num(m.impressions),
          clicks: num(m.clicks),
          cost_micros: num(m.costMicros),
          conversions: num(m.conversions),
          conversions_value: num(m.conversionsValue),
          metrics: { periodo: `${since}..${until}` },
          raw: r,
          last_synced_at: nowIso,
        });
      }
      const agRows = Array.from(byId.values());
      for (const row of agRows) {
        row.metrics = {
          periodo: `${since}..${until}`,
          impressions: row.impressions,
          clicks: row.clicks,
          cost_micros: row.cost_micros,
          conversions: row.conversions,
          conversions_value: row.conversions_value,
        };
      }
      if (agRows.length > 0) {
        const { error } = await (supabase as any)
          .schema("crm")
          .from("google_ad_group")
          .upsert(agRows, { onConflict: "connection_id,external_ad_group_id" });
        if (error) throw new Error("ad_group_upsert_failed: " + error.message);
        rowsWritten += agRows.length;
      } else {
        notes.push(`ligação ${conn.id}: sem ad groups VIDEO no período`);
      }
      per.ad_groups = agRows.length;
    } catch (e) {
      errorCount++;
      notes.push(`ligação ${conn.id}: ad groups falharam (${(e as Error).message.slice(0, 800)})`);
    }

    // ---- 7) NÍVEL ANÚNCIO: crm.google_ad + insights diários (D-ERP111) -----
    // Esta função é dona de crm.google_ad e das linhas level='ad' de
    // crm.ads_insights_breakdown_daily. Não toca em level='campaign' nem em
    // platform='meta'.
    try {
      const adSel = adFields.length ? `,\n    ${adFields.join(",\n    ")}` : "";
      apiCalls++;
      const adRowsApi = await gaql(
        ctx,
        `
  SELECT
    campaign.id,
    ad_group.id,
    ad_group.name${adSel}
  FROM ad_group_ad
  WHERE campaign.advertising_channel_type = 'VIDEO'
`,
      );

      // vídeo do YouTube por anúncio (asset view)
      const videoByAdRes = new Map<string, { id: string | null; title: string | null }>();
      const temAssetView = adAssetFields.includes("asset.youtube_video_asset.youtube_video_id") &&
        adAssetFields.includes("ad_group_ad_asset_view.ad_group_ad");
      if (temAssetView) {
        try {
          apiCalls++;
          const assetRows = await gaql(
            ctx,
            `
  SELECT
    ${adAssetFields.join(",\n    ")}
  FROM ad_group_ad_asset_view
  WHERE campaign.advertising_channel_type = 'VIDEO'
    AND ad_group_ad_asset_view.field_type = 'YOUTUBE_VIDEO'
`,
          );
          for (const r of assetRows) {
            const adRes = r.adGroupAdAssetView?.adGroupAd ?? null;
            const yt = r.asset?.youtubeVideoAsset ?? {};
            if (!adRes || !yt?.youtubeVideoId) continue;
            videoByAdRes.set(String(adRes), {
              id: String(yt.youtubeVideoId),
              title: yt.youtubeVideoTitle != null ? String(yt.youtubeVideoTitle) : null,
            });
          }
          per.anuncios_com_video_asset_view = videoByAdRes.size;
          if (videoByAdRes.size === 0) {
            notes.push(
              `ligação ${conn.id}: ad_group_ad_asset_view sem linhas YOUTUBE_VIDEO (usa-se o recurso do próprio anúncio)`,
            );
          }
        } catch (e) {
          notes.push(
            `ligação ${conn.id}: vídeo do anúncio não obtido (${(e as Error).message.slice(0, 600)})`,
          );
        }
      } else {
        notes.push(`ligação ${conn.id}: ad_group_ad_asset_view sem campos confirmados nesta versão`);
      }

      // Recurso alternativo: os `asset` referidos pelo próprio anúncio.
      const assetRefsByAd = new Map<string, string[]>();
      const colherAssets = (v: unknown, out: Set<string>) => {
        if (v == null) return;
        if (typeof v === "string") {
          if (/\/assets\/\d+$/.test(v)) out.add(v);
          return;
        }
        if (Array.isArray(v)) {
          for (const x of v) colherAssets(x, out);
          return;
        }
        if (typeof v === "object") for (const x of Object.values(v as Row)) colherAssets(x, out);
      };
      const todosRefs = new Set<string>();
      for (const r of adRowsApi) {
        const adRes = r.adGroupAd?.resourceName ?? r.adGroupAd?.ad?.resourceName ?? null;
        if (!adRes) continue;
        const refs = new Set<string>();
        colherAssets(r.adGroupAd?.ad, refs);
        if (refs.size === 0) continue;
        assetRefsByAd.set(String(adRes), Array.from(refs));
        for (const x of refs) todosRefs.add(x);
      }
      const videoByAssetRes = new Map<string, { id: string | null; title: string | null }>();
      if (todosRefs.size > 0 && adAssetFields.includes("asset.youtube_video_asset.youtube_video_id")) {
        try {
          apiCalls++;
          const rows = await gaql(
            ctx,
            `
  SELECT
    asset.resource_name,
    asset.youtube_video_asset.youtube_video_id,
    asset.youtube_video_asset.youtube_video_title
  FROM asset
  WHERE asset.type = 'YOUTUBE_VIDEO'
`,
          );
          for (const r of rows) {
            const res = r.asset?.resourceName ?? null;
            const yt = r.asset?.youtubeVideoAsset ?? {};
            if (!res || !yt?.youtubeVideoId) continue;
            videoByAssetRes.set(String(res), {
              id: String(yt.youtubeVideoId),
              title: yt.youtubeVideoTitle != null ? String(yt.youtubeVideoTitle) : null,
            });
          }
          per.assets_youtube = videoByAssetRes.size;
        } catch (e) {
          notes.push(
            `ligação ${conn.id}: assets YouTube não obtidos (${(e as Error).message.slice(0, 600)})`,
          );
        }
      }
      const videoDoAnuncio = (adRes: string | null) => {
        if (!adRes) return undefined;
        const direto = videoByAdRes.get(adRes);
        if (direto) return direto;
        for (const ref of assetRefsByAd.get(adRes) ?? []) {
          const v = videoByAssetRes.get(ref);
          if (v) return v;
        }
        return undefined;
      };

      const adsById = new Map<string, Row>();
      for (const r of adRowsApi) {
        const ad = r.adGroupAd?.ad ?? {};
        const id = ad.id != null ? String(ad.id) : null;
        if (!id) continue;
        const adRes = r.adGroupAd?.resourceName ?? ad.resourceName ?? null;
        const vid = videoDoAnuncio(adRes ? String(adRes) : null);
        adsById.set(id, {
          connection_id: conn.id,
          company_id: conn.company_id,
          customer_id: customerId,
          external_campaign_id: r.campaign?.id != null ? String(r.campaign.id) : null,
          external_ad_group_id: r.adGroup?.id != null ? String(r.adGroup.id) : null,
          external_ad_id: id,
          resource_name: adRes,
          name: ad.name ?? r.adGroup?.name ?? "(sem nome)",
          status: r.adGroupAd?.status ?? null,
          type: ad.type ?? null,
          youtube_video_id: vid?.id ?? null,
          youtube_video_title: vid?.title ?? null,
          final_urls: ad.finalUrls ?? null,
          raw: r,
          last_synced_at: nowIso,
        });
      }
      const adRows = Array.from(adsById.values());
      if (adRows.length > 0) {
        const { error } = await (supabase as any)
          .schema("crm")
          .from("google_ad")
          .upsert(adRows, { onConflict: "connection_id,external_ad_id" });
        if (error) throw new Error("google_ad_upsert_failed: " + error.message);
        rowsWritten += adRows.length;
      } else {
        notes.push(`ligação ${conn.id}: sem anúncios de vídeo`);
      }
      per.anuncios = adRows.length;
      per.anuncios_com_video = adRows.filter((a) => a.youtube_video_id != null).length;

      // insights diários por anúncio
      apiCalls++;
      const selVideo = videoFields.length ? `,\n    ${videoFields.join(",\n    ")}` : "";
      const insRows = await gaql(
        ctx,
        `
  SELECT
    campaign.id,
    campaign.name,
    ad_group.id,
    ad_group_ad.ad.id,
    customer.currency_code,
    segments.date,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions${selVideo}
  FROM ad_group_ad
  WHERE campaign.advertising_channel_type = 'VIDEO'
    AND segments.date BETWEEN '${since}' AND '${until}'
`,
      );

      const byKey = new Map<string, Row>();
      for (const r of insRows) {
        const adId = r.adGroupAd?.ad?.id != null ? String(r.adGroupAd.ad.id) : null;
        const date = r.segments?.date ? String(r.segments.date).slice(0, 10) : null;
        const campId = r.campaign?.id != null ? String(r.campaign.id) : null;
        if (!adId || !date || !campId) continue;
        const m = r.metrics ?? {};
        const views = viewsField ? Math.round(num(m[apiKeyToJson(viewsField)])) : 0;
        const vm: Row = { api_version: API_VERSION, recolhido_em: nowIso, video_views: views };
        for (const f of videoFields) {
          const v = m[apiKeyToJson(f)];
          if (v != null) vm[f.replace("metrics.", "")] = Number(v);
        }
        const key = `${adId}|${date}`;
        const prev = byKey.get(key);
        if (prev) {
          prev.impressions += num(m.impressions);
          prev.clicks += num(m.clicks);
          prev.spend_cents += microsToCents(m.costMicros);
          prev.conversions = num(prev.conversions) + num(m.conversions);
          prev.video_thruplays = num(prev.video_thruplays) + views;
          continue;
        }
        byKey.set(key, {
          company_id: conn.company_id,
          connection_id: conn.id,
          platform: "google",
          level: "ad",
          external_campaign_id: campId,
          external_adset_id: r.adGroup?.id != null ? String(r.adGroup.id) : "",
          external_ad_id: adId,
          campaign_name: r.campaign?.name ?? null,
          date_start: date,
          breakdown: "none",
          breakdown_value: "none",
          impressions: num(m.impressions),
          clicks: num(m.clicks),
          spend_cents: microsToCents(m.costMicros),
          video_thruplays: views,
          conversions: num(m.conversions),
          currency: r.customer?.currencyCode ?? conn.selected_ad_account_currency ?? null,
          source: "platform_api",
          raw: { linha: r, video_metrics: vm },
          last_synced_at: nowIso,
          updated_at: nowIso,
        });
      }
      const insOut = Array.from(byKey.values());
      if (insOut.length > 0) {
        for (let i = 0; i < insOut.length; i += 500) {
          const { error } = await (supabase as any)
            .schema("crm")
            .from("ads_insights_breakdown_daily")
            .upsert(insOut.slice(i, i + 500), {
              onConflict:
                "connection_id,platform,level,external_campaign_id,external_adset_id,external_ad_id,date_start,breakdown,breakdown_value",
            });
          if (error) throw new Error("ad_insights_upsert_failed: " + error.message);
        }
        rowsWritten += insOut.length;
      } else {
        notes.push(`ligação ${conn.id}: sem insights por anúncio no período`);
      }
      per.insights_anuncio = insOut.length;
    } catch (e) {
      errorCount++;
      notes.push(`ligação ${conn.id}: nível anúncio falhou (${(e as Error).message.slice(0, 1200)})`);
    }


    perConnection[conn.id] = per;
  }

  await finishSyncRun(supabase, runId, startedMs, {
    status: resolveStatus(rowsWritten, errorCount),
    api_calls: apiCalls,
    rows_written: rowsWritten,
    details: { params: { days, probe_only: body.probe_only === true }, per_connection: perConnection, notes },
  });

  return json({
    ok: true,
    api_version: API_VERSION,
    days,
    since,
    until,
    campos_confirmados: confirmed,
    connections: conns.length,
    rows_written: rowsWritten,
    api_calls: apiCalls,
    per_connection: perConnection,
    notes,
  });
});
