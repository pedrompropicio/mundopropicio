// crm-google-lead-conversion-enqueue
//
// Sprint 2 — Produtor da fila crm.google_conversion para LEADS.
//
// Varre crm.google_click (com lead_capture_id NOT NULL, identificador de
// clique e consent_granted=true) e enfileira uma linha 'pending' por lead
// em crm.google_conversion. O consumidor (crm-google-conversion-upload)
// processa-a depois.
//
// Por que LEAD em vez de venda? As vendas Ticketline/Fever chegam-nos
// agregadas — não temos o comprador individual — pelo que a atribuição
// possível ao clique Google é ao nível do LEAD que o utilizador deixou
// na landing. O conversion action no Google deve ser de categoria "Lead".
//
// Lê configuração da tabela public.portal_settings (escopada à Mundo
// Propício):
//   - google_lead_conversion_action_id (texto) — ID/recurso da ação
//   - google_lead_conversion_value     (numeric) — valor por conversão
//
// Auth caller: JWT de admin (has_role admin). 403 caso contrário.
// Sem cron por agora — invocação manual ou via UI futura.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const MP_COMPANY_ID = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const MAX_BATCH = 5000;

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

/** Lê uma portal_setting escalar (string|number) por `key`, para a empresa MP. */
function readSettingScalar(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  // jsonb pode vir como objeto { value: ... } — aceita esse padrão também
  if (typeof value === "object" && value !== null && "value" in value) {
    const v = (value as { value: unknown }).value;
    if (typeof v === "string" || typeof v === "number") return v;
  }
  return null;
}

interface ClickRow {
  id: string;
  lead_capture_id: string | null;
  client_event_id: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  captured_at: string;
  consent_granted: boolean | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log(
    "[crm-google-lead-conversion-enqueue] BUILD_VERSION=lead-producer-v2-cronauth",
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

  // Caminho service_role (cron) — descodificação manual do payload do JWT.
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
    // 1) Auth admin
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

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 2) Lê configuração de Portal Settings
  const { data: settings, error: settingsErr } = await admin
    .from("portal_settings")
    .select("key, value")
    .eq("company_id", MP_COMPANY_ID)
    .in("key", [
      "google_lead_conversion_action_id",
      "google_lead_conversion_value",
    ]);
  if (settingsErr) {
    return json(
      { error: "settings_read_failed", detail: settingsErr.message },
      500,
    );
  }
  const map = new Map<string, unknown>(
    (settings ?? []).map((s: { key: string; value: unknown }) => [s.key, s.value]),
  );
  const actionRefRaw = readSettingScalar(map.get("google_lead_conversion_action_id"));
  const actionRef = actionRefRaw == null ? "" : String(actionRefRaw).trim();
  if (!actionRef) {
    return json({
      enqueued: 0,
      skipped_no_action: true,
      message:
        "google_lead_conversion_action_id não configurado em Portal Settings",
    });
  }
  const valueRaw = readSettingScalar(map.get("google_lead_conversion_value"));
  const conversionValue = (() => {
    if (valueRaw == null || valueRaw === "") return 0;
    const n = typeof valueRaw === "number" ? valueRaw : parseFloat(String(valueRaw));
    return Number.isFinite(n) ? n : 0;
  })();

  // 3) Candidatos — google_click com lead_capture_id, pelo menos um id de
  //    clique e consent_granted=true. Limita a MAX_BATCH; o índice UNIQUE
  //    parcial em (company_id, conversion_action_ref, order_id) garante
  //    idempotência. Filtramos também na query para evitar trabalho inútil.
  const { data: existing, error: existingErr } = await admin
    .schema("crm")
    .from("google_conversion")
    .select("order_id")
    .eq("company_id", MP_COMPANY_ID)
    .eq("conversion_action_ref", actionRef)
    .not("order_id", "is", null);
  if (existingErr) {
    return json(
      { error: "existing_read_failed", detail: existingErr.message },
      500,
    );
  }
  const alreadyEnqueued = new Set<string>(
    (existing ?? []).map((r: { order_id: string }) => r.order_id),
  );

  const { data: clicks, error: clicksErr } = await admin
    .schema("crm")
    .from("google_click")
    .select(
      "id, lead_capture_id, client_event_id, gclid, gbraid, wbraid, captured_at, consent_granted",
    )
    .eq("company_id", MP_COMPANY_ID)
    .eq("consent_granted", true)
    .or("client_event_id.not.is.null,lead_capture_id.not.is.null")
    .or("gclid.not.is.null,gbraid.not.is.null,wbraid.not.is.null")
    .order("captured_at", { ascending: true })
    .limit(MAX_BATCH);
  if (clicksErr) {
    return json(
      { error: "clicks_read_failed", detail: clicksErr.message },
      500,
    );
  }

  const candidates: ClickRow[] = (clicks ?? []) as ClickRow[];
  const errors: Array<{ google_click_id: string; reason: string }> = [];
  const rowsToInsert: Array<Record<string, unknown>> = [];
  let skippedExisting = 0;

  // 3b) Resolução em LOTE de lead_capture por client_event_id (o portal não
  //     consegue devolver o id do insert anónimo sob RLS; client_event_id é a chave).
  const clientEventIds = Array.from(
    new Set(
      candidates
        .filter((c) => !c.lead_capture_id && c.client_event_id)
        .map((c) => c.client_event_id as string),
    ),
  );
  const leadByClientEventId = new Map<string, string>();
  if (clientEventIds.length > 0) {
    for (let i = 0; i < clientEventIds.length; i += 500) {
      const chunk = clientEventIds.slice(i, i + 500);
      const { data: leads, error: leadsErr } = await admin
        .from("lead_capture")
        .select("id, client_event_id")
        .in("client_event_id", chunk);
      if (leadsErr) {
        return json(
          { error: "leads_read_failed", detail: leadsErr.message },
          500,
        );
      }
      for (const l of (leads ?? []) as Array<{ id: string; client_event_id: string }>) {
        if (l.client_event_id && !leadByClientEventId.has(l.client_event_id)) {
          leadByClientEventId.set(l.client_event_id, l.id);
        }
      }
    }
  }

  const backfill: Array<{ clickId: string; leadId: string }> = [];

  for (const c of candidates) {
    let orderId = c.lead_capture_id;
    if (!orderId && c.client_event_id) {
      const resolved = leadByClientEventId.get(c.client_event_id);
      if (resolved) {
        orderId = resolved;
        backfill.push({ clickId: c.id, leadId: resolved });
      }
    }
    if (!orderId) {
      errors.push({ google_click_id: c.id, reason: "lead_nao_encontrado" });
      continue;
    }
    if (alreadyEnqueued.has(orderId)) {
      skippedExisting++;
      continue;
    }

    // Identificador de clique (prioridade gclid > gbraid > wbraid; exatamente um)
    const ident = c.gclid
      ? { gclid: c.gclid, gbraid: null, wbraid: null }
      : c.gbraid
      ? { gclid: null, gbraid: c.gbraid, wbraid: null }
      : c.wbraid
      ? { gclid: null, gbraid: null, wbraid: c.wbraid }
      : null;
    if (!ident) {
      errors.push({ google_click_id: c.id, reason: "sem_identificador_clique" });
      continue;
    }
    rowsToInsert.push({
      company_id: MP_COMPANY_ID,
      conversion_action_ref: actionRef,
      gclid: ident.gclid,
      gbraid: ident.gbraid,
      wbraid: ident.wbraid,
      google_click_id: c.id,
      conversion_value: conversionValue,
      currency_code: "EUR",
      order_id: orderId,
      conversion_datetime: c.captured_at,
      status: "pending",
    });
    // Marca já como enfileirado em memória para o batch atual evitar duplicados
    alreadyEnqueued.add(orderId);
  }

  // 4) Insert com upsert + ignoreDuplicates (idempotente face ao índice
  //    parcial UNIQUE google_conversion_dedup_uidx).
  let enqueued = 0;
  if (rowsToInsert.length > 0) {
    // Em blocos de 1000 para evitar payloads gigantes
    for (let i = 0; i < rowsToInsert.length; i += 1000) {
      const chunk = rowsToInsert.slice(i, i + 1000);
      const { data: inserted, error: insErr } = await admin
        .schema("crm")
        .from("google_conversion")
        .upsert(chunk, {
          onConflict: "company_id,conversion_action_ref,order_id",
          ignoreDuplicates: true,
        })
        .select("id");
      if (insErr) {
        errors.push({ google_click_id: "(batch)", reason: insErr.message });
        continue;
      }
      enqueued += (inserted ?? []).length;
    }
  }

  return json({
    candidates: candidates.length,
    enqueued,
    skipped_existing: skippedExisting,
    errors,
    company_id: MP_COMPANY_ID,
    conversion_action_ref: actionRef,
    conversion_value: conversionValue,
  });
});
