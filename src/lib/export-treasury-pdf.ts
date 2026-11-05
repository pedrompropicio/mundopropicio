import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchExportBranding, drawPdfExportHeader } from "@/lib/export-header";
import { sanitizePdfText, sanitizePdfRows } from "@/lib/pdf-text";
import { formatMoney, type CompanyLocale } from "@/lib/company-locale";
import { treasuryDisplayRows, treasuryPeriodLabel, TREASURY_NOTES, type TreasuryBridge, type TreasuryNode, type TreasuryPeriod } from "@/lib/treasury-bridge";

/** Só renderiza o mesmo modelo do ecrã; não carrega nem recalcula resultados financeiros. */
export async function exportTreasuryPdf(input: { companyId: string; bridge: TreasuryBridge; period: TreasuryPeriod; periodMode?: boolean; locale: CompanyLocale }) {
  const branding = await fetchExportBranding(input.companyId);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawPdfExportHeader(doc, {
    branding: { ...branding, displayName: sanitizePdfText(branding.displayName) },
    title: sanitizePdfText("Tesouraria — Onde está o dinheiro"),
    subtitles: [sanitizePdfText(treasuryPeriodLabel(input.period, input.periodMode))],
  });
  autoTable(doc, {
    startY: y, body: sanitizePdfRows(TREASURY_NOTES.map((note) => [note])),
    styles: { fontSize: 8 }, theme: "plain", margin: { left: 14, right: 14 },
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const renderNode = (node: TreasuryNode, path: string) => {
    if (y > 245) { doc.addPage(); y = 16; }
    const name = `${path}${node.name}${node.source ? ` · ${node.source}` : ""}`;
    const titleLines = doc.splitTextToSize(sanitizePdfText(name), 180);
    doc.setFontSize(11);
    doc.text(titleLines, 14, y);
    y += titleLines.length * 5;
    const rows = treasuryDisplayRows(node).map((r) => [r.label, formatMoney(r.withoutPending, input.locale), formatMoney(r.withPending, input.locale)]);
    rows.push(["7. % de participação da empresa", node.housePct === undefined ? "—" : `${new Intl.NumberFormat(input.locale.locale, { maximumFractionDigits: 4 }).format(node.housePct)}%`, ""]);
    rows.push(["8. Pendentes (nota)", formatMoney(node.amounts.pending, input.locale), "Só no timing com pendentes"]);
    if (node.cashDetail) rows.push([node.id === "common" ? "Comuns: fora das linhas e do total dos eventos." : "Sub-evento: resultado e sócios apurados no Master.", "", ""]);
    autoTable(doc, {
      startY: y, head: [["Onde está o dinheiro", "Sem pendentes", "Com pendentes"]], body: sanitizePdfRows(rows),
      styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [40, 40, 40] },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } }, margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    for (const child of node.children) renderNode(child, `${path}${node.name} / `);
  };
  renderNode(input.bridge.company, "");
  renderNode(input.bridge.common, "");
  doc.save(`tesouraria-${new Date().toISOString().slice(0, 10)}.pdf`);
}
