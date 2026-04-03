import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrency } from "@/lib/mock-data";
import { applyPTNumberFormat } from "@/lib/excel-format";

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-PT");
}

function fmtVal(v: number): string {
  return formatCurrency(v);
}

// ─── Types ───
interface SyntheticEvent {
  eventName: string;
  eventStatus: string;
  isConciliated: boolean;
  totalSales: number;
  totalExpenses: number;
  balance: number;
}

interface SyntheticOffice {
  officeName: string;
  totalSales: number;
  totalDirectExpenses: number;
  totalTransfers: number;
  expectedBalance: number;
  events: SyntheticEvent[];
}

interface AnalyticalLine {
  date: string;
  type: string;
  description: string;
  eventName: string;
  amount: number;
  runningBalance?: number;
}

interface AnalyticalOffice {
  officeName: string;
  expectedBalance: number;
  lines: AnalyticalLine[];
}

// ═══════════════════════════ EXCEL ═══════════════════════════

export function exportTicketOfficeAuditToExcel(
  syntheticData: SyntheticOffice[],
  analyticalData: AnalyticalOffice[],
  viewMode: "synthetic" | "analytical"
) {
  const wb = XLSX.utils.book_new();

  if (viewMode === "synthetic") {
    const rows: any[][] = [
      ["AUDITORIA DE BILHETEIRAS — Sintético"],
      [`Gerado em ${new Date().toLocaleDateString("pt-PT")}`],
      [],
      ["Bilheteira", "Vendas (€)", "Desp. Diretas (€)", "Transferências (€)", "Saldo Previsto (€)", "Eventos"],
    ];

    syntheticData.forEach((office) => {
      rows.push([
        office.officeName,
        office.totalSales,
        office.totalDirectExpenses,
        office.totalTransfers,
        office.expectedBalance,
        office.events.length,
      ]);

      office.events.forEach((ev) => {
        rows.push([
          `  ↳ ${ev.eventName}`,
          ev.totalSales,
          ev.totalExpenses,
          "",
          ev.balance,
          statusLabel(ev.eventStatus) + (ev.isConciliated ? " ✓" : ""),
        ]);
      });
    });

    // Grand totals
    const totals = syntheticData.reduce(
      (acc, d) => ({
        sales: acc.sales + d.totalSales,
        expenses: acc.expenses + d.totalDirectExpenses,
        transfers: acc.transfers + d.totalTransfers,
        balance: acc.balance + d.expectedBalance,
        events: acc.events + d.events.length,
      }),
      { sales: 0, expenses: 0, transfers: 0, balance: 0, events: 0 }
    );
    rows.push([]);
    rows.push(["TOTAL", totals.sales, totals.expenses, totals.transfers, totals.balance, totals.events]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 35 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 20 }];
    applyPTNumberFormat(ws);
    XLSX.utils.book_append_sheet(wb, ws, "Sintético");
  } else {
    analyticalData.forEach((office) => {
      const rows: any[][] = [
        [`AUDITORIA — ${office.officeName}`],
        [`Gerado em ${new Date().toLocaleDateString("pt-PT")}`],
        [],
        ["Data", "Tipo", "Descrição", "Evento", "Entrada (€)", "Saída (€)", "Saldo (€)"],
      ];

      office.lines.forEach((line) => {
        rows.push([
          line.date,
          typeLabel(line.type),
          line.description,
          line.eventName,
          line.amount > 0 ? line.amount : "",
          line.amount < 0 ? Math.abs(line.amount) : "",
          line.runningBalance ?? 0,
        ]);
      });

      const totalIn = office.lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
      const totalOut = Math.abs(office.lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0));
      rows.push([]);
      rows.push(["", "", "", "TOTAL", totalIn, totalOut, office.expectedBalance]);

      const sheetName = office.officeName.substring(0, 31);
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 25 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
      applyPTNumberFormat(ws);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
  }

  XLSX.writeFile(wb, `Auditoria_Bilheteiras_${viewMode === "synthetic" ? "Sintetico" : "Analitico"}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ═══════════════════════════ PDF ═══════════════════════════

export function exportTicketOfficeAuditToPDF(
  syntheticData: SyntheticOffice[],
  analyticalData: AnalyticalOffice[],
  viewMode: "synthetic" | "analytical"
) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const ml = 14;
  const mr = 14;
  const cw = pageWidth - ml - mr;
  let y = 14;

  function checkPage(needed: number) {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      y = 14;
      return true;
    }
    return false;
  }

  // Logo
  try {
    doc.addImage(logoHorizontal, "PNG", ml, y, 60, 17);
    y += 22;
  } catch { y += 4; }

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Auditoria de Bilheteiras", ml, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Vista: ${viewMode === "synthetic" ? "Sintético" : "Analítico"} — Gerado em ${new Date().toLocaleDateString("pt-PT")}`, ml, y);
  doc.setTextColor(0, 0, 0);
  y += 8;

  // Summary bar
  const grandTotals = syntheticData.reduce(
    (acc, d) => ({
      sales: acc.sales + d.totalSales,
      expenses: acc.expenses + d.totalDirectExpenses,
      transfers: acc.transfers + d.totalTransfers,
      balance: acc.balance + d.expectedBalance,
    }),
    { sales: 0, expenses: 0, transfers: 0, balance: 0 }
  );

  doc.setFillColor(245, 245, 250);
  doc.roundedRect(ml, y, cw, 16, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  const qw = cw / 4;

  doc.setTextColor(100, 100, 100);
  doc.text("Vendas", ml + 4, y + 5);
  doc.setFontSize(10);
  doc.setTextColor(34, 139, 34);
  doc.text(fmtVal(grandTotals.sales), ml + 4, y + 12);

  doc.setFontSize(8);
  doc.setTextColor(200, 120, 0);
  doc.text("Despesas Diretas", ml + qw + 4, y + 5);
  doc.setFontSize(10);
  doc.text(fmtVal(grandTotals.expenses), ml + qw + 4, y + 12);

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("Transferências", ml + qw * 2 + 4, y + 5);
  doc.setFontSize(10);
  doc.text(fmtVal(grandTotals.transfers), ml + qw * 2 + 4, y + 12);

  doc.setFontSize(8);
  const balColor = grandTotals.balance >= 0 ? [34, 139, 34] : [200, 50, 50];
  doc.setTextColor(balColor[0], balColor[1], balColor[2]);
  doc.text("Saldo Previsto", ml + qw * 3 + 4, y + 5);
  doc.setFontSize(10);
  doc.text(fmtVal(grandTotals.balance), ml + qw * 3 + 4, y + 12);

  doc.setTextColor(0, 0, 0);
  y += 20;

  if (viewMode === "synthetic") {
    renderSyntheticPDF(doc, syntheticData, ml, mr, cw, pageWidth, pageHeight, y, checkPage);
  } else {
    renderAnalyticalPDF(doc, analyticalData, ml, mr, cw, pageWidth, pageHeight, y, checkPage);
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Mundo Propício - Auditoria de Bilheteiras", ml, pageHeight - 8);
    doc.text(`Página ${p}/${totalPages}`, pageWidth - mr, pageHeight - 8, { align: "right" });
  }

  doc.save(`Auditoria_Bilheteiras_${viewMode === "synthetic" ? "Sintetico" : "Analitico"}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Synthetic PDF ───
function renderSyntheticPDF(
  doc: jsPDF,
  data: SyntheticOffice[],
  ml: number, mr: number, cw: number,
  _pageWidth: number, pageHeight: number,
  startY: number,
  checkPage: (n: number) => boolean
) {
  let y = startY;

  const colW = [cw * 0.28, cw * 0.14, cw * 0.14, cw * 0.14, cw * 0.14, cw * 0.16];
  const colX = [ml];
  for (let i = 1; i < 6; i++) colX.push(colX[i - 1] + colW[i - 1]);

  function drawHeader() {
    doc.setFillColor(30, 30, 40);
    doc.rect(ml, y, cw, 8, "F");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("Bilheteira", colX[0] + 2, y + 5.5);
    doc.text("Vendas (€)", colX[1] + colW[1] - 2, y + 5.5, { align: "right" });
    doc.text("Desp. Diretas (€)", colX[2] + colW[2] - 2, y + 5.5, { align: "right" });
    doc.text("Transferências (€)", colX[3] + colW[3] - 2, y + 5.5, { align: "right" });
    doc.text("Saldo Previsto (€)", colX[4] + colW[4] - 2, y + 5.5, { align: "right" });
    doc.text("Estado", colX[5] + 2, y + 5.5);
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  drawHeader();

  data.forEach((office) => {
    // Office row
    if (checkPage(8)) { y = 14; drawHeader(); }
    doc.setFillColor(240, 242, 248);
    doc.rect(ml, y - 1, cw, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(office.officeName, colX[0] + 2, y + 4);
    doc.setTextColor(34, 139, 34);
    doc.text(fmtVal(office.totalSales), colX[1] + colW[1] - 2, y + 4, { align: "right" });
    doc.setTextColor(200, 120, 0);
    doc.text(fmtVal(office.totalDirectExpenses), colX[2] + colW[2] - 2, y + 4, { align: "right" });
    doc.setTextColor(0, 0, 0);
    doc.text(fmtVal(office.totalTransfers), colX[3] + colW[3] - 2, y + 4, { align: "right" });
    const bc = office.expectedBalance >= 0 ? [34, 139, 34] : [200, 50, 50];
    doc.setTextColor(bc[0], bc[1], bc[2]);
    doc.text(fmtVal(office.expectedBalance), colX[4] + colW[4] - 2, y + 4, { align: "right" });
    doc.setTextColor(0, 0, 0);
    doc.text(`${office.events.length} evento(s)`, colX[5] + 2, y + 4);
    y += 8;

    // Event rows
    office.events.forEach((ev) => {
      if (checkPage(7)) { y = 14; drawHeader(); }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(`  ↳ ${ev.eventName.substring(0, 35)}`, colX[0] + 4, y + 4);
      doc.setTextColor(34, 139, 34);
      doc.text(fmtVal(ev.totalSales), colX[1] + colW[1] - 2, y + 4, { align: "right" });
      doc.setTextColor(200, 120, 0);
      doc.text(fmtVal(ev.totalExpenses), colX[2] + colW[2] - 2, y + 4, { align: "right" });
      doc.setTextColor(0, 0, 0);
      doc.text("—", colX[3] + colW[3] - 2, y + 4, { align: "right" });
      const ebc = ev.balance >= 0 ? [34, 139, 34] : [200, 50, 50];
      doc.setTextColor(ebc[0], ebc[1], ebc[2]);
      doc.text(fmtVal(ev.balance), colX[4] + colW[4] - 2, y + 4, { align: "right" });
      doc.setTextColor(0, 0, 0);
      doc.text(statusLabel(ev.eventStatus) + (ev.isConciliated ? " ✓" : ""), colX[5] + 2, y + 4);
      y += 7;
    });

    y += 2;
  });
}

// ─── Analytical PDF ───
function renderAnalyticalPDF(
  doc: jsPDF,
  data: AnalyticalOffice[],
  ml: number, mr: number, cw: number,
  _pageWidth: number, pageHeight: number,
  startY: number,
  checkPage: (n: number) => boolean
) {
  let y = startY;

  const colW = [cw * 0.09, cw * 0.10, cw * 0.28, cw * 0.19, cw * 0.11, cw * 0.11, cw * 0.12];
  const colX = [ml];
  for (let i = 1; i < 7; i++) colX.push(colX[i - 1] + colW[i - 1]);

  function drawTableHeader() {
    doc.setFillColor(30, 30, 40);
    doc.rect(ml, y, cw, 8, "F");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("Data", colX[0] + 2, y + 5.5);
    doc.text("Tipo", colX[1] + 2, y + 5.5);
    doc.text("Descrição", colX[2] + 2, y + 5.5);
    doc.text("Evento", colX[3] + 2, y + 5.5);
    doc.text("Entrada (€)", colX[4] + colW[4] - 2, y + 5.5, { align: "right" });
    doc.text("Saída (€)", colX[5] + colW[5] - 2, y + 5.5, { align: "right" });
    doc.text("Saldo (€)", colX[6] + colW[6] - 2, y + 5.5, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  data.forEach((office, idx) => {
    if (idx > 0) {
      doc.addPage();
      y = 14;
    }

    // Office title
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(office.officeName, ml, y + 4);
    y += 10;

    drawTableHeader();

    office.lines.forEach((line) => {
      if (checkPage(7)) { y = 14; drawTableHeader(); }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(fmtDate(line.date), colX[0] + 2, y + 4);
      doc.text(typeLabel(line.type), colX[1] + 2, y + 4);
      doc.text(line.description.substring(0, 45), colX[2] + 2, y + 4);
      doc.text(line.eventName.substring(0, 25), colX[3] + 2, y + 4);

      if (line.amount > 0) {
        doc.setTextColor(34, 139, 34);
        doc.text(fmtVal(line.amount), colX[4] + colW[4] - 2, y + 4, { align: "right" });
        doc.setTextColor(0, 0, 0);
        doc.text("—", colX[5] + colW[5] - 2, y + 4, { align: "right" });
      } else {
        doc.text("—", colX[4] + colW[4] - 2, y + 4, { align: "right" });
        doc.setTextColor(200, 120, 0);
        doc.text(fmtVal(Math.abs(line.amount)), colX[5] + colW[5] - 2, y + 4, { align: "right" });
        doc.setTextColor(0, 0, 0);
      }

      const rb = (line.runningBalance ?? 0);
      const rbc = rb >= 0 ? [34, 139, 34] : [200, 50, 50];
      doc.setTextColor(rbc[0], rbc[1], rbc[2]);
      doc.text(fmtVal(rb), colX[6] + colW[6] - 2, y + 4, { align: "right" });
      doc.setTextColor(0, 0, 0);
      y += 7;
    });

    // Totals row
    if (checkPage(10)) { y = 14; }
    const totalIn = office.lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const totalOut = Math.abs(office.lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0));

    doc.setFillColor(230, 240, 255);
    doc.rect(ml, y - 1, cw, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("TOTAL", colX[2] + 2, y + 5);
    doc.setTextColor(34, 139, 34);
    doc.text(fmtVal(totalIn), colX[4] + colW[4] - 2, y + 5, { align: "right" });
    doc.setTextColor(200, 120, 0);
    doc.text(fmtVal(totalOut), colX[5] + colW[5] - 2, y + 5, { align: "right" });
    const fbc = office.expectedBalance >= 0 ? [34, 139, 34] : [200, 50, 50];
    doc.setTextColor(fbc[0], fbc[1], fbc[2]);
    doc.text(fmtVal(office.expectedBalance), colX[6] + colW[6] - 2, y + 5, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 12;
  });
}

// ─── Helpers ───
function statusLabel(status: string) {
  switch (status) {
    case "completed": return "Finalizado";
    case "confirmed": return "Confirmado";
    case "cancelled": return "Cancelado";
    default: return "Planeamento";
  }
}

function typeLabel(type: string) {
  switch (type) {
    case "sale": return "Venda";
    case "expense": return "Despesa";
    case "transfer": return "Transferência";
    case "income": return "Receita";
    default: return type;
  }
}
