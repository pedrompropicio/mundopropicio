// crm-google-ads-sync
//
// Sprint 2 — Google Ads (READ-ONLY).
//
// Recursos sincronizados na mesma invocação (1 access token SA):
//   • campaigns      → crm.google_campaign     (validado em produção)
//   • ad_groups      → crm.google_ad_group
//   • keywords       → crm.google_keyword
//   • asset_groups   → crm.google_asset_group  (0 linhas esperadas — sem PMax)
//
// Cada bloco tem try/catch isolado: falha de um não rebenta os outros.
//
// Auth Google: service account (GOOGLE_SA_KEY_JSON) → JWT RS256 scope adwords
// → access_token em https://oauth2.googleapis.com/token.
// API: REST v24 (override via secret GOOGLE_ADS_API_VERSION).
// Headers: Authorization Bearer, developer-token, login-customer-id (MCC).
// Corpo: { query } apenas (v24 não suporta pageSize; page size fixo 10000).
// Resposta: validar Content-Type antes de res.json() para evitar HTML disfarçado.
//
// Secrets:
// - GOOGLE_SA_KEY_JSON          (Live only nesta fase)
// - GOOGLE_ADS_DEVELOPER_TOKEN
// - GOOGLE_ADS_API_VERSION      (opcional, fallback "v24")

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GOOGLE_ADS_API_VERSION = Deno.env.get("GOOGLE_ADS_API_VERSION") ?? "v24";
const LOGIN_CUSTOMER_ID = "9743221780";
const CUSTOMER_ID = "2200043144";
const COMPANY_ID = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const CONNECTION_ID = "c0000000-0000-4000-a000-000022000431";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- SA JWT → access token ----------

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlJson(obj: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)));
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getGoogleAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SA_KEY_JSON");
  if (!raw) {
    throw new Error(
      "missing_secret:GOOGLE_SA_KEY_JSON (only present in Live for now)",
    );
  }
  let sa: { client_email?: string; private_key?: string; token_uri?: string };
  try {
    sa = JSON.parse(raw);
  } catch (_e) {
    throw new Error("invalid_secret:GOOGLE_SA_KEY_JSON_not_valid_json");
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error("invalid_secret:GOOGLE_SA_KEY_JSON_missing_fields");
  }
  const privateKeyPem = sa.private_key.replace(/\\n/g, "\n");
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/adwords",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64urlJson(header)}.${b64urlJson(claim)}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(signingInput),
    ),
  );
  const jwt = `${signingInput}.${b64url(sig)}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `google_oauth_non_json:${res.status}:${ct}:${text.slice(0, 300)}`,
    );
  }
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(
      `google_oauth_failed:${res.status}:${JSON.stringify(data)}`,
    );
  }
  return data.access_token as string;
}

// ---------- Google Ads search helper ----------

async function googleAdsSearch(
  accessToken: string,
  devToken: string,
  query: string,
): Promise<unknown[]> {
  const url =
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${CUSTOMER_ID}/googleAds:search`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": devToken,
      "login-customer-id": LOGIN_CUSTOMER_ID,
      "Content-Type": "application/json",
    },
    // v24 não suporta pageSize em googleAds:search (page size fixo 10000).
    // Enviá-lo devolve INVALID_ARGUMENT / PAGE_SIZE_NOT_SUPPORTED.
    body: JSON.stringify({ query }),
  });
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `google_ads_api_non_json:${res.status}:${ct}:${text.slice(0, 300)}`,
    );
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `google_ads_api_failed:${res.status}:${JSON.stringify(data).slice(0, 500)}`,
    );
  }
  return (data.results ?? []) as unknown[];
}

// ---------- GAQL row types ----------

interface CampaignRow {
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
    biddingStrategyType?: string;
    startDate?: string;
    endDate?: string;
    resourceName?: string;
  };
  campaignBudget?: { amountMicros?: string };
  metrics?: {
    impressions?: string;
    clicks?: string;
    costMicros?: string;
    conversions?: number;
    conversionsValue?: number;
  };
}

interface AdGroupRow {
  adGroup?: {
    id?: string;
    name?: string;
    status?: string;
    type?: string;
    resourceName?: string;
  };
  campaign?: { id?: string };
  metrics?: CampaignRow["metrics"];
}

interface KeywordRow {
  adGroupCriterion?: {
    criterionId?: string;
    status?: string;
    resourceName?: string;
    keyword?: { text?: string; matchType?: string };
  };
  adGroup?: { id?: string };
  metrics?: CampaignRow["metrics"];
}

interface AssetGroupRow {
  assetGroup?: {
    id?: string;
    name?: string;
    status?: string;
    resourceName?: string;
  };
  campaign?: { id?: string };
  metrics?: CampaignRow["metrics"];
}

function num(v: unknown): number {
  return Number(v ?? 0);
}

// ---------- Entry ----------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: claimsData, error: claimsErr } = await userClient.auth
    .getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return json({ error: "unauthorized" }, 401);
  }
  const userId = claimsData.claims.sub as string;
  const { data: isAdmin } = await userClient.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) return json({ error: "forbidden_admin_only" }, 403);

  const devToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
  if (!devToken) {
    return json({
      error: "missing_secret",
      detail:
        "GOOGLE_ADS_DEVELOPER_TOKEN não está definido — adiciona o secret e tenta novamente.",
    }, 500);
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (e) {
    console.error("[crm-google-ads-sync] SA auth failed:", e);
    return json({ error: "google_sa_auth_failed", detail: String(e) }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const errors: string[] = [];
  const nowIso = new Date().toISOString();

  const summary = {
    campaigns: { read: 0, upserted: 0 },
    ad_groups: { read: 0, upserted: 0 },
    keywords: { read: 0, upserted: 0 },
    asset_groups: { read: 0, upserted: 0 },
  };

  // ---------- 1) CAMPAIGNS ----------
  try {
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.bidding_strategy_type,
        campaign.resource_name,
        campaign_budget.amount_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
    `.trim();
    const rows = (await googleAdsSearch(accessToken, devToken, query)) as CampaignRow[];
    summary.campaigns.read = rows.length;

    type Agg = {
      campaign: NonNullable<CampaignRow["campaign"]>;
      budgetMicros: number | null;
      impressions: number;
      clicks: number;
      costMicros: number;
      conversions: number;
      conversionsValue: number;
      raw: CampaignRow[];
    };
    const byId = new Map<string, Agg>();
    for (const row of rows) {
      const id = row.campaign?.id;
      if (!id) continue;
      const cur = byId.get(id) ?? {
        campaign: row.campaign!,
        budgetMicros: row.campaignBudget?.amountMicros
          ? Number(row.campaignBudget.amountMicros)
          : null,
        impressions: 0,
        clicks: 0,
        costMicros: 0,
        conversions: 0,
        conversionsValue: 0,
        raw: [],
      };
      cur.impressions += num(row.metrics?.impressions);
      cur.clicks += num(row.metrics?.clicks);
      cur.costMicros += num(row.metrics?.costMicros);
      cur.conversions += num(row.metrics?.conversions);
      cur.conversionsValue += num(row.metrics?.conversionsValue);
      cur.raw.push(row);
      byId.set(id, cur);
    }

    const upsertRows = Array.from(byId.values()).map((a) => ({
      connection_id: CONNECTION_ID,
      company_id: COMPANY_ID,
      customer_id: CUSTOMER_ID,
      external_campaign_id: a.campaign.id!,
      resource_name: a.campaign.resourceName ?? null,
      name: a.campaign.name ?? "(sem nome)",
      status: a.campaign.status ?? null,
      advertising_channel_type: a.campaign.advertisingChannelType ?? null,
      bidding_strategy_type: a.campaign.biddingStrategyType ?? null,
      budget_amount_micros: a.budgetMicros,
      start_date: a.campaign.startDate ?? null,
      end_date: a.campaign.endDate ?? null,
      impressions: a.impressions,
      clicks: a.clicks,
      cost_micros: a.costMicros,
      conversions: a.conversions,
      conversions_value: a.conversionsValue,
      metrics: {
        impressions: a.impressions,
        clicks: a.clicks,
        cost_micros: a.costMicros,
        conversions: a.conversions,
        conversions_value: a.conversionsValue,
        window: "LAST_30_DAYS",
      },
      raw: { rows: a.raw },
      last_synced_at: nowIso,
    }));

    if (upsertRows.length > 0) {
      const { error: upErr, count } = await admin
        .schema("crm")
        .from("google_campaign")
        .upsert(upsertRows, {
          onConflict: "connection_id,external_campaign_id",
          count: "exact",
        });
      if (upErr) errors.push(`campaigns_upsert_failed:${upErr.message}`);
      else summary.campaigns.upserted = count ?? upsertRows.length;
    }
  } catch (e) {
    console.error("[crm-google-ads-sync] campaigns failed:", e);
    errors.push(`campaigns_failed:${String(e)}`);
  }

  // ---------- 2) AD GROUPS ----------
  try {
    const query = `
      SELECT
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group.type,
        ad_group.resource_name,
        campaign.id,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM ad_group
      WHERE segments.date DURING LAST_30_DAYS
    `.trim();
    const rows = (await googleAdsSearch(accessToken, devToken, query)) as AdGroupRow[];
    summary.ad_groups.read = rows.length;

    type Agg = {
      adGroup: NonNullable<AdGroupRow["adGroup"]>;
      campaignId: string | null;
      impressions: number;
      clicks: number;
      costMicros: number;
      conversions: number;
      conversionsValue: number;
      raw: AdGroupRow[];
    };
    const byId = new Map<string, Agg>();
    for (const row of rows) {
      const id = row.adGroup?.id;
      if (!id) continue;
      const cur = byId.get(id) ?? {
        adGroup: row.adGroup!,
        campaignId: row.campaign?.id ?? null,
        impressions: 0,
        clicks: 0,
        costMicros: 0,
        conversions: 0,
        conversionsValue: 0,
        raw: [],
      };
      cur.impressions += num(row.metrics?.impressions);
      cur.clicks += num(row.metrics?.clicks);
      cur.costMicros += num(row.metrics?.costMicros);
      cur.conversions += num(row.metrics?.conversions);
      cur.conversionsValue += num(row.metrics?.conversionsValue);
      cur.raw.push(row);
      byId.set(id, cur);
    }

    const upsertRows = Array.from(byId.values()).map((a) => ({
      connection_id: CONNECTION_ID,
      company_id: COMPANY_ID,
      customer_id: CUSTOMER_ID,
      external_campaign_id: a.campaignId ?? "",
      external_ad_group_id: a.adGroup.id!,
      resource_name: a.adGroup.resourceName ?? null,
      name: a.adGroup.name ?? "(sem nome)",
      status: a.adGroup.status ?? null,
      type: a.adGroup.type ?? null,
      impressions: a.impressions,
      clicks: a.clicks,
      cost_micros: a.costMicros,
      conversions: a.conversions,
      conversions_value: a.conversionsValue,
      metrics: {
        impressions: a.impressions,
        clicks: a.clicks,
        cost_micros: a.costMicros,
        conversions: a.conversions,
        conversions_value: a.conversionsValue,
        window: "LAST_30_DAYS",
      },
      raw: { rows: a.raw },
      last_synced_at: nowIso,
    }));

    if (upsertRows.length > 0) {
      const { error: upErr, count } = await admin
        .schema("crm")
        .from("google_ad_group")
        .upsert(upsertRows, {
          onConflict: "connection_id,external_ad_group_id",
          count: "exact",
        });
      if (upErr) errors.push(`ad_groups_upsert_failed:${upErr.message}`);
      else summary.ad_groups.upserted = count ?? upsertRows.length;
    }
  } catch (e) {
    console.error("[crm-google-ads-sync] ad_groups failed:", e);
    errors.push(`ad_groups_failed:${String(e)}`);
  }

  // ---------- 3) KEYWORDS ----------
  try {
    const query = `
      SELECT
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        ad_group_criterion.resource_name,
        ad_group.id,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM keyword_view
      WHERE segments.date DURING LAST_30_DAYS
    `.trim();
    const rows = (await googleAdsSearch(accessToken, devToken, query)) as KeywordRow[];
    summary.keywords.read = rows.length;

    type Agg = {
      crit: NonNullable<KeywordRow["adGroupCriterion"]>;
      adGroupId: string;
      impressions: number;
      clicks: number;
      costMicros: number;
      conversions: number;
      conversionsValue: number;
      raw: KeywordRow[];
    };
    const byKey = new Map<string, Agg>();
    for (const row of rows) {
      const agId = row.adGroup?.id;
      const critId = row.adGroupCriterion?.criterionId;
      if (!agId || !critId) continue;
      const key = `${agId}:${critId}`;
      const cur = byKey.get(key) ?? {
        crit: row.adGroupCriterion!,
        adGroupId: agId,
        impressions: 0,
        clicks: 0,
        costMicros: 0,
        conversions: 0,
        conversionsValue: 0,
        raw: [],
      };
      cur.impressions += num(row.metrics?.impressions);
      cur.clicks += num(row.metrics?.clicks);
      cur.costMicros += num(row.metrics?.costMicros);
      cur.conversions += num(row.metrics?.conversions);
      cur.conversionsValue += num(row.metrics?.conversionsValue);
      cur.raw.push(row);
      byKey.set(key, cur);
    }

    const upsertRows = Array.from(byKey.values()).map((a) => ({
      connection_id: CONNECTION_ID,
      company_id: COMPANY_ID,
      customer_id: CUSTOMER_ID,
      external_ad_group_id: a.adGroupId,
      external_criterion_id: a.crit.criterionId!,
      resource_name: a.crit.resourceName ?? null,
      keyword_text: a.crit.keyword?.text ?? null,
      match_type: a.crit.keyword?.matchType ?? null,
      status: a.crit.status ?? null,
      impressions: a.impressions,
      clicks: a.clicks,
      cost_micros: a.costMicros,
      conversions: a.conversions,
      conversions_value: a.conversionsValue,
      metrics: {
        impressions: a.impressions,
        clicks: a.clicks,
        cost_micros: a.costMicros,
        conversions: a.conversions,
        conversions_value: a.conversionsValue,
        window: "LAST_30_DAYS",
      },
      raw: { rows: a.raw },
      last_synced_at: nowIso,
    }));

    if (upsertRows.length > 0) {
      const { error: upErr, count } = await admin
        .schema("crm")
        .from("google_keyword")
        .upsert(upsertRows, {
          onConflict: "connection_id,external_ad_group_id,external_criterion_id",
          count: "exact",
        });
      if (upErr) errors.push(`keywords_upsert_failed:${upErr.message}`);
      else summary.keywords.upserted = count ?? upsertRows.length;
    }
  } catch (e) {
    console.error("[crm-google-ads-sync] keywords failed:", e);
    errors.push(`keywords_failed:${String(e)}`);
  }

  // ---------- 4) ASSET GROUPS (Performance Max) ----------
  // Conta atual não tem campanhas PMax → esperado 0 linhas, sem erro.
  try {
    const query = `
      SELECT
        asset_group.id,
        asset_group.name,
        asset_group.status,
        asset_group.resource_name,
        campaign.id,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM asset_group
      WHERE segments.date DURING LAST_30_DAYS
    `.trim();
    const rows = (await googleAdsSearch(accessToken, devToken, query)) as AssetGroupRow[];
    summary.asset_groups.read = rows.length;

    type Agg = {
      assetGroup: NonNullable<AssetGroupRow["assetGroup"]>;
      campaignId: string | null;
      impressions: number;
      clicks: number;
      costMicros: number;
      conversions: number;
      conversionsValue: number;
      raw: AssetGroupRow[];
    };
    const byId = new Map<string, Agg>();
    for (const row of rows) {
      const id = row.assetGroup?.id;
      if (!id) continue;
      const cur = byId.get(id) ?? {
        assetGroup: row.assetGroup!,
        campaignId: row.campaign?.id ?? null,
        impressions: 0,
        clicks: 0,
        costMicros: 0,
        conversions: 0,
        conversionsValue: 0,
        raw: [],
      };
      cur.impressions += num(row.metrics?.impressions);
      cur.clicks += num(row.metrics?.clicks);
      cur.costMicros += num(row.metrics?.costMicros);
      cur.conversions += num(row.metrics?.conversions);
      cur.conversionsValue += num(row.metrics?.conversionsValue);
      cur.raw.push(row);
      byId.set(id, cur);
    }

    const upsertRows = Array.from(byId.values()).map((a) => ({
      connection_id: CONNECTION_ID,
      company_id: COMPANY_ID,
      customer_id: CUSTOMER_ID,
      external_campaign_id: a.campaignId ?? "",
      external_asset_group_id: a.assetGroup.id!,
      resource_name: a.assetGroup.resourceName ?? null,
      name: a.assetGroup.name ?? "(sem nome)",
      status: a.assetGroup.status ?? null,
      impressions: a.impressions,
      clicks: a.clicks,
      cost_micros: a.costMicros,
      conversions: a.conversions,
      conversions_value: a.conversionsValue,
      metrics: {
        impressions: a.impressions,
        clicks: a.clicks,
        cost_micros: a.costMicros,
        conversions: a.conversions,
        conversions_value: a.conversionsValue,
        window: "LAST_30_DAYS",
      },
      raw: { rows: a.raw },
      last_synced_at: nowIso,
    }));

    if (upsertRows.length > 0) {
      const { error: upErr, count } = await admin
        .schema("crm")
        .from("google_asset_group")
        .upsert(upsertRows, {
          onConflict: "connection_id,external_asset_group_id",
          count: "exact",
        });
      if (upErr) errors.push(`asset_groups_upsert_failed:${upErr.message}`);
      else summary.asset_groups.upserted = count ?? upsertRows.length;
    }
  } catch (e) {
    console.error("[crm-google-ads-sync] asset_groups failed:", e);
    errors.push(`asset_groups_failed:${String(e)}`);
  }

  return json({
    ...summary,
    errors,
    customer_id: CUSTOMER_ID,
    login_customer_id: LOGIN_CUSTOMER_ID,
  });
});
