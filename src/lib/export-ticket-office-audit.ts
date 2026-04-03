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
  eventId?: string;
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
  viewMode: "synthetic" | "analytical",
  groupBy?: "type" | "event"
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
    // Analytical - structured by event
    analyticalData.forEach((office) => {
      const rows: any[][] = [
        [`AUDITORIA — ${office.officeName}`],
        [`Gerado em ${new Date().toLocaleDateString("pt-PT")} — Vista: ${groupBy === "event" ? "Por Evento" : "Por Categoria"}`],
        [],
      ];

      const eventLines = office.lines.filter((l) => l.type !== "transfer");
      const transferLines = office.lines.filter((l) => l.type === "transfer");

      // Group by event
      const byEvent: Record<string, AnalyticalLine[]> = {};
      eventLines.forEach((l) => {
        const evKey = l.eventName || "Sem evento";
        if (!byEvent[evKey]) byEvent[evKey] = [];
        byEvent[evKey].push(l);
      });

      Object.entries(byEvent).forEach(([evName, evLines]) => {
        const sales = evLines.filter((l) => l.type === "sale" || l.type === "income");
        const expenses = evLines.filter((l) => l.type === "expense");
        const salesTotal = sales.reduce((s, l) => s + Math.abs(l.amount), 0);
        const expTotal = expenses.reduce((s, l) => s + Math.abs(l.amount), 0);

        rows.push([`EVENTO: ${evName}`, "", "", "Vendas", salesTotal, "Despesas", expTotal]);
        rows.push(["Data", "Tipo", "Descrição", "Valor (€)"]);

        evLines.forEach((line) => {
          rows.push([
            line.date,
            typeLabel(line.type),
            line.description,
            line.amount > 0 ? line.amount : -Math.abs(line.amount),
          ]);
        });
        rows.push([]);
      });

      // Transfers
      if (transferLines.length > 0) {
        const transferTotal = transferLines.reduce((s, l) => s + Math.abs(l.amount), 0);
        rows.push([`ADIANTAMENTOS / TRANSFERÊNCIAS`, "", "", "Total", transferTotal]);
        rows.push(["Data", "Descrição", "", "Valor (€)"]);
        transferLines.forEach((line) => {
          rows.push([line.date, line.description, "", Math.abs(line.amount)]);
        });
        rows.push([]);
      }

      rows.push(["SALDO PREVISTO", "", "", office.expectedBalance]);

      const sheetName = office.officeName.substring(0, 31);
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 40 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
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
  viewMode: "synthetic" | "analytical",
  groupBy?: "type" | "event"
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
  const viewLabel = viewMode === "synthetic" ? "Sintético" : `Analítico (${groupBy === "event" ? "Por Evento" : "Por Categoria"})`;
  doc.text(`Vista: ${viewLabel} — Gerado em ${new Date().toLocaleDateString("pt-PT")}`, ml, y);
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
    renderSyntheticPDF(doc, syntheticData, ml, cw, pageHeight, y, checkPage);
  } else {
    renderAnalyticalPDF(doc, analyticalData, ml, cw, pageHeight, y, checkPage);
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
  ml: number, cw: number,
  pageHeight: number,
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

// ─── Analytical PDF (hierarchical: events > sales/expenses + transfers) ───
function renderAnalyticalPDF(
  doc: jsPDF,
  data: AnalyticalOffice[],
  ml: number, cw: number,
  _pageHeight: number,
  startY: number,
  checkPage: (n: number) => boolean
) {
  let y = startY;

  // Line detail columns
  const lineColW = [cw * 0.12, cw * 0.60, cw * 0.14, cw * 0.14];
  const lineColX = [ml];
  for (let i = 1; i < 4; i++) lineColX.push(lineColX[i - 1] + lineColW[i - 1]);

  function drawLineHeader(label: string) {
    doc.setFillColor(50, 50, 60);
    doc.rect(ml + 8, y, cw - 8, 7, "F");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("Data", lineColX[0] + 10, y + 4.5);
    doc.text("Descrição", lineColX[1] + 2, y + 4.5);
    doc.text("Valor (€)", lineColX[2] + lineColW[2] - 2, y + 4.5, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 8;
  }

  data.forEach((office, idx) => {
    if (idx > 0) {
      doc.addPage();
      y = 14;
    }

    // Office title bar
    doc.setFillColor(30, 30, 40);
    doc.rect(ml, y, cw, 9, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(office.officeName, ml + 4, y + 6.5);

    // Office balance on the right
    const obc = office.expectedBalance >= 0 ? [100, 220, 100] : [255, 120, 120];
    doc.setTextColor(obc[0], obc[1], obc[2]);
    doc.setFontSize(9);
    doc.text(`Saldo: ${fmtVal(office.expectedBalance)}`, ml + cw - 4, y + 6.5, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 12;

    // Separate lines by type
    const eventLines = office.lines.filter((l) => l.type !== "transfer");
    const transferLines = office.lines.filter((l) => l.type === "transfer");

    // Group event lines by event
    const byEvent: Record<string, { sales: AnalyticalLine[]; expenses: AnalyticalLine[] }> = {};
    eventLines.forEach((l) => {
      const evKey = l.eventName || "Sem evento";
      if (!byEvent[evKey]) byEvent[evKey] = { sales: [], expenses: [] };
      if (l.type === "sale" || l.type === "income") byEvent[evKey].sales.push(l);
      else if (l.type === "expense") byEvent[evKey].expenses.push(l);
    });

    // Render each event
    Object.entries(byEvent).forEach(([evName, evData]) => {
      const salesTotal = evData.sales.reduce((s, l) => s + Math.abs(l.amount), 0);
      const expTotal = evData.expenses.reduce((s, l) => s + Math.abs(l.amount), 0);
      const evBalance = salesTotal - expTotal;

      // Event header
      if (checkPage(18)) { y = 14; }
      doc.setFillColor(240, 242, 248);
      doc.rect(ml, y, cw, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(30, 30, 40);
      doc.text(evName, ml + 4, y + 5.5);

      // Event summary on right
      doc.setFontSize(7);
      doc.setTextColor(34, 139, 34);
      doc.text(fmtVal(salesTotal), ml + cw - 90, y + 5.5, { align: "right" });
      doc.setTextColor(200, 120, 0);
      doc.text(fmtVal(expTotal), ml + cw - 50, y + 5.5, { align: "right" });
      const evbc = evBalance >= 0 ? [34, 139, 34] : [200, 50, 50];
      doc.setTextColor(evbc[0], evbc[1], evbc[2]);
      doc.text(fmtVal(evBalance), ml + cw - 4, y + 5.5, { align: "right" });
      doc.setTextColor(0, 0, 0);
      y += 10;

      // Sub-sections: Sales and Expenses
      const subSections = [
        { label: "Bilhetes Vendidos", lines: evData.sales, color: [34, 139, 34] as number[] },
        { label: "Despesas e Custos", lines: evData.expenses, color: [200, 120, 0] as number[] },
      ];

      subSections.forEach((sub) => {
        if (sub.lines.length === 0) return;
        const subTotal = sub.lines.reduce((s, l) => s + Math.abs(l.amount), 0);

        // Sub-section header
        if (checkPage(10)) { y = 14; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(sub.color[0], sub.color[1], sub.color[2]);
        doc.text(`  ${sub.label} (${sub.lines.length})`, ml + 4, y + 4);
        doc.text(fmtVal(subTotal), ml + cw - 4, y + 4, { align: "right" });
        doc.setTextColor(0, 0, 0);
        y += 6;

        // Line items
        sub.lines.forEach((line) => {
          if (checkPage(6)) { y = 14; }
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.text(fmtDate(line.date), ml + 12, y + 3.5);
          doc.text(line.description.substring(0, 55), ml + 38, y + 3.5);
          doc.setTextColor(sub.color[0], sub.color[1], sub.color[2]);
          doc.text(fmtVal(Math.abs(line.amount)), ml + cw - 4, y + 3.5, { align: "right" });
          doc.setTextColor(0, 0, 0);
          y += 5.5;
        });

        y += 2;
      });

      y += 2;
    });

    // Transfers section
    if (transferLines.length > 0) {
      const transferTotal = transferLines.reduce((s, l) => s + Math.abs(l.amount), 0);

      if (checkPage(14)) { y = 14; }
      doc.setFillColor(240, 242, 248);
      doc.rect(ml, y, cw, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text("Adiantamentos / Transferências", ml + 4, y + 5.5);
      doc.text(fmtVal(transferTotal), ml + cw - 4, y + 5.5, { align: "right" });
      doc.setTextColor(0, 0, 0);
      y += 10;

      transferLines.forEach((line) => {
        if (checkPage(6)) { y = 14; }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.text(fmtDate(line.date), ml + 12, y + 3.5);
        doc.text(line.description.substring(0, 55), ml + 38, y + 3.5);
        doc.setTextColor(100, 100, 100);
        doc.text(fmtVal(Math.abs(line.amount)), ml + cw - 4, y + 3.5, { align: "right" });
        doc.setTextColor(0, 0, 0);
        y += 5.5;
      });

      y += 4;
    }

    // Office balance footer
    if (checkPage(10)) { y = 14; }
    doc.setFillColor(230, 240, 255);
    doc.rect(ml, y, cw, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("SALDO PREVISTO", ml + 4, y + 5.5);
    const fbc = office.expectedBalance >= 0 ? [34, 139, 34] : [200, 50, 50];
    doc.setTextColor(fbc[0], fbc[1], fbc[2]);
    doc.text(fmtVal(office.expectedBalance), ml + cw - 4, y + 5.5, { align: "right" });
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
