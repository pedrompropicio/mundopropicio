import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrency } from "@/lib/mock-data";
import { formatDatePT } from "@/lib/utils";

interface TicketingExportInput {
  eventId: string;
  includeChildren?: boolean;
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

interface SessionRow { id: string; date: string; label: string; start_time: string | null; sort_order: number; }
interface ZoneRow { id: string; name: string; total_capacity: number; session_id: string | null; }
interface LotRow {
  id: string;
  zone_id: string;
  name: string;
  lot_number: number;
  lot_type: string;
  price: number;
  iva_rate: number;
  quantity: number;
}
interface SaleRow { lot_id: string; quantity: number; unit_price: number; }
interface AssignmentRow {
  id: string;
  event_date_id: string | null;
  is_conciliated: boolean;
  conciliated_at: string | null;
  conciliated_by: string | null;
  commission_notes: string | null;
  financial_accounts?: { id: string; name: string; contact_name: string | null } | null;
}

const fmt = (n: number) => formatCurrency(n);
const pct = (n: number) => `${n.toFixed(1)}%`;

function statusLabel(s: string): string {
  const map: Record<string, string> = {
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

const lotTypeLabel: Record<string, string> = { regular: "Regular", promo: "Promo", special: "Especial" };

async function fetchEventTicketingBundle(eventId: string) {
  const evtRes = await supabase
    .from("events")
    .select("id, name, date, status, event_type, location, parent_event_id, cities:city_id(name, country), venues:venue_id(name)")
    .eq("id", eventId)
    .maybeSingle();
  if (evtRes.error) throw evtRes.error;
  const evt = evtRes.data as any;
  if (!evt) throw new Error("Evento não encontrado");

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

  const [sessionsRes, zonesRes, assignmentsRes] = await Promise.all([
    supabase.from("event_sessions").select("id, date, label, start_time, sort_order").eq("event_id", eventId).order("sort_order"),
    supabase.from("event_ticket_zones").select("id, name, total_capacity, session_id").eq("event_id", eventId).order("created_at"),
    supabase
      .from("event_ticket_office_assignments")
      .select("id, event_date_id, is_conciliated, conciliated_at, conciliated_by, commission_notes, financial_accounts:financial_account_id(id, name, contact_name)")
      .eq("event_id", eventId),
  ]);
  if (sessionsRes.error) throw sessionsRes.error;
  if (zonesRes.error) throw zonesRes.error;
  if (assignmentsRes.error) throw assignmentsRes.error;

  const sessions = (sessionsRes.data ?? []) as SessionRow[];
  const zones = (zonesRes.data ?? []) as ZoneRow[];
  const assignments = (assignmentsRes.data ?? []) as any as AssignmentRow[];

  const zoneIds = zones.map((z) => z.id);
  let lots: LotRow[] = [];
  let sales: SaleRow[] = [];
  if (zoneIds.length > 0) {
    const lotsRes = await supabase
      .from("event_ticket_lots")
      .select("id, zone_id, name, lot_number, lot_type, price, iva_rate, quantity")
      .in("zone_id", zoneIds)
      .order("lot_number");
    if (lotsRes.error) throw lotsRes.error;
    lots = (lotsRes.data ?? []) as LotRow[];

    const lotIds = lots.map((l) => l.id);
    if (lotIds.length > 0) {
      const salesRes = await supabase
        .from("ticket_sales")
        .select("lot_id, quantity, unit_price")
        .in("lot_id", lotIds);
      if (salesRes.error) throw salesRes.error;
      sales = (salesRes.data ?? []) as SaleRow[];
    }
  }

  return { event, sessions, zones, lots, sales, assignments };
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
  return y + 4;
}

function drawEventIdentity(ctx: RenderContext, yStart: number, event: EventRow): number {
  const { doc, marginLeft, contentWidth } = ctx;
  let y = yStart;

  doc.setDrawColor(220, 220, 230);
  doc.setFillColor(248, 248, 252);
  doc.roundedRect(marginLeft, y, contentWidth, 18, 1.5, 1.5, "FD");

  const colW = contentWidth / 4;
  const rows = [
    { label: "EVENTO", value: event.name, bold: true },
    { label: "DATA", value: formatDatePT(event.date) },
    { label: "LOCAL", value: [event.city?.name, event.venue?.name ?? event.location].filter(Boolean).join(" · ") || "—" },
    { label: "TIPO / STATUS", value: `${eventTypeLabel(event.event_type)} · ${statusLabel(event.status)}` },
  ];
  rows.forEach((r, i) => {
    const x = marginLeft + i * colW + 3;
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 130);
    doc.setFont("helvetica", "bold");
    doc.text(r.label, x, y + 5);
    doc.setFontSize(r.bold ? 10 : 9);
    doc.setTextColor(20, 20, 30);
    doc.setFont("helvetica", r.bold ? "bold" : "normal");
    doc.text(r.value || "—", x, y + 11, { maxWidth: colW - 5 });
  });
  doc.setTextColor(0, 0, 0);
  return y + 22;
}

interface ZoneStats {
  zone: ZoneRow;
  lots: LotRow[];
  capacity: number;
  forecastQty: number;
  soldQty: number;
  available: number;
  forecastRevGross: number;
  forecastRevNet: number;
  actualRevGross: number;
  actualRevNet: number;
}

function buildZoneStats(zone: ZoneRow, lots: LotRow[], sales: SaleRow[]): ZoneStats {
  const zoneLots = lots.filter((l) => l.zone_id === zone.id);
  let forecastQty = 0;
  let soldQty = 0;
  let forecastRevGross = 0;
  let forecastRevNet = 0;
  let actualRevGross = 0;
  let actualRevNet = 0;
  zoneLots.forEach((lot) => {
    forecastQty += Number(lot.quantity);
    forecastRevGross += Number(lot.price) * Number(lot.quantity);
    const netUnit = Number(lot.price) / (1 + Number(lot.iva_rate) / 100);
    forecastRevNet += netUnit * Number(lot.quantity);
    const lotSales = sales.filter((s) => s.lot_id === lot.id);
    lotSales.forEach((s) => {
      const sn = Number(s.quantity);
      soldQty += sn;
      const gross = Number(s.unit_price) * sn;
      actualRevGross += gross;
      actualRevNet += (Number(s.unit_price) / (1 + Number(lot.iva_rate) / 100)) * sn;
    });
  });
  return {
    zone,
    lots: zoneLots,
    capacity: Number(zone.total_capacity),
    forecastQty,
    soldQty,
    available: Number(zone.total_capacity) - soldQty,
    forecastRevGross,
    forecastRevNet,
    actualRevGross,
    actualRevNet,
  };
}

function drawSummaryCards(ctx: RenderContext, yStart: number, zoneStats: ZoneStats[]): number {
  const { doc, marginLeft, contentWidth } = ctx;
  const totalCapacity = zoneStats.reduce((s, z) => s + z.capacity, 0);
  const totalSold = zoneStats.reduce((s, z) => s + z.soldQty, 0);
  const totalAvail = totalCapacity - totalSold;
  const occupancy = totalCapacity > 0 ? (totalSold / totalCapacity) * 100 : 0;
  const totalForecastRev = zoneStats.reduce((s, z) => s + z.forecastRevGross, 0);
  const totalActualRev = zoneStats.reduce((s, z) => s + z.actualRevGross, 0);

  const cards = [
    { label: "CAPACIDADE TOTAL", value: totalCapacity.toLocaleString("pt-PT"), color: [34, 100, 180] as [number, number, number] },
    { label: "VENDIDOS", value: totalSold.toLocaleString("pt-PT"), color: [34, 130, 60] as [number, number, number] },
    { label: "DISPONÍVEIS", value: totalAvail.toLocaleString("pt-PT"), color: [180, 130, 30] as [number, number, number] },
    { label: "OCUPAÇÃO", value: pct(occupancy), color: [120, 60, 200] as [number, number, number] },
    { label: "RECEITA PREVISTA", value: fmt(totalForecastRev), color: [60, 60, 80] as [number, number, number] },
    { label: "RECEITA REAL", value: fmt(totalActualRev), color: totalActualRev >= totalForecastRev ? ([34, 130, 60] as [number, number, number]) : ([200, 60, 60] as [number, number, number]) },
  ];

  let y = yStart;
  const cardW = (contentWidth - 5 * 3) / 6;
  const cardH = 18;
  cards.forEach((c, i) => {
    const x = marginLeft + i * (cardW + 3);
    doc.setDrawColor(220, 220, 230);
    doc.setFillColor(252, 252, 254);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, "FD");
    doc.setFillColor(c.color[0], c.color[1], c.color[2]);
    doc.rect(x, y, 2, cardH, "F");
    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 130);
    doc.setFont("helvetica", "bold");
    doc.text(c.label, x + 5, y + 5);
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 30);
    doc.text(c.value, x + 5, y + 12);
  });
  doc.setTextColor(0, 0, 0);
  return y + cardH + 6;
}

function drawZonesTables(ctx: RenderContext, yStart: number, zoneStats: ZoneStats[], sales: SaleRow[]): number {
  const { doc, marginLeft, contentWidth, pageHeight } = ctx;
  if (zoneStats.length === 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(150, 150, 150);
    doc.text("Sem zonas configuradas para este evento.", marginLeft, yStart + 5);
    doc.setTextColor(0, 0, 0);
    return yStart + 10;
  }

  let y = yStart;
  doc.setFillColor(34, 100, 180);
  doc.rect(marginLeft, y, contentWidth, 6, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("ZONAS E LOTES", marginLeft + 3, y + 4.2);
  doc.setTextColor(0, 0, 0);
  y += 8;

  zoneStats.forEach((z) => {
    if (y > pageHeight - 40) {
      doc.addPage();
      y = 14;
    }
    doc.setFillColor(240, 240, 245);
    doc.rect(marginLeft, y, contentWidth, 7, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 60);
    doc.text(z.zone.name, marginLeft + 3, y + 5);
    const occ = z.capacity > 0 ? (z.soldQty / z.capacity) * 100 : 0;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 100);
    doc.text(
      `Cap. ${z.capacity.toLocaleString("pt-PT")} · Vend. ${z.soldQty.toLocaleString("pt-PT")} · Disp. ${z.available.toLocaleString("pt-PT")} · ${pct(occ)}`,
      marginLeft + contentWidth - 3,
      y + 5,
      { align: "right" },
    );
    doc.setTextColor(0, 0, 0);
    y += 8;

    const body = z.lots.map((lot) => {
      const lotSales = sales.filter((s) => s.lot_id === lot.id);
      const sold = lotSales.reduce((sum, s) => sum + Number(s.quantity), 0);
      const grossUnit = Number(lot.price);
      const ivaRate = Number(lot.iva_rate);
      const forecastRev = grossUnit * Number(lot.quantity);
      const actualRev = lotSales.reduce((sum, s) => sum + Number(s.unit_price) * Number(s.quantity), 0);
      return [
        String(lot.lot_number),
        lot.name,
        lotTypeLabel[lot.lot_type] ?? lot.lot_type,
        fmt(grossUnit),
        `${ivaRate}%`,
        Number(lot.quantity).toLocaleString("pt-PT"),
        sold.toLocaleString("pt-PT"),
        fmt(forecastRev),
        fmt(actualRev),
      ];
    });

    autoTable(doc, {
      head: [["#", "Lote", "Tipo", "Preço c/IVA", "IVA", "Quantidade", "Vendidos", "Receita Prev.", "Receita Real"]],
      body,
      startY: y,
      margin: { left: marginLeft, right: marginLeft },
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak", textColor: [30, 30, 40] },
      headStyles: { fillColor: [248, 248, 252], textColor: [60, 60, 80], fontStyle: "bold", fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 50 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22, halign: "right" },
        4: { cellWidth: 14, halign: "right" },
        5: { cellWidth: 22, halign: "right" },
        6: { cellWidth: 22, halign: "right" },
        7: { cellWidth: 28, halign: "right" },
        8: { cellWidth: 28, halign: "right" },
      },
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 4;
  });

  return y;
}

function drawTicketOfficesSection(ctx: RenderContext, yStart: number, assignments: AssignmentRow[]): number {
  const { doc, marginLeft, contentWidth, pageHeight } = ctx;
  if (assignments.length === 0) return yStart;
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
  doc.text("BILHETEIRAS / CONTAS ASSOCIADAS", marginLeft + 3, y + 4.2);
  doc.setTextColor(0, 0, 0);
  y += 8;

  autoTable(doc, {
    head: [["Bilheteira", "Contacto", "Conciliada", "Data conciliação", "Por", "Comissões / Notas"]],
    body: assignments.map((a) => [
      a.financial_accounts?.name ?? "—",
      a.financial_accounts?.contact_name ?? "—",
      a.is_conciliated ? "Sim" : "Não",
      a.conciliated_at ? new Date(a.conciliated_at).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—",
      a.conciliated_by ?? "—",
      a.commission_notes ?? "",
    ]),
    startY: y,
    margin: { left: marginLeft, right: marginLeft },
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak", textColor: [30, 30, 40] },
    headStyles: { fillColor: [240, 240, 245], textColor: [60, 60, 80], fontStyle: "bold", fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 40 },
      2: { cellWidth: 22, halign: "center" },
      3: { cellWidth: 28 },
      4: { cellWidth: 30 },
      5: { cellWidth: contentWidth - 170 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2) {
        const v = String(data.cell.raw ?? "");
        if (v === "Sim") data.cell.styles.textColor = [30, 130, 50];
        if (v === "Não") data.cell.styles.textColor = [180, 130, 30];
      }
    },
  });

  return ((doc as any).lastAutoTable?.finalY ?? y) + 6;
}

function drawSessionsSection(ctx: RenderContext, yStart: number, sessions: SessionRow[]): number {
  const { doc, marginLeft, contentWidth, pageHeight } = ctx;
  if (sessions.length === 0) return yStart;
  let y = yStart;
  if (y > pageHeight - 30) {
    doc.addPage();
    y = 14;
  }
  doc.setFillColor(248, 248, 252);
  doc.rect(marginLeft, y, contentWidth, 5, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 100);
  doc.text("SESSÕES", marginLeft + 3, y + 3.5);
  doc.setTextColor(0, 0, 0);
  y += 6;
  autoTable(doc, {
    head: [["#", "Etiqueta", "Data", "Hora"]],
    body: sessions.map((s) => [
      String(s.sort_order),
      s.label,
      formatDatePT(s.date),
      s.start_time ?? "—",
    ]),
    startY: y,
    margin: { left: marginLeft, right: marginLeft },
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: [240, 240, 245], textColor: [60, 60, 80], fontStyle: "bold", fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 60 },
      2: { cellWidth: 40 },
      3: { cellWidth: 30 },
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
    doc.text("MP Gestão Eventos · Relatório de Bilheteria", marginLeft, pageHeight - 8);
    doc.text(`Página ${p} / ${total}`, pageWidth - marginRight, pageHeight - 8, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);
}

async function renderEventTicketingPage(ctx: RenderContext, eventId: string, isFirst: boolean) {
  if (!isFirst) ctx.doc.addPage();
  const { event, sessions, zones, lots, sales, assignments } = await fetchEventTicketingBundle(eventId);
  const zoneStats = zones.map((z) => buildZoneStats(z, lots, sales));

  let y = drawHeader(ctx, "Bilheteria — Relatório de Conferência", `Evento: ${event.name}`);
  y = drawEventIdentity(ctx, y, event);
  y = drawSummaryCards(ctx, y, zoneStats);
  y = drawSessionsSection(ctx, y, sessions);
  y = drawZonesTables(ctx, y, zoneStats, sales);
  y = drawTicketOfficesSection(ctx, y + 2, assignments);
}

export async function exportEventTicketingToPDF({ eventId, includeChildren = true }: TicketingExportInput): Promise<void> {
  let eventIds: string[] = [eventId];
  const masterRes = await supabase.from("events").select("id, name, event_type").eq("id", eventId).maybeSingle();
  if (masterRes.error) throw masterRes.error;
  const masterEvent = masterRes.data as any;

  if (includeChildren && masterEvent) {
    const childRes = await supabase.from("events").select("id, name, date").eq("parent_event_id", eventId).order("date");
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
    await renderEventTicketingPage(ctx, eventIds[i], i === 0);
  }
  drawFooter(ctx);

  const safeName = (masterEvent?.name ?? "evento").replace(/[^\w\d-]+/g, "_").slice(0, 40);
  doc.save(`Bilheteria_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
