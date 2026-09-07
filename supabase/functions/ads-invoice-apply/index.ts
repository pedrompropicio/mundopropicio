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

const VERSION = "v2.3_revert_guards";

/** Meta e Google faturam a 60 dias ("Payment Terms: NET 60" no PDF). */
const PAYMENT_TERMS_DAYS = 60;

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

/** Data de emissão + NET 60, em data local (YYYY-MM-DD). */
function addDays(d: string, days: number): string {
  const [y, m, dd] = String(d).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Trava anti-duplicação: procura lançamentos de tráfego pago que já cubram
 * esta fatura, mesmo feitos à mão e sem qualquer ligação à ads_invoice.
 * Critério: rubrica 3.2.01 Digital e (invoice_ref = nº da fatura
 * OU specification contém "ref. MM/AAAA" do período faturado).
 */
async function findExistingTransactions(inv: any) {
  const spec = `ref. ${periodLabel(inv.billing_period)}`;
  const { data, error } = await admin
    .from("transactions")
    .select("id, date, amount, event_id, invoice_ref, specification, parent_transaction_id")
    .eq("category_id", CATEGORY_DIGITAL)
    .eq("company_id", inv.company_id)
    .or(`invoice_ref.eq.${inv.invoice_number},specification.ilike.%${spec}%`);
  if (error) throw new Error(error.message);
  return data ?? [];
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
  // 'fora_sistema' é uma decisão humana: a linha não pertence a nenhum evento
  // do sistema e por isso não é órfã nem gera filha.
  const orphan = lines.filter(
    (l) => !l.is_adjustment && l.match_source !== "fora_sistema" && (!l.event_id || l.match_source === "none"),
  );
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

  if (body.dry_run !== true && (inv.status === "applied" || inv.parent_transaction_id)) {
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
  const dryRun = body.dry_run === true;
  if (!dryRun && inv.status !== "confirmed") return json({ error: "a fatura tem de estar confirmada" }, 400);


  const problem = checkReady(inv, lines);
  if (problem) return json({ error: problem }, 400);

  const byEvent = new Map<string, any[]>();
  let adjustments = 0;
  let outOfScope = 0;
  let outOfScopeLines = 0;
  for (const l of lines) {
    if (l.is_adjustment) { adjustments += Number(l.amount); continue; }
    if (l.match_source === "fora_sistema") { outOfScope += Number(l.amount); outOfScopeLines++; continue; }
    if (!byEvent.has(l.event_id)) byEvent.set(l.event_id, []);
    byEvent.get(l.event_id)!.push(l);
  }
  adjustments = round2(adjustments);
  outOfScope = round2(outOfScope);

  const subtotals = new Map<string, number>();
  for (const [eventId, evLines] of byEvent) {
    subtotals.set(eventId, round2(evLines.reduce((a, l) => a + Number(l.amount), 0)));
  }
  const childrenSum = round2(Array.from(subtotals.values()).reduce((a, v) => a + v, 0));
  const total = Number(inv.total_amount);
  if (Math.abs(round2(childrenSum + adjustments + outOfScope) - total) >= 0.005) {
    return json({
      error:
        `filhas (${childrenSum}) + ajustes (${adjustments}) + fora do sistema (${outOfScope}) ` +
        `≠ total da fatura (${total})`,
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
  const dueDate = addDays(txDate, PAYMENT_TERMS_DAYS);
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
    due_date: dueDate,
    company_id: inv.company_id,
  };

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

  /** subtotal do evento / total da fatura × 100, 4 casas decimais */
  const splitPct = (subtotal: number) =>
    total === 0 ? null : Math.round((subtotal / total) * 100 * 10000) / 10000;

  // ---- trava anti-duplicação: nunca gerar por cima de lançamentos existentes
  const existing = await findExistingTransactions(inv);
  if (existing.length > 0) {
    return json({
      error:
        `já existem ${existing.length} lançamento(s) de tráfego pago para esta fatura ` +
        `(${inv.invoice_number} / ${spec}). Geração recusada.`,
      duplicate_block: true,
      existing: existing
        .map((t: any) => ({
          id: t.id,
          date: t.date,
          amount: Number(t.amount),
          event: t.event_id ? eventName(t.event_id) : null,
          event_id: t.event_id,
          role: t.parent_transaction_id ? "filha" : "mãe",
          invoice_ref: t.invoice_ref,
          specification: t.specification,
        }))
        .sort((a: any, b: any) => (a.role === "mãe" ? -1 : 1) - (b.role === "mãe" ? -1 : 1)),
      version: VERSION,
    }, 409);
  }

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      status: inv.status,
      parent: {
        date: txDate,
        due_date: dueDate,
        invoice_ref: inv.invoice_number,
        split_mode: "absolute",
        amount: total,
        specification: spec,
        supplier_id: supplierId,
      },
      children: Array.from(byEvent.keys()).map((eventId) => ({
        event: eventName(eventId),
        event_id: eventId,
        amount: subtotals.get(eventId)!,
        split_percentage: splitPct(subtotals.get(eventId)!),
        split_mode: "percentage",
        date: txDate,
        due_date: dueDate,
        forecast_id: pickForecast(eventId),
      })),
      adjustments,
      children_sum: childrenSum,
      out_of_scope: { amount: outOfScope, lines: outOfScopeLines },
      total,
      version: VERSION,
    });
  }

  const { data: parent, error: pe } = await admin
    .from("transactions")
    .insert({
      ...base,
      event_id: null,
      amount: total,
      invoice_ref: inv.invoice_number,
      split_mode: "absolute",
    })
    .select("id, amount")
    .single();
  if (pe) return json({ error: `mãe: ${pe.message}` }, 500);

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
        split_mode: "percentage",
        split_percentage: splitPct(subtotal),
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
    out_of_scope: { amount: outOfScope, lines: outOfScopeLines },
    total,
    original_attached: originalAttached,
    transactions: created,
    version: VERSION,
  });
}

// ------------------------------------------------------- destrancar campanhas
/**
 * Destranca só os vínculos que a confirmação DESTA fatura trancou.
 * Mantém linked_event_id — o que se desfaz é a tranca, não o vínculo.
 */
async function unlockCampaigns(inv: any, lines: any[]): Promise<number> {
  if (inv.platform !== "meta") return 0;
  const names = new Set<string>();
  for (const l of lines) {
    // mesma condição da confirmação: só linhas com evento trancam/destrancam
    if (l.is_adjustment || !l.event_id || !l.campaign_name) continue;
    names.add(normName(l.campaign_name));
  }
  if (names.size === 0) return 0;
  const { data: snaps } = await admin
    .schema("crm")
    .from("meta_campaign_snapshot")
    .select("id, name")
    .eq("company_id", inv.company_id);
  let unlocked = 0;
  for (const snap of snaps ?? []) {
    if (!names.has(normName(snap.name))) continue;
    const { error } = await admin
      .schema("crm")
      .from("meta_campaign_snapshot")
      .update({ linked_event_locked: false })
      .eq("id", snap.id);
    if (!error) unlocked++;
  }
  return unlocked;
}

// ------------------------------------------------------------------ reabertura

async function handleReopen(body: any, userId?: string) {
  const { inv, lines } = await loadInvoice(body.invoice_id);
  if (inv.status === "applied" || inv.parent_transaction_id) {
    return json({ error: "fatura aplicada — usa a reversão" }, 400);
  }
  if (inv.status !== "confirmed") {
    return json({ error: "só faturas confirmadas podem ser reabertas" }, 400);
  }

  const campaignsUnlocked = await unlockCampaigns(inv, lines);

  const { error } = await admin
    .from("ads_invoice")
    .update({
      status: "proposed",
      confirmed_by: null,
      confirmed_at: null,
      reopened_by: userId ?? null,
      reopened_at: new Date().toISOString(),
      reopen_count: Number(inv.reopen_count ?? 0) + 1,
    })
    .eq("id", inv.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, status: "proposed", campaigns_unlocked: campaignsUnlocked, version: VERSION });
}

// -------------------------------------------------------------------- reversão

async function handleRevert(body: any, userId?: string) {
  const { inv, lines } = await loadInvoice(body.invoice_id);
  // mesma condição de "aplicada" que a UI usa
  if (!(inv.status === "applied" || inv.parent_transaction_id)) {
    return json({ error: "só faturas aplicadas podem ser revertidas" }, 400);
  }
  if (!inv.parent_transaction_id) {
    return json({ error: "não há lançamentos a reverter" }, 400);
  }
  const parentId = inv.parent_transaction_id as string;

  const { data: txs, error: te } = await admin
    .from("transactions")
    .select("id, date, amount, status, paid_amount, settlement_id, card_session_id, event_id, parent_transaction_id")
    .or(`id.eq.${parentId},parent_transaction_id.eq.${parentId}`);
  if (te) return json({ error: `guarda transactions falhou: ${te.message}` }, 500);
  const ids = (txs ?? []).map((t: any) => t.id);
  if (ids.length === 0) return json({ error: "não há lançamentos a reverter" }, 400);

  // ---------------- guardas: nada é apagado se alguma delas falhar
  // Uma guarda que não conseguiu correr NUNCA é tratada como guarda que passou.
  const blockers: any[] = [];

  for (const t of txs ?? []) {
    if (t.status === "paid" || Number(t.paid_amount ?? 0) > 0) {
      blockers.push({ kind: "pago", transaction_id: t.id, status: t.status, paid_amount: Number(t.paid_amount ?? 0) });
    }
    if (t.settlement_id) blockers.push({ kind: "fecho_bilheteira", transaction_id: t.id, settlement_id: t.settlement_id });
    if (t.card_session_id) blockers.push({ kind: "sessao_cartao", transaction_id: t.id, card_session_id: t.card_session_id });
  }

  const { data: pays, error: paysErr } = await admin
    .from("transaction_payments").select("id, transaction_id").in("transaction_id", ids);
  if (paysErr) return json({ error: `guarda transaction_payments falhou: ${paysErr.message}` }, 500);
  for (const p of pays ?? []) blockers.push({ kind: "parcela_registada", transaction_id: p.transaction_id, payment_id: p.id });

  const { data: pli, error: pliErr } = await admin
    .from("payment_list_items").select("id, transaction_id, payment_list_id").in("transaction_id", ids);
  if (pliErr) return json({ error: `guarda payment_list_items falhou: ${pliErr.message}` }, 500);
  for (const r of pli ?? []) blockers.push({ kind: "lista_pagamento", transaction_id: r.transaction_id, payment_list_id: r.payment_list_id });

  const { data: rni, error: rniErr } = await admin
    .from("reimbursement_note_items").select("id, transaction_id, reimbursement_note_id").in("transaction_id", ids);
  if (rniErr) return json({ error: `guarda reimbursement_note_items falhou: ${rniErr.message}` }, 500);
  for (const r of rni ?? []) blockers.push({ kind: "nota_reembolso", transaction_id: r.transaction_id, note_id: (r as any).reimbursement_note_id ?? null });

  const { data: rnp, error: rnpErr } = await admin
    .from("reimbursement_notes").select("id, payment_transaction_id").in("payment_transaction_id", ids);
  if (rnpErr) return json({ error: `guarda reimbursement_notes falhou: ${rnpErr.message}` }, 500);
  for (const r of rnp ?? []) blockers.push({ kind: "nota_reembolso_pagamento", transaction_id: r.payment_transaction_id, note_id: r.id });

  // FK CASCADE: o DELETE apagaria a conferência do contabilista em silêncio.
  const { data: reviews, error: reviewsErr } = await admin
    .from("accountant_transaction_reviews")
    .select("id, transaction_id, status, note")
    .in("transaction_id", ids);
  if (reviewsErr) return json({ error: `guarda accountant_transaction_reviews falhou: ${reviewsErr.message}` }, 500);
  for (const r of reviews ?? []) {
    blockers.push({ kind: "conferencia_contabilista", transaction_id: r.transaction_id, status: r.status, note: r.note });
  }

  const { data: exports, error: exportsErr } = await admin
    .from("accounting_exports")
    .select("id, period_from, period_to, created_at")
    .eq("company_id", inv.company_id);
  if (exportsErr) return json({ error: `guarda accounting_exports falhou: ${exportsErr.message}` }, 500);
  for (const t of txs ?? []) {
    for (const ex of exports ?? []) {
      if (!t.date || !ex.period_from || !ex.period_to) continue;
      if (t.date >= ex.period_from && t.date <= ex.period_to) {
        blockers.push({
          kind: "exportado_contabilidade",
          transaction_id: t.id,
          transaction_date: t.date,
          period_from: ex.period_from,
          period_to: ex.period_to,
          exported_at: ex.created_at,
        });
      }
    }
  }

  if (blockers.length > 0) {
    return json({
      error: `reversão recusada: ${blockers.length} impedimento(s) nos lançamentos desta fatura`,
      revert_block: true,
      blockers,
      version: VERSION,
    }, 409);
  }

  // ---------------- (a) soltar as ligações do BP (FK NO ACTION)
  const { data: unlinked, error: unlinkErr } = await admin
    .from("event_forecasts")
    .update({ transaction_id: null })
    .in("transaction_id", ids)
    .select("id");
  if (unlinkErr) return json({ error: `soltar event_forecasts falhou: ${unlinkErr.message}` }, 500);
  const forecastsUnlinked = (unlinked ?? []).length;

  // ---------------- (b) apagar a mãe (as filhas caem por CASCADE)
  await admin.from("ads_invoice_line").update({ transaction_id: null }).eq("invoice_id", inv.id);
  const { error: de } = await admin.from("transactions").delete().eq("id", parentId);
  if (de) return json({ error: `apagar lançamentos: ${de.message}` }, 500);

  // ---------------- (c) ficheiros do storage (só depois do DELETE ter passado)
  let filesDeleted = 0;
  const prefix = `${inv.company_id}/ads-invoices/${inv.id}/`;
  const { data: files } = await admin.storage.from(DOC_BUCKET).list(prefix.replace(/\/$/, ""), { limit: 1000 });
  const paths = (files ?? []).filter((f: any) => f.name).map((f: any) => `${prefix}${f.name}`);
  if (paths.length > 0) {
    const { data: removed } = await admin.storage.from(DOC_BUCKET).remove(paths);
    filesDeleted = (removed ?? []).length;
  }

  // ---------------- (d) fatura volta a proposta
  const { error: ue } = await admin
    .from("ads_invoice")
    .update({
      status: "proposed",
      applied_by: null,
      applied_at: null,
      parent_transaction_id: null,
      confirmed_by: null,
      confirmed_at: null,
      reopened_by: userId ?? null,
      reopened_at: new Date().toISOString(),
      reopen_count: Number(inv.reopen_count ?? 0) + 1,
    })
    .eq("id", inv.id);
  if (ue) return json({ error: ue.message }, 500);

  // ---------------- (e) destrancar campanhas
  const campaignsUnlocked = await unlockCampaigns(inv, lines);

  return json({
    ok: true,
    status: "proposed",
    deleted_transactions: ids.length,
    files_deleted: filesDeleted,
    forecasts_unlinked: forecastsUnlinked,
    campaigns_unlocked: campaignsUnlocked,
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
    if (body.action === "reopen") return await handleReopen(body, auth.userId);
    if (body.action === "revert") return await handleRevert(body, auth.userId);
    return json({ error: "action inválida (confirm | generate | reopen | revert)" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e), version: VERSION }, 500);
  }
});
