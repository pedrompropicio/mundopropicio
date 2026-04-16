import jsPDF from "jspdf";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";

// ─── Types ───
interface TransactionLine {
  description: string;
  specification: string | null;
  supplierName?: string;
  date: string;
  amount: number;
  iva_rate: number;
  status: string;
  isPartnerPaid?: boolean;
  partnerName?: string;
  is_reimbursement: boolean;
  reimbursementCode?: string;
  pl_override_note: string | null;
}

interface CategoryLine {
  categoryName: string;
  categoryCode: string;
  forecastAmount: number;
  actualAmount: number;
  transactions: TransactionLine[];
}

interface CategoryGroup {
  groupName: string;
  groupCode: string;
  categories: CategoryLine[];
  totalForecast: number;
  totalActual: number;
}

export interface BPTransactionsPDFData {
  eventName: string;
  eventDate: string;
  groupedData: CategoryGroup[];
  outOfBPTransactions: TransactionLine[];
  totalForecast: number;
  totalActual: number;
}

type ViewMode = "synthetic" | "analytical";

interface Cursor { y: number; }

function fmtDate(d: string) {
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return d; }
}

function fmtVal(v: number) { return formatCurrency(v); }

function varianceColor(variance: number): [number, number, number] {
  if (variance > 0) return [200, 50, 50];
  if (variance < 0) return [34, 139, 34];
  return [100, 100, 100];
}

function statusLabel(status: string) {
  if (status === "paid") return "Pago";
  if (status === "approved") return "A pagar";
  return status;
}

function tagLabel(t: TransactionLine): string {
  const tags: string[] = [];
  if (t.isPartnerPaid) tags.push("Sócio");
  if (t.is_reimbursement) tags.push(`Reembolso${t.reimbursementCode ? ` (${t.reimbursementCode})` : ""}`);
  if (t.pl_override_note) tags.push("Fora do BP");
  return tags.length > 0 ? ` [${tags.join(", ")}]` : "";
}

// ═══════════════════════════ MAIN ═══════════════════════════

export function exportBPTransactionsToPDF(data: BPTransactionsPDFData, viewMode: ViewMode) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 14;
  const mr = 14;
  const cw = pw - ml - mr;
  const cursor: Cursor = { y: 14 };

  function checkPage(needed: number) {
    if (cursor.y + needed > ph - 20) {
      doc.addPage();
      cursor.y = 14;
      return true;
    }
    return false;
  }

  // ─── Header ───
  try {
    doc.addImage(logoHorizontal, "PNG", ml, cursor.y, 60, 17);
    cursor.y += 22;
  } catch { cursor.y += 4; }

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("BP x Transações (Despesas)", ml, cursor.y);
  cursor.y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const modeLabel = viewMode === "synthetic" ? "Sintético" : "Analítico";
  doc.text(`Evento: ${data.eventName} — ${fmtDate(data.eventDate)} | Vista: ${modeLabel} | Gerado em ${new Date().toLocaleDateString("pt-PT")}`, ml, cursor.y);
  doc.setTextColor(0, 0, 0);
  cursor.y += 8;

  // ─── Summary bar ───
  const outBPTotal = data.outOfBPTransactions.reduce((s, t) => s + Number(t.amount), 0);
  const grandActual = data.totalActual + outBPTotal;
  const grandVariance = grandActual - data.totalForecast;

  doc.setFillColor(245, 245, 250);
  doc.roundedRect(ml, cursor.y, cw, 16, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  const qw = cw / 3;

  doc.setTextColor(100, 100, 100);
  doc.text("Previsto (s/IVA)", ml + 4, cursor.y + 5);
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 40);
  doc.text(fmtVal(data.totalForecast), ml + 4, cursor.y + 12);

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("Realizado (s/IVA)", ml + qw + 4, cursor.y + 5);
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 40);
  doc.text(fmtVal(grandActual), ml + qw + 4, cursor.y + 12);

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("Variação", ml + qw * 2 + 4, cursor.y + 5);
  doc.setFontSize(10);
  const vc = varianceColor(grandVariance);
  doc.setTextColor(vc[0], vc[1], vc[2]);
  doc.text((grandVariance > 0 ? "+" : "") + fmtVal(grandVariance), ml + qw * 2 + 4, cursor.y + 12);

  doc.setTextColor(0, 0, 0);
  cursor.y += 20;

  // ─── Table columns ───
  const colW = [cw * 0.36, cw * 0.18, cw * 0.10, cw * 0.12, cw * 0.12, cw * 0.12];
  const colX = [ml];
  for (let i = 1; i < 6; i++) colX.push(colX[i - 1] + colW[i - 1]);

  function drawTableHeader() {
    doc.setFillColor(30, 30, 40);
    doc.rect(ml, cursor.y, cw, 8, "F");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("Categoria / Transação", colX[0] + 2, cursor.y + 5.5);
    doc.text("Fornecedor", colX[1] + 2, cursor.y + 5.5);
    doc.text("Data", colX[2] + 2, cursor.y + 5.5);
    doc.text("Previsto (€)", colX[3] + colW[3] - 2, cursor.y + 5.5, { align: "right" });
    doc.text("Realizado (€)", colX[4] + colW[4] - 2, cursor.y + 5.5, { align: "right" });
    doc.text("Variação (€)", colX[5] + colW[5] - 2, cursor.y + 5.5, { align: "right" });
    doc.setTextColor(0, 0, 0);
    cursor.y += 10;
  }

  drawTableHeader();

  // ─── Render groups ───
  data.groupedData.forEach((group) => {
    if (checkPage(10)) drawTableHeader();

    // Group row
    doc.setFillColor(240, 242, 248);
    doc.rect(ml, cursor.y - 1, cw, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(`${group.groupCode} ${group.groupName}`, colX[0] + 2, cursor.y + 4);
    doc.text(fmtVal(group.totalForecast), colX[3] + colW[3] - 2, cursor.y + 4, { align: "right" });
    doc.text(fmtVal(group.totalActual), colX[4] + colW[4] - 2, cursor.y + 4, { align: "right" });
    const gv = group.totalActual - group.totalForecast;
    const gvc = varianceColor(gv);
    doc.setTextColor(gvc[0], gvc[1], gvc[2]);
    doc.text((gv > 0 ? "+" : "") + fmtVal(gv), colX[5] + colW[5] - 2, cursor.y + 4, { align: "right" });
    doc.setTextColor(0, 0, 0);
    cursor.y += 8;

    group.categories.forEach((cat) => {
      if (checkPage(8)) drawTableHeader();

      // Category row - show code and name separately
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      const codeText = cat.categoryCode ? `[${cat.categoryCode}]` : "";
      const nameText = cat.categoryName || "Sem categoria";
      const countText = cat.transactions.length > 0 ? ` (${cat.transactions.length})` : "";
      const catLabel = `  ${codeText} ${nameText}${countText}`;
      doc.text(catLabel.substring(0, 60), colX[0] + 4, cursor.y + 4);
      doc.setFont("helvetica", "normal");
      doc.text(fmtVal(cat.forecastAmount), colX[3] + colW[3] - 2, cursor.y + 4, { align: "right" });
      doc.text(fmtVal(cat.actualAmount), colX[4] + colW[4] - 2, cursor.y + 4, { align: "right" });
      const cv = cat.actualAmount - cat.forecastAmount;
      const cvc = varianceColor(cv);
      doc.setTextColor(cvc[0], cvc[1], cvc[2]);
      doc.text((cv > 0 ? "+" : "") + fmtVal(cv), colX[5] + colW[5] - 2, cursor.y + 4, { align: "right" });
      doc.setTextColor(0, 0, 0);
      cursor.y += 7;

      // Analytical: show individual transactions
      if (viewMode === "analytical" && cat.transactions.length > 0) {
        cat.transactions.forEach((t) => {
          if (checkPage(6)) drawTableHeader();
          renderTransactionLine(doc, t, colX, colW, cursor);
        });
        cursor.y += 1;
      }
    });

    cursor.y += 2;
  });

  // ─── Fora do BP ───
  if (data.outOfBPTransactions.length > 0) {
    if (checkPage(12)) drawTableHeader();

    doc.setFillColor(255, 248, 230);
    doc.rect(ml, cursor.y - 1, cw, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(180, 120, 0);
    doc.text(`⚠ Fora do BP (${data.outOfBPTransactions.length})`, colX[0] + 2, cursor.y + 4);
    doc.text(fmtVal(outBPTotal), colX[4] + colW[4] - 2, cursor.y + 4, { align: "right" });
    doc.setTextColor(0, 0, 0);
    cursor.y += 8;

    if (viewMode === "analytical") {
      data.outOfBPTransactions.forEach((t) => {
        if (checkPage(6)) drawTableHeader();
        renderTransactionLine(doc, t, colX, colW, cursor);
      });
    }
    cursor.y += 3;
  }

  // ─── Grand total ───
  if (checkPage(10)) drawTableHeader();
  doc.setFillColor(230, 235, 245);
  doc.rect(ml, cursor.y - 1, cw, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("TOTAL DESPESAS", colX[0] + 2, cursor.y + 5);
  doc.text(fmtVal(data.totalForecast), colX[3] + colW[3] - 2, cursor.y + 5, { align: "right" });
  doc.text(fmtVal(grandActual), colX[4] + colW[4] - 2, cursor.y + 5, { align: "right" });
  const ftvc = varianceColor(grandVariance);
  doc.setTextColor(ftvc[0], ftvc[1], ftvc[2]);
  doc.setFontSize(9);
  doc.text((grandVariance > 0 ? "+" : "") + fmtVal(grandVariance), colX[5] + colW[5] - 2, cursor.y + 5, { align: "right" });
  doc.setTextColor(0, 0, 0);

  // ─── Footer ───
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("MP Gestão Eventos - BP x Transações", ml, ph - 8);
    doc.text(`Página ${p}/${totalPages}`, pw - mr, ph - 8, { align: "right" });
  }

  const suffix = viewMode === "synthetic" ? "Sintetico" : "Analitico";
  doc.save(`BP_Transacoes_${suffix}_${data.eventName.replace(/\s+/g, "_").substring(0, 30)}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Transaction line renderer ───
function renderTransactionLine(
  doc: jsPDF,
  t: TransactionLine,
  colX: number[],
  colW: number[],
  c: Cursor
) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const desc = (t.description + (t.specification ? ` (${t.specification})` : "") + tagLabel(t)).substring(0, 60);
  doc.text(`    ${desc}`, colX[0] + 6, c.y + 3.5);
  doc.setTextColor(100, 100, 100);
  doc.text((t.supplierName ?? "—").substring(0, 25), colX[1] + 2, c.y + 3.5);
  doc.text(fmtDate(t.date), colX[2] + 2, c.y + 3.5);
  doc.setTextColor(0, 0, 0);
  doc.text(fmtVal(Number(t.amount)), colX[4] + colW[4] - 2, c.y + 3.5, { align: "right" });

  // Status badge
  doc.setFontSize(6);
  const sl = statusLabel(t.status);
  if (t.status === "paid") {
    doc.setTextColor(34, 139, 34);
  } else {
    doc.setTextColor(180, 120, 0);
  }
  doc.text(sl, colX[5] + colW[5] - 2, c.y + 3.5, { align: "right" });
  doc.setTextColor(0, 0, 0);
  c.y += 5.5;
}
