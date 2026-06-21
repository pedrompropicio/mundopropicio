// crm-google-user-list-ensure
//
// Garante que cada linha de `crm.google_user_list` (status='draft', sem
// external_user_list_id) existe como Customer Match user list no Google Ads.
// Idempotente: linhas já com external_user_list_id são ignoradas.
//
// Auth caller: igual ao padrão v2-cronauth de crm-google-conversion-upload
// (service_role bypass via decode manual do JWT; senão has_role admin).
//
// Auth Google: service account (GOOGLE_SA_KEY_JSON), mesmos helpers da
// crm-google-conversion-upload.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GOOGLE_ADS_API_VERSION = Deno.env.get("GOOGLE_ADS_API_VERSION") ?? "v24";
const LOGIN_CUSTOMER_ID = "9743221780";
const CUSTOMER_ID = "2200043144";
const MP_COMPANY_ID = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";

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

// ---------- SA JWT → access token (cópia de crm-google-conversion-upload) ----------

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

// ---------- types ----------

interface UserListRow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  membership_life_span: number;
  external_user_list_id: string | null;
}

// ---------- Entry ----------

Deno.serve(async (req: Request): Promise<Response> => {
  console.log(
    "[crm-google-user-list-ensure] BUILD_VERSION=user-list-ensure-v1",
    new Date().toISOString(),
  );
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  // Service_role bypass (cron) — decode manual do payload.
  let isServiceRole = false;
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload?.role === "service_role") isServiceRole = true;
    }
  } catch {
    // ignora — cai no caminho admin
  }

  if (!isServiceRole) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
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
  }

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

  // ---------- 1) Body opcional ----------
  let body: { user_list_id?: string; name?: string; description?: string } = {};
  try {
    const txt = await req.text();
    if (txt) body = JSON.parse(txt);
  } catch {
    return json({ error: "invalid_json_body" }, 400);
  }

  // ---------- 2) Selecionar candidatos ----------
  let rows: UserListRow[] = [];
  const selectCols =
    "id, company_id, name, description, membership_life_span, external_user_list_id";

  if (body.user_list_id) {
    const { data, error } = await admin
      .schema("crm")
      .from("google_user_list")
      .select(selectCols)
      .eq("id", body.user_list_id)
      .maybeSingle();
    if (error) return json({ error: "fetch_failed", detail: error.message }, 500);
    if (!data) return json({ error: "not_found" }, 404);
    rows = [data as UserListRow];
  } else if (body.name) {
    // find-or-create draft na MP
    const { data: existing, error: findErr } = await admin
      .schema("crm")
      .from("google_user_list")
      .select(selectCols)
      .eq("company_id", MP_COMPANY_ID)
      .eq("name", body.name)
      .maybeSingle();
    if (findErr) {
      return json({ error: "find_failed", detail: findErr.message }, 500);
    }
    if (existing) {
      rows = [existing as UserListRow];
    } else {
      const { data: inserted, error: insErr } = await admin
        .schema("crm")
        .from("google_user_list")
        .insert({
          company_id: MP_COMPANY_ID,
          name: body.name,
          description: body.description ?? null,
          status: "draft",
        })
        .select(selectCols)
        .single();
      if (insErr) {
        return json({ error: "create_failed", detail: insErr.message }, 500);
      }
      rows = [inserted as UserListRow];
    }
  } else {
    const { data, error } = await admin
      .schema("crm")
      .from("google_user_list")
      .select(selectCols)
      .eq("company_id", MP_COMPANY_ID)
      .eq("status", "draft")
      .is("external_user_list_id", null);
    if (error) return json({ error: "fetch_failed", detail: error.message }, 500);
    rows = (data ?? []) as UserListRow[];
  }

  // Filtro idempotente
  const pending = rows.filter((r) => !r.external_user_list_id);

  if (pending.length === 0) {
    return json({
      processed: 0,
      created: 0,
      errors: [],
      results: [],
      customer_id: CUSTOMER_ID,
    });
  }

  // ---------- 3) Auth Google ----------
  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (e) {
    console.error("[crm-google-user-list-ensure] SA auth failed:", e);
    return json({ error: "google_sa_auth_failed", detail: String(e) }, 500);
  }

  const url =
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${CUSTOMER_ID}/userLists:mutate`;

  const results: Array<{
    user_list_id: string;
    external_user_list_id: string | null;
    status: "active" | "error";
  }> = [];
  const errors: string[] = [];
  let created = 0;
  const nowIso = new Date().toISOString();

  // ---------- 4) Processar linha a linha ----------
  for (const row of pending) {
    const payload = {
      operations: [{
        create: {
          name: row.name,
          description: row.description ?? "",
          membershipLifeSpan: row.membership_life_span,
          crmBasedUserList: {
            uploadKeyType: "CONTACT_INFO",
            dataSourceType: "FIRST_PARTY",
          },
        },
      }],
    };

    let apiData: any = null;
    let apiError: string | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": devToken,
          "login-customer-id": LOGIN_CUSTOMER_ID,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        const text = await res.text();
        apiError =
          `google_ads_api_non_json:${res.status}:${ct}:${text.slice(0, 300)}`;
      } else {
        apiData = await res.json();
        if (!res.ok) {
          apiError = `google_ads_api_failed:${res.status}:${
            JSON.stringify(apiData).slice(0, 500)
          }`;
        }
      }
    } catch (e) {
      apiError = `fetch_failed:${String(e)}`;
    }

    const resourceName: string | undefined =
      apiData?.results?.[0]?.resourceName;

    if (!apiError && resourceName) {
      const segs = resourceName.split("/");
      const externalId = segs[segs.length - 1];
      const { error: upErr } = await admin
        .schema("crm")
        .from("google_user_list")
        .update({
          external_resource_name: resourceName,
          external_user_list_id: externalId,
          status: "active",
          last_synced_at: nowIso,
          raw: apiData,
          updated_at: nowIso,
        })
        .eq("id", row.id);
      if (upErr) {
        errors.push(`update_active_${row.id}:${upErr.message}`);
        results.push({
          user_list_id: row.id,
          external_user_list_id: externalId,
          status: "error",
        });
      } else {
        created++;
        results.push({
          user_list_id: row.id,
          external_user_list_id: externalId,
          status: "active",
        });
      }
    } else {
      const detail = apiError ?? "no_resource_name_returned";
      errors.push(`${row.id}:${detail.slice(0, 300)}`);
      const { error: upErr } = await admin
        .schema("crm")
        .from("google_user_list")
        .update({
          status: "error",
          raw: { error: detail, response: apiData },
          updated_at: nowIso,
        })
        .eq("id", row.id);
      if (upErr) errors.push(`update_error_${row.id}:${upErr.message}`);
      results.push({
        user_list_id: row.id,
        external_user_list_id: null,
        status: "error",
      });
    }
  }

  return json({
    processed: pending.length,
    created,
    errors,
    results,
    customer_id: CUSTOMER_ID,
  });
});
