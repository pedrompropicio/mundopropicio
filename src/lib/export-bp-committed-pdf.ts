/**
 * CAMADA DE DESENHO do documento de fecho com os sócios (jsPDF).
 *
 * Distinto do `export-event-bp-pdf.ts` (relatório de conferência com auditoria).
 * Aqui desenha-se uma tabela hierárquica L1 > L2 > L3 > linha de BP com 7 colunas,
 * onde cada linha já mostra o valor COMPROMETIDO (previsto + quota do excedido).
 *
 * Toda a montagem de números vive em `bp-closing-data.ts`. Este ficheiro só
 * desenha. Cada bloco é uma SECÇÃO: `drawExpenseSection` devolve a posição
 * vertical onde parou, para que a fase 2 possa acrescentar por baixo o bloco de
 * receitas e o de apuração sem reescrever nada disto.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchExportBranding, type ExportBranding } from "@/lib/export-header";
import { formatDatePT } from "@/lib/utils";
import {
  buildClosingReportData,
  fetchCommittedBpBundle,
  type ClosingReportData,
  type CommittedBpBundle,
  type OutRow,
  type ReportSection,
} from "@/lib/bp-closing-data";

export { fetchCommittedBpBundle, buildCommittedRows, distributeExcess } from "@/lib/bp-closing-data";
export type { CommittedBpBundle } from "@/lib/bp-closing-data";

export const SYSTEM_NAME = "MP Gestão Eventos";

const nf = (n: number) =>
  Number(n || 0).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
    // força separador de milhares também em 4 dígitos (pt-PT omite por defeito)
    minimumIntegerDigits: 1,
  }).replace(/^(\d)(\d{3})(,|$)/, "$1 $2$3");

// ─── Secções ──────────────────────────────────────────────────────────────────

/** Cabeçalho do documento. Devolve o Y onde a primeira secção pode começar. */
function drawHeader(doc: jsPDF, branding: ExportBranding, bundle: CommittedBpBundle): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 10;
  let y = 14;

  if (branding.logoDataUrl) {
    try {
      const fmt = branding.logoDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      const w = 46;
      doc.addImage(branding.logoDataUrl, fmt as any, pageWidth - 10 - w, y - 4, w, w * 0.205);
    } catch { /* logo opcional */ }
  }

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(bundle.event.name, left, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const place = [bundle.event.venueName, bundle.event.cityName || bundle.event.location].filter(Boolean).join(" · ");
  const lines = [
    "Business Plan — visão previsto + excedido",
    [formatDatePT(bundle.event.date), place].filter(Boolean).join(" · "),
    `${SYSTEM_NAME}${branding.displayName && branding.displayName !== SYSTEM_NAME ? ` · ${branding.displayName}` : ""} · Gerado em ${new Date().toLocaleString("pt-PT")}`,
  ];
  for (const l of lines) {
    doc.text(l, left, y);
    y += 4.6;
  }
  doc.setTextColor(0, 0, 0);
  return y + 3;
}

/** Rodapé repetido em cada página. */
function drawPageFooter(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(130, 130, 130);
  const page = (doc as any).internal.getCurrentPageInfo().pageNumber;
  doc.text(SYSTEM_NAME, 10, pageHeight - 7);
  doc.text(`Página ${page}`, pageWidth - 10, pageHeight - 7, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

/**
 * Desenha a árvore de despesas a partir de `startY`.
 * Devolve o Y final, para se poder acrescentar outra secção por baixo.
 */
export function drawExpenseSection(doc: jsPDF, section: ReportSection, startY: number): number {
  const rows: OutRow[] = section.rows;

  const body = rows.map((r) => [
    r.code,
    r.kind === "line" ? `    ${r.label}` : r.label,
    r.orderer,
    r.docs > 0 ? `${r.docs} ${r.docs === 1 ? "Anexo" : "Anexos"}` : "",
    nf(r.base),
    nf(r.iva),
    nf(r.total),
  ]);

  autoTable(doc, {
    startY,
    head: [["Código", "Descrição", "Ordenador", "Anexos", "Valor s/IVA", "IVA", "Total c/IVA"]],
    body,
    theme: "plain",
    styles: { fontSize: 7.5, cellPadding: { top: 1.2, right: 2, bottom: 1.2, left: 2 }, textColor: [20, 20, 20], lineWidth: 0 },
    headStyles: { fontStyle: "bold", fontSize: 7.5, fillColor: [31, 41, 55], textColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 116 },
      2: { cellWidth: 38 },
      3: { cellWidth: 22 },
      4: { cellWidth: 28, halign: "right" },
      5: { cellWidth: 22, halign: "right" },
      6: { cellWidth: 31, halign: "right" },
    },
    margin: { left: 10, right: 10, bottom: 14 },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const r = rows[data.row.index];
      if (!r) return;
      if (r.kind === "l1") {
        data.cell.styles.fillColor = [31, 41, 55];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
      } else if (r.kind === "l2") {
        data.cell.styles.fillColor = [190, 195, 202];
        data.cell.styles.fontStyle = "bold";
      } else if (r.kind === "l3") {
        data.cell.styles.fillColor = [228, 231, 235];
        data.cell.styles.fontStyle = "bold";
      } else if (r.kind === "total") {
        data.cell.styles.fillColor = [17, 24, 39];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 8.5;
      } else if (data.row.index % 2 === 1) {
        data.cell.styles.fillColor = [249, 250, 251];
      }
    },
    didDrawPage: () => drawPageFooter(doc),
  });

  return ((doc as any).lastAutoTable?.finalY ?? startY) + 6;
}

// ─── Documento ────────────────────────────────────────────────────────────────

/** Constrói o documento (testável fora do browser). */
export function buildCommittedBpDoc(bundle: CommittedBpBundle, branding: ExportBranding): jsPDF {
  const data: ClosingReportData = buildClosingReportData(bundle);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  let y = drawHeader(doc, branding, bundle);
  y = drawExpenseSection(doc, data.expenses, y);
  // FASE 2: aqui entram `drawRevenueSection(doc, data.revenues, y)` e
  // `drawApuracaoSection(doc, data.apuracao, y)`.

  return doc;
}

export function committedBpFileName(eventName: string): string {
  const safe = eventName.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");
  return `BP-previsto-excedido-${safe}.pdf`;
}

export async function exportCommittedBpToPDF(opts: { eventId: string; includeChildren?: boolean }) {
  const bundle = await fetchCommittedBpBundle(opts.eventId, opts.includeChildren ?? true);
  const branding = await fetchExportBranding();
  const doc = buildCommittedBpDoc(bundle, branding);
  doc.save(committedBpFileName(bundle.event.name));
}
