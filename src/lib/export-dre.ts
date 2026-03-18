import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrency } from "@/lib/mock-data";

type TicketRevenueSource = "transactions" | "ticket_sales";

interface DRELine {
  label: string;
  amountExIva: number;
  ivaAmount: number;
  amountIncIva: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  indent?: boolean;
}

function calcAmountWithIva(amount: number, ivaRate: number): number {
  return amount * (1 + ivaRate / 100);
}

function buildDREForExport(
  transactions: any[],
  categories: any[],
  ticketRevenueSource: TicketRevenueSource,
  ticketZones: any[],
  ticketLots: any[],
  ticketSales: any[],
  eventId: string,
  ticketCategoryId: string | null
): DRELine[] {
  const catMap = Object.fromEntries(categories.map((c: any) => [c.id, c.name]));

  const useTicketSales = ticketRevenueSource === "ticket_sales";
  const eventZones = ticketZones.filter((z: any) => z.event_id === eventId);
  const hasTicketMgmt = eventZones.length > 0;

  let incomes = transactions.filter((t) => t.type === "income");
  let ticketIncomeExIva = 0;
  let ticketIncomeIncIva = 0;

  if (useTicketSales && hasTicketMgmt && ticketCategoryId) {
    incomes = incomes.filter((t) => t.category_id !== ticketCategoryId);
    const eventLotIds = ticketLots
      .filter((l: any) => eventZones.some((z: any) => z.id === l.zone_id))
      .map((l: any) => l.id);
    const eventTicketSalesData = ticketSales.filter((s: any) => eventLotIds.includes(s.lot_id));
    ticketIncomeExIva = eventTicketSalesData.reduce((sum: number, s: any) => sum + Number(s.quantity) * Number(s.unit_price), 0);
    ticketIncomeIncIva = calcAmountWithIva(ticketIncomeExIva, 23);
  }

  const expenses = transactions.filter((t) => t.type === "expense");

  const aggregate = (txs: any[]) => {
    const byCat: Record<string, { exIva: number; iva: number; incIva: number }> = {};
    txs.forEach((t) => {
      const name = catMap[t.category_id] ?? "Sem categoria";
      const amt = Number(t.amount);
      const iva = Number(t.iva_rate ?? 23);
      const withIva = calcAmountWithIva(amt, iva);
      if (!byCat[name]) byCat[name] = { exIva: 0, iva: 0, incIva: 0 };
      byCat[name].exIva += amt;
      byCat[name].iva += withIva - amt;
      byCat[name].incIva += withIva;
    });
    return byCat;
  };

  const incByCat = aggregate(incomes);
  const expByCat = aggregate(expenses);

  if (useTicketSales && hasTicketMgmt && ticketIncomeExIva > 0) {
    const ticketLabel = "Venda de Bilhetes (Gestão)";
    incByCat[ticketLabel] = {
      exIva: ticketIncomeExIva,
      iva: ticketIncomeIncIva - ticketIncomeExIva,
      incIva: ticketIncomeIncIva,
    };
  }

  const totalIncEx = Object.values(incByCat).reduce((s, v) => s + v.exIva, 0);
  const totalIncInc = Object.values(incByCat).reduce((s, v) => s + v.incIva, 0);
  const totalExpEx = expenses.reduce((s, t) => s + Number(t.amount), 0);
  const totalExpInc = expenses.reduce((s, t) => s + calcAmountWithIva(Number(t.amount), Number(t.iva_rate ?? 23)), 0);

  const lines: DRELine[] = [];
  lines.push({ label: "RECEITAS", amountExIva: totalIncEx, ivaAmount: totalIncInc - totalIncEx, amountIncIva: totalIncInc, isTotal: true });
  Object.entries(incByCat).sort((a, b) => b[1].exIva - a[1].exIva)
    .forEach(([name, val]) => lines.push({ label: name, amountExIva: val.exIva, ivaAmount: val.iva, amountIncIva: val.incIva, indent: true }));
  lines.push({ label: "DESPESAS", amountExIva: totalExpEx, ivaAmount: totalExpInc - totalExpEx, amountIncIva: totalExpInc, isTotal: true });
  Object.entries(expByCat).sort((a, b) => b[1].exIva - a[1].exIva)
    .forEach(([name, val]) => lines.push({ label: name, amountExIva: val.exIva, ivaAmount: val.iva, amountIncIva: val.incIva, indent: true }));
  const resEx = totalIncEx - totalExpEx;
  const resInc = totalIncInc - totalExpInc;
  lines.push({ label: "RESULTADO LÍQUIDO", amountExIva: resEx, ivaAmount: resInc - resEx, amountIncIva: resInc, isGrandTotal: true });

  return lines;
}

// Helper to compute event-level summary with ticket source logic
function computeEventSummary(
  evtTx: any[],
  categories: any[],
  ticketRevenueSource: TicketRevenueSource,
  ticketZones: any[],
  ticketLots: any[],
  ticketSales: any[],
  eventId: string,
  ticketCategoryId: string | null
) {
  const dre = buildDREForExport(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, eventId, ticketCategoryId);
  const rev = dre.find((l) => l.label === "RECEITAS");
  const exp = dre.find((l) => l.label === "DESPESAS");
  return {
    incEx: rev?.amountExIva ?? 0,
    incInc: rev?.amountIncIva ?? 0,
    expEx: exp?.amountExIva ?? 0,
    expInc: exp?.amountIncIva ?? 0,
  };
}

export function exportDREToExcel(
  events: any[],
  transactions: any[],
  categories: any[],
  ticketRevenueSource: TicketRevenueSource = "transactions",
  ticketZones: any[] = [],
  ticketLots: any[] = [],
  ticketSales: any[] = [],
  ticketCategoryId: string | null = null
) {
  const wb = XLSX.utils.book_new();

  const summaryRows: any[][] = [
    ["RELATÓRIO DRE - RESUMO GERAL"],
    [`Fonte de receita de bilhetes: ${ticketRevenueSource === "ticket_sales" ? "Vendas da gestão de bilhetes" : "Transações registadas"}`],
    [],
    ["Evento", "Transações", "Receitas S/IVA", "IVA Receitas", "Receitas C/IVA", "Despesas S/IVA", "IVA Despesas", "Despesas C/IVA", "Resultado S/IVA", "Resultado C/IVA"],
  ];

  let gIncEx = 0, gIncInc = 0, gExpEx = 0, gExpInc = 0;

  events.forEach((evt) => {
    const evtTx = transactions.filter((t: any) => t.event_id === evt.id);
    const summary = computeEventSummary(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, evt.id, ticketCategoryId);
    gIncEx += summary.incEx; gIncInc += summary.incInc; gExpEx += summary.expEx; gExpInc += summary.expInc;

    summaryRows.push([evt.name, evtTx.length, summary.incEx, summary.incInc - summary.incEx, summary.incInc, summary.expEx, summary.expInc - summary.expEx, summary.expInc, summary.incEx - summary.expEx, summary.incInc - summary.expInc]);
  });

  summaryRows.push([]);
  summaryRows.push(["TOTAL", "", gIncEx, gIncInc - gIncEx, gIncInc, gExpEx, gExpInc - gExpEx, gExpInc, gIncEx - gExpEx, gIncInc - gExpInc]);

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Resumo");

  events.forEach((evt) => {
    const evtTx = transactions.filter((t: any) => t.event_id === evt.id);
    const dre = buildDREForExport(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, evt.id, ticketCategoryId);
    if (evtTx.length === 0 && dre.length <= 3) return;
    const rows: any[][] = [
      [`DRE - ${evt.name}`],
      [],
      ["Rubrica", "Valor S/IVA (€)", "IVA (€)", "Valor C/IVA (€)"],
    ];
    dre.forEach((line) => {
      rows.push([line.indent ? `  ${line.label}` : line.label, line.amountExIva, line.ivaAmount, line.amountIncIva]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    const sheetName = evt.name.substring(0, 31).replace(/[\\/*?[\]:]/g, "");
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, `DRE_Relatorio_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportDREToPDF(
  events: any[],
  transactions: any[],
  categories: any[],
  ticketRevenueSource: TicketRevenueSource = "transactions",
  ticketZones: any[] = [],
  ticketLots: any[] = [],
  ticketSales: any[] = [],
  ticketCategoryId: string | null = null
) {
  const doc = new jsPDF({ orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = 14;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let y = 14;

  const colWidths = [contentWidth * 0.40, contentWidth * 0.20, contentWidth * 0.20, contentWidth * 0.20];
  const colX = [marginLeft, marginLeft + colWidths[0], marginLeft + colWidths[0] + colWidths[1], marginLeft + colWidths[0] + colWidths[1] + colWidths[2]];

  function checkNewPage(needed: number) {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      y = 14;
    }
  }

  function drawTableHeader() {
    doc.setFillColor(30, 30, 40);
    doc.rect(marginLeft, y, contentWidth, 8, "F");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("Rubrica", colX[0] + 2, y + 5.5);
    doc.text("S/ IVA (€)", colX[1] + colWidths[1] - 2, y + 5.5, { align: "right" });
    doc.text("IVA (€)", colX[2] + colWidths[2] - 2, y + 5.5, { align: "right" });
    doc.text("C/ IVA (€)", colX[3] + colWidths[3] - 2, y + 5.5, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  function fmtVal(v: number): string {
    return v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  // Logo
  try {
    doc.addImage(logoHorizontal, "PNG", marginLeft, y, 78, 22);
    y += 28;
  } catch {
    y += 4;
  }

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Relatório DRE", marginLeft, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-PT")}`, marginLeft, y);
  y += 5;
  const sourceLabel = ticketRevenueSource === "ticket_sales"
    ? "Receita de bilhetes: Vendas da gestão de bilhetes"
    : "Receita de bilhetes: Transações registadas";
  doc.text(sourceLabel, marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 10;

  // Global summary
  let gIncEx = 0, gIncInc = 0, gExpEx = 0, gExpInc = 0;
  events.forEach((evt) => {
    const evtTx = transactions.filter((t: any) => t.event_id === evt.id);
    const summary = computeEventSummary(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, evt.id, ticketCategoryId);
    gIncEx += summary.incEx; gIncInc += summary.incInc; gExpEx += summary.expEx; gExpInc += summary.expInc;
  });

  doc.setFillColor(245, 245, 250);
  doc.roundedRect(marginLeft, y, contentWidth, 20, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  const thirdW = contentWidth / 3;
  doc.setTextColor(34, 139, 34);
  doc.text("Total Receitas", marginLeft + 4, y + 6);
  doc.setFontSize(11);
  doc.text(fmtVal(gIncEx), marginLeft + 4, y + 14);
  doc.setFontSize(8);
  doc.setTextColor(200, 120, 0);
  doc.text("Total Despesas", marginLeft + thirdW + 4, y + 6);
  doc.setFontSize(11);
  doc.text(fmtVal(gExpEx), marginLeft + thirdW + 4, y + 14);
  doc.setFontSize(8);
  const resColor = gIncEx - gExpEx >= 0 ? [34, 139, 34] : [200, 50, 50];
  doc.setTextColor(resColor[0], resColor[1], resColor[2]);
  doc.text("Resultado Líquido", marginLeft + thirdW * 2 + 4, y + 6);
  doc.setFontSize(11);
  doc.text(fmtVal(gIncEx - gExpEx), marginLeft + thirdW * 2 + 4, y + 14);
  doc.setTextColor(0, 0, 0);
  y += 26;

  // Per-event DRE
  events.forEach((evt, evtIdx) => {
    const evtTx = transactions.filter((t: any) => t.event_id === evt.id);
    const dre = buildDREForExport(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, evt.id, ticketCategoryId);
    if (evtTx.length === 0 && dre.length <= 3) return;

    if (evtIdx > 0 || y > 60) {
      doc.addPage();
      y = 14;
    }

    try {
      doc.addImage(logoHorizontal, "PNG", marginLeft, y, 60, 17);
      y += 22;
    } catch {
      y += 4;
    }

    doc.setFillColor(60, 60, 80);
    doc.roundedRect(marginLeft, y, contentWidth, 10, 1, 1, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(`DRE — ${evt.name}`, marginLeft + 4, y + 7);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${evtTx.length} transações`, pageWidth - marginRight - 4, y + 7, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 14;

    drawTableHeader();

    dre.forEach((line) => {
      checkNewPage(8);
      const rowH = 7;

      if (line.isGrandTotal) {
        doc.setFillColor(230, 240, 255);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
      } else if (line.isTotal) {
        doc.setFillColor(240, 240, 245);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
      }

      const label = line.indent ? `    ${line.label}` : line.label;
      doc.text(label, colX[0] + 2, y + 4);
      doc.text(fmtVal(Math.abs(line.amountExIva)), colX[1] + colWidths[1] - 2, y + 4, { align: "right" });
      doc.text(fmtVal(Math.abs(line.ivaAmount)), colX[2] + colWidths[2] - 2, y + 4, { align: "right" });
      doc.text(fmtVal(Math.abs(line.amountIncIva)), colX[3] + colWidths[3] - 2, y + 4, { align: "right" });

      y += rowH;
    });

    y += 8;
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Mundo Propício - Relatório DRE`, marginLeft, pageHeight - 8);
    doc.text(`Página ${p}/${totalPages}`, pageWidth - marginRight, pageHeight - 8, { align: "right" });
  }

  doc.save(`DRE_Relatorio_${new Date().toISOString().slice(0, 10)}.pdf`);
}
