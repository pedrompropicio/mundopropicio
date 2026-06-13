// crm-google-ads-sync
//
// Sprint 2 — Google Ads (READ-ONLY, only campaigns).
//
// Flow:
// 1. Auth via service account (GOOGLE_SA_KEY_JSON secret) → sign RS256 JWT
//    with scope adwords, exchange at https://oauth2.googleapis.com/token.
// 2. Call Google Ads REST: POST /v17/customers/<cid>/googleAds:search with
//    GAQL pulling campaign fields + metrics for LAST_30_DAYS.
//    Headers: Authorization Bearer, developer-token, login-customer-id (MCC).
// 3. Upsert into crm.google_campaign via service_role on conflict
//    (connection_id, external_campaign_id).
// 4. Returns { read, upserted, errors } JSON summary.
//
// Secrets expected (set in Lovable Cloud → Secrets):
// - GOOGLE_SA_KEY_JSON          (full SA JSON; Live only for now)
// - GOOGLE_ADS_DEVELOPER_TOKEN  (Google Ads dev token)
//
// Constants for this MVP (single tenant, single MCC, single client account):
// - LOGIN_CUSTOMER_ID (MCC) = 9743221780
// - CUSTOMER_ID (account)   = 2200043144
// - COMPANY_ID              = 7c858982-6ccd-47ca-bd65-e0dd3eebf01c (Mundo Propício)
// - CONNECTION_ID           = c0000000-0000-4000-a000-000022000431 (seeded row)

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// Google passou a cadência mensal de versões em 2026. v24 é estável (sunset
// mai/2027). Para subir de versão sem alterar código, define o secret
// GOOGLE_ADS_API_VERSION (ex.: "v25"); fallback para "v24".
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
  } catch (e) {
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

// ---------- Google Ads search ----------

interface GAQLRow {
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

async function fetchCampaigns(accessToken: string, devToken: string): Promise<{
  rows: GAQLRow[];
  raw: unknown;
}> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      campaign.start_date,
      campaign.end_date,
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
    body: JSON.stringify({ query, pageSize: 1000 }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `google_ads_api_failed:${res.status}:${JSON.stringify(data).slice(0, 500)}`,
    );
  }
  // Aggregate metrics per campaign (LAST_30_DAYS returns rows segmented).
  return { rows: (data.results ?? []) as GAQLRow[], raw: data };
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

  // Authz: require admin role of the caller (mirrors other sensitive fns).
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

  let rows: GAQLRow[];
  try {
    const r = await fetchCampaigns(accessToken, devToken);
    rows = r.rows;
  } catch (e) {
    console.error("[crm-google-ads-sync] ads api failed:", e);
    return json({ error: "google_ads_api_failed", detail: String(e) }, 502);
  }

  // Aggregate per campaign.id (LAST_30_DAYS comes segmented when segments
  // are selected; here we only select campaign + metrics, so typically one
  // row per campaign — but we aggregate defensively).
  type Agg = {
    campaign: NonNullable<GAQLRow["campaign"]>;
    budgetMicros: number | null;
    impressions: number;
    clicks: number;
    costMicros: number;
    conversions: number;
    conversionsValue: number;
    raw: GAQLRow[];
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
    cur.impressions += Number(row.metrics?.impressions ?? 0);
    cur.clicks += Number(row.metrics?.clicks ?? 0);
    cur.costMicros += Number(row.metrics?.costMicros ?? 0);
    cur.conversions += Number(row.metrics?.conversions ?? 0);
    cur.conversionsValue += Number(row.metrics?.conversionsValue ?? 0);
    cur.raw.push(row);
    byId.set(id, cur);
  }

  const nowIso = new Date().toISOString();
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

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const errors: string[] = [];
  let upserted = 0;
  if (upsertRows.length > 0) {
    const { error: upErr, count } = await admin
      .schema("crm")
      .from("google_campaign")
      .upsert(upsertRows, {
        onConflict: "connection_id,external_campaign_id",
        count: "exact",
      });
    if (upErr) {
      errors.push(`upsert_failed:${upErr.message}`);
    } else {
      upserted = count ?? upsertRows.length;
    }
  }

  return json({
    read: rows.length,
    campaigns: upsertRows.length,
    upserted,
    errors,
    customer_id: CUSTOMER_ID,
    login_customer_id: LOGIN_CUSTOMER_ID,
  });
});
