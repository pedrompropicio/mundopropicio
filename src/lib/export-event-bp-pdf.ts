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

async function fetchEventBundle(eventId: string) {
  const [evtRes, forecastsRes, partnersRes] = await Promise.all([
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
  ]);

  if (evtRes.error) throw evtRes.error;
  if (forecastsRes.error) throw forecastsRes.error;
  if (partnersRes.error) throw partnersRes.error;

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

  // Forecast → partners assignments
  const forecastIds = forecasts.map((f) => f.id);
  let forecastPartners: { forecast_id: string; partner_id: string }[] = [];
  let auditLogs: AuditLog[] = [];
  let linkedTxIds = new Set<string>();
  if (forecastIds.length > 0) {
    const [fpRes, auditRes] = await Promise.all([
      supabase.from("event_forecast_partners").select("forecast_id, partner_id").in("forecast_id", forecastIds),
      supabase.from("forecast_audit_log").select("*").in("forecast_id", forecastIds).order("created_at", { ascending: false }),
    ]);
    if (fpRes.error) throw fpRes.error;
    if (auditRes.error) throw auditRes.error;
    forecastPartners = (fpRes.data ?? []) as any;
    auditLogs = (auditRes.data ?? []) as any;
    forecasts.forEach((f) => {
      if (f.transaction_id) linkedTxIds.add(f.transaction_id);
    });
  }

  return { event, forecasts, partners, forecastPartners, auditLogs };
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
  forecastPartners: { forecast_id: string; partner_id: string }[],
  partners: PartnerRow[],
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

  groups.forEach((g) => {
    const head = [
      [
        "Código",
        "Descrição",
        "Especificação",
        "Resp. (Sócio)",
        "Status",
        "Vínculo",
        "Valor s/IVA",
        "IVA %",
        "Total",
      ],
    ];
    const body = g.rows.map((r) => [
      r.account_categories?.code ?? "—",
      r.description ?? "",
      r.specification ?? "",
      partnersForForecast(r.id, forecastPartners, partners),
      statusLabel(r.status),
      r.transaction_id ? "Sim" : "—",
      fmt(Number(r.amount)),
      `${r.iva_rate}%`,
      fmt(Number(r.amount) * (1 + Number(r.iva_rate) / 100)),
    ]);

    autoTable(doc, {
      head,
      body,
      startY: y,
      margin: { left: marginLeft, right: marginLeft },
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.2, overflow: "linebreak", textColor: [30, 30, 40] },
      headStyles: { fillColor: [240, 240, 245], textColor: [60, 60, 80], fontStyle: "bold", fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 50 },
        2: { cellWidth: 32 },
        3: { cellWidth: 30 },
        4: { cellWidth: 16 },
        5: { cellWidth: 12, halign: "center" },
        6: { cellWidth: 22, halign: "right" },
        7: { cellWidth: 12, halign: "right" },
        8: { cellWidth: 22, halign: "right" },
      },
      didDrawPage: () => {},
      willDrawCell: (data) => {
        if (data.section === "head" && data.column.index === 0) {
          // Group header banner before first column header
        }
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 4) {
          const v = String(data.cell.raw ?? "");
          if (v === "Aprovado" || v === "Pago") data.cell.styles.textColor = [30, 130, 50];
          if (v === "Rascunho" || v === "Pendente") data.cell.styles.textColor = [180, 130, 30];
        }
      },
    });

    // After each table, add a group subtotal line
    const finalY = (doc as any).lastAutoTable.finalY ?? y;
    doc.setFillColor(248, 248, 252);
    doc.rect(marginLeft, finalY, contentWidth, 5, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 80);
    doc.text(`Subtotal ${g.groupCode} ${g.groupName}`, marginLeft + 2, finalY + 3.5);
    doc.text(
      `${fmt(g.baseTotal)}  ·  IVA ${fmt(g.ivaTotal)}  ·  Total ${fmt(g.baseTotal + g.ivaTotal)}`,
      marginLeft + contentWidth - 2,
      finalY + 3.5,
      { align: "right" },
    );
    doc.setTextColor(0, 0, 0);
    y = finalY + 8;

    if (y > ctx.pageHeight - 20) {
      doc.addPage();
      y = 14;
    }
  });

  return y;
}

function drawNotesSection(
  ctx: RenderContext,
  yStart: number,
  forecasts: ForecastRow[],
): number {
  const { doc, marginLeft, contentWidth, pageHeight } = ctx;
  const withNotes = forecasts.filter((f) => f.notes && f.notes.trim().length > 0);
  if (withNotes.length === 0) return yStart;

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
  doc.text("OBSERVAÇÕES / NOTAS", marginLeft + 3, y + 4.2);
  doc.setTextColor(0, 0, 0);
  y += 8;

  autoTable(doc, {
    head: [["Código", "Descrição", "Nota"]],
    body: withNotes.map((f) => [
      f.account_categories?.code ?? "—",
      f.description ?? "",
      f.notes ?? "",
    ]),
    startY: y,
    margin: { left: marginLeft, right: marginLeft },
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak", textColor: [40, 40, 50] },
    headStyles: { fillColor: [240, 240, 245], textColor: [60, 60, 80], fontStyle: "bold", fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 60 },
      2: { cellWidth: contentWidth - 76 },
    },
  });
  return ((doc as any).lastAutoTable?.finalY ?? y) + 6;
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
  const { event, forecasts, partners, forecastPartners, auditLogs } = await fetchEventBundle(eventId);

  let y = drawHeader(
    ctx,
    "Business Plan — Relatório de Conferência",
    `Evento: ${event.name}`,
  );
  y = drawEventIdentity(ctx, y, event, partners);
  y = drawSummaryCards(ctx, y, forecasts);

  const incomes = forecasts.filter((f) => f.type === "income");
  const expenses = forecasts.filter((f) => f.type === "expense");

  y = drawForecastTable(ctx, y, "Receitas", incomes, forecastPartners, partners, [34, 110, 60]);
  if (y > ctx.pageHeight - 40) {
    ctx.doc.addPage();
    y = 14;
  }
  y = drawForecastTable(ctx, y, "Despesas", expenses, forecastPartners, partners, [160, 60, 60]);

  y = drawNotesSection(ctx, y + 2, forecasts);
  y = drawAuditSection(ctx, y + 2, forecasts, auditLogs);
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
