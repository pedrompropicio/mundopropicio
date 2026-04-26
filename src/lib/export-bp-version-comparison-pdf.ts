import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import type { DiffRow, DiffSummary } from "@/lib/bp-version-diff";
import { buildCategoryLookup, type CategoryLookup, type CategoryNode } from "@/lib/category-hierarchy";

interface ExportInput {
  eventName: string;
  versionALabel: string; // "v2 (Pessimista 12k)"
  versionBLabel: string; // "v3 (Ativa)"
  rows: DiffRow[];
  summary: DiffSummary;
  categories: CategoryNode[];
  showOnlyDifferences: boolean;
}

export function exportBPVersionComparisonPDF(input: ExportInput): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const lookup = buildCategoryLookup(input.categories);

  // Header
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Comparação BP — ${input.eventName}`, 40, 40);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${input.versionALabel}  vs  ${input.versionBLabel}`, 40, 58);
  doc.text(
    `Gerado a ${format(new Date(), "d MMM yyyy 'às' HH:mm", { locale: pt })}`,
    40,
    72
  );

  // Summary line
  const totalDeltaTxt = `${input.summary.totalDelta >= 0 ? "+" : ""}${formatCurrency(input.summary.totalDelta)}`;
  doc.setFont("helvetica", "bold");
  doc.text(
    `Δ total: ${totalDeltaTxt}   |   Adicionadas: ${input.summary.addedCount}   |   Modificadas: ${input.summary.modifiedCount}   |   Removidas: ${input.summary.removedCount}`,
    40,
    92
  );

  // Group rows
  const grouped = groupByL2(input.rows, lookup);
  const visibleGroups = input.showOnlyDifferences
    ? grouped.filter((g) => g.rows.some((r) => r.status !== "unchanged"))
    : grouped;

  const body: (string | number)[][] = [];
  for (const group of visibleGroups) {
    body.push([
      { content: group.groupName, colSpan: 6, styles: { fontStyle: "bold", fillColor: [240, 240, 245] } } as any,
    ]);
    const visibleRows = input.showOnlyDifferences
      ? group.rows.filter((r) => r.status !== "unchanged")
      : group.rows;
    for (const r of visibleRows) {
      body.push([
        statusLabel(r.status),
        r.type === "income" ? "Receita" : "Despesa",
        r.description,
        r.baseAmount == null ? "—" : formatCurrency(r.baseAmount),
        r.compareAmount == null ? "—" : formatCurrency(r.compareAmount),
        formatDelta(r),
      ]);
    }
  }

  autoTable(doc, {
    startY: 110,
    head: [["", "Tipo", "Descrição", input.versionALabel, input.versionBLabel, "Δ"]],
    body,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [60, 60, 80], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 50 },
      2: { cellWidth: 220 },
      3: { cellWidth: 90, halign: "right" },
      4: { cellWidth: 90, halign: "right" },
      5: { cellWidth: 80, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const raw = data.row.raw as any[];
      if (raw && raw[0]?.colSpan) return; // group header row
      const status = (raw?.[0] ?? "").toString().toLowerCase();
      if (status.includes("adic")) data.cell.styles.fillColor = [220, 245, 220];
      else if (status.includes("remov")) data.cell.styles.fillColor = [250, 220, 220];
      else if (status.includes("modif")) data.cell.styles.fillColor = [255, 245, 210];
    },
  });

  doc.save(`comparacao-bp-${input.eventName}-${input.versionALabel}-vs-${input.versionBLabel}.pdf`);
}

function statusLabel(s: DiffRow["status"]): string {
  if (s === "added") return "Adicionada";
  if (s === "removed") return "Removida";
  if (s === "modified") return "Modificada";
  return "—";
}

function formatDelta(r: DiffRow): string {
  if (r.status === "unchanged") return "—";
  const v = r.delta;
  const sign = v >= 0 ? "+" : "";
  return `${sign}${formatCurrency(v)}`;
}

interface GroupedRows {
  groupCode: string;
  groupName: string;
  rows: DiffRow[];
}

function groupByL2(rows: DiffRow[], lookup: Record<string, CategoryLookup>): GroupedRows[] {
  const map = new Map<string, GroupedRows>();
  for (const r of rows) {
    const cat = r.category_id ? lookup[r.category_id] : null;
    const key = cat?.groupCode ?? "_sem_categoria";
    const name = cat?.groupName ?? "Sem categoria";
    if (!map.has(key)) map.set(key, { groupCode: key, groupName: name, rows: [] });
    map.get(key)!.rows.push(r);
  }
  return Array.from(map.values()).sort((a, b) => a.groupCode.localeCompare(b.groupCode));
}
