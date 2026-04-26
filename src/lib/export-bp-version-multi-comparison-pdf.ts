import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import type { MultiDiffResult } from "@/lib/bp-version-multi-diff";

interface ExportInput {
  eventName: string;
  result: MultiDiffResult;
  showOnlyDifferences: boolean;
}

export function exportBPMultiVersionComparisonPDF(input: ExportInput): void {
  const { eventName, result, showOnlyDifferences } = input;
  const { summary, groups } = result;
  const versions = summary.versions;

  // Wider page when more versions are compared.
  const orientation = versions.length >= 3 ? "landscape" : "landscape";
  const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });

  // Header
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(`Comparação BP — ${eventName}`, 40, 40);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(versions.map((v) => v.label).join("  ·  "), 40, 56);
  doc.text(
    `Gerado a ${format(new Date(), "d MMM yyyy 'às' HH:mm", { locale: pt })}`,
    40,
    70
  );

  // Summary block — totals per version
  let cursorY = 90;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Totais por versão", 40, cursorY);
  cursorY += 6;

  autoTable(doc, {
    startY: cursorY,
    head: [["Métrica", ...versions.map((v) => v.label)]],
    body: [
      ["Receitas", ...summary.income.map((n) => formatCurrency(n))],
      ["Despesas", ...summary.expense.map((n) => formatCurrency(n))],
      ["Resultado", ...summary.result.map((n) => formatCurrency(n))],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [60, 60, 80], textColor: 255 },
    columnStyles: Object.fromEntries(
      versions.map((_, i) => [i + 1, { halign: "right" }])
    ) as any,
  });

  cursorY = (doc as any).lastAutoTable.finalY + 16;

  // Detailed rows
  const visibleGroups = showOnlyDifferences
    ? groups
        .map((g) => ({ ...g, rows: g.rows.filter((r) => r.hasDifferences) }))
        .filter((g) => g.rows.length > 0)
    : groups;

  const body: (string | number | { content: string; colSpan?: number; styles?: any })[][] = [];
  for (const g of visibleGroups) {
    body.push([
      {
        content: g.groupName,
        colSpan: 2 + versions.length,
        styles: { fontStyle: "bold", fillColor: [240, 240, 245] },
      } as any,
    ]);
    for (const r of g.rows) {
      body.push([
        r.type === "income" ? "Rec." : "Desp.",
        r.description,
        ...r.cells.map((c) => (c.amount == null ? "—" : formatCurrency(c.amount))),
      ]);
    }
    // Sub-total row per group
    body.push([
      { content: "", styles: { fillColor: [250, 250, 252] } } as any,
      {
        content: "Subtotal",
        styles: { fontStyle: "bold", fillColor: [250, 250, 252], halign: "right" },
      } as any,
      ...g.totalsBase.map(
        (t) =>
          ({
            content: formatCurrency(t),
            styles: { fontStyle: "bold", fillColor: [250, 250, 252], halign: "right" },
          }) as any
      ),
    ]);
  }

  autoTable(doc, {
    startY: cursorY,
    head: [["Tipo", "Descrição", ...versions.map((v) => v.label)]],
    body,
    styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [60, 60, 80], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 200 },
      ...Object.fromEntries(
        versions.map((_, i) => [i + 2, { halign: "right", cellWidth: 80 }])
      ),
    } as any,
  });

  doc.save(
    `comparacao-bp-${eventName}-${versions.map((v) => v.label).join("-vs-")}.pdf`
  );
}
