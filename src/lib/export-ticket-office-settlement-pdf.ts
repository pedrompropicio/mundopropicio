import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchExportBranding, drawPdfExportHeader } from "@/lib/export-header";
import { formatDatePT } from "@/lib/utils";
import { formatCurrency } from "@/lib/mock-data";
import { settlementPdfFileName, SETTLEMENT_STATUS_LABEL, type SettlementView } from "@/lib/ticket-office-settlement-view";

/** PDF de leitura de um fecho de bilheteira — padrão do app (jspdf + autotable + cabeçalho institucional). */
export async function exportTicketOfficeSettlementPdf(v: SettlementView) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const branding = await fetchExportBranding();
  let y = drawPdfExportHeader(doc, {
    branding,
    title: `Fecho de bilheteira — ${v.officeName}`,
    subtitles: [
      `Evento: ${v.eventName}${v.eventDate ? ` (${formatDatePT(v.eventDate)})` : ""}`,
      `Data do fecho: ${formatDatePT(v.settlementDate)} · Estado: ${SETTLEMENT_STATUS_LABEL[v.status] ?? v.status}`,
      ...(v.statementNumber ? [`Apuramento Ticketline nº ${v.statementNumber}`] : []),
    ],
  });

  autoTable(doc, {
    startY: y + 2,
    head: [["Bruto", "Deduções", "Direito do evento", "Transferido"]],
    body: [[
      formatCurrency(v.grossRevenue),
      `−${formatCurrency(v.totalDeductions)}`,
      formatCurrency(v.netFinal),
      formatCurrency(v.netTransferred),
    ]],
    styles: { fontSize: 10, halign: "center" },
    headStyles: { fillColor: [40, 40, 40] },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Deduções", 14, y);
  autoTable(doc, {
    startY: y + 2,
    head: [["Descrição", "Fornecedor", "Valor"]],
    body: v.deductions.length
      ? v.deductions.map((d) => [d.description, d.supplier ?? "—", formatCurrency(d.value)])
      : [["Sem deduções ligadas", "", ""]],
    foot: [["Total", "", `−${formatCurrency(v.totalDeductions)}`]],
    styles: { fontSize: 9 },
    columnStyles: { 2: { halign: "right" } },
    headStyles: { fillColor: [40, 40, 40] },
    footStyles: { fillColor: [230, 230, 230], textColor: 20 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  const lines: [string, string][] = [];
  if (v.venueRetainedAmount > 0) lines.push(["Retido pela sala", formatCurrency(v.venueRetainedAmount) + (v.venueRetainedNotes ? ` — ${v.venueRetainedNotes}` : "")]);
  if (v.venueRemainderPaid && v.venueRemainderAmount > 0) lines.push(["Saldo restante da fatura pago pela bilheteira", formatCurrency(v.venueRemainderAmount)]);
  if (v.formaManual) lines.push(["Forma de liquidação manual", v.formaManual + (v.formaManualNotes ? ` — ${v.formaManualNotes}` : "")]);
  if (v.notes) lines.push(["Notas do fecho", v.notes]);
  if (v.adjustmentNotes) lines.push(["Notas de ajuste", v.adjustmentNotes]);
  if (v.grossAdjustmentNotes) lines.push(["Notas de ajuste do bruto", v.grossAdjustmentNotes]);
  if (v.status === "confirmed") lines.push(["Fechado por", `${v.closedByName ?? "—"}${v.closedAt ? ` em ${new Date(v.closedAt).toLocaleString("pt-PT")}` : ""}`]);
  if (lines.length) {
    autoTable(doc, {
      startY: y,
      body: lines,
      styles: { fontSize: 9 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 } },
      theme: "plain",
    });
  }

  const pages = doc.getNumberOfPages();
  const gen = `Gerado em ${new Date().toLocaleString("pt-PT")}`;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const h = doc.internal.pageSize.getHeight();
    doc.text(gen, 14, h - 8);
    doc.text(`${i}/${pages}`, doc.internal.pageSize.getWidth() - 20, h - 8);
  }
  doc.save(settlementPdfFileName(v.eventName, v.settlementDate));
}
