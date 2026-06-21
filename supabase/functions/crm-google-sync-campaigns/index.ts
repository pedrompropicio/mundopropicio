// crm-google-sync-campaigns
// Lê campanhas reais da Google Ads API (GAQL searchStream) e popula
// crm.google_campaign. Read-only — não cria nem edita nada no Google Ads.
//
// Auth: aceita service_role (cron) ou JWT de utilizador autenticado (manual).
// Por connection google em crm.ad_platform_connections (status=active).
//
// Decisão sobre ad_groups: NESTE PASSO só sincroniza campanhas. Ad groups
// ficam para um próximo passo (manter scope curto + observar quotas antes).
//
// Versão Google Ads API: v20 (estável atual; v17 foi descontinuada em jun/2025).
// v20 mantém o endpoint googleAds:searchStream e suporta DEMAND_GEN.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GOOGLE_ADS_API_VERSION = "v20";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const GOOGLE_SA_KEY_JSON = Deno.env.get("GOOGLE_SA_KEY_JSON");
const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
const GOOGLE_ADS_LOGIN_CUSTOMER_ID_FALLBACK = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID");

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

// ---------------- Service Account JWT → OAuth2 access_token ----------------

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

function b64urlEncode(input: Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getGoogleAccessToken(): Promise<string> {
  if (!GOOGLE_SA_KEY_JSON) throw new Error("missing_secret_GOOGLE_SA_KEY_JSON");
  let sa: { client_email: string; private_key: string; token_uri?: string };
  try {
    sa = JSON.parse(GOOGLE_SA_KEY_JSON);
  } catch (e) {
    throw new Error("invalid_GOOGLE_SA_KEY_JSON: " + (e as Error).message);
  }
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const iat = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/adwords",
    aud: tokenUri,
    iat,
    exp: iat + 3600,
  };
  const header = { alg: "RS256", typ: "JWT" };
  const signingInput =
    b64urlEncode(JSON.stringify(header)) + "." + b64urlEncode(JSON.stringify(claims));

  const der = pemToDer(sa.private_key);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
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
  const jwt = signingInput + "." + b64urlEncode(sig);

  const resp = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = await resp.json();
  if (!resp.ok || !j.access_token) {
    throw new Error(`google_oauth_failed ${resp.status}: ${JSON.stringify(j)}`);
  }
  return j.access_token as string;
}

// ---------------- Google Ads searchStream ----------------

// NOTA: `campaign.resource_name` NÃO é selecionável em GAQL — o resourceName
// é devolvido automaticamente em cada row da resource principal (campaign).
// Incluí-lo no SELECT dispara INVALID_ARGUMENT / BAD_FIELD_NAME.
// Ref: https://developers.google.com/google-ads/api/fields/v20/campaign
const GAQL_CAMPAIGNS = `
  SELECT
    campaign.id,
    campaign.name,
    campaign.status,
    campaign.advertising_channel_type,
    campaign.bidding_strategy_type,
    campaign.start_date,
    campaign.end_date,
    campaign_budget.amount_micros,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions,
    metrics.conversions_value
  FROM campaign
  WHERE segments.date DURING LAST_30_DAYS
`;

interface GAdsCampaignRow {
  campaign?: Record<string, unknown>;
  campaignBudget?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  segments?: Record<string, unknown>;
}

async function searchStreamCampaigns(
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  customerId: string,
): Promise<GAdsCampaignRow[]> {
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "login-customer-id": loginCustomerId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: GAQL_CAMPAIGNS }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`google_ads_api ${resp.status}: ${text.slice(0, 2000)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error("google_ads_parse_error: " + (e as Error).message);
  }
  // searchStream devolve array de chunks, cada um com results[]
  const chunks = Array.isArray(parsed) ? parsed : [parsed];
  const rows: GAdsCampaignRow[] = [];
  for (const c of chunks as Array<{ results?: GAdsCampaignRow[] }>) {
    if (Array.isArray(c?.results)) rows.push(...c.results);
  }
  return rows;
}

// ---------------- Agregação por campanha ----------------

interface AggCampaign {
  external_campaign_id: string;
  resource_name: string | null;
  name: string;
  status: string | null;
  advertising_channel_type: string | null;
  bidding_strategy_type: string | null;
  budget_amount_micros: number | null;
  start_date: string | null;
  end_date: string | null;
  impressions: number;
  clicks: number;
  cost_micros: number;
  conversions: number;
  conversions_value: number;
  raw_sample: unknown;
}

function aggregate(rows: GAdsCampaignRow[]): AggCampaign[] {
  const byId = new Map<string, AggCampaign>();
  for (const r of rows) {
    const c = (r.campaign ?? {}) as Record<string, unknown>;
    const m = (r.metrics ?? {}) as Record<string, unknown>;
    const b = (r.campaignBudget ?? {}) as Record<string, unknown>;
    const id = c.id != null ? String(c.id) : null;
    if (!id) continue;
    const prev = byId.get(id) ?? {
      external_campaign_id: id,
      resource_name: (c.resourceName as string) ?? null,
      name: (c.name as string) ?? "(sem nome)",
      status: (c.status as string) ?? null,
      advertising_channel_type: (c.advertisingChannelType as string) ?? null,
      bidding_strategy_type: (c.biddingStrategyType as string) ?? null,
      budget_amount_micros:
        b.amountMicros != null ? Number(b.amountMicros) : null,
      start_date: (c.startDate as string) ?? null,
      end_date: (c.endDate as string) ?? null,
      impressions: 0,
      clicks: 0,
      cost_micros: 0,
      conversions: 0,
      conversions_value: 0,
      raw_sample: r,
    };
    prev.impressions += m.impressions != null ? Number(m.impressions) : 0;
    prev.clicks += m.clicks != null ? Number(m.clicks) : 0;
    prev.cost_micros += m.costMicros != null ? Number(m.costMicros) : 0;
    prev.conversions += m.conversions != null ? Number(m.conversions) : 0;
    prev.conversions_value +=
      m.conversionsValue != null ? Number(m.conversionsValue) : 0;
    byId.set(id, prev);
  }
  return Array.from(byId.values());
}

// ---------------- Auth da edge function ----------------

interface AuthInfo {
  isServiceRole: boolean;
  userId: string | null;
}

async function authenticateRequest(req: Request): Promise<AuthInfo> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("missing_authorization");

  // Detecta service_role pelo payload
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload?.role === "service_role") {
        return { isServiceRole: true, userId: null };
      }
    }
  } catch (_e) {
    // ignore, tentar como user token
  }

  // Valida como user token
  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supa.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Error("invalid_token");
  }
  return { isServiceRole: false, userId: data.claims.sub as string };
}

// ---------------- Handler ----------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let auth: AuthInfo;
  try {
    auth = await authenticateRequest(req);
  } catch (e) {
    return json({ error: "unauthorized", detail: (e as Error).message }, 401);
  }

  if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
    return json({ error: "missing_secret_GOOGLE_ADS_DEVELOPER_TOKEN" }, 500);
  }

  // Body opcional: { company_id?, connection_id? }
  let bodyJson: { company_id?: string; connection_id?: string } = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      bodyJson = await req.json();
    }
  } catch (_e) {
    // ignore
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Selecciona connection(s) google active
  let q = (supabase as any)
    .schema("crm")
    .from("ad_platform_connections")
    .select(
      "id, company_id, selected_ad_account_id, login_customer_id, status",
    )
    .eq("platform", "google")
    .eq("status", "active");
  if (bodyJson.connection_id) q = q.eq("id", bodyJson.connection_id);
  if (bodyJson.company_id) q = q.eq("company_id", bodyJson.company_id);
  const { data: connections, error: connErr } = await q;
  if (connErr) return json({ error: "connections_query_failed", detail: connErr.message }, 500);
  if (!connections || connections.length === 0) {
    return json({ error: "no_active_google_connection" }, 404);
  }

  // Obtem access token uma vez (a SA é a mesma para todas as connections)
  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (e) {
    return json({ error: "google_oauth_failed", detail: (e as Error).message }, 500);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const conn of connections) {
    const customerId = String(conn.selected_ad_account_id || "").replace(/-/g, "");
    const loginCustomerId =
      (conn.login_customer_id as string | null) ||
      GOOGLE_ADS_LOGIN_CUSTOMER_ID_FALLBACK ||
      "";
    if (!customerId || !loginCustomerId) {
      results.push({
        connection_id: conn.id,
        ok: false,
        error: "missing_customer_or_login_id",
      });
      continue;
    }

    try {
      const rows = await searchStreamCampaigns(
        accessToken,
        GOOGLE_ADS_DEVELOPER_TOKEN!,
        loginCustomerId,
        customerId,
      );
      const agg = aggregate(rows);

      const upsertRows = agg.map((a) => ({
        connection_id: conn.id,
        company_id: conn.company_id,
        customer_id: customerId,
        external_campaign_id: a.external_campaign_id,
        resource_name: a.resource_name,
        name: a.name,
        status: a.status,
        advertising_channel_type: a.advertising_channel_type,
        bidding_strategy_type: a.bidding_strategy_type,
        budget_amount_micros: a.budget_amount_micros,
        start_date: a.start_date,
        end_date: a.end_date,
        impressions: a.impressions,
        clicks: a.clicks,
        cost_micros: a.cost_micros,
        conversions: a.conversions,
        conversions_value: a.conversions_value,
        raw: a.raw_sample,
        metrics: {
          impressions: a.impressions,
          clicks: a.clicks,
          cost_micros: a.cost_micros,
          conversions: a.conversions,
          conversions_value: a.conversions_value,
          period: "LAST_30_DAYS",
        },
        last_synced_at: new Date().toISOString(),
      }));

      let upserted = 0;
      if (upsertRows.length > 0) {
        const { error: upErr } = await (supabase as any)
          .schema("crm")
          .from("google_campaign")
          .upsert(upsertRows, {
            onConflict: "connection_id,external_campaign_id",
          });
        if (upErr) throw new Error("upsert_failed: " + upErr.message);
        upserted = upsertRows.length;
      }

      // Marca connection saudável
      await (supabase as any)
        .schema("crm")
        .from("ad_platform_connections")
        .update({
          last_validated_at: new Date().toISOString(),
          last_error: null,
          consecutive_failures: 0,
        })
        .eq("id", conn.id);

      results.push({
        connection_id: conn.id,
        company_id: conn.company_id,
        customer_id: customerId,
        ok: true,
        campaigns_fetched: agg.length,
        rows_returned: rows.length,
        upserted,
      });
    } catch (e) {
      const msg = (e as Error).message;
      await (supabase as any)
        .schema("crm")
        .from("ad_platform_connections")
        .update({
          last_validated_at: new Date().toISOString(),
          last_error: msg.slice(0, 1000),
        })
        .eq("id", conn.id);
      results.push({ connection_id: conn.id, ok: false, error: msg });
    }
  }

  return json({
    ok: true,
    api_version: GOOGLE_ADS_API_VERSION,
    period: "LAST_30_DAYS",
    connections_processed: results.length,
    invoked_by: auth.isServiceRole ? "service_role" : `user:${auth.userId}`,
    results,
  });
});
