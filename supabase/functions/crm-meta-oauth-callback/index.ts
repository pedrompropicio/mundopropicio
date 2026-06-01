// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-meta-oauth-callback
//
// Meta OAuth redirect handler. Meta sends the user back here with
// ?code=...&state=<uuid>. We:
//   1. Validate inputs
//   2. (handled in branch) if Meta returned error → redirect with reason
//   3. Consume single-use state via crm.consume_oauth_state
//   4. Exchange code → short-lived access token
//   5. Exchange short-lived → long-lived (~60d)
//   6. Fetch /me/businesses to know which Business Manager(s) the user has
//   7. Encrypt + upsert connection via crm.upsert_meta_connection
//   8. Write audit log via crm.write_audit_log
//   9. Redirect to /crm/connections with status
//
// Public endpoint: invoked by browser redirect from Meta, no Supabase JWT
// available. Requires verify_jwt = false in supabase/config.toml.
//
// See ARCHITECTURE.md ADR-010 (token strategy) and §2.6 (audit).

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const META_APP_ID = Deno.env.get("META_APP_ID")!;
const META_APP_SECRET = Deno.env.get("META_APP_SECRET")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;
// Fallback hardcoded para resiliência: se o secret estiver vazio/inacessível em runtime
// (visto durante setup inicial — desalinhamento entre Lovable Cloud Test/Live projects),
// a function continua a funcionar. Ver troubleshooting em sessões de 2026-05-10.
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://www.mpgestaoeventos.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/crm-meta-oauth-callback`;

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0].trim();
  return first || null;
}

function buildAppRedirect(params: Record<string, string>): string {
  const url = new URL("/audience/connections", APP_BASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

interface MetaTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message: string; type: string; code: number };
}

interface MetaBusiness {
  id: string;
  name: string;
}

interface MetaBusinessesResponse {
  data?: MetaBusiness[];
  error?: { message: string; type: string; code: number };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");
  const errDesc = url.searchParams.get("error_description");

  // (2) Meta returned an error (user cancelled, app revoked, etc.)
  if (errParam) {
    console.error(
      "[crm-meta-oauth-callback] Meta returned error:",
      errParam,
      errDesc,
    );
    return redirect(
      buildAppRedirect({ platform: "meta", status: "error", reason: "auth_denied" }),
    );
  }

  // (1) Input presence + format validation
  if (!code || !state) {
    console.error("[crm-meta-oauth-callback] missing code or state");
    return redirect(
      buildAppRedirect({
        platform: "meta",
        status: "error",
        reason: "missing_params",
      }),
    );
  }
  if (!UUID_RE.test(state)) {
    console.error("[crm-meta-oauth-callback] invalid state format:", state);
    return redirect(
      buildAppRedirect({
        platform: "meta",
        status: "error",
        reason: "invalid_state",
      }),
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // (3) Consume single-use state — deletes the row, returns owning company+user
  const { data: stateRows, error: stateErr } = await supabase
    .rpc("crm_consume_oauth_state", { p_state_id: state });

  if (
    stateErr ||
    !Array.isArray(stateRows) ||
    stateRows.length === 0 ||
    !stateRows[0].valid
  ) {
    console.error(
      "[crm-meta-oauth-callback] consume_oauth_state failed:",
      stateErr,
      stateRows,
    );
    return redirect(
      buildAppRedirect({
        platform: "meta",
        status: "error",
        reason: "invalid_or_expired_state",
      }),
    );
  }

  const {
    company_id,
    user_id,
    platform,
  } = stateRows[0] as {
    company_id: string;
    user_id: string;
    platform: string;
    valid: boolean;
  };

  if (platform !== "meta") {
    console.error("[crm-meta-oauth-callback] state platform mismatch:", platform);
    return redirect(
      buildAppRedirect({
        platform: "meta",
        status: "error",
        reason: "platform_mismatch",
      }),
    );
  }

  // (4) Exchange authorization code → short-lived user access token
  let shortToken: string;
  try {
    const exchangeUrl = new URL(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`,
    );
    exchangeUrl.searchParams.set("client_id", META_APP_ID);
    exchangeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    exchangeUrl.searchParams.set("client_secret", META_APP_SECRET);
    exchangeUrl.searchParams.set("code", code);

    const res = await fetch(exchangeUrl);
    const json = (await res.json()) as MetaTokenResponse;
    if (!res.ok || json.error || !json.access_token) {
      console.error(
        "[crm-meta-oauth-callback] short-lived exchange failed:",
        res.status,
        json,
      );
      return redirect(
        buildAppRedirect({
          platform: "meta",
          status: "error",
          reason: "token_exchange_failed",
        }),
      );
    }
    shortToken = json.access_token;
  } catch (e) {
    console.error("[crm-meta-oauth-callback] short-lived exchange threw:", e);
    return redirect(
      buildAppRedirect({
        platform: "meta",
        status: "error",
        reason: "token_exchange_failed",
      }),
    );
  }

  // (5) Exchange short-lived → long-lived user access token (~60 days)
  let longToken: string;
  let expiresInSec: number;
  try {
    const longUrl = new URL(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`,
    );
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", META_APP_ID);
    longUrl.searchParams.set("client_secret", META_APP_SECRET);
    longUrl.searchParams.set("fb_exchange_token", shortToken);

    const res = await fetch(longUrl);
    const json = (await res.json()) as MetaTokenResponse;
    if (!res.ok || json.error || !json.access_token) {
      console.error(
        "[crm-meta-oauth-callback] long-lived exchange failed:",
        res.status,
        json,
      );
      return redirect(
        buildAppRedirect({
          platform: "meta",
          status: "error",
          reason: "token_exchange_failed",
        }),
      );
    }
    longToken = json.access_token;
    // Meta typically returns 60 days for long-lived; fall back if missing.
    expiresInSec = Number(json.expires_in) || 60 * 60 * 24 * 60;
  } catch (e) {
    console.error("[crm-meta-oauth-callback] long-lived exchange threw:", e);
    return redirect(
      buildAppRedirect({
        platform: "meta",
        status: "error",
        reason: "token_exchange_failed",
      }),
    );
  }

  const expiresAt = new Date(Date.now() + expiresInSec * 1000);

  // (6) Fetch the user's Business Managers
  let businesses: MetaBusiness[];
  try {
    const bizUrl = new URL(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/me/businesses`,
    );
    bizUrl.searchParams.set("access_token", longToken);
    bizUrl.searchParams.set("fields", "id,name");

    const res = await fetch(bizUrl);
    const json = (await res.json()) as MetaBusinessesResponse;
    if (!res.ok || json.error) {
      console.error(
        "[crm-meta-oauth-callback] /me/businesses failed:",
        res.status,
        json,
      );
      return redirect(
        buildAppRedirect({
          platform: "meta",
          status: "error",
          reason: "businesses_fetch_failed",
        }),
      );
    }
    businesses = json.data ?? [];
  } catch (e) {
    console.error("[crm-meta-oauth-callback] /me/businesses threw:", e);
    return redirect(
      buildAppRedirect({
        platform: "meta",
        status: "error",
        reason: "businesses_fetch_failed",
      }),
    );
  }

  if (businesses.length === 0) {
    console.error("[crm-meta-oauth-callback] no businesses for user", user_id);
    return redirect(
      buildAppRedirect({
        platform: "meta",
        status: "error",
        reason: "no_business_manager",
      }),
    );
  }

  const primary = businesses[0];

  // (7) Encrypt token and upsert the platform connection
  const { data: connectionId, error: upsertErr } = await supabase
    .rpc("crm_upsert_meta_connection", {
      p_company_id: company_id,
      p_user_id: user_id,
      p_external_business_id: primary.id,
      p_external_business_name: primary.name,
      p_access_token: longToken,
      p_token_type: "long_lived_user",
      p_expires_at: expiresAt.toISOString(),
      p_master_key: ENCRYPTION_MASTER_KEY,
      // available_ad_accounts: full list of Business Managers from /me/businesses.
      // Used later by the frontend's "select primary BM" UI without re-fetching from Meta.
      // Ad accounts within each BM are fetched lazily by a separate function when the user
      // picks the BM (see future crm-meta-fetch-ad-accounts function).
      p_available_ad_accounts: businesses,
    });

  if (upsertErr || !connectionId) {
    console.error(
      "[crm-meta-oauth-callback] upsert_meta_connection failed:",
      upsertErr,
    );
    return redirect(
      buildAppRedirect({
        platform: "meta",
        status: "error",
        reason: "connection_save_failed",
      }),
    );
  }

  // (8) Audit log — best effort, do not block the redirect on failure
  try {
    const { error: auditErr } = await supabase
      .rpc("crm_write_audit_log", {
        p_company_id: company_id,
        p_user_id: user_id,
        p_action: "crm.ad_platform_connection.created",
        p_entity_type: "ad_platform_connection",
        p_entity_id: connectionId,
        p_payload_before: null,
        p_payload_after: {
          platform: "meta",
          external_business_id: primary.id,
          external_business_name: primary.name,
          token_type: "long_lived_user",
          expires_at: expiresAt.toISOString(),
          available_businesses_count: businesses.length,
        },
        p_ip_address: clientIp(req),
        p_user_agent: req.headers.get("user-agent"),
      });
    if (auditErr) {
      console.error(
        "[crm-meta-oauth-callback] write_audit_log returned error:",
        auditErr,
      );
    }
  } catch (e) {
    console.error("[crm-meta-oauth-callback] write_audit_log threw:", e);
  }

  // (9) Success — send the user back to the connections page
  return redirect(
    buildAppRedirect({
      platform: "meta",
      status: "success",
      conn: connectionId as string,
    }),
  );
});
