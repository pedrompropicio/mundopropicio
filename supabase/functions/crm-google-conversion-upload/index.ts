// crm-google-conversion-upload
//
// Envio de conversões offline para o Google Ads via DATA MANAGER API.
//
// Migrado de POST /v24/customers/{cid}:uploadClickConversions (Google Ads API),
// que a Google fechou a novas integrações em 2026:
//   "New integrations for uploading click conversions should use the Data
//    Manager API. Usage of ConversionUploadService.UploadClickConversions is
//    limited to existing users."
// As 14 linhas em crm.google_conversion entre 23 e 27/08/2026 falharam todas
// com esse erro. Ver docs + issue #62.
//
// Lê crm.google_conversion (status='pending') e envia para
//   POST https://datamanager.googleapis.com/v1/events:ingest
//
// DIFERENÇA IMPORTANTE face à versão anterior: a Data Manager API não devolve
// resultado por evento (só { requestId, fieldWarnings }). O lote é tudo-ou-nada.
// Em caso de erro as linhas ficam em 'pending' (não 'failed') para o cron
// tentar outra vez — só vão a 'failed' quando o erro é da própria linha
// (ex.: sem identificador de clique).
//
// Auth Google: service account GOOGLE_SA_KEY_JSON, scope datamanager.
// Auth caller: service_role (cron, jobid 43) ou JWT de admin.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import {
  DATA_MANAGER_MAX_EVENTS,
  DATA_MANAGER_SCOPE,
  type DataManagerDestination,
  type DataManagerEvent,
  getGoogleAccessToken,
  ingestEvents,
  toRfc3339,
} from "../_shared/google-data-manager.ts";

/** Conta Google Ads que recebe os dados (220-004-3144). */
const OPERATING_ACCOUNT_ID = "2200043144";
/** MCC onde a service account tem acesso (974-322-1780). */
const LOGIN_ACCOUNT_ID = "9743221780";

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

/** O ref pode vir como ID numérico ou como resource name completo. */
function toConversionActionId(ref: string): string {
  const trimmed = ref.trim();
  const m = trimmed.match(/conversionActions\/(\d+)/);
  if (m) return m[1];
  return trimmed;
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log(
    "[crm-google-conversion-upload] BUILD_VERSION=conv-upload-v3-datamanager",
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

  // ----- opções de entrada -----
  let validateOnly = false;
  let limit = DATA_MANAGER_MAX_EVENTS;
  try {
    const raw = await req.text();
    if (raw) {
      const parsed = JSON.parse(raw);
      validateOnly = parsed?.validate_only === true;
      if (Number.isFinite(parsed?.limit)) {
        limit = Math.max(1, Math.min(DATA_MANAGER_MAX_EVENTS, parsed.limit));
      }
    }
  } catch {
    // corpo vazio ou não-JSON: mantém defaults
  }

  // ----- auth do caller: service_role (cron) ou admin -----
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
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: claimsData.claims.sub as string,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "forbidden_admin_only" }, 403);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---------- 1) Ler pendentes ----------
  const { data: pendingRaw, error: fetchErr } = await admin
    .schema("crm")
    .from("google_conversion")
    .select(
      "id, conversion_action_ref, gclid, gbraid, wbraid, conversion_value, currency_code, order_id, conversion_datetime",
    )
    .eq("status", "pending")
    .order("conversion_datetime", { ascending: true })
    .limit(limit);

  if (fetchErr) {
    return json({ error: "fetch_pending_failed", detail: fetchErr.message }, 500);
  }

  const pending = (pendingRaw ?? []) as PendingRow[];
  const errors: string[] = [];

  if (pending.length === 0) {
    return json({
      read: 0,
      sent: 0,
      failed: 0,
      validate_only: validateOnly,
      errors: [],
      operating_account_id: OPERATING_ACCOUNT_ID,
    });
  }

  // ---------- 2) Linhas sem identificador de clique: falha própria ----------
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
      read: pending.length,
      sent: 0,
      failed: failedNoId,
      validate_only: validateOnly,
      errors,
      operating_account_id: OPERATING_ACCOUNT_ID,
    });
  }

  // ---------- 3) Token (scope datamanager) ----------
  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(DATA_MANAGER_SCOPE);
  } catch (e) {
    console.error("[crm-google-conversion-upload] SA auth failed:", e);
    return json({ error: "google_sa_auth_failed", detail: String(e) }, 500);
  }

  // ---------- 4) Destinations: um por ação de conversão distinta ----------
  // Na Data Manager API a ação de conversão vive no destination
  // (productDestinationId), não dentro do evento. Cada evento aponta para o
  // destination pela 'reference'.
  const destinationByAction = new Map<string, string>();
  const destinations: DataManagerDestination[] = [];
  for (const r of sendable) {
    const actionId = toConversionActionId(r.conversion_action_ref);
    if (destinationByAction.has(actionId)) continue;
    const reference = `ca_${actionId}`;
    destinationByAction.set(actionId, reference);
    destinations.push({
      reference,
      loginAccount: {
        accountId: LOGIN_ACCOUNT_ID,
        accountType: "GOOGLE_ADS",
      },
      operatingAccount: {
        accountId: OPERATING_ACCOUNT_ID,
        accountType: "GOOGLE_ADS",
      },
      productDestinationId: actionId,
    });
  }

  // ---------- 5) Eventos ----------
  const events: DataManagerEvent[] = sendable.map((r) => {
    const actionId = toConversionActionId(r.conversion_action_ref);
    const ev: DataManagerEvent = {
      destinationReferences: [destinationByAction.get(actionId)!],
      eventTimestamp: toRfc3339(r.conversion_datetime),
      eventSource: "WEB",
      adIdentifiers: {},
    };
    if (r.gclid) ev.adIdentifiers!.gclid = r.gclid;
    else if (r.gbraid) ev.adIdentifiers!.gbraid = r.gbraid;
    else if (r.wbraid) ev.adIdentifiers!.wbraid = r.wbraid;

    if (r.conversion_value !== null && r.conversion_value !== undefined) {
      ev.conversionValue = Number(r.conversion_value);
      ev.currency = r.currency_code ?? "EUR";
    }
    // order_id = lead_capture.id — é a nossa chave de dedupe.
    if (r.order_id) ev.transactionId = r.order_id;
    return ev;
  });

  // ---------- 6) Enviar ----------
  // O enqueue só enfileira cliques com consent_granted = true, por isso
  // podemos afirmar consentimento de personalização com verdade.
  const result = await ingestEvents({
    accessToken,
    destinations,
    events,
validateOnly,
    consent: {
      adUserData: "CONSENT_GRANTED",
      adPersonalization: "CONSENT_GRANTED",
    },
  });

  const nowIso = new Date().toISOString();

  // ---------- 7) Erro: devolver as linhas a 'pending' ----------
  // Tudo-ou-nada. Não enterramos as linhas em 'failed' — o erro é do lote
  // (credenciais, permissões, API), não da linha.
  if (!result.ok) {
    console.error(
      "[crm-google-conversion-upload] ingest failed:",
      JSON.stringify(result.error).slice(0, 1000),
    );
    const detail = typeof result.error === "string"
      ? result.error
      : JSON.stringify(result.error);

    const { error: upErr } = await admin
      .schema("crm")
      .from("google_conversion")
      .update({
        error_detail: detail.slice(0, 1000),
        updated_at: nowIso,
      })
      .in("id", sendable.map((r) => r.id));
    if (upErr) errors.push(`mark_retry_failed:${upErr.message}`);

    return json({
      error: "data_manager_ingest_failed",
      status: result.status,
      detail: result.error,
      read: pending.length,
      sent: 0,
      failed: failedNoId,
      still_pending: sendable.length,
      validate_only: validateOnly,
      errors,
    }, 502);
  }

  // ---------- 8) validateOnly: não marca nada ----------
  if (validateOnly) {
    return json({
      validate_only: true,
      ok: true,
      read: pending.length,
      would_send: sendable.length,
      request_id: result.requestId,
      field_warnings: result.fieldWarnings,
      destinations,
      sample_event: events[0],
      operating_account_id: OPERATING_ACCOUNT_ID,
    });
  }

  // ---------- 9) Sucesso: marcar tudo como enviado ----------
  const { error: upErr, count } = await admin
    .schema("crm")
    .from("google_conversion")
    .update({
      status: "sent",
      sent_at: nowIso,
      error_detail: null,
      data_manager_job_id: result.requestId ?? null,
      raw: {
        transport: "data_manager",
        request_id: result.requestId,
        field_warnings: result.fieldWarnings,
      },
      updated_at: nowIso,
    }, { count: "exact" })
    .in("id", sendable.map((r) => r.id));

  if (upErr) errors.push(`update_sent:${upErr.message}`);

  return json({
    read: pending.length,
    sent: count ?? sendable.length,
    failed: failedNoId,
    request_id: result.requestId,
    field_warnings: result.fieldWarnings,
    validate_only: false,
    errors,
    operating_account_id: OPERATING_ACCOUNT_ID,
  });
});