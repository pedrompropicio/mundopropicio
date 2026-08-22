// Helpers partilhados do Google Ads (auth por service account + chamadas REST).
// Extraído do padrão já usado em crm-google-sync-campaigns / crm-google-conversion-upload.

export const GOOGLE_ADS_API_VERSION = "v24";
const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

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
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Access token OAuth2 com scope adwords, a partir de GOOGLE_SA_KEY_JSON. */
export async function getGoogleAdsAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SA_KEY_JSON");
  if (!raw) throw new Error("missing_secret_GOOGLE_SA_KEY_JSON");
  let sa: { client_email: string; private_key: string; token_uri?: string };
  try {
    sa = JSON.parse(raw);
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
  const signingInput =
    b64urlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64urlEncode(JSON.stringify(claims));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)),
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

export interface GoogleAdsCtx {
  accessToken: string;
  developerToken: string;
  loginCustomerId: string;
  customerId: string;
}

/** POST a um endpoint da Google Ads API. `path` é relativo à versão (ex.: "/customers/123/campaigns:mutate"). */
export async function googleAdsPost<T = unknown>(
  ctx: GoogleAdsCtx,
  path: string,
  body: unknown,
): Promise<T> {
  const resp = await fetch(`${GOOGLE_ADS_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "developer-token": ctx.developerToken,
      "login-customer-id": ctx.loginCustomerId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await resp.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* mantém texto cru */
  }
  if (!resp.ok) {
    throw new GoogleAdsError(`google_ads_${resp.status}`, resp.status, parsed);
  }
  return parsed as T;
}

export class GoogleAdsError extends Error {
  status: number;
  raw: unknown;
  constructor(message: string, status: number, raw: unknown) {
    super(message);
    this.name = "GoogleAdsError";
    this.status = status;
    this.raw = raw;
  }
}

/** GAQL search (não-stream), útil para leituras pequenas. */
export async function googleAdsSearch(
  ctx: GoogleAdsCtx,
  query: string,
): Promise<Array<Record<string, any>>> {
  const out: Array<Record<string, any>> = [];
  let pageToken: string | undefined;
  do {
    const page = await googleAdsPost<{ results?: any[]; nextPageToken?: string }>(
      ctx,
      `/customers/${ctx.customerId}/googleAds:search`,
      { query, pageSize: 1000, pageToken },
    );
    for (const r of page.results ?? []) out.push(r);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

export function mensagemErroGoogle(raw: unknown): string {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    const errs = (obj as any)?.error?.details?.[0]?.errors ?? (obj as any)?.[0]?.error?.details?.[0]?.errors;
    if (Array.isArray(errs) && errs.length) {
      return errs.map((e: any) => e.message).filter(Boolean).join(" · ");
    }
    const msg = (obj as any)?.error?.message;
    if (msg) return String(msg);
  } catch {
    /* ignora */
  }
  return "O Google recusou o pedido. Vê o detalhe técnico no plano.";
}
