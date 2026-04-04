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

interface TicketOfficeAuditPDFOptions {
  viewMode: "synthetic" | "analytical";
  groupBy?: "type" | "event";
  detailLevel?: 2 | 3;
}

// Shared mutable cursor type for PDF y-position
interface Cursor { y: number; }

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
        [`Gerado em ${new Date().toLocaleDateString("pt-PT")} — Vista: ${groupBy === "event" ? "Por Evento" : "Por Categoria"}`],
        [],
      ];

      const transferLines = office.lines.filter((l) => l.type === "transfer");
      const eventLines = office.lines.filter((l) => l.type !== "transfer");

      const byEvent: Record<string, { sales: AnalyticalLine[]; expenses: AnalyticalLine[] }> = {};
      eventLines.forEach((l) => {
        const evKey = l.eventName || "Sem evento";
        if (!byEvent[evKey]) byEvent[evKey] = { sales: [], expenses: [] };
        if (l.type === "sale" || l.type === "income") byEvent[evKey].sales.push(l);
        else if (l.type === "expense") byEvent[evKey].expenses.push(l);
      });

      Object.entries(byEvent).forEach(([evName, evData]) => {
        const salesTotal = evData.sales.reduce((s, l) => s + Math.abs(l.amount), 0);
        const expTotal = evData.expenses.reduce((s, l) => s + Math.abs(l.amount), 0);

        rows.push([`EVENTO: ${evName}`, "", "", "Vendas", salesTotal, "Despesas", expTotal]);

        if (evData.sales.length > 0) {
          rows.push([`  Bilhetes Vendidos (${evData.sales.length})`, "", "", salesTotal]);
          rows.push(["    Data", "    Descrição", "", "    Valor (€)"]);
          evData.sales.forEach((line) => {
            rows.push([`    ${fmtDate(line.date)}`, `    ${line.description}`, "", Math.abs(line.amount)]);
          });
        }

        if (evData.expenses.length > 0) {
          rows.push([`  Despesas e Custos (${evData.expenses.length})`, "", "", expTotal]);
          rows.push(["    Data", "    Descrição", "", "    Valor (€)"]);
          evData.expenses.forEach((line) => {
            rows.push([`    ${fmtDate(line.date)}`, `    ${line.description}`, "", Math.abs(line.amount)]);
          });
        }

        rows.push([]);
      });

      if (transferLines.length > 0) {
        const transferTotal = transferLines.reduce((s, l) => s + Math.abs(l.amount), 0);
        rows.push([`ADIANTAMENTOS / TRANSFERÊNCIAS (${transferLines.length})`, "", "", "Total", transferTotal]);
        rows.push(["  Data", "  Descrição", "", "  Valor (€)"]);
        transferLines.forEach((line) => {
          rows.push([`  ${fmtDate(line.date)}`, `  ${line.description}`, "", Math.abs(line.amount)]);
        });
        rows.push([]);
      }

      rows.push(["SALDO PREVISTO", "", "", office.expectedBalance]);

      const sheetName = office.officeName.substring(0, 31);
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 14 }, { wch: 40 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
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
  options: TicketOfficeAuditPDFOptions
) {
  const { viewMode, groupBy, detailLevel = 3 } = options;
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const ml = 14;
  const mr = 14;
  const cw = pageWidth - ml - mr;

  // Shared mutable cursor — all functions read/write cursor.y
  const cursor: Cursor = { y: 14 };

  function checkPage(needed: number) {
    if (cursor.y + needed > pageHeight - 20) {
      doc.addPage();
      cursor.y = 14;
      return true;
    }
    return false;
  }

  try {
    doc.addImage(logoHorizontal, "PNG", ml, cursor.y, 60, 17);
    cursor.y += 22;
  } catch {
    cursor.y += 4;
  }

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Auditoria de Bilheteiras", ml, cursor.y);
  cursor.y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const analyticalLabel = `${detailLevel}º Nível${groupBy ? ` — ${groupBy === "event" ? "Por Evento" : "Por Categoria"}` : ""}`;
  const viewLabel = viewMode === "synthetic" ? "Sintético" : `Analítico (${analyticalLabel})`;
  doc.text(`Vista: ${viewLabel} — Gerado em ${new Date().toLocaleDateString("pt-PT")}`, ml, cursor.y);
  doc.setTextColor(0, 0, 0);
  cursor.y += 8;

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
  doc.roundedRect(ml, cursor.y, cw, 16, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  const qw = cw / 4;

  doc.setTextColor(100, 100, 100);
  doc.text("Vendas", ml + 4, cursor.y + 5);
  doc.setFontSize(10);
  doc.setTextColor(34, 139, 34);
  doc.text(fmtVal(grandTotals.sales), ml + 4, cursor.y + 12);

  doc.setFontSize(8);
  doc.setTextColor(200, 120, 0);
  doc.text("Despesas Diretas", ml + qw + 4, cursor.y + 5);
  doc.setFontSize(10);
  doc.text(fmtVal(grandTotals.expenses), ml + qw + 4, cursor.y + 12);

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("Transferências", ml + qw * 2 + 4, cursor.y + 5);
  doc.setFontSize(10);
  doc.text(fmtVal(grandTotals.transfers), ml + qw * 2 + 4, cursor.y + 12);

  doc.setFontSize(8);
  const balColor = grandTotals.balance >= 0 ? [34, 139, 34] : [200, 50, 50];
  doc.setTextColor(balColor[0], balColor[1], balColor[2]);
  doc.text("Saldo Previsto", ml + qw * 3 + 4, cursor.y + 5);
  doc.setFontSize(10);
  doc.text(fmtVal(grandTotals.balance), ml + qw * 3 + 4, cursor.y + 12);

  doc.setTextColor(0, 0, 0);
  cursor.y += 20;

  if (viewMode === "synthetic") {
    renderSyntheticPDF(doc, syntheticData, ml, cw, cursor, checkPage);
  } else {
    renderAnalyticalPDF(doc, analyticalData, ml, cw, cursor, checkPage, detailLevel);
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Mundo Propício - Auditoria de Bilheteiras", ml, pageHeight - 8);
    doc.text(`Página ${p}/${totalPages}`, pageWidth - mr, pageHeight - 8, { align: "right" });
  }

  const fileSuffix = viewMode === "synthetic" ? "Sintetico" : `Analitico_N${detailLevel}`;
  doc.save(`Auditoria_Bilheteiras_${fileSuffix}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Synthetic PDF ───
function renderSyntheticPDF(
  doc: jsPDF,
  data: SyntheticOffice[],
  ml: number, cw: number,
  c: Cursor,
  checkPage: (n: number) => boolean
) {
  const colW = [cw * 0.28, cw * 0.14, cw * 0.14, cw * 0.14, cw * 0.14, cw * 0.16];
  const colX = [ml];
  for (let i = 1; i < 6; i++) colX.push(colX[i - 1] + colW[i - 1]);

  function drawHeader() {
    doc.setFillColor(30, 30, 40);
    doc.rect(ml, c.y, cw, 8, "F");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("Bilheteira", colX[0] + 2, c.y + 5.5);
    doc.text("Vendas (€)", colX[1] + colW[1] - 2, c.y + 5.5, { align: "right" });
    doc.text("Desp. Diretas (€)", colX[2] + colW[2] - 2, c.y + 5.5, { align: "right" });
    doc.text("Transferências (€)", colX[3] + colW[3] - 2, c.y + 5.5, { align: "right" });
    doc.text("Saldo Previsto (€)", colX[4] + colW[4] - 2, c.y + 5.5, { align: "right" });
    doc.text("Estado", colX[5] + 2, c.y + 5.5);
    doc.setTextColor(0, 0, 0);
    c.y += 10;
  }

  drawHeader();

  data.forEach((office) => {
    if (checkPage(8)) { drawHeader(); }
    doc.setFillColor(240, 242, 248);
    doc.rect(ml, c.y - 1, cw, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(office.officeName, colX[0] + 2, c.y + 4);
    doc.setTextColor(34, 139, 34);
    doc.text(fmtVal(office.totalSales), colX[1] + colW[1] - 2, c.y + 4, { align: "right" });
    doc.setTextColor(200, 120, 0);
    doc.text(fmtVal(office.totalDirectExpenses), colX[2] + colW[2] - 2, c.y + 4, { align: "right" });
    doc.setTextColor(0, 0, 0);
    doc.text(fmtVal(office.totalTransfers), colX[3] + colW[3] - 2, c.y + 4, { align: "right" });
    const bc = office.expectedBalance >= 0 ? [34, 139, 34] : [200, 50, 50];
    doc.setTextColor(bc[0], bc[1], bc[2]);
    doc.text(fmtVal(office.expectedBalance), colX[4] + colW[4] - 2, c.y + 4, { align: "right" });
    doc.setTextColor(0, 0, 0);
    doc.text(`${office.events.length} evento(s)`, colX[5] + 2, c.y + 4);
    c.y += 8;

    office.events.forEach((ev) => {
      if (checkPage(7)) { drawHeader(); }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(`  ↳ ${ev.eventName.substring(0, 35)}`, colX[0] + 4, c.y + 4);
      doc.setTextColor(34, 139, 34);
      doc.text(fmtVal(ev.totalSales), colX[1] + colW[1] - 2, c.y + 4, { align: "right" });
      doc.setTextColor(200, 120, 0);
      doc.text(fmtVal(ev.totalExpenses), colX[2] + colW[2] - 2, c.y + 4, { align: "right" });
      doc.setTextColor(0, 0, 0);
      doc.text("—", colX[3] + colW[3] - 2, c.y + 4, { align: "right" });
      const ebc = ev.balance >= 0 ? [34, 139, 34] : [200, 50, 50];
      doc.setTextColor(ebc[0], ebc[1], ebc[2]);
      doc.text(fmtVal(ev.balance), colX[4] + colW[4] - 2, c.y + 4, { align: "right" });
      doc.setTextColor(0, 0, 0);
      doc.text(statusLabel(ev.eventStatus) + (ev.isConciliated ? " ✓" : ""), colX[5] + 2, c.y + 4);
      c.y += 7;
    });

    c.y += 2;
  });
}

// ─── Analytical PDF (configurable 2nd/3rd level) ───
function renderAnalyticalPDF(
  doc: jsPDF,
  data: AnalyticalOffice[],
  ml: number, cw: number,
  c: Cursor,
  checkPage: (n: number) => boolean,
  detailLevel: 2 | 3 = 3
) {
  const dateX = ml + 16;
  const descX = ml + 42;
  const valX = ml + cw - 4;

  function drawLineHeader() {
    doc.setFillColor(245, 245, 250);
    doc.rect(ml + 12, c.y, cw - 12, 6, "F");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text("Data", dateX, c.y + 4);
    doc.text("Descrição", descX, c.y + 4);
    doc.text("Valor (€)", valX, c.y + 4, { align: "right" });
    doc.setTextColor(0, 0, 0);
    c.y += 7;
  }

  data.forEach((office, idx) => {
    const drawOfficeHeader = (continued = false) => {
      const officeTitle = continued ? `${office.officeName} (continuação)` : office.officeName;
      doc.setFillColor(30, 30, 40);
      doc.rect(ml, c.y, cw, 9, "F");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(officeTitle, ml + 4, c.y + 6.5);
      const obc = office.expectedBalance >= 0 ? [100, 220, 100] : [255, 120, 120];
      doc.setTextColor(obc[0], obc[1], obc[2]);
      doc.setFontSize(9);
      doc.text(`Saldo: ${fmtVal(office.expectedBalance)}`, ml + cw - 4, c.y + 6.5, { align: "right" });
      doc.setTextColor(0, 0, 0);
      c.y += 12;
    };

    if (idx > 0) {
      doc.addPage();
      c.y = 14;
    }
    drawOfficeHeader();

    const transferLines = office.lines.filter((l) => l.type === "transfer");
    const eventLines = office.lines.filter((l) => l.type !== "transfer");

    const byEvent: Record<string, { sales: AnalyticalLine[]; expenses: AnalyticalLine[] }> = {};
    eventLines.forEach((l) => {
      const evKey = l.eventName || "Sem evento";
      if (!byEvent[evKey]) byEvent[evKey] = { sales: [], expenses: [] };
      if (l.type === "sale" || l.type === "income") byEvent[evKey].sales.push(l);
      else if (l.type === "expense") byEvent[evKey].expenses.push(l);
    });

    Object.entries(byEvent).forEach(([evName, evData]) => {
      const salesTotal = evData.sales.reduce((s, l) => s + Math.abs(l.amount), 0);
      const expTotal = evData.expenses.reduce((s, l) => s + Math.abs(l.amount), 0);
      const evBalance = salesTotal - expTotal;
      const evLineCount = evData.sales.length + evData.expenses.length;

      const drawEventHeader = () => {
        doc.setFillColor(240, 242, 248);
        doc.rect(ml, c.y, cw, 8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(30, 30, 40);
        doc.text(`${evName} (${evLineCount})`, ml + 4, c.y + 5.5);
        doc.setFontSize(7.5);
        doc.setTextColor(34, 139, 34);
        doc.text(fmtVal(salesTotal), ml + cw - 100, c.y + 5.5, { align: "right" });
        doc.setTextColor(200, 120, 0);
        doc.text(fmtVal(expTotal), ml + cw - 52, c.y + 5.5, { align: "right" });
        const evbc = evBalance >= 0 ? [34, 139, 34] : [200, 50, 50];
        doc.setTextColor(evbc[0], evbc[1], evbc[2]);
        doc.text(fmtVal(evBalance), ml + cw - 4, c.y + 5.5, { align: "right" });
        doc.setTextColor(0, 0, 0);
        c.y += 10;
      };

      if (checkPage(detailLevel === 3 ? 22 : 12)) {
        drawOfficeHeader(true);
      }
      drawEventHeader();

      const subSections = [
        { label: "Bilhetes Vendidos", lines: evData.sales, color: [34, 139, 34] as number[] },
        { label: "Despesas e Custos", lines: evData.expenses, color: [200, 120, 0] as number[] },
      ];

      subSections.forEach((sub) => {
        if (sub.lines.length === 0) return;
        const subTotal = sub.lines.reduce((s, l) => s + Math.abs(l.amount), 0);

        const drawSubHeader = () => {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(sub.color[0], sub.color[1], sub.color[2]);
          doc.text(`${sub.label} (${sub.lines.length})`, ml + 10, c.y + 4);
          doc.text(fmtVal(subTotal), ml + cw - 4, c.y + 4, { align: "right" });
          doc.setTextColor(0, 0, 0);
          c.y += 6;

          if (detailLevel === 3) {
            drawLineHeader();
          }
        };

        if (checkPage(detailLevel === 3 ? 16 : 8)) {
          drawOfficeHeader(true);
          drawEventHeader();
        }
        drawSubHeader();

        if (detailLevel === 3) {
          sub.lines.forEach((line) => {
            if (checkPage(6)) {
              drawOfficeHeader(true);
              drawEventHeader();
              drawSubHeader();
            }

            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.5);
            doc.text(fmtDate(line.date), dateX, c.y + 3.5);
            doc.text(line.description.substring(0, 60), descX, c.y + 3.5);
            doc.setTextColor(sub.color[0], sub.color[1], sub.color[2]);
            doc.text(fmtVal(Math.abs(line.amount)), valX, c.y + 3.5, { align: "right" });
            doc.setTextColor(0, 0, 0);
            c.y += 5.5;
          });
        }

        c.y += 3;
      });

      c.y += 2;
    });

    if (transferLines.length > 0) {
      const transferTotal = transferLines.reduce((s, l) => s + Math.abs(l.amount), 0);

      const drawTransferHeader = () => {
        doc.setFillColor(240, 242, 248);
        doc.rect(ml, c.y, cw, 8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Adiantamentos / Transferências (${transferLines.length})`, ml + 4, c.y + 5.5);
        doc.text(fmtVal(transferTotal), ml + cw - 4, c.y + 5.5, { align: "right" });
        doc.setTextColor(0, 0, 0);
        c.y += 10;

        if (detailLevel === 3) {
          drawLineHeader();
        }
      };

      if (checkPage(detailLevel === 3 ? 16 : 8)) {
        drawOfficeHeader(true);
      }
      drawTransferHeader();

      if (detailLevel === 3) {
        transferLines.forEach((line) => {
          if (checkPage(6)) {
            drawOfficeHeader(true);
            drawTransferHeader();
          }

          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.text(fmtDate(line.date), dateX, c.y + 3.5);
          doc.text(line.description.substring(0, 60), descX, c.y + 3.5);
          doc.setTextColor(100, 100, 100);
          doc.text(fmtVal(Math.abs(line.amount)), valX, c.y + 3.5, { align: "right" });
          doc.setTextColor(0, 0, 0);
          c.y += 5.5;
        });
      }

      c.y += 4;
    }

    if (checkPage(10)) {
      drawOfficeHeader(true);
    }
    doc.setFillColor(230, 240, 255);
    doc.rect(ml, c.y, cw, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("SALDO PREVISTO", ml + 4, c.y + 5.5);
    const fbc = office.expectedBalance >= 0 ? [34, 139, 34] : [200, 50, 50];
    doc.setTextColor(fbc[0], fbc[1], fbc[2]);
    doc.text(fmtVal(office.expectedBalance), ml + cw - 4, c.y + 5.5, { align: "right" });
    doc.setTextColor(0, 0, 0);
    c.y += 12;
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
