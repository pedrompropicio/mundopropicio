// crm-google-conversion-upload
//
// Sprint 2 — Envio de conversões offline para o Google Ads.
//
// Lê crm.google_conversion (status='pending') e envia em batch para
//   POST /v24/customers/{CUSTOMER_ID}:uploadClickConversions
// com partialFailure=true. Atualiza cada linha individualmente para
// 'sent' ou 'failed' consoante o resultado devolvido pela Google.
//
// Auth Google: mesma service account (GOOGLE_SA_KEY_JSON) usada na
// crm-google-ads-sync. Headers: Authorization Bearer, developer-token,
// login-customer-id (MCC). Content-Type validado antes de res.json().
//
// Auth caller: JWT de admin (has_role admin). 403 caso contrário.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GOOGLE_ADS_API_VERSION = Deno.env.get("GOOGLE_ADS_API_VERSION") ?? "v24";
const LOGIN_CUSTOMER_ID = "9743221780";
const CUSTOMER_ID = "2200043144";
const MAX_BATCH = 2000;

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

// ---------- SA JWT → access token (igual a crm-google-ads-sync) ----------

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
  if (!raw) throw new Error("missing_secret:GOOGLE_SA_KEY_JSON");
  let sa: { client_email?: string; private_key?: string; token_uri?: string };
  try { sa = JSON.parse(raw); } catch {
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

// ---------- helpers ----------

/**
 * Converte timestamptz (UTC) para o formato exigido pela Google:
 *   "yyyy-MM-dd HH:mm:ss+HH:mm"
 * Usamos sempre offset UTC (+00:00) — o campo na BD é timestamptz armazenado em UTC.
 */
function formatGoogleDateTime(ts: string): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const HH = pad(d.getUTCHours());
  const MM = pad(d.getUTCMinutes());
  const SS = pad(d.getUTCSeconds());
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}+00:00`;
}

function buildConversionActionResource(ref: string): string {
  if (ref.startsWith("customers/")) return ref;
  return `customers/${CUSTOMER_ID}/conversionActions/${ref}`;
}

interface PendingRow {
  id: string;
  conversion_action_ref: string;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  conversion_value: number | null;
  currency_code: string | null;
  order_id: string | null;
  conversion_datetime: string;
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
      detail: "GOOGLE_ADS_DEVELOPER_TOKEN não está definido.",
    }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---------- 1) Fetch pending ----------
  const { data: pendingRaw, error: fetchErr } = await admin
    .schema("crm")
    .from("google_conversion")
    .select(
      "id, conversion_action_ref, gclid, gbraid, wbraid, conversion_value, currency_code, order_id, conversion_datetime",
    )
    .eq("status", "pending")
    .order("conversion_datetime", { ascending: true })
    .limit(MAX_BATCH);

  if (fetchErr) {
    return json({ error: "fetch_pending_failed", detail: fetchErr.message }, 500);
  }
  const pending = (pendingRaw ?? []) as PendingRow[];
  const errors: string[] = [];

  if (pending.length === 0) {
    return json({
      read: 0, sent: 0, failed: 0, errors: [], customer_id: CUSTOMER_ID,
    });
  }

  // ---------- 2) Marcar linhas sem identificador como failed ----------
  const sendable: PendingRow[] = [];
  const noIdIds: string[] = [];
  for (const r of pending) {
    if (r.gclid || r.gbraid || r.wbraid) sendable.push(r);
    else noIdIds.push(r.id);
  }
  let failedNoId = 0;
  if (noIdIds.length > 0) {
    const { error: upErr, count } = await admin
      .schema("crm")
      .from("google_conversion")
      .update({
        status: "failed",
        error_detail: "sem_identificador_clique",
        updated_at: new Date().toISOString(),
      }, { count: "exact" })
      .in("id", noIdIds);
    if (upErr) errors.push(`mark_no_id_failed:${upErr.message}`);
    else failedNoId = count ?? noIdIds.length;
  }

  if (sendable.length === 0) {
    return json({
      read: pending.length, sent: 0, failed: failedNoId,
      errors, customer_id: CUSTOMER_ID,
    });
  }

  // ---------- 3) Auth Google ----------
  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (e) {
    console.error("[crm-google-conversion-upload] SA auth failed:", e);
    return json({ error: "google_sa_auth_failed", detail: String(e) }, 500);
  }

  // ---------- 4) Montar payload (ordem importa: results[i] ↔ sendable[i]) ----------
  const conversions = sendable.map((r) => {
    const c: Record<string, unknown> = {
      conversionAction: buildConversionActionResource(r.conversion_action_ref),
      conversionDateTime: formatGoogleDateTime(r.conversion_datetime),
    };
    if (r.gclid) c.gclid = r.gclid;
    else if (r.gbraid) c.gbraid = r.gbraid;
    else if (r.wbraid) c.wbraid = r.wbraid;
    if (r.conversion_value !== null && r.conversion_value !== undefined) {
      c.conversionValue = Number(r.conversion_value);
      c.currencyCode = r.currency_code ?? "EUR";
    }
    if (r.order_id) c.orderId = r.order_id;
    return c;
  });

  // ---------- 5) Chamar Google ----------
  const url =
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${CUSTOMER_ID}:uploadClickConversions`;
  let apiData: any;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": devToken,
        "login-customer-id": LOGIN_CUSTOMER_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ conversions, partialFailure: true }),
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      const text = await res.text();
      throw new Error(
        `google_ads_api_non_json:${res.status}:${ct}:${text.slice(0, 300)}`,
      );
    }
    apiData = await res.json();
    if (!res.ok) {
      throw new Error(
        `google_ads_api_failed:${res.status}:${JSON.stringify(apiData).slice(0, 500)}`,
      );
    }
  } catch (e) {
    console.error("[crm-google-conversion-upload] upload failed:", e);
    return json({
      error: "google_ads_api_failed",
      detail: String(e),
      read: pending.length,
      sent: 0,
      failed: failedNoId,
    }, 502);
  }

  // ---------- 6) Mapear resultados ----------
  // Google devolve results[] com o mesmo comprimento de conversions[]; entradas
  // rejeitadas aparecem vazias ({}). partialFailureError tem a Status com details
  // contendo GoogleAdsFailure -> errors[].location.fieldPathElements.index.
  const results: any[] = Array.isArray(apiData.results) ? apiData.results : [];
  const errorByIndex = new Map<number, string>();
  const pfe = apiData.partialFailureError;
  if (pfe) {
    const details: any[] = Array.isArray(pfe.details) ? pfe.details : [];
    for (const det of details) {
      const errs: any[] = Array.isArray(det?.errors) ? det.errors : [];
      for (const er of errs) {
        const fpe: any[] = er?.location?.fieldPathElements ?? [];
        const idxEl = fpe.find((p: any) => typeof p?.index === "number");
        const idx = idxEl?.index;
        const msg = er?.message ?? JSON.stringify(er).slice(0, 300);
        if (typeof idx === "number") {
          errorByIndex.set(idx, errorByIndex.get(idx)
            ? `${errorByIndex.get(idx)} | ${msg}`
            : msg);
        }
      }
    }
  }

  // ---------- 7) Atualizar BD linha a linha ----------
  let sent = 0;
  let failed = failedNoId;
  const nowIso = new Date().toISOString();

  for (let i = 0; i < sendable.length; i++) {
    const row = sendable[i];
    const result = results[i];
    const errMsg = errorByIndex.get(i);
    const accepted = !errMsg &&
      result && typeof result === "object" &&
      (result.gclid || result.gbraid || result.wbraid ||
        result.conversionAction || result.conversionDateTime);

    if (accepted) {
      const { error: upErr } = await admin
        .schema("crm")
        .from("google_conversion")
        .update({
          status: "sent",
          sent_at: nowIso,
          error_detail: null,
          raw: { sent_payload: conversions[i], result },
          updated_at: nowIso,
        })
        .eq("id", row.id);
      if (upErr) errors.push(`update_sent_${row.id}:${upErr.message}`);
      else sent++;
    } else {
      const detail = errMsg ?? "rejected_no_detail";
      const { error: upErr } = await admin
        .schema("crm")
        .from("google_conversion")
        .update({
          status: "failed",
          error_detail: detail.slice(0, 1000),
          raw: { sent_payload: conversions[i], result, error: errMsg ?? null },
          updated_at: nowIso,
        })
        .eq("id", row.id);
      if (upErr) errors.push(`update_failed_${row.id}:${upErr.message}`);
      else failed++;
    }
  }

  return json({
    read: pending.length,
    sent,
    failed,
    errors,
    customer_id: CUSTOMER_ID,
  });
});
