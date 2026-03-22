import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrency } from "@/lib/mock-data";
import { buildCategoryLookup, aggregateByHierarchyDRE } from "@/lib/category-hierarchy";

type TicketRevenueSource = "transactions" | "ticket_sales";

interface DRELine {
  label: string;
  amountExIva: number;
  ivaAmount: number;
  amountIncIva: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  isGroupHeader?: boolean;
  indent?: boolean;
  isDistribution?: boolean;
  isRetained?: boolean;
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
  ticketCategoryId: string | null,
  partners: any[] = [],
  events: any[] = []
): DRELine[] {
  const lookup = buildCategoryLookup(categories);

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

  const incGroups = aggregateByHierarchyDRE(incomes, lookup, calcAmountWithIva);
  const expGroups = aggregateByHierarchyDRE(expenses, lookup, calcAmountWithIva);

  if (useTicketSales && hasTicketMgmt && ticketIncomeExIva > 0) {
    incGroups.push({
      groupName: "Venda de Bilhetes (Gestão)",
      groupCode: "0.0",
      totalBase: ticketIncomeExIva,
      totalIva: ticketIncomeIncIva - ticketIncomeExIva,
      details: [{ name: "Venda de Bilhetes (Gestão)", code: "0.0.01", base: ticketIncomeExIva, iva: ticketIncomeIncIva - ticketIncomeExIva }],
    });
  }

  const totalIncEx = incGroups.reduce((s, g) => s + g.totalBase, 0);
  const totalIncIva = incGroups.reduce((s, g) => s + g.totalIva, 0);
  const totalIncInc = totalIncEx + totalIncIva;
  const totalExpEx = expGroups.reduce((s, g) => s + g.totalBase, 0);
  const totalExpIva = expGroups.reduce((s, g) => s + g.totalIva, 0);
  const totalExpInc = totalExpEx + totalExpIva;

  const lines: DRELine[] = [];
  lines.push({ label: "RECEITAS", amountExIva: totalIncEx, ivaAmount: totalIncIva, amountIncIva: totalIncInc, isTotal: true });
  incGroups.forEach((group) => {
    if (group.details.length > 1 || group.details[0]?.name !== group.groupName) {
      lines.push({ label: group.groupName, amountExIva: group.totalBase, ivaAmount: group.totalIva, amountIncIva: group.totalBase + group.totalIva, isGroupHeader: true });
      group.details.forEach((d) => lines.push({ label: d.name, amountExIva: d.base, ivaAmount: d.iva, amountIncIva: d.base + d.iva, indent: true }));
    } else {
      lines.push({ label: group.groupName, amountExIva: group.totalBase, ivaAmount: group.totalIva, amountIncIva: group.totalBase + group.totalIva, indent: true });
    }
  });

  lines.push({ label: "DESPESAS", amountExIva: totalExpEx, ivaAmount: totalExpIva, amountIncIva: totalExpInc, isTotal: true });
  expGroups.forEach((group) => {
    if (group.details.length > 1 || group.details[0]?.name !== group.groupName) {
      lines.push({ label: group.groupName, amountExIva: group.totalBase, ivaAmount: group.totalIva, amountIncIva: group.totalBase + group.totalIva, isGroupHeader: true });
      group.details.forEach((d) => lines.push({ label: d.name, amountExIva: d.base, ivaAmount: d.iva, amountIncIva: d.base + d.iva, indent: true }));
    } else {
      lines.push({ label: group.groupName, amountExIva: group.totalBase, ivaAmount: group.totalIva, amountIncIva: group.totalBase + group.totalIva, indent: true });
    }
  });

  const resEx = totalIncEx - totalExpEx;
  const resInc = totalIncInc - totalExpInc;
  lines.push({ label: "RESULTADO LÍQUIDO", amountExIva: resEx, ivaAmount: resInc - resEx, amountIncIva: resInc, isGrandTotal: true });

  // Partner distribution section — sub-events inherit from parent
  const eventData = events.find((e: any) => e.id === eventId);
  const parentEventId = eventData?.parent_event_id;
  const resolvedPartnerId = parentEventId || eventId;
  const eventPartners = partners.filter((p: any) => p.event_id === resolvedPartnerId);
  const parentData = parentEventId ? events.find((e: any) => e.id === parentEventId) : null;
  const calcBasis = parentData?.partner_calc_basis || eventData?.partner_calc_basis || "net_result";

  if (eventPartners.length > 0) {
    let totalDistribution = 0;
    eventPartners.forEach((p: any) => {
      let base: number;
      if (calcBasis === "gross_revenue") {
        base = totalIncEx;
      } else if (calcBasis === "net_result_gross_expenses") {
        base = totalIncEx - totalExpInc;
      } else {
        const expBase = p.expense_includes_iva ? totalExpInc : totalExpEx;
        base = totalIncEx - expBase;
      }
      const share = base * (Number(p.percentage) / 100);
      totalDistribution += share;
      const supplierName = p.suppliers?.name || "Sócio";
      lines.push({
        label: `  ${supplierName} (${Number(p.percentage).toFixed(1)}%)`,
        amountExIva: share,
        ivaAmount: 0,
        amountIncIva: share,
        isDistribution: true,
        indent: true,
      });
    });
    const retained = resEx - totalDistribution;
    lines.push({
      label: "RESULTADO MUNDO PROPÍCIO",
      amountExIva: retained,
      ivaAmount: 0,
      amountIncIva: retained,
      isRetained: true,
    });
  }

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
  ticketCategoryId: string | null,
  partners: any[] = [],
  events: any[] = []
) {
  const dre = buildDREForExport(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, eventId, ticketCategoryId, partners, events);
  const rev = dre.find((l) => l.label === "RECEITAS");
  const exp = dre.find((l) => l.label === "DESPESAS");
  const retained = dre.find((l) => l.isRetained);
  return {
    incEx: rev?.amountExIva ?? 0,
    incInc: rev?.amountIncIva ?? 0,
    expEx: exp?.amountExIva ?? 0,
    expInc: exp?.amountIncIva ?? 0,
    retainedEx: retained?.amountExIva ?? null,
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
  ticketCategoryId: string | null = null,
  partners: any[] = []
) {
  const wb = XLSX.utils.book_new();

  const summaryRows: any[][] = [
    ["RELATÓRIO DRE - RESUMO GERAL"],
    [`Fonte de receita de bilhetes: ${ticketRevenueSource === "ticket_sales" ? "Vendas da gestão de bilhetes" : "Transações registadas"}`],
    [],
    ["Evento", "Transações", "Receitas S/IVA", "IVA Receitas", "Receitas C/IVA", "Despesas S/IVA", "IVA Despesas", "Despesas C/IVA", "Resultado S/IVA", "Resultado C/IVA", "Resultado MP"],
  ];

  let gIncEx = 0, gIncInc = 0, gExpEx = 0, gExpInc = 0;

  events.forEach((evt) => {
    const evtTx = transactions.filter((t: any) => t.event_id === evt.id);
    const summary = computeEventSummary(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, evt.id, ticketCategoryId, partners, events);
    gIncEx += summary.incEx; gIncInc += summary.incInc; gExpEx += summary.expEx; gExpInc += summary.expInc;

    summaryRows.push([
      evt.name, evtTx.length, summary.incEx, summary.incInc - summary.incEx, summary.incInc,
      summary.expEx, summary.expInc - summary.expEx, summary.expInc,
      summary.incEx - summary.expEx, summary.incInc - summary.expInc,
      summary.retainedEx !== null ? summary.retainedEx : "",
    ]);
  });

  summaryRows.push([]);
  summaryRows.push(["TOTAL", "", gIncEx, gIncInc - gIncEx, gIncInc, gExpEx, gExpInc - gExpEx, gExpInc, gIncEx - gExpEx, gIncInc - gExpInc]);

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Resumo");

  events.forEach((evt) => {
    const evtTx = transactions.filter((t: any) => t.event_id === evt.id);
    const dre = buildDREForExport(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, evt.id, ticketCategoryId, partners, events);
    if (evtTx.length === 0 && dre.length <= 3) return;
    const rows: any[][] = [
      [`DRE - ${evt.name}`],
      [],
      ["Rubrica", "Valor S/IVA (€)", "IVA (€)", "Valor C/IVA (€)"],
    ];
    dre.forEach((line) => {
      const prefix = line.indent ? `    ` : line.isGroupHeader ? `  ` : '';
      rows.push([`${prefix}${line.label}`, line.amountExIva, line.ivaAmount, line.amountIncIva]);
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
  ticketCategoryId: string | null = null,
  partners: any[] = [],
  allEvents: any[] = []
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

  // Compute global summary totals
  let gIncEx = 0, gIncInc = 0, gExpEx = 0, gExpInc = 0;
  events.forEach((evt) => {
    const evtTx = transactions.filter((t: any) => t.event_id === evt.id);
    const summary = computeEventSummary(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, evt.id, ticketCategoryId, partners, events);
    gIncEx += summary.incEx; gIncInc += summary.incInc; gExpEx += summary.expEx; gExpInc += summary.expInc;
  });

  // Per-event DRE
  let isFirstEventPage = true;
  events.forEach((evt) => {
    const evtTx = transactions.filter((t: any) => t.event_id === evt.id);
    const dre = buildDREForExport(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, evt.id, ticketCategoryId, partners, events);
    if (evtTx.length === 0 && dre.length <= 3) return;

    if (!isFirstEventPage) {
      doc.addPage();
      y = 14;
    }
    isFirstEventPage = false;

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

      if (line.isRetained) {
        doc.setFillColor(220, 235, 255);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
      } else if (line.isDistribution) {
        doc.setFillColor(245, 248, 255);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
      } else if (line.isGrandTotal) {
        doc.setFillColor(230, 240, 255);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
      } else if (line.isTotal) {
        doc.setFillColor(240, 240, 245);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
      } else if (line.isGroupHeader) {
        doc.setFillColor(245, 245, 250);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
      }

      const label = line.indent ? `        ${line.label}` : line.isGroupHeader ? `  ${line.label}` : line.label;
      doc.text(label, colX[0] + 2, y + 4);
      doc.text(fmtVal(Math.abs(line.amountExIva)), colX[1] + colWidths[1] - 2, y + 4, { align: "right" });
      doc.text(fmtVal(Math.abs(line.ivaAmount)), colX[2] + colWidths[2] - 2, y + 4, { align: "right" });
      doc.text(fmtVal(Math.abs(line.amountIncIva)), colX[3] + colWidths[3] - 2, y + 4, { align: "right" });

      y += rowH;
    });

    y += 8;
  });

  // Global summary box at the end
  checkNewPage(30);
  y += 4;
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
