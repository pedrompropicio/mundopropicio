// ads-invoice-ingest
// Camada de PROPOSTA para faturas de tráfego pago (Meta / Google).
// NÃO cria transações, NÃO gera anexos, NÃO toca em syncs existentes.
//
//   action 'parse_meta'     — lê um PDF do bucket ads-invoices (ou base64),
//                             extrai cabeçalho + linhas de detalhe e propõe
//                             o rateio por evento via crm.meta_campaign_snapshot.
//   action 'propose_google' — constrói as linhas a partir do espelho
//                             crm.google_campaign_insights_daily (sem PDF).
//
// Import de supabase-js SEMPRE npm: (nunca esm.sh) — ver
// .lovable/memory/constraints/edge-fn-esm-sh-supabase-js.md
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseMetaInvoice } from "../_shared/ads-invoice-parser.ts";

const VERSION = "v1.0_proposal_layer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

function norm(s: string): string {
  return String(s ?? "").replace(/[\u00a0\u2009\u202f]/g, " ").replace(/\s+/g, " ").trim();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** service_role, ou JWT de utilizador autenticado. */
async function authorize(req: Request): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, error: "missing Authorization" };
  if (token === SERVICE_ROLE) return { ok: true };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { ok: false, error: "invalid token" };
  return { ok: true, userId: data.user.id };
}

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** company_id a partir do caminho `<company_id>/<platform>/<file>` ou do body. */
function companyFromPath(path?: string | null): string | null {
  const first = (path ?? "").replace(/^\/+/, "").split("/")[0];
  return /^[0-9a-f-]{36}$/i.test(first) ? first : null;
}

interface LineDraft {
  line_no: number;
  raw_description: string;
  placement: string | null;
  campaign_name: string | null;
  external_campaign_id: string | null;
  event_id: string | null;
  match_source: "erp_link" | "fuzzy" | "manual" | "none";
  amount: number;
  is_adjustment: boolean;
}

/** Regrava fatura + linhas de forma idempotente. */
async function upsertInvoice(
  invoice: Record<string, unknown>,
  lines: LineDraft[],
): Promise<{ id: string }> {
  const { data: existing } = await admin
    .from("ads_invoice")
    .select("id")
    .eq("company_id", invoice.company_id as string)
    .eq("platform", invoice.platform as string)
    .eq("invoice_number", invoice.invoice_number as string)
    .maybeSingle();

  let invoiceId: string;
  if (existing?.id) {
    invoiceId = existing.id;
    const { error } = await admin
      .from("ads_invoice")
      .update({ ...invoice, updated_at: new Date().toISOString() })
      .eq("id", invoiceId);
    if (error) throw new Error(`update ads_invoice: ${error.message}`);
    const del = await admin.from("ads_invoice_line").delete().eq("invoice_id", invoiceId);
    if (del.error) throw new Error(`delete lines: ${del.error.message}`);
  } else {
    const { data, error } = await admin.from("ads_invoice").insert(invoice).select("id").single();
    if (error) throw new Error(`insert ads_invoice: ${error.message}`);
    invoiceId = data.id;
  }

  if (lines.length) {
    const rows = lines.map((l) => ({
      ...l,
      invoice_id: invoiceId,
      company_id: invoice.company_id as string,
    }));
    const { error } = await admin.from("ads_invoice_line").insert(rows);
    if (error) throw new Error(`insert lines: ${error.message}`);
  }
  return { id: invoiceId };
}

async function buildAllocation(companyId: string, lines: LineDraft[]) {
  const ids = Array.from(new Set(lines.map((l) => l.event_id).filter(Boolean))) as string[];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await admin.from("events").select("id, name").in("id", ids);
    for (const e of data ?? []) names.set(e.id, e.name);
  }
  const byEvent = new Map<string, number>();
  let semEvento = 0;
  let ajustes = 0;
  for (const l of lines) {
    if (l.is_adjustment) ajustes = round2(ajustes + l.amount);
    if (!l.event_id) { if (!l.is_adjustment) semEvento++; continue; }
    byEvent.set(l.event_id, round2((byEvent.get(l.event_id) ?? 0) + l.amount));
  }
  const por_evento = Array.from(byEvent.entries())
    .map(([event_id, valor]) => ({ event_id, nome: names.get(event_id) ?? "(sem nome)", valor }))
    .sort((a, b) => b.valor - a.valor);
  return { por_evento, sem_evento: semEvento, ajustes };
}

// ------------------------------------------------------------------ parse_meta

async function matchMetaCampaigns(companyId: string, campaignNames: string[]) {
  const { data, error } = await admin
    .schema("crm")
    .from("meta_campaign_snapshot")
    .select("name, external_campaign_id, linked_event_id")
    .eq("company_id", companyId);
  if (error) throw new Error(`meta_campaign_snapshot: ${error.message}`);

  const exact = new Map<string, { events: Set<string | null>; ids: Set<string> }>();
  const all: Array<{ name: string; external_campaign_id: string; linked_event_id: string | null }> = [];
  for (const row of data ?? []) {
    const key = norm(row.name ?? "");
    if (!key) continue;
    all.push({
      name: key,
      external_campaign_id: row.external_campaign_id,
      linked_event_id: row.linked_event_id ?? null,
    });
    const slot = exact.get(key) ?? { events: new Set<string | null>(), ids: new Set<string>() };
    slot.events.add(row.linked_event_id ?? null);
    if (row.external_campaign_id) slot.ids.add(row.external_campaign_id);
    exact.set(key, slot);
  }

  const result = new Map<
    string,
    { event_id: string | null; external_campaign_id: string | null; match_source: "erp_link" | "fuzzy" | "none" }
  >();

  for (const raw of campaignNames) {
    const name = norm(raw);
    if (!name) { result.set(raw, { event_id: null, external_campaign_id: null, match_source: "none" }); continue; }

    const hit = exact.get(name);
    if (hit) {
      const events = Array.from(hit.events);
      if (events.length === 1 && events[0]) {
        result.set(raw, {
          event_id: events[0],
          external_campaign_id: hit.ids.size === 1 ? Array.from(hit.ids)[0] : null,
          match_source: "erp_link",
        });
      } else {
        // sem vínculo, ou vínculos divergentes → fica por resolver
        result.set(raw, {
          event_id: null,
          external_campaign_id: hit.ids.size === 1 ? Array.from(hit.ids)[0] : null,
          match_source: "none",
        });
      }
      continue;
    }

    const prefixHits = all.filter((c) => c.name.startsWith(name));
    if (prefixHits.length === 1 && prefixHits[0].linked_event_id) {
      result.set(raw, {
        event_id: prefixHits[0].linked_event_id,
        external_campaign_id: prefixHits[0].external_campaign_id ?? null,
        match_source: "fuzzy",
      });
      continue;
    }

    result.set(raw, { event_id: null, external_campaign_id: null, match_source: "none" });
  }
  return result;
}

async function handleParseMeta(body: Record<string, any>) {
  const filePath: string | undefined = body.file_path;
  let bytes: Uint8Array;
  if (body.file_base64) {
    bytes = decodeBase64(String(body.file_base64));
  } else if (filePath) {
    const { data, error } = await admin.storage.from("ads-invoices").download(filePath);
    if (error || !data) return json({ error: `download falhou: ${error?.message ?? "sem ficheiro"}` }, 400);
    bytes = new Uint8Array(await data.arrayBuffer());
  } else {
    return json({ error: "indicar file_path ou file_base64" }, 400);
  }

  const companyId = body.company_id ?? companyFromPath(filePath);
  if (!companyId) return json({ error: "company_id não resolvido (caminho ou body)" }, 400);

  const parsed = await parseMetaInvoice(bytes);
  const h = parsed.header;
  if (!h.invoiceNumber || !h.billingPeriod || h.totalAmount === null) {
    return json({ error: "cabeçalho incompleto", header: h, warnings: parsed.warnings, debug: parsed.debug }, 422);
  }

  const nonAdjust = parsed.lines.filter((l) => !l.isAdjustment).map((l) => l.campaignName);
  const matches = await matchMetaCampaigns(companyId, nonAdjust);

  const lines: LineDraft[] = parsed.lines.map((l) => {
    if (l.isAdjustment) {
      return {
        line_no: l.lineNo,
        raw_description: l.rawDescription,
        placement: null,
        campaign_name: l.campaignName,
        external_campaign_id: null,
        event_id: null,
        match_source: "none",
        amount: l.amount,
        is_adjustment: true,
      };
    }
    const m = matches.get(l.campaignName) ?? { event_id: null, external_campaign_id: null, match_source: "none" as const };
    return {
      line_no: l.lineNo,
      raw_description: l.rawDescription,
      placement: l.placement,
      campaign_name: l.campaignName,
      external_campaign_id: m.external_campaign_id,
      event_id: m.event_id,
      match_source: m.match_source,
      amount: l.amount,
      is_adjustment: false,
    };
  });

  const linesSum = round2(lines.reduce((s, l) => s + l.amount, 0));
  await upsertInvoice(
    {
      company_id: companyId,
      platform: "meta",
      invoice_number: h.invoiceNumber,
      billing_period: h.billingPeriod,
      issue_date: h.issueDate,
      currency: "EUR",
      total_amount: h.totalAmount,
      lines_sum: linesSum,
      source: "pdf",
      source_ref: body.source_ref ?? null,
      file_path: filePath ?? null,
      status: "proposed",
    },
    lines,
  );

  const alloc = await buildAllocation(companyId, lines);
  return json({
    version: VERSION,
    invoice_number: h.invoiceNumber,
    billing_period: h.billingPeriod,
    total_amount: h.totalAmount,
    lines_sum: linesSum,
    reconcilia: Math.abs(h.totalAmount - linesSum) < 0.005,
    linhas: lines.length,
    sem_evento: alloc.sem_evento,
    ajustes: alloc.ajustes,
    por_evento: alloc.por_evento,
    warnings: parsed.warnings,
  });
}

// -------------------------------------------------------------- propose_google

async function handleProposeGoogle(body: Record<string, any>) {
  const invoiceNumber = body.invoice_number ? String(body.invoice_number) : null;
  const period = body.billing_period ? String(body.billing_period) : null; // YYYY-MM
  const companyId = body.company_id ? String(body.company_id) : null;
  if (!invoiceNumber || !period || !companyId) {
    return json({ error: "indicar invoice_number, billing_period (YYYY-MM) e company_id" }, 400);
  }
  if (!/^\d{4}-\d{2}$/.test(period)) return json({ error: "billing_period deve ser YYYY-MM" }, 400);

  const start = `${period}-01`;
  const [y, m] = period.split("-").map(Number);
  const endDate = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  const end = endDate.toISOString().slice(0, 10);

  const { data: daily, error } = await admin
    .schema("crm")
    .from("google_campaign_insights_daily")
    .select("external_campaign_id, campaign_name, spend_cents")
    .eq("company_id", companyId)
    .gte("date_start", start)
    .lt("date_start", end);
  if (error) throw new Error(`google_campaign_insights_daily: ${error.message}`);

  const agg = new Map<string, { cents: number; name: string | null }>();
  for (const row of daily ?? []) {
    const key = String(row.external_campaign_id ?? "");
    const slot = agg.get(key) ?? { cents: 0, name: row.campaign_name ?? null };
    slot.cents += Number(row.spend_cents ?? 0);
    if (!slot.name && row.campaign_name) slot.name = row.campaign_name;
    agg.set(key, slot);
  }

  const { data: campaigns } = await admin
    .schema("crm")
    .from("google_campaign")
    .select("external_campaign_id, name, linked_event_id")
    .eq("company_id", companyId);
  const meta = new Map<string, { name: string | null; linked_event_id: string | null }>();
  for (const c of campaigns ?? []) {
    meta.set(String(c.external_campaign_id), { name: c.name ?? null, linked_event_id: c.linked_event_id ?? null });
  }

  const lines: LineDraft[] = Array.from(agg.entries())
    .filter(([, v]) => v.cents !== 0)
    .sort((a, b) => b[1].cents - a[1].cents)
    .map(([externalId, v], i) => {
      const c = meta.get(externalId);
      const name = norm(c?.name ?? v.name ?? externalId);
      return {
        line_no: i + 1,
        raw_description: name,
        placement: null,
        campaign_name: name,
        external_campaign_id: externalId || null,
        event_id: c?.linked_event_id ?? null,
        match_source: c?.linked_event_id ? "erp_link" : "none",
        amount: round2(v.cents / 100),
        is_adjustment: false,
      } as LineDraft;
    });

  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  await upsertInvoice(
    {
      company_id: companyId,
      platform: "google",
      invoice_number: invoiceNumber,
      billing_period: start,
      issue_date: null,
      currency: "EUR",
      total_amount: total,
      lines_sum: total,
      source: "mirror",
      source_ref: body.source_ref ?? null,
      file_path: null,
      status: "proposed",
    },
    lines,
  );

  const alloc = await buildAllocation(companyId, lines);
  return json({
    version: VERSION,
    invoice_number: invoiceNumber,
    billing_period: start,
    total_amount: total,
    lines_sum: total,
    reconcilia: true,
    linhas: lines.length,
    sem_evento: alloc.sem_evento,
    por_evento: alloc.por_evento,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "método não permitido" }, 405);

  const auth = await authorize(req);
  if (!auth.ok) return json({ error: auth.error ?? "não autorizado" }, 401);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "body inválido" }, 400);
  }

  try {
    switch (body.action) {
      case "parse_meta":
        return await handleParseMeta(body);
      case "propose_google":
        return await handleProposeGoogle(body);
      default:
        return json({ error: "action deve ser parse_meta ou propose_google" }, 400);
    }
  } catch (e) {
    console.error("ads-invoice-ingest", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
