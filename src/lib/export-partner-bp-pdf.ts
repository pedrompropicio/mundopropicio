/**
 * Partner BP export (PDF) — derived from staff export, but stripped of
 * sensitive details (audit log, raw transactions, partner percentages,
 * supplier IBANs, etc.). Renders the same hierarchical L1>L2>L3 view the
 * partner already sees on the Agrupada tab.
 *
 * Inputs come from data ALREADY fetched and filtered by RLS in
 * PartnerEventDetail (no extra queries → no leakage risk).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrency } from "@/lib/mock-data";
import { formatDatePT } from "@/lib/utils";

export interface PartnerBPGroupL3 {
  code: string;
  name: string;
  total: number;
  items: { id: string; description: string; specification?: string | null; amount: number }[];
}
export interface PartnerBPGroupL2 {
  code: string;
  name: string;
  total: number;
  l3Groups: PartnerBPGroupL3[];
}
export interface PartnerBPGroupL1 {
  code: string;
  name: string;
  total: number;
  l2Groups: PartnerBPGroupL2[];
}

export interface PartnerBPExportInput {
  eventName: string;
  eventDate: string | null;
  eventLocation: string | null;
  cityLabel: string | null;
  bpVersionLabel: string | null; // ex: "v3 (15/06/2026)"
  bpVersionDescription?: string | null;
  groups: PartnerBPGroupL1[];
  totalExpense: number;
}

const fmt = (n: number) => formatCurrency(n);

export async function exportPartnerBPPdf(input: PartnerBPExportInput): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  // Logo
  try {
    doc.addImage(logoHorizontal, "PNG", margin, y, 38, 12);
  } catch {
    /* ignore */
  }

  // Title block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Business Plan — Custos", pageWidth - margin, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(
    `Gerado a ${formatDatePT(new Date().toISOString())}`,
    pageWidth - margin,
    y + 10,
    { align: "right" },
  );
  doc.setTextColor(0);
  y += 18;

  // Event info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(input.eventName, margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const subParts = [
    input.cityLabel,
    input.eventDate ? formatDatePT(input.eventDate) : null,
    input.eventLocation,
  ].filter(Boolean);
  if (subParts.length > 0) {
    doc.setTextColor(90);
    doc.text(subParts.join(" · "), margin, y);
    y += 5;
    doc.setTextColor(0);
  }
  if (input.bpVersionLabel) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(70);
    const verLine = input.bpVersionDescription
      ? `${input.bpVersionLabel} — ${input.bpVersionDescription}`
      : input.bpVersionLabel;
    doc.text(verLine, margin, y);
    y += 5;
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
  }

  // Body table — flat rows with indentation by level
  const body: any[] = [];
  for (const l1 of input.groups) {
    body.push([
      { content: `${l1.code} · ${l1.name}`, styles: { fontStyle: "bold", fillColor: [230, 230, 230] } },
      { content: fmt(l1.total), styles: { fontStyle: "bold", halign: "right", fillColor: [230, 230, 230] } },
    ]);
    for (const l2 of l1.l2Groups) {
      body.push([
        { content: `   ${l2.code} · ${l2.name}`, styles: { fontStyle: "bold", fillColor: [245, 245, 245], textColor: 70 } },
        { content: fmt(l2.total), styles: { fontStyle: "bold", halign: "right", fillColor: [245, 245, 245], textColor: 70 } },
      ]);
      for (const l3 of l2.l3Groups) {
        body.push([
          { content: `      ${l3.code} · ${l3.name}`, styles: { fontStyle: "bold", textColor: 90, fontSize: 8.5 } },
          { content: fmt(l3.total), styles: { fontStyle: "bold", halign: "right", textColor: 90, fontSize: 8.5 } },
        ]);
        for (const it of l3.items) {
          const label = it.specification
            ? `         ${it.description} · ${it.specification}`
            : `         ${it.description}`;
          body.push([
            { content: label, styles: { fontSize: 8, textColor: 60 } },
            { content: fmt(it.amount), styles: { halign: "right", fontSize: 8, textColor: 60 } },
          ]);
        }
      }
    }
  }

  autoTable(doc, {
    startY: y,
    head: [[
      { content: "Categoria / Descrição", styles: { halign: "left" } },
      { content: "Valor (c/IVA)", styles: { halign: "right" } },
    ]],
    body,
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 1.5 },
    headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: pageWidth - margin * 2 - 35 },
      1: { cellWidth: 35, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  // Grand total
  const finalY = (doc as any).lastAutoTable?.finalY ?? y;
  let totalY = finalY + 6;
  if (totalY > doc.internal.pageSize.getHeight() - 20) {
    doc.addPage();
    totalY = margin;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setFillColor(20, 20, 20);
  doc.setTextColor(255);
  doc.rect(margin, totalY, pageWidth - margin * 2, 9, "F");
  doc.text("Total previsto (despesas, c/IVA)", margin + 3, totalY + 6);
  doc.text(fmt(input.totalExpense), pageWidth - margin - 3, totalY + 6, { align: "right" });
  doc.setTextColor(0);

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages?.() ?? 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth - margin,
      doc.internal.pageSize.getHeight() - 6,
      { align: "right" },
    );
    doc.setTextColor(0);
  }

  const safeName = input.eventName.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
  const datePart = input.eventDate ? input.eventDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
  doc.save(`BP_${safeName}_${datePart}.pdf`);
}
