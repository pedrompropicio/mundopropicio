// _shared/google-data-manager.ts
//
// Adaptador partilhado da Data Manager API da Google.
//
// Substitui o caminho antigo (Google Ads API ConversionUploadService), que a
// Google fechou a novas integrações:
//   "New integrations for uploading click conversions should use the Data
//    Manager API. Usage of ConversionUploadService.UploadClickConversions is
//    limited to existing users."
//
// Usado por:
//   - crm-google-conversion-upload   (conversões offline por gclid)
//   - crm-google-customer-match-sync (futuro: membros de Customer Match)
//
// Diferenças face ao caminho antigo:
//   - endpoint  datamanager.googleapis.com/v1/events:ingest
//   - scope     https://www.googleapis.com/auth/datamanager  (era .../adwords)
//   - SEM header developer-token e SEM login-customer-id
//   - a ação de conversão vai no destination (productDestinationId),
//     não dentro de cada evento
//   - a resposta NÃO tem resultado por evento: é tudo-ou-nada por request

export const DATA_MANAGER_SCOPE =
  "https://www.googleapis.com/auth/datamanager";
export const ADWORDS_SCOPE = "https://www.googleapis.com/auth/adwords";

export const DATA_MANAGER_ENDPOINT =
  "https://datamanager.googleapis.com/v1/events:ingest";

/** Máximo de eventos por request imposto pela Data Manager API. */
export const DATA_MANAGER_MAX_EVENTS = 2000;

// ---------------------------------------------------------------- token ----

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

/**
 * Troca a chave da service account (secret GOOGLE_SA_KEY_JSON) por um access
 * token, para o scope pedido.
 *
 * Mesma mecânica do _shared/google-ads.ts — a ÚNICA diferença é o scope ser
 * parametrizável. Aceita vários scopes separados por espaço.
 */
export async function getGoogleAccessToken(
  scope: string = DATA_MANAGER_SCOPE,
): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SA_KEY_JSON");
  if (!raw) throw new Error("missing_secret:GOOGLE_SA_KEY_JSON");

  let sa: { client_email?: string; private_key?: string; token_uri?: string };
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error("invalid_secret:GOOGLE_SA_KEY_JSON_not_valid_json");
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error("invalid_secret:GOOGLE_SA_KEY_JSON_missing_fields");
  }

  const privateKeyPem = sa.private_key.replace(/\\n/g, "\n");
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";

  const now = Math.floor(Date.now() / 1000);
  const signingInput = `${b64urlJson({ alg: "RS256", typ: "JWT" })}.${
    b64urlJson({
      iss: sa.client_email,
      scope,
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    })
  }`;

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

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signingInput}.${b64url(sig)}`,
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
    throw new Error(`google_oauth_failed:${res.status}:${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

// ----------------------------------------------------------------- tipos ----

export interface ProductAccount {
  accountId: string;
  accountType: "GOOGLE_ADS" | string;
}

export interface DataManagerDestination {
  reference: string;
  loginAccount?: ProductAccount;
  operatingAccount: ProductAccount;
  productDestinationId: string;
}

export interface DataManagerEvent {
  destinationReferences: string[];
  transactionId?: string;
  eventTimestamp: string;
  adIdentifiers?: {
    gclid?: string;
    gbraid?: string;
    wbraid?: string;
  };
  conversionValue?: number;
  currency?: string;
  eventSource?: "WEB" | "APP" | "IN_STORE" | "PHONE" | "OTHER";
}

export interface IngestResult {
  ok: boolean;
  status: number;
  requestId?: string;
  fieldWarnings?: unknown[];
  error?: unknown;
}

// --------------------------------------------------------------- ingest ----

/**
 * POST datamanager.googleapis.com/v1/events:ingest
 *
 * ATENÇÃO — semântica diferente do ConversionUploadService: a resposta é
 * { requestId, fieldWarnings }. NÃO há resultado por evento. Ou o request
 * inteiro é aceite, ou nenhum evento entra. Quem chama tem de tratar o lote
 * como uma unidade.
 *
 * Com validateOnly=true a Google valida estrutura, credenciais e permissões
 * sem ingerir nada — é o modo certo para o primeiro teste.
 */
export async function ingestEvents(opts: {
  accessToken: string;
  destinations: DataManagerDestination[];
  events: DataManagerEvent[];
  validateOnly?: boolean;
  /** Consentimento ao nível do request. */
  adPersonalizationConsent?: "PERSONALIZATION_ALLOWED" | "PERSONALIZATION_DENIED";
}): Promise<IngestResult> {
  if (opts.events.length > DATA_MANAGER_MAX_EVENTS) {
    throw new Error(
      `too_many_events:${opts.events.length}>${DATA_MANAGER_MAX_EVENTS}`,
    );
  }

  const body: Record<string, unknown> = {
    destinations: opts.destinations,
    events: opts.events,
    validateOnly: opts.validateOnly ?? false,
  };
  if (opts.adPersonalizationConsent) {
    body.consent = { adPersonalizationConsent: opts.adPersonalizationConsent };
  }
  // NOTA: 'encoding' só é preciso quando se enviam userIdentifiers com hash.
  // Aqui só mandamos gclid, por isso fica de fora de propósito.

  const res = await fetch(DATA_MANAGER_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    return {
      ok: false,
      status: res.status,
      error: `data_manager_non_json:${res.status}:${ct}:${text.slice(0, 500)}`,
    };
  }

  const data = await res.json();
  if (!res.ok) {
    return { ok: false, status: res.status, error: data };
  }

  return {
    ok: true,
    status: res.status,
    requestId: data.requestId,
    fieldWarnings: Array.isArray(data.fieldWarnings) ? data.fieldWarnings : [],
  };
}

/** timestamptz do Postgres -> RFC 3339, que é o que a Data Manager API quer. */
export function toRfc3339(ts: string): string {
  return new Date(ts).toISOString();
}