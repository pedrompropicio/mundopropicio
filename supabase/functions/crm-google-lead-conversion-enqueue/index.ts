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
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";
import { matchClickToLead, MATCH_WINDOW_DAYS, positiveConversionValue } from "../_shared/google-click-match.ts";

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
  // #283 resto (D-ERP229): service role verificada no Auth (isServiceRoleRequest), nunca pelo payload.
  const isServiceRole = await isServiceRoleRequest(req);

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
  const conversionValue = positiveConversionValue(valueRaw);

  // 3) Candidatos (#62, D-ERP230). Antes: só os 5.000 cliques MAIS ANTIGOS eram
  //    vistos (nada depois de 08/09 entrava), o lead só se procurava por
  //    client_event_id e o .in() de 500 uuids rebentava o tamanho do URL.
  //    Agora: cliques da janela de 90 dias (limite da Google para conversões de
  //    clique), paginados; casamento 1) lead_capture_id já gravado, 2) mesmo
  //    gclid/gbraid/wbraid guardado pelo portal em lead_capture.raw (primeiro),
  //    3) mesmo client_event_id (sessão do portal) — fallback explícito, marcado
  //    em google_conversion.raw.match_method. O clique não guarda email, por isso
  //    não há casamento por email.
  const PAGE = 1000;
  const windowStart = new Date(Date.now() - MATCH_WINDOW_DAYS * 86_400_000).toISOString();

  const alreadyEnqueued = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: existingErr } = await admin
      .schema("crm")
      .from("google_conversion")
      .select("order_id")
      .eq("company_id", MP_COMPANY_ID)
      .eq("conversion_action_ref", actionRef)
      .not("order_id", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (existingErr) {
      return json({ error: "existing_read_failed", detail: existingErr.message }, 500);
    }
    for (const r of (page ?? []) as Array<{ order_id: string }>) alreadyEnqueued.add(r.order_id);
    if (!page || page.length < PAGE) break;
  }

  const candidates: ClickRow[] = [];
  for (let from = 0; candidates.length < MAX_BATCH; from += PAGE) {
    const { data: page, error: clicksErr } = await admin
      .schema("crm")
      .from("google_click")
      .select(
        "id, lead_capture_id, client_event_id, gclid, gbraid, wbraid, captured_at, consent_granted",
      )
      .eq("company_id", MP_COMPANY_ID)
      .eq("consent_granted", true)
      .gte("captured_at", windowStart)
      .or("gclid.not.is.null,gbraid.not.is.null,wbraid.not.is.null")
      .order("captured_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (clicksErr) {
      return json({ error: "clicks_read_failed", detail: clicksErr.message }, 500);
    }
    candidates.push(...((page ?? []) as ClickRow[]));
    if (!page || page.length < PAGE) break;
  }

  // 3a) Leads com identificador de clique guardado pelo portal (raw.gclid/gbraid/wbraid).
  const leadByIdent = new Map<string, string>();
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: lErr } = await admin
      .from("lead_capture")
      .select("id, raw, created_at")
      .eq("company_id", MP_COMPANY_ID)
      .or("raw->>gclid.not.is.null,raw->>gbraid.not.is.null,raw->>wbraid.not.is.null")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (lErr) return json({ error: "leads_read_failed", detail: lErr.message }, 500);
    for (const l of (page ?? []) as Array<{ id: string; raw: Record<string, unknown> | null }>) {
      for (const k of ["gclid", "gbraid", "wbraid"]) {
        const v = l.raw?.[k];
        if (typeof v === "string" && v.trim() && !leadByIdent.has(`${k}:${v.trim()}`)) {
          leadByIdent.set(`${k}:${v.trim()}`, l.id); // o lead mais antigo ganha
        }
      }
    }
    if (!page || page.length < PAGE) break;
  }

  // 3b) Fallback por client_event_id, em blocos pequenos (URL do .in()).
  const clientEventIds = Array.from(
    new Set(candidates.filter((c) => !c.lead_capture_id && c.client_event_id).map((c) => c.client_event_id as string)),
  );
  const leadByClientEventId = new Map<string, string>();
  for (let i = 0; i < clientEventIds.length; i += 100) {
    const chunk = clientEventIds.slice(i, i + 100);
    const { data: leads, error: leadsErr } = await admin
      .from("lead_capture")
      .select("id, client_event_id")
      .eq("company_id", MP_COMPANY_ID)
      .in("client_event_id", chunk);
    if (leadsErr) return json({ error: "leads_read_failed", detail: leadsErr.message }, 500);
    for (const l of (leads ?? []) as Array<{ id: string; client_event_id: string }>) {
      if (l.client_event_id && !leadByClientEventId.has(l.client_event_id)) {
        leadByClientEventId.set(l.client_event_id, l.id);
      }
    }
  }

  const errors: Array<{ google_click_id: string; reason: string }> = [];
  const rowsToInsert: Array<Record<string, unknown>> = [];
  let skippedExisting = 0;
  let noLead = 0;
  const byMethod: Record<string, number> = { lead_capture_id: 0, click_identifier: 0, client_event_id: 0 };
  const backfill: Array<{ clickId: string; leadId: string }> = [];

  for (const c of candidates) {
    const m = matchClickToLead(c, leadByIdent, leadByClientEventId);
    if (!m) {
      noLead++;
      continue;
    }
    const orderId = m.leadId;
    if (m.method !== "lead_capture_id") backfill.push({ clickId: c.id, leadId: orderId });
    if (alreadyEnqueued.has(orderId)) {
      skippedExisting++;
      continue;
    }
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
    byMethod[m.method]++;
    rowsToInsert.push({
      company_id: MP_COMPANY_ID,
      conversion_action_ref: actionRef,
      gclid: ident.gclid,
      gbraid: ident.gbraid,
      wbraid: ident.wbraid,
      google_click_id: c.id,
      // D-ERP230: sem valor configurado → null (o upload envia SEM valor, não 0).
      conversion_value: conversionValue,
      currency_code: "EUR",
      order_id: orderId,
      conversion_datetime: c.captured_at,
      status: "pending",
      raw: { match_method: m.method },
    });
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

  // 5) Backfill secundário de crm.google_click.lead_capture_id (não bloqueia).
  let backfilled = 0;
  for (const b of backfill) {
    const { error: upErr } = await admin
      .schema("crm")
      .from("google_click")
      .update({ lead_capture_id: b.leadId })
      .eq("id", b.clickId)
      .is("lead_capture_id", null);
    if (upErr) {
      console.error("[backfill lead_capture_id] falhou", b.clickId, upErr.message);
      continue;
    }
    backfilled++;
  }

  return json({
    candidates: candidates.length,
    no_lead: noLead,
    by_method: byMethod,
    window_days: MATCH_WINDOW_DAYS,
    enqueued,
    skipped_existing: skippedExisting,
    lead_capture_id_backfilled: backfilled,
    errors,

    company_id: MP_COMPANY_ID,
    conversion_action_ref: actionRef,
    conversion_value: conversionValue,
  });
});
