// ads-invoice-apply
// Fecho do ciclo das faturas de tráfego pago:
//
//   action 'confirm'  — confirmação humana do rateio. Tranca o vínculo das
//                       campanhas Meta (única escrita permitida em crm.*).
//   action 'generate' — cria a transação-mãe (sem evento) e uma filha por
//                       evento, com o comprovativo de veiculação por evento.
//
// NÃO toca em crm.auto_link_*, crons, funções de sync nem em resolve_ads_event.
// Import de supabase-js SEMPRE npm: (nunca esm.sh).
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPdf, type PdfOp } from "../_shared/simple-pdf.ts";

const VERSION = "v1.0_confirm_generate";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const round2 = (n: number) => Math.round(n * 100) / 100;

const CATEGORY_DIGITAL = "c0000034-0000-0000-0000-000000000001"; // 3.2.01 Digital
const DOC_BUCKET = "transaction-documents";
const ADS_BUCKET = "ads-invoices";

const platformLabel: Record<string, string> = { meta: "Meta Platforms Ireland Limited", google: "Google Ireland Limited" };
const platformAccount: Record<string, string> = { meta: "5094207367314169", google: "220-004-3144" };
const IVA_NOTE = "IVA 0% - autoliquidação pelo adquirente (art. 196.º da Diretiva 2006/112/CE)";

async function authorize(req: Request): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, error: "missing Authorization" };
  if (SERVICE_ROLE && token === SERVICE_ROLE) return { ok: true };
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload?.role === "service_role") return { ok: true };
    }
  } catch (_e) { /* tentar como token de utilizador */ }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { ok: false, error: "invalid token" };
  return { ok: true, userId: data.user.id };
}

function normName(s: string): string {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function periodLabel(d: string): string {
  const [y, m] = String(d).split("-");
  return `${m}/${y}`;
}

function fmtEur(n: number): string {
  const s = Math.abs(n).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${s} €`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, dd] = String(d).split("-");
  return `${dd}/${m}/${y}`;
}

async function loadInvoice(invoiceId: string) {
  const { data: inv, error } = await admin.from("ads_invoice").select("*").eq("id", invoiceId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!inv) throw new Error("fatura não encontrada");
  const { data: lines, error: le } = await admin
    .from("ads_invoice_line")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_no");
  if (le) throw new Error(le.message);
  return { inv, lines: lines ?? [] };
}

/** Guardas comuns: soma bate ao total e nenhuma linha não-ajuste sem evento. */
function checkReady(inv: any, lines: any[]): string | null {
  const sum = round2(lines.reduce((a, l) => a + Number(l.amount), 0));
  if (Math.abs(sum - Number(inv.total_amount)) >= 0.005) {
    return `soma das linhas (${sum}) difere do total da fatura (${inv.total_amount})`;
  }
  const orphan = lines.filter((l) => !l.is_adjustment && (!l.event_id || l.match_source === "none"));
  if (orphan.length > 0) {
    return `${orphan.length} linha(s) sem evento resolvido (linhas ${orphan.map((l) => l.line_no).join(", ")})`;
  }
  return null;
}

// ---------------------------------------------------------------- confirmação

async function handleConfirm(body: any, userId?: string) {
  const { inv, lines } = await loadInvoice(body.invoice_id);
  if (inv.status === "confirmed" || inv.status === "applied") {
    return json({ ok: true, already: true, status: inv.status, version: VERSION });
  }
  if (inv.status !== "proposed") return json({ error: `estado ${inv.status} não confirmável` }, 400);

  const problem = checkReady(inv, lines);
  if (problem) return json({ error: problem }, 400);

  const { error: ue } = await admin
    .from("ads_invoice")
    .update({ status: "confirmed", confirmed_by: userId ?? null, confirmed_at: new Date().toISOString() })
    .eq("id", inv.id);
  if (ue) return json({ error: ue.message }, 500);

  // Tranca os vínculos das campanhas Meta envolvidas (única escrita em crm.*)
  let locked = 0;
  if (inv.platform === "meta") {
    const byCampaign = new Map<string, string>();
    for (const l of lines) {
      if (l.is_adjustment || !l.event_id || !l.campaign_name) continue;
      byCampaign.set(normName(l.campaign_name), l.event_id);
    }
    const { data: snaps } = await admin
      .schema("crm")
      .from("meta_campaign_snapshot")
      .select("id, name")
      .eq("company_id", inv.company_id);
    for (const snap of snaps ?? []) {
      const eventId = byCampaign.get(normName(snap.name));
      if (!eventId) continue;
      const { error } = await admin
        .schema("crm")
        .from("meta_campaign_snapshot")
        .update({ linked_event_id: eventId, linked_event_locked: true })
        .eq("id", snap.id);
      if (!error) locked++;
    }
  }

  return json({ ok: true, status: "confirmed", campaigns_locked: locked, version: VERSION });
}

// ------------------------------------------------------- comprovativo por evento

function buildEventProof(inv: any, eventName: string, eventLines: any[], subtotal: number): Uint8Array {
  const ops: PdfOp[] = [];
  let y = 60;
  const push = (text: string, size = 9, bold = false, x = 50) => {
    ops.push({ kind: "text", x, y, size, bold, text });
  };

  push("Comprovativo de veiculação de tráfego pago", 15, true);
  y += 26;
  push(`Plataforma: ${platformLabel[inv.platform] ?? inv.platform}`, 9.5);
  y += 14;
  push(`Fatura n.º ${inv.invoice_number} · data ${fmtDate(inv.issue_date)}`, 9.5);
  y += 14;
  push(`Período de faturação: ${periodLabel(inv.billing_period)}`, 9.5);
  y += 14;
  push(`Conta de anúncios: ${platformAccount[inv.platform] ?? "—"}`, 9.5);
  y += 14;
  push(IVA_NOTE, 8.5);
  y += 26;
  ops.push({ kind: "line", x1: 50, y1: y, x2: 545, y2: y });
  y += 20;
  push(eventName, 13, true);
  y += 24;

  push("#", 9, true, 50);
  push("Descrição da linha da fatura", 9, true, 80);
  ops.push({ kind: "text", x: 545, y, size: 9, bold: true, text: "Valor", align: "right" });
  y += 6;
  ops.push({ kind: "line", x1: 50, y1: y, x2: 545, y2: y });
  y += 14;

  for (const l of eventLines) {
    const desc = String(l.raw_description ?? "");
    const chunks: string[] = [];
    let rest = desc;
    while (rest.length > 88) {
      let cut = rest.lastIndexOf(" ", 88);
      if (cut < 40) cut = 88;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut).trim();
    }
    chunks.push(rest);
    push(String(l.line_no), 8.5, false, 50);
    ops.push({ kind: "text", x: 545, y, size: 8.5, text: fmtEur(Number(l.amount)), align: "right" });
    for (let i = 0; i < chunks.length; i++) {
      ops.push({ kind: "text", x: 80, y: y + i * 11, size: 8.5, text: chunks[i] });
    }
    y += chunks.length * 11 + 4;
  }

  y += 4;
  ops.push({ kind: "line", x1: 50, y1: y, x2: 545, y2: y });
  y += 16;
  push("Subtotal do evento", 10, true, 80);
  ops.push({ kind: "text", x: 545, y, size: 10, bold: true, text: fmtEur(subtotal), align: "right" });

  return buildPdf([ops]);
}

// ------------------------------------------------------------------- geração

async function handleGenerate(body: any, userId?: string) {
  const { inv, lines } = await loadInvoice(body.invoice_id);

  if (inv.status === "applied" || inv.parent_transaction_id) {
    let createdRows: any[] = [];
    if (inv.parent_transaction_id) {
      const { data: created } = await admin
        .from("transactions")
        .select("id, event_id, amount, description, specification, parent_transaction_id")
        .or(`id.eq.${inv.parent_transaction_id},parent_transaction_id.eq.${inv.parent_transaction_id}`);
      createdRows = created ?? [];
    }
    return json({ ok: true, already: true, status: inv.status, transactions: createdRows, version: VERSION });
  }
  if (inv.status !== "confirmed") return json({ error: "a fatura tem de estar confirmada" }, 400);

  const problem = checkReady(inv, lines);
  if (problem) return json({ error: problem }, 400);

  const byEvent = new Map<string, any[]>();
  let adjustments = 0;
  for (const l of lines) {
    if (l.is_adjustment) { adjustments += Number(l.amount); continue; }
    if (!byEvent.has(l.event_id)) byEvent.set(l.event_id, []);
    byEvent.get(l.event_id)!.push(l);
  }
  adjustments = round2(adjustments);

  const subtotals = new Map<string, number>();
  for (const [eventId, evLines] of byEvent) {
    subtotals.set(eventId, round2(evLines.reduce((a, l) => a + Number(l.amount), 0)));
  }
  const childrenSum = round2(Array.from(subtotals.values()).reduce((a, v) => a + v, 0));
  const total = Number(inv.total_amount);
  if (Math.abs(round2(childrenSum + adjustments) - total) >= 0.005) {
    return json({
      error: `filhas (${childrenSum}) + ajustes (${adjustments}) ≠ total da fatura (${total})`,
    }, 400);
  }

  // fornecedor: o mesmo já usado nas transações de tráfego pago da plataforma
  const supplierName = inv.platform === "meta" ? "META PLATFORMS IRELAND LIMITED" : "GOOGLE";
  const { data: sup } = await admin
    .from("suppliers")
    .select("id, name")
    .eq("company_id", inv.company_id)
    .ilike("name", `%${supplierName}%`)
    .limit(5);
  let supplierId: string | null = null;
  if (sup && sup.length > 0) {
    const { data: used } = await admin
      .from("transactions")
      .select("supplier_id")
      .in("supplier_id", sup.map((s) => s.id))
      .eq("description", "Trafego Pago")
      .limit(1);
    supplierId = used?.[0]?.supplier_id ?? sup[0].id;
  }

  const spec = `ref. ${periodLabel(inv.billing_period)}`;
  const txDate = inv.issue_date ?? new Date().toISOString().slice(0, 10);
  const base = {
    type: "expense",
    category_id: CATEGORY_DIGITAL,
    description: "Trafego Pago",
    specification: spec,
    iva_rate: 0,
    status: "approved",
    supplier_id: supplierId,
    payment_method: "transfer",
    date: txDate,
    company_id: inv.company_id,
  };

  const { data: parent, error: pe } = await admin
    .from("transactions")
    .insert({ ...base, event_id: null, amount: total })
    .select("id, amount")
    .single();
  if (pe) return json({ error: `mãe: ${pe.message}` }, 500);

  // linhas de BP 3.2.01 dos eventos envolvidos (versão ativa)
  const eventIds = Array.from(byEvent.keys());
  const { data: forecasts } = await admin
    .from("event_forecasts")
    .select("id, event_id, description, amount")
    .in("event_id", eventIds)
    .eq("category_id", CATEGORY_DIGITAL)
    .is("version_id", null);
  const pickForecast = (eventId: string): string | null => {
    const cands = (forecasts ?? []).filter((f) => f.event_id === eventId);
    if (cands.length === 0) return null;
    if (cands.length === 1) return cands[0].id;
    const scored = cands
      .map((f) => ({ f, score: /patrocinad|trafego|tráfego/i.test(String(f.description ?? "")) ? 1 : 0 }))
      .sort((a, b) => b.score - a.score || Number(b.f.amount) - Number(a.f.amount));
    return scored[0].score > 0 ? scored[0].f.id : null;
  };

  const { data: eventRows } = await admin.from("events").select("id, name").in("id", eventIds);
  const eventName = (id: string) => (eventRows ?? []).find((e: any) => e.id === id)?.name ?? "(evento)";

  const created: any[] = [{ role: "mae", id: parent.id, event: null, amount: total }];

  for (const [eventId, evLines] of byEvent) {
    const subtotal = subtotals.get(eventId)!;
    const { data: child, error: ce } = await admin
      .from("transactions")
      .insert({
        ...base,
        event_id: eventId,
        amount: subtotal,
        parent_transaction_id: parent.id,
        forecast_id: pickForecast(eventId),
      })
      .select("id, forecast_id")
      .single();
    if (ce) return json({ error: `filha ${eventName(eventId)}: ${ce.message}` }, 500);

    // comprovativo de veiculação — só as linhas DESTE evento
    const pdf = buildEventProof(inv, eventName(eventId), evLines, subtotal);
    const path = `${inv.company_id}/ads-invoices/${inv.id}/comprovativo-${eventId}.pdf`;
    const { error: se } = await admin.storage.from(DOC_BUCKET).upload(path, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (se) return json({ error: `upload comprovativo: ${se.message}` }, 500);
    const { error: de } = await admin.from("transaction_documents").insert({
      transaction_id: child.id,
      name: `Comprovativo de veiculacao ${periodLabel(inv.billing_period).replace("/", "-")} - ${eventName(eventId)}.pdf`,
      file_url: path,
      doc_type: "comprovativo_veiculacao",
      uploaded_by: "system",
      is_accounting: false,
      company_id: inv.company_id,
    });
    if (de) return json({ error: `documento comprovativo: ${de.message}` }, 500);

    await admin
      .from("ads_invoice_line")
      .update({ transaction_id: child.id })
      .eq("invoice_id", inv.id)
      .eq("event_id", eventId)
      .eq("is_adjustment", false);

    created.push({ role: "filha", id: child.id, event: eventName(eventId), amount: subtotal, forecast_id: child.forecast_id });
  }

  // fatura original — só na mãe, nunca numa filha
  let originalAttached = false;
  if (inv.file_path) {
    const dl = await admin.storage.from(ADS_BUCKET).download(inv.file_path);
    if (dl.data) {
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      const fileName = inv.file_path.split("/").pop()!;
      const path = `${inv.company_id}/ads-invoices/${inv.id}/${fileName}`;
      const up = await admin.storage.from(DOC_BUCKET).upload(path, bytes, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (!up.error) {
        const { error } = await admin.from("transaction_documents").insert({
          transaction_id: parent.id,
          name: fileName,
          file_url: path,
          doc_type: "fatura",
          uploaded_by: "system",
          is_accounting: true,
          company_id: inv.company_id,
        });
        originalAttached = !error;
      }
    }
  }

  const { error: fe } = await admin
    .from("ads_invoice")
    .update({
      status: "applied",
      applied_by: userId ?? null,
      applied_at: new Date().toISOString(),
      parent_transaction_id: parent.id,
    })
    .eq("id", inv.id);
  if (fe) return json({ error: fe.message }, 500);

  return json({
    ok: true,
    status: "applied",
    parent_transaction_id: parent.id,
    adjustments,
    children_sum: childrenSum,
    total,
    original_attached: originalAttached,
    transactions: created,
    version: VERSION,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await authorize(req);
    if (!auth.ok) return json({ error: auth.error ?? "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    if (!body?.invoice_id) return json({ error: "invoice_id obrigatório" }, 400);
    if (body.action === "confirm") return await handleConfirm(body, auth.userId);
    if (body.action === "generate") return await handleGenerate(body, auth.userId);
    return json({ error: "action inválida (confirm | generate)" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e), version: VERSION }, 500);
  }
});
