import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ExtractedRow {
  zona: string;
  tipo_bilhete: string;
  preco_unitario: number;
  quantidade_total: number;
  quantidade_vendida: number;
  valor_vendido: number;
  iva_rate: number;
}

interface ZoneMapping {
  pdfZone: string;
  mappedZoneId: string | null;
  rows: ExtractedRow[];
}

interface ImportReportData {
  fileName: string;
  eventName: string;
  sessionLabel?: string;
  sessionDate?: string;
  sessionTime?: string;
  ticketOfficeName?: string;
  pdfHeader: {
    event_name?: string;
    venue_name?: string;
    session_date?: string;
    session_time?: string;
    ticket_office_name?: string;
    period_from?: string;
    period_to?: string;
    total_quantity_all?: number;
    total_quantity_sold?: number;
    total_revenue?: number;
  };
  extractedRows: ExtractedRow[];
  zoneMappings: ZoneMapping[];
  existingZoneNames: Record<string, string>; // id -> name
  headerWarnings: string[];
  totalWarnings: string[];
  importType: string;
}

export function generateImportReportPdf(data: ImportReportData): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 16;

  const fmtNum = (n: number) => n.toLocaleString("pt-PT");
  const fmtMoney = (n: number) => n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";

  // === HEADER ===
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Relatório de Análise de Importação", margin, y);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-PT")}`, pageW - margin, y, { align: "right" });
  doc.setTextColor(0);
  y += 8;

  // === EVENT INFO ===
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Evento no App", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const appInfo: string[] = [
    `Evento: ${data.eventName}`,
  ];
  if (data.sessionLabel) appInfo.push(`Sessão: ${data.sessionLabel} (${data.sessionDate || ""}${data.sessionTime ? " " + data.sessionTime : ""})`);
  if (data.ticketOfficeName) appInfo.push(`Bilheteira: ${data.ticketOfficeName}`);
  appInfo.push(`Tipo: ${data.importType === "sales" ? "Importação de Vendas" : "Configuração Inicial"}`);
  appInfo.push(`Ficheiro: ${data.fileName}`);
  appInfo.forEach(line => { doc.text(line, margin + 2, y); y += 4; });
  y += 3;

  // === PDF HEADER INFO ===
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Dados do Cabeçalho do PDF", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const h = data.pdfHeader;
  const pdfInfo: string[] = [];
  if (h.event_name) pdfInfo.push(`Evento: ${h.event_name}`);
  if (h.venue_name) pdfInfo.push(`Local: ${h.venue_name}`);
  if (h.session_date) pdfInfo.push(`Sessão: ${h.session_date}${h.session_time ? " " + h.session_time : ""}`);
  if (h.period_from) pdfInfo.push(`Período: ${h.period_from} a ${h.period_to || h.period_from}`);
  if (h.ticket_office_name) pdfInfo.push(`Bilheteira: ${h.ticket_office_name}`);
  if (h.total_quantity_sold != null) pdfInfo.push(`Total vendidos (PDF): ${fmtNum(h.total_quantity_sold)}`);
  if (h.total_revenue != null) pdfInfo.push(`Total receita (PDF): ${fmtMoney(h.total_revenue)}`);
  pdfInfo.forEach(line => { doc.text(line, margin + 2, y); y += 4; });
  y += 3;

  // === DIVERGENCES ===
  const allWarnings = [...data.headerWarnings, ...data.totalWarnings];
  if (allWarnings.length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(200, 0, 0);
    doc.text("⚠ Divergências Detectadas", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    allWarnings.forEach(w => {
      doc.text(`• ${w}`, margin + 2, y);
      y += 4;
    });
    doc.setTextColor(0);
    y += 3;
  }

  // === SUMMARY TOTALS ===
  const totalSold = data.extractedRows.reduce((s, r) => s + r.quantidade_vendida, 0);
  const totalRevenue = data.extractedRows.reduce((s, r) => s + r.valor_vendido, 0);
  const totalAll = data.extractedRows.reduce((s, r) => s + r.quantidade_total, 0);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("Resumo da Extracção", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Total de linhas extraídas: ${data.extractedRows.length}`, margin + 2, y); y += 4;
  doc.text(`Bilhetes configurados: ${fmtNum(totalAll)}`, margin + 2, y); y += 4;
  doc.text(`Bilhetes vendidos: ${fmtNum(totalSold)}`, margin + 2, y); y += 4;
  doc.text(`Receita total: ${fmtMoney(totalRevenue)}`, margin + 2, y); y += 4;
  doc.text(`Zonas no PDF: ${data.zoneMappings.length}`, margin + 2, y); y += 4;
  const mapped = data.zoneMappings.filter(m => m.mappedZoneId).length;
  const newZones = data.zoneMappings.filter(m => !m.mappedZoneId).length;
  doc.text(`Zonas mapeadas: ${mapped} | Novas zonas: ${newZones}`, margin + 2, y); y += 6;

  // === VALIDATION VS PDF TOTAL ===
  if (h.total_quantity_sold != null || h.total_revenue != null) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Validação contra TOTAL do PDF", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    if (h.total_quantity_sold != null) {
      const diff = totalSold - h.total_quantity_sold;
      const color = Math.abs(diff) > 1 ? "DIVERGE" : "OK";
      doc.text(`Qtd vendida: Extraído ${fmtNum(totalSold)} vs PDF ${fmtNum(h.total_quantity_sold)} → ${color} (dif: ${diff > 0 ? "+" : ""}${diff})`, margin + 2, y);
      y += 4;
    }
    if (h.total_revenue != null) {
      const diff = totalRevenue - h.total_revenue;
      const color = Math.abs(diff) > 1 ? "DIVERGE" : "OK";
      doc.text(`Receita: Extraído ${fmtMoney(totalRevenue)} vs PDF ${fmtMoney(h.total_revenue)} → ${color} (dif: ${diff > 0 ? "+" : ""}${fmtMoney(Math.abs(diff))})`, margin + 2, y);
      y += 4;
    }
    y += 4;
  }

  // === ZONE MAPPING TABLE ===
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Mapeamento de Zonas", margin, y);
  y += 2;

  const zoneRows = data.zoneMappings.map(m => {
    const qtd = m.rows.reduce((s, r) => s + r.quantidade_vendida, 0);
    const rev = m.rows.reduce((s, r) => s + r.valor_vendido, 0);
    const status = m.mappedZoneId
      ? `Mapeada → ${data.existingZoneNames[m.mappedZoneId] || "?"}`
      : "Nova zona";
    return [m.pdfZone, String(m.rows.length), fmtNum(qtd), fmtMoney(rev), status];
  });

  autoTable(doc, {
    startY: y,
    head: [["Zona PDF", "Tipos", "Vendidos", "Receita", "Mapeamento"]],
    body: zoneRows,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
    margin: { left: margin, right: margin },
    theme: "grid",
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // === DETAIL TABLE ===
  if (y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    y = 16;
  }

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Detalhe por Zona e Tipo de Bilhete", margin, y);
  y += 2;

  const detailRows = data.extractedRows.map(r => [
    r.zona,
    r.tipo_bilhete,
    fmtMoney(r.preco_unitario),
    fmtNum(r.quantidade_total),
    fmtNum(r.quantidade_vendida),
    fmtMoney(r.valor_vendido),
    `${r.iva_rate}%`,
  ]);

  // Add total row
  detailRows.push([
    "TOTAL",
    "",
    "",
    fmtNum(totalAll),
    fmtNum(totalSold),
    fmtMoney(totalRevenue),
    "",
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Zona", "Tipo Bilhete", "P. Unit.", "Qt. Total", "Qt. Vendida", "Receita", "IVA"]],
    body: detailRows,
    styles: { fontSize: 6.5, cellPadding: 1.2 },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
    margin: { left: margin, right: margin },
    theme: "grid",
    didParseCell: (data) => {
      // Bold last row (TOTAL)
      if (data.row.index === detailRows.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [240, 240, 240];
      }
    },
  });

  // Footer on each page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      `Relatório de importação — ${data.fileName} — Página ${i}/${totalPages}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: "center" }
    );
  }

  doc.setTextColor(0);
  return doc;
}
