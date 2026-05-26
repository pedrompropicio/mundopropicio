import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { EtapaListRowData } from "@/components/operacao/list/EtapaListRow";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em curso",
  blocked: "Bloqueada",
  done: "Concluída",
  cancelled: "Cancelada",
};

const RESP_LABEL: Record<string, string> = {
  todos: "Todos",
  meus: "Meus",
  sem_responsavel: "Sem responsável",
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtRange(a?: string | null, b?: string | null, noDate?: boolean | null): string {
  if (noDate) return "Sem data";
  if (!a && !b) return "—";
  if (a && b) return `${fmtDate(a)} → ${fmtDate(b)}`;
  return fmtDate(a ?? b);
}
function fmtDateLong(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

export interface EtapasPdfFilters {
  date_preset?: string;
  date_from?: string;
  date_to?: string;
  status: string[];
  responsibility?: string;
  sort_by?: string;
  sort_dir?: string;
  frentes_labels?: string[]; // optional pre-resolved frente names
  event_label?: string | null;
}

export function exportEtapasListPdf(rows: EtapaListRowData[], filters: EtapasPdfFilters) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 32;
  let y = margin;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Etapas operacionais", margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-PT")}`, margin, y);
  y += 12;

  // Filters summary
  const parts: string[] = [];
  const preset = filters.date_preset ?? "all";
  if (preset === "today") parts.push("Período: Hoje");
  else if (preset === "range" && filters.date_from && filters.date_to) {
    parts.push(
      filters.date_from === filters.date_to
        ? `Período: ${fmtDateLong(filters.date_from)}`
        : `Período: ${fmtDateLong(filters.date_from)} → ${fmtDateLong(filters.date_to)}`
    );
  } else parts.push("Período: Todas");

  if (filters.event_label) parts.push(`Evento: ${filters.event_label}`);
  if (filters.status.length) parts.push(`Status: ${filters.status.map((s) => STATUS_LABEL[s] ?? s).join(", ")}`);
  if (filters.responsibility && filters.responsibility !== "todos") {
    parts.push(`Responsável: ${RESP_LABEL[filters.responsibility] ?? filters.responsibility}`);
  }
  if (filters.frentes_labels && filters.frentes_labels.length) {
    parts.push(`Frentes: ${filters.frentes_labels.join(", ")}`);
  }
  if (filters.sort_by) {
    parts.push(`Ordenação: ${filters.sort_by} ${filters.sort_dir === "desc" ? "↓" : "↑"}`);
  }

  const filtLines = doc.splitTextToSize(parts.join("  ·  "), pageW - margin * 2);
  doc.text(filtLines, margin, y);
  y += 11 * filtLines.length + 4;
  doc.setTextColor(0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`${rows.length} ${rows.length === 1 ? "etapa" : "etapas"}`, margin, y);
  y += 8;

  // Group by frente preserving order
  const groups: Array<{ name: string; event?: string | null; rows: EtapaListRowData[] }> = [];
  const idx = new Map<string, number>();
  for (const r of rows) {
    const key = r.frente ? `${r.frente.event?.id ?? ""}::${r.frente.id}` : "__no_frente__";
    let i = idx.get(key);
    if (i === undefined) {
      i = groups.length;
      idx.set(key, i);
      groups.push({
        name: r.frente?.name ?? "Sem frente",
        event: r.frente?.event?.name ?? null,
        rows: [],
      });
    }
    groups[i].rows.push(r);
  }

  for (const g of groups) {
    autoTable(doc, {
      startY: y + 4,
      head: [[
        `${g.name}${g.event ? `  ·  ${g.event}` : ""}  (${g.rows.length})`,
        "", "", "", "",
      ]],
      body: g.rows.map((e) => [
        e.name,
        STATUS_LABEL[e.status] ?? e.status,
        fmtRange(e.planned_start, e.planned_end, e.has_no_date),
        e.responsible?.full_name ?? "—",
        e.supplier?.name ?? "—",
      ]),
      columns: [
        { header: "Etapa" },
        { header: "Status" },
        { header: "Datas" },
        { header: "Responsável" },
        { header: "Fornecedor" },
      ],
      styles: { fontSize: 8.5, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, halign: "left" },
      columnStyles: {
        0: { cellWidth: 280 },
        1: { cellWidth: 70 },
        2: { cellWidth: 120 },
        3: { cellWidth: 130 },
        4: { cellWidth: 130 },
      },
      margin: { left: margin, right: margin },
      didDrawPage: () => {
        // page number footer
        const pageH = doc.internal.pageSize.getHeight();
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(
          `pág. ${doc.getCurrentPageInfo().pageNumber}`,
          pageW - margin,
          pageH - 14,
          { align: "right" }
        );
        doc.setTextColor(0);
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`etapas-${stamp}.pdf`);
}
