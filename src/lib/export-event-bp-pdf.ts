import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrency } from "@/lib/mock-data";
import { formatDatePT } from "@/lib/utils";

interface BPExportInput {
  eventId: string;
  includeChildren?: boolean; // when Master, include sub-events
}

interface EventRow {
  id: string;
  name: string;
  date: string;
  status: string;
  event_type: string;
  location: string | null;
  parent_event_id: string | null;
  city?: { name: string; country: string } | null;
  venue?: { name: string } | null;
}

interface ForecastRow {
  id: string;
  type: "income" | "expense";
  description: string;
  specification: string | null;
  amount: number;
  iva_rate: number;
  status: string;
  notes: string | null;
  category_id: string | null;
  transaction_id: string | null;
  event_id: string;
  account_categories?: { code: string; name: string } | null;
}

interface PartnerRow {
  id: string;
  name: string;
  percentage: number;
}

interface AuditLog {
  id: string;
  forecast_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  observation: string | null;
  changed_by: string;
  created_at: string;
}

const fmt = (n: number) => formatCurrency(n);

interface TxRow {
  id: string;
  description: string;
  specification: string | null;
  amount: number;
  iva_rate: number;
  status: string;
  paid_amount: number | null;
  due_date: string | null;
  payment_date: string | null;
  category_id: string | null;
  type: string;
  event_id: string | null;
  parent_transaction_id: string | null;
  invoice_ref: string | null;
  suppliers?: { name: string } | null;
}

async function fetchEventBundle(eventId: string) {
  const [evtRes, forecastsRes, partnersRes, txRes] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, date, status, event_type, location, parent_event_id, cities:city_id(name, country), venues:venue_id(name)")
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("event_forecasts")
      .select("*, account_categories(code, name)")
      .eq("event_id", eventId)
      .order("type")
      .order("created_at"),
    supabase
      .from("event_partners")
      .select("id, percentage, suppliers:supplier_id(name)")
      .eq("event_id", eventId),
    supabase
      .from("transactions")
      .select("id, description, specification, amount, iva_rate, status, paid_amount, due_date, payment_date, category_id, type, event_id, parent_transaction_id, invoice_ref, suppliers:supplier_id(name)")
      .or(`event_id.eq.${eventId},event_id.is.null`),
  ]);

  if (evtRes.error) throw evtRes.error;
  if (forecastsRes.error) throw forecastsRes.error;
  if (partnersRes.error) throw partnersRes.error;
  if (txRes.error) throw txRes.error;

  const evt = evtRes.data as any;
  const event: EventRow = {
    id: evt.id,
    name: evt.name,
    date: evt.date,
    status: evt.status,
    event_type: evt.event_type,
    location: evt.location ?? null,
    parent_event_id: evt.parent_event_id ?? null,
    city: evt.cities ?? null,
    venue: evt.venues ?? null,
  };
  const forecasts: ForecastRow[] = (forecastsRes.data ?? []) as any;
  const partners: PartnerRow[] = (partnersRes.data ?? []).map((p: any) => ({
    id: p.id,
    name: p.suppliers?.name ?? "Sócio",
    percentage: Number(p.percentage),
  }));
  const transactions: TxRow[] = (txRes.data ?? []) as any;

  // Forecast → partners assignments
  const forecastIds = forecasts.map((f) => f.id);
  let forecastPartners: { forecast_id: string; partner_id: string }[] = [];
  let auditLogs: AuditLog[] = [];
  if (forecastIds.length > 0) {
    const [fpRes, auditRes] = await Promise.all([
      supabase.from("event_forecast_partners").select("forecast_id, partner_id").in("forecast_id", forecastIds),
      supabase.from("forecast_audit_log").select("*").in("forecast_id", forecastIds).order("created_at", { ascending: true }),
    ]);
    if (fpRes.error) throw fpRes.error;
    if (auditRes.error) throw auditRes.error;
    forecastPartners = (fpRes.data ?? []) as any;
    auditLogs = (auditRes.data ?? []) as any;
  }

  return { event, forecasts, partners, forecastPartners, auditLogs, transactions };
}

// Match transactions to a forecast line (mirror of UI logic in EventForecast.tsx)
function matchTransactionsForForecast(
  fc: ForecastRow,
  allForecasts: ForecastRow[],
  transactions: TxRow[],
): TxRow[] {
  // 1) Direct link
  if (fc.transaction_id) {
    const direct = transactions.filter((t) => t.id === fc.transaction_id);
    if (direct.length > 0) return direct;
  }
  // Scope to same event or master (null event_id)
  const scoped = transactions.filter((t) => t.event_id === fc.event_id || t.event_id === null);
  if (!fc.category_id) return [];
  const sameCat = scoped.filter((t) => t.category_id === fc.category_id && t.type === fc.type);

  const fcSameCat = allForecasts.filter(
    (f) => f.category_id === fc.category_id && f.type === fc.type && f.event_id === fc.event_id,
  );
  if (fcSameCat.length <= 1) return sameCat;

  const descLower = (fc.description ?? "").toLowerCase().trim();
  const matched = sameCat.filter((t) => {
    const txDesc = (t.description ?? "").toLowerCase().trim();
    return txDesc === descLower || txDesc.includes(descLower) || descLower.includes(txDesc);
  });
  return matched.length > 0 ? matched : [];
}

function txStatusLabel(t: TxRow): string {
  const total = Number(t.amount) * (1 + Number(t.iva_rate) / 100);
  const paid = Number(t.paid_amount ?? 0);
  if (t.status === "pending") return "Pendente";
  if (t.status === "paid" || paid >= total - 0.01) return "Pago";
  if (paid > 0.01) return "Parcial";
  const today = new Date().toISOString().slice(0, 10);
  if (t.due_date && t.due_date.slice(0, 10) < today) return "Atrasado";
  return "A Pagar";
}

/**
 * Status agregado da linha-mãe do BP quando tem transações vinculadas.
 * Reflete a evolução real da execução em vez do status estático do forecast.
 */
function aggregatedForecastStatus(
  forecast: ForecastRow,
  matchedTx: TxRow[],
): { label: string; progress?: string } {
  if (matchedTx.length === 0) {
    return { label: statusLabel(forecast.status) };
  }

  const today = new Date().toISOString().slice(0, 10);
  let paidCount = 0;
  let partialCount = 0;
  let overdueCount = 0;
  let pendingCount = 0;
  let openCount = 0;

  matchedTx.forEach((t) => {
    const total = Number(t.amount) * (1 + Number(t.iva_rate) / 100);
    const paid = Number(t.paid_amount ?? 0);
    const fullyPaid = t.status === "paid" || paid >= total - 0.01;
    if (fullyPaid) { paidCount++; return; }
    if (t.status === "pending") { pendingCount++; return; }
    if (paid > 0.01) { partialCount++; return; }
    if (t.due_date && t.due_date.slice(0, 10) < today) { overdueCount++; return; }
    openCount++;
  });

  const total = matchedTx.length;
  const progress = total > 1 ? `${paidCount}/${total}` : undefined;

  if (paidCount === total) return { label: "Pago", progress };
  if (overdueCount > 0) return { label: "Atrasado", progress };
  if (partialCount > 0 || (paidCount > 0 && paidCount < total)) return { label: "Parcial", progress };
  if (pendingCount > 0) return { label: "Pendente", progress };
  return { label: "A Pagar", progress };
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: "Rascunho",
    approved: "Aprovado",
    pending: "Pendente",
    paid: "Pago",
    planning: "Planeamento",
    confirmed: "Confirmado",
    active: "Ativo",
    completed: "Concluído",
  };
  return map[s] ?? s;
}

function eventTypeLabel(t: string): string {
  const map: Record<string, string> = {
    simple: "Evento Simples",
    festival: "Festival",
    multi_day: "Múltiplos Dias",
    master: "Master / Turnê",
    split: "Sub-evento",
  };
  return map[t] ?? t;
}

interface RenderContext {
  doc: jsPDF;
  pageWidth: number;
  pageHeight: number;
  marginLeft: number;
  marginRight: number;
  contentWidth: number;
}

function drawHeader(ctx: RenderContext, title: string, subtitle: string): number {
  const { doc, marginLeft, pageWidth, marginRight } = ctx;
  let y = 12;
  try {
    doc.addImage(logoHorizontal, "PNG", marginLeft, y, 50, 14);
  } catch {
    // ignore
  }
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "normal");
  doc.text(`Gerado em ${new Date().toLocaleString("pt-PT")}`, pageWidth - marginRight, y + 5, { align: "right" });
  y += 18;

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 30);
  doc.text(title, marginLeft, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 90);
  doc.text(subtitle, marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 6;
  return y + 2;
}

function drawEventIdentity(
  ctx: RenderContext,
  yStart: number,
  event: EventRow,
  partners: PartnerRow[],
): number {
  const { doc, marginLeft, contentWidth } = ctx;
  let y = yStart;

  doc.setDrawColor(220, 220, 230);
  doc.setFillColor(248, 248, 252);
  doc.roundedRect(marginLeft, y, contentWidth, 26, 1.5, 1.5, "FD");

  const colW = contentWidth / 3;
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 130);
  doc.setFont("helvetica", "bold");
  doc.text("EVENTO", marginLeft + 3, y + 5);
  doc.text("DATA / LOCAL", marginLeft + colW + 3, y + 5);
  doc.text("CLASSIFICAÇÃO", marginLeft + colW * 2 + 3, y + 5);

  doc.setFontSize(10);
  doc.setTextColor(20, 20, 30);
  doc.setFont("helvetica", "bold");
  doc.text(event.name, marginLeft + 3, y + 11, { maxWidth: colW - 6 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  const dateStr = formatDatePT(event.date);
  const cityStr = event.city ? `${event.city.name}` : "";
  const venueStr = event.venue?.name ?? event.location ?? "";
  doc.text(dateStr, marginLeft + colW + 3, y + 11);
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text([cityStr, venueStr].filter(Boolean).join(" · "), marginLeft + colW + 3, y + 16, { maxWidth: colW - 6 });

  doc.setFontSize(9);
  doc.setTextColor(20, 20, 30);
  doc.text(`${eventTypeLabel(event.event_type)}`, marginLeft + colW * 2 + 3, y + 11);
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(`Status: ${statusLabel(event.status)}`, marginLeft + colW * 2 + 3, y + 16);

  // Partners line
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 130);
  doc.setFont("helvetica", "bold");
  doc.text("SÓCIOS RESPONSÁVEIS", marginLeft + 3, y + 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(40, 40, 50);
  const partnerStr =
    partners.length === 0
      ? "—"
      : partners.map((p) => `${p.name} (${Number(p.percentage).toFixed(2)}%)`).join("  ·  ");
  doc.text(partnerStr, marginLeft + 60, y + 21, { maxWidth: contentWidth - 65 });

  doc.setTextColor(0, 0, 0);
  return y + 30;
}

function drawSummaryCards(
  ctx: RenderContext,
  yStart: number,
  forecasts: ForecastRow[],
): number {
  const { doc, marginLeft, contentWidth } = ctx;

  const incBase = forecasts.filter((f) => f.type === "income").reduce((s, f) => s + Number(f.amount), 0);
  const incIva = forecasts.filter((f) => f.type === "income").reduce((s, f) => s + Number(f.amount) * Number(f.iva_rate) / 100, 0);
  const expBase = forecasts.filter((f) => f.type === "expense").reduce((s, f) => s + Number(f.amount), 0);
  const expIva = forecasts.filter((f) => f.type === "expense").reduce((s, f) => s + Number(f.amount) * Number(f.iva_rate) / 100, 0);
  const result = incBase - expBase;

  let y = yStart;
  const cardW = (contentWidth - 6) / 3;
  const cardH = 18;

  const cards = [
    { label: "RECEITAS PREVISTAS", base: incBase, iva: incIva, color: [34, 139, 34] as [number, number, number] },
    { label: "DESPESAS PREVISTAS", base: expBase, iva: expIva, color: [200, 60, 60] as [number, number, number] },
    {
      label: "RESULTADO PREVISTO",
      base: result,
      iva: incIva - expIva,
      color: result >= 0 ? ([34, 100, 180] as [number, number, number]) : ([200, 60, 60] as [number, number, number]),
    },
  ];

  cards.forEach((c, i) => {
    const x = marginLeft + i * (cardW + 3);
    doc.setDrawColor(220, 220, 230);
    doc.setFillColor(252, 252, 254);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, "FD");
    doc.setFillColor(c.color[0], c.color[1], c.color[2]);
    doc.rect(x, y, 2, cardH, "F");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 130);
    doc.setFont("helvetica", "bold");
    doc.text(c.label, x + 5, y + 5);
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 30);
    doc.text(fmt(c.base), x + 5, y + 11);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 130);
    doc.setFont("helvetica", "normal");
    doc.text(`IVA: ${fmt(c.iva)}  ·  Total: ${fmt(c.base + c.iva)}`, x + 5, y + 15);
  });
  doc.setTextColor(0, 0, 0);
  return y + cardH + 6;
}

interface GroupedForecast {
  groupCode: string;
  groupName: string;
  rows: ForecastRow[];
  baseTotal: number;
  ivaTotal: number;
}

function groupByCategory(rows: ForecastRow[]): GroupedForecast[] {
  const map = new Map<string, GroupedForecast>();
  rows.forEach((r) => {
    const code = r.account_categories?.code ?? "—";
    const name = r.account_categories?.name ?? "Sem categoria";
    const key = `${code}__${name}`;
    if (!map.has(key)) {
      map.set(key, { groupCode: code, groupName: name, rows: [], baseTotal: 0, ivaTotal: 0 });
    }
    const g = map.get(key)!;
    g.rows.push(r);
    g.baseTotal += Number(r.amount);
    g.ivaTotal += (Number(r.amount) * Number(r.iva_rate)) / 100;
  });
  return Array.from(map.values()).sort((a, b) => a.groupCode.localeCompare(b.groupCode, "pt", { numeric: true }));
}

function partnersForForecast(
  forecastId: string,
  forecastPartners: { forecast_id: string; partner_id: string }[],
  partners: PartnerRow[],
): string {
  const ids = forecastPartners.filter((fp) => fp.forecast_id === forecastId).map((fp) => fp.partner_id);
  if (ids.length === 0) return "—";
  const names = partners.filter((p) => ids.includes(p.id)).map((p) => p.name);
  return names.length === 0 ? "—" : names.join(", ");
}

function drawForecastTable(
  ctx: RenderContext,
  yStart: number,
  title: string,
  forecasts: ForecastRow[],
  allForecasts: ForecastRow[],
  forecastPartners: { forecast_id: string; partner_id: string }[],
  partners: PartnerRow[],
  transactions: TxRow[],
  auditLogs: AuditLog[],
  accent: [number, number, number],
): number {
  const { doc, marginLeft, contentWidth } = ctx;
  if (forecasts.length === 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(150, 150, 150);
    doc.text(`${title}: sem registos`, marginLeft, yStart + 5);
    doc.setTextColor(0, 0, 0);
    return yStart + 10;
  }

  let y = yStart;
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(marginLeft, y, contentWidth, 6, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), marginLeft + 3, y + 4.2);
  doc.setTextColor(0, 0, 0);
  y += 8;

  const groups = groupByCategory(forecasts);

  const colWidths = {
    code: 16,
    desc: 55,
    spec: 38,
    partner: 32,
    status: 18,
    link: 14,
    base: 26,
    iva: 14,
    total: 28,
  };
  const totalCols = Object.values(colWidths).reduce((s, v) => s + v, 0);

  const auditByFc = new Map<string, AuditLog[]>();
  auditLogs.forEach((a) => {
    const arr = auditByFc.get(a.forecast_id) ?? [];
    arr.push(a);
    auditByFc.set(a.forecast_id, arr);
  });

  groups.forEach((g) => {
    const head = [[
      "Código", "Descrição", "Especificação", "Resp. (Sócio)",
      "Status", "Vínculo", "Valor s/IVA", "IVA %", "Total",
    ]];

    const body: any[] = [];
    g.rows.forEach((r) => {
      // Compute matched transactions early to derive aggregated status
      const matched = matchTransactionsForForecast(r, allForecasts, transactions);
      const agg = aggregatedForecastStatus(r, matched);
      const statusCell = agg.progress ? `${agg.label} (${agg.progress})` : agg.label;

      // Main forecast row
      body.push([
        r.account_categories?.code ?? "—",
        r.description ?? "",
        r.specification ?? "",
        partnersForForecast(r.id, forecastPartners, partners),
        statusCell,
        r.transaction_id || matched.length > 0 ? "Vinc." : "—",
        fmt(Number(r.amount)),
        `${r.iva_rate}%`,
        fmt(Number(r.amount) * (1 + Number(r.iva_rate) / 100)),
      ]);

      // Sub-row: Notes / Observação (sempre que existe)
      const note = (r.notes ?? "").trim();
      if (note.length > 0) {
        body.push([{
          content: `Observação: ${note}`,
          colSpan: 9,
          styles: {
            fillColor: [253, 252, 240] as [number, number, number],
            textColor: [90, 70, 30] as [number, number, number],
            fontStyle: "italic" as const,
            fontSize: 6.8,
            cellPadding: { top: 1.2, right: 2, bottom: 1.4, left: 6 },
          },
        }]);
      }

      // Sub-rows: Transações vinculadas / correspondentes (desdobramento)
      if (matched.length > 0) {
        body.push([{
          content: `Transações (${matched.length})`,
          colSpan: 9,
          styles: {
            fillColor: [238, 244, 252] as [number, number, number],
            textColor: [40, 60, 110] as [number, number, number],
            fontStyle: "bold" as const,
            fontSize: 6.8,
            cellPadding: { top: 1.2, right: 2, bottom: 1, left: 6 },
          },
        }]);
        matched.forEach((t) => {
          const txTotal = Number(t.amount) * (1 + Number(t.iva_rate) / 100);
          const txPaid = Number(t.paid_amount ?? 0);
          const txBal = Math.max(0, txTotal - txPaid);
          const sup = t.suppliers?.name ?? "—";
          const inv = t.invoice_ref ? `Fatura ${t.invoice_ref} · ` : "";
          const due = t.due_date ? `Vcto ${formatDatePT(t.due_date)} · ` : "";
          const pay = t.payment_date ? `Pago em ${formatDatePT(t.payment_date)} · ` : "";
          const balLine = txBal > 0.01 ? ` · Aberto ${fmt(txBal)}` : "";
          const specLine = t.specification ? ` (${t.specification})` : "";
          const txLabel = `   • ${t.description}${specLine}  —  ${sup}\n      ${inv}${due}${pay}Pago ${fmt(txPaid)} / Total ${fmt(txTotal)}${balLine}  [${txStatusLabel(t)}]`;
          body.push([{
            content: txLabel,
            colSpan: 9,
            styles: {
              fillColor: [248, 250, 254] as [number, number, number],
              textColor: [50, 60, 80] as [number, number, number],
              fontSize: 6.5,
              cellPadding: { top: 0.8, right: 2, bottom: 0.8, left: 6 },
            },
          }]);
        });
      }

      // Sub-rows: Histórico de auditoria da linha
      const audits = auditByFc.get(r.id) ?? [];
      if (audits.length > 0) {
        body.push([{
          content: `Histórico de alterações (${audits.length})`,
          colSpan: 9,
          styles: {
            fillColor: [245, 240, 250] as [number, number, number],
            textColor: [80, 50, 110] as [number, number, number],
            fontStyle: "bold" as const,
            fontSize: 6.8,
            cellPadding: { top: 1.2, right: 2, bottom: 1, left: 6 },
          },
        }]);
        audits.forEach((a) => {
          const when = new Date(a.created_at).toLocaleString("pt-PT", {
            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
          });
          const obs = a.observation ? `\n      "${a.observation}"` : "";
          const auditLine = `   - [${when}] ${a.field_name}: "${a.old_value ?? "-"}" -> "${a.new_value ?? "-"}" - por ${a.changed_by}${obs}`;
          body.push([{
            content: auditLine,
            colSpan: 9,
            styles: {
              fillColor: [251, 248, 254] as [number, number, number],
              textColor: [70, 50, 90] as [number, number, number],
              fontSize: 6.4,
              cellPadding: { top: 0.7, right: 2, bottom: 0.7, left: 6 },
            },
          }]);
        });
      }
    });

    const foot = [[
      {
        content: `Subtotal ${g.groupCode} ${g.groupName}`,
        colSpan: 6,
        styles: {
          halign: "left" as const, fontStyle: "bold" as const,
          fillColor: [240, 240, 245] as [number, number, number],
          textColor: [40, 40, 60] as [number, number, number],
        },
      },
      {
        content: fmt(g.baseTotal),
        styles: {
          halign: "right" as const, fontStyle: "bold" as const,
          fillColor: [240, 240, 245] as [number, number, number],
          textColor: [40, 40, 60] as [number, number, number],
        },
      },
      { content: "", styles: { fillColor: [240, 240, 245] as [number, number, number] } },
      {
        content: fmt(g.baseTotal + g.ivaTotal),
        styles: {
          halign: "right" as const, fontStyle: "bold" as const,
          fillColor: [240, 240, 245] as [number, number, number],
          textColor: [40, 40, 60] as [number, number, number],
        },
      },
    ]];

    autoTable(doc, {
      head, body, foot,
      startY: y,
      margin: { left: marginLeft, right: marginLeft },
      theme: "grid",
      tableWidth: totalCols,
      styles: { fontSize: 7, cellPadding: 1.2, overflow: "linebreak", textColor: [30, 30, 40] },
      headStyles: { fillColor: [240, 240, 245], textColor: [60, 60, 80], fontStyle: "bold", fontSize: 7 },
      footStyles: { fontSize: 7.5, cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: colWidths.code },
        1: { cellWidth: colWidths.desc },
        2: { cellWidth: colWidths.spec },
        3: { cellWidth: colWidths.partner },
        4: { cellWidth: colWidths.status },
        5: { cellWidth: colWidths.link, halign: "center" },
        6: { cellWidth: colWidths.base, halign: "right" },
        7: { cellWidth: colWidths.iva, halign: "right" },
        8: { cellWidth: colWidths.total, halign: "right" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 4) {
          const raw = String(data.cell.raw ?? "");
          // Match label without optional progress suffix " (x/y)"
          const label = raw.replace(/\s*\(\d+\/\d+\)\s*$/, "");
          const palette: Record<string, { bg: [number, number, number]; fg: [number, number, number] }> = {
            "Pago":      { bg: [220, 245, 225], fg: [25, 110, 45] },
            "A Pagar":   { bg: [220, 232, 250], fg: [30, 70, 150] },
            "Aprovado":  { bg: [220, 232, 250], fg: [30, 70, 150] },
            "Parcial":   { bg: [255, 235, 210], fg: [170, 95, 20] },
            "Atrasado":  { bg: [250, 220, 220], fg: [170, 30, 30] },
            "Pendente":  { bg: [253, 245, 210], fg: [150, 110, 20] },
            "Rascunho":  { bg: [235, 235, 240], fg: [90, 90, 110] },
          };
          const cfg = palette[label];
          if (cfg) {
            data.cell.styles.fillColor = cfg.bg;
            data.cell.styles.textColor = cfg.fg;
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.halign = "center";
          }
        }
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY ?? y;
    y = finalY + 4;

    if (y > ctx.pageHeight - 20) {
      doc.addPage();
      y = 14;
    }
  });

  return y;
}


function drawAuditSection(
  ctx: RenderContext,
  yStart: number,
  forecasts: ForecastRow[],
  auditLogs: AuditLog[],
): number {
  const { doc, marginLeft, contentWidth, pageHeight } = ctx;
  if (auditLogs.length === 0) return yStart;

  let y = yStart;
  if (y > pageHeight - 40) {
    doc.addPage();
    y = 14;
  }
  doc.setFillColor(60, 60, 80);
  doc.rect(marginLeft, y, contentWidth, 6, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("HISTÓRICO DE AUDITORIA", marginLeft + 3, y + 4.2);
  doc.setTextColor(0, 0, 0);
  y += 8;

  const fcMap = new Map(forecasts.map((f) => [f.id, f]));
  const body = auditLogs.map((log) => {
    const fc = fcMap.get(log.forecast_id);
    const desc = fc ? `${fc.account_categories?.code ?? "—"} ${fc.description}` : "—";
    return [
      new Date(log.created_at).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      desc,
      log.field_name,
      log.old_value ?? "—",
      log.new_value ?? "—",
      log.changed_by ?? "—",
      log.observation ?? "",
    ];
  });

  autoTable(doc, {
    head: [["Data", "Linha BP", "Campo", "Anterior", "Novo", "Por", "Observação"]],
    body,
    startY: y,
    margin: { left: marginLeft, right: marginLeft },
    theme: "grid",
    styles: { fontSize: 6.5, cellPadding: 1.2, overflow: "linebreak", textColor: [40, 40, 50] },
    headStyles: { fillColor: [240, 240, 245], textColor: [60, 60, 80], fontStyle: "bold", fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 50 },
      2: { cellWidth: 22 },
      3: { cellWidth: 28 },
      4: { cellWidth: 28 },
      5: { cellWidth: 24 },
      6: { cellWidth: contentWidth - 178 },
    },
  });
  return ((doc as any).lastAutoTable?.finalY ?? y) + 6;
}

function drawFooter(ctx: RenderContext) {
  const { doc, pageWidth, pageHeight, marginLeft, marginRight } = ctx;
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("MP Gestão Eventos · Relatório Business Plan", marginLeft, pageHeight - 8);
    doc.text(`Página ${p} / ${total}`, pageWidth - marginRight, pageHeight - 8, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);
}

async function renderEventBPPage(ctx: RenderContext, eventId: string, isFirst: boolean) {
  if (!isFirst) {
    ctx.doc.addPage();
  }
  const { event, forecasts, partners, forecastPartners, auditLogs, transactions } = await fetchEventBundle(eventId);

  let y = drawHeader(
    ctx,
    "Business Plan — Relatório de Conferência",
    `Evento: ${event.name}`,
  );
  y = drawEventIdentity(ctx, y, event, partners);
  y = drawSummaryCards(ctx, y, forecasts);

  const incomes = forecasts.filter((f) => f.type === "income");
  const expenses = forecasts.filter((f) => f.type === "expense");

  y = drawForecastTable(ctx, y, "Receitas", incomes, forecasts, forecastPartners, partners, transactions, auditLogs, [34, 110, 60]);
  if (y > ctx.pageHeight - 40) {
    ctx.doc.addPage();
    y = 14;
  }
  y = drawForecastTable(ctx, y, "Despesas", expenses, forecasts, forecastPartners, partners, transactions, auditLogs, [160, 60, 60]);
}

export async function exportEventBPToPDF({ eventId, includeChildren = true }: BPExportInput): Promise<void> {
  // Resolve siblings if Master
  let eventIds: string[] = [eventId];
  let masterEvent: any = null;

  const masterRes = await supabase
    .from("events")
    .select("id, name, event_type")
    .eq("id", eventId)
    .maybeSingle();
  if (masterRes.error) throw masterRes.error;
  masterEvent = masterRes.data;

  if (includeChildren && masterEvent) {
    const childRes = await supabase
      .from("events")
      .select("id, name, date")
      .eq("parent_event_id", eventId)
      .order("date");
    if (childRes.error) throw childRes.error;
    if (childRes.data && childRes.data.length > 0) {
      eventIds = [eventId, ...childRes.data.map((c) => c.id)];
    }
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 10;
  const marginRight = 10;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const ctx: RenderContext = { doc, pageWidth, pageHeight, marginLeft, marginRight, contentWidth };

  for (let i = 0; i < eventIds.length; i++) {
    await renderEventBPPage(ctx, eventIds[i], i === 0);
  }

  drawFooter(ctx);

  const safeName = (masterEvent?.name ?? "evento").replace(/[^\w\d-]+/g, "_").slice(0, 40);
  doc.save(`BP_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
