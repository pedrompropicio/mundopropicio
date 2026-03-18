import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrency } from "@/lib/mock-data";
import type { PLMode } from "@/components/ReportPL";

interface PLLine {
  label: string;
  forecast: number;
  actual: number;
  variance: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  indent?: boolean;
  subIndent?: boolean;
  isSubTotal?: boolean;
  quantity?: number;
  unitPrice?: number;
}

function buildPLForExport(
  forecasts: any[], transactions: any[], categories: any[],
  ticketZones: any[], ticketLots: any[], ticketSales: any[], eventId: string
): PLLine[] {
  const catMap = Object.fromEntries(categories.map((c: any) => [c.id, c.name]));

  const aggregate = (items: any[]) => {
    const byCat: Record<string, number> = {};
    items.forEach((item) => {
      const name = catMap[item.category_id] ?? "Sem categoria";
      byCat[name] = (byCat[name] ?? 0) + Number(item.amount);
    });
    return byCat;
  };

  // Calculate ticket lot revenue for this event
  const evtZones = ticketZones.filter((z: any) => z.event_id === eventId);
  let ticketForecastRevenue = 0;
  const ticketLines: PLLine[] = [];
  let totalTicketQty = 0;
  let totalTicketActualRevenue = 0;
  if (evtZones.length > 0) {
    evtZones.forEach((zone: any) => {
      const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
      let zoneRevenue = 0;
      let zoneQty = 0;
      let zoneActualRevenue = 0;
      zoneLots.forEach((lot: any) => {
        const lotRevenue = Number(lot.price) * Number(lot.quantity);
        const qty = Number(lot.quantity);
        ticketForecastRevenue += lotRevenue;
        zoneRevenue += lotRevenue;
        zoneQty += qty;
        const lotSales = ticketSales.filter((s: any) => s.lot_id === lot.id);
        const lotSoldRevenue = lotSales.reduce((s: number, sl: any) => s + Number(sl.quantity) * Number(sl.unit_price), 0);
        zoneActualRevenue += lotSoldRevenue;
        totalTicketActualRevenue += lotSoldRevenue;
        ticketLines.push({
          label: `${zone.name} — ${lot.name}`,
          forecast: lotRevenue, actual: lotSoldRevenue, variance: lotSoldRevenue - lotRevenue, subIndent: true,
          quantity: qty, unitPrice: Number(lot.price),
        });
      });
      totalTicketQty += zoneQty;
      ticketLines.push({
        label: `Subtotal ${zone.name}`,
        forecast: zoneRevenue, actual: zoneActualRevenue, variance: zoneActualRevenue - zoneRevenue, subIndent: true, isSubTotal: true,
        quantity: zoneQty,
      });
    });
    ticketLines.push({
      label: `Total Bilheteira`,
      forecast: ticketForecastRevenue, actual: totalTicketActualRevenue, variance: totalTicketActualRevenue - ticketForecastRevenue, subIndent: true, isSubTotal: true,
      quantity: totalTicketQty,
    });
  }

  const fInc = forecasts.filter((f) => f.type === "income");
  const fExp = forecasts.filter((f) => f.type === "expense");
  const tInc = transactions.filter((t) => t.type === "income");
  const tExp = transactions.filter((t) => t.type === "expense");

  const fIncByCat = aggregate(fInc);
  const fExpByCat = aggregate(fExp);
  const tIncByCat = aggregate(tInc);
  const tExpByCat = aggregate(tExp);

  // Add ticket lot revenue to Bilheteira category forecast
  if (ticketForecastRevenue > 0) {
    const bilheteiraKey = "Bilheteira";
    fIncByCat[bilheteiraKey] = (fIncByCat[bilheteiraKey] ?? 0) + ticketForecastRevenue;
  }

  const totalFInc = Object.values(fIncByCat).reduce((s, v) => s + v, 0);
  const totalFExp = fExp.reduce((s, f) => s + Number(f.amount), 0);
  const totalTInc = tInc.reduce((s, t) => s + Number(t.amount), 0);
  const totalTExp = tExp.reduce((s, t) => s + Number(t.amount), 0);

  const allIncCats = [...new Set([...Object.keys(fIncByCat), ...Object.keys(tIncByCat)])].sort();
  const allExpCats = [...new Set([...Object.keys(fExpByCat), ...Object.keys(tExpByCat)])].sort();

  const lines: PLLine[] = [];
  lines.push({ label: "RECEITAS", forecast: totalFInc, actual: totalTInc, variance: totalTInc - totalFInc, isTotal: true });
  allIncCats.forEach((cat) => {
    const f = fIncByCat[cat] ?? 0;
    const a = tIncByCat[cat] ?? 0;
    lines.push({ label: cat, forecast: f, actual: a, variance: a - f, indent: true });
    if (cat.toLowerCase().includes("bilhete") && ticketLines.length > 0) {
      ticketLines.forEach((tl) => lines.push(tl));
    }
  });
  lines.push({ label: "DESPESAS", forecast: totalFExp, actual: totalTExp, variance: totalTExp - totalFExp, isTotal: true });
  allExpCats.forEach((cat) => {
    const f = fExpByCat[cat] ?? 0;
    const a = tExpByCat[cat] ?? 0;
    lines.push({ label: cat, forecast: f, actual: a, variance: a - f, indent: true });
  });
  const fRes = totalFInc - totalFExp;
  const tRes = totalTInc - totalTExp;
  lines.push({ label: "RESULTADO LÍQUIDO", forecast: fRes, actual: tRes, variance: tRes - fRes, isGrandTotal: true });
  return lines;
}

export function exportPLToExcel(
  events: any[], forecasts: any[], transactions: any[], categories: any[],
  ticketZones: any[] = [], ticketLots: any[] = [], mode: PLMode = "comparison"
) {
  const wb = XLSX.utils.book_new();

  const isComparison = mode === "comparison";
  const summaryRows: any[][] = [
    [isComparison ? "RELATÓRIO P&L - PREVISÃO vs REALIZADO" : "RELATÓRIO P&L - PREVISÃO"],
    [],
    isComparison
      ? ["Evento", "Receita Prev.", "Receita Real", "Despesa Prev.", "Despesa Real", "Resultado Prev.", "Resultado Real", "Variação"]
      : ["Evento", "Receita Prev.", "Despesa Prev.", "Resultado Prev."],
  ];

  let gFInc = 0, gFExp = 0, gTInc = 0, gTExp = 0;

  events.forEach((evt) => {
    const evtF = forecasts.filter((f: any) => f.event_id === evt.id);
    const evtT = transactions.filter((t: any) => t.event_id === evt.id);
    let fInc = evtF.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const fExp = evtF.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const tInc = evtT.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const tExp = evtT.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const evtZones = ticketZones.filter((z: any) => z.event_id === evt.id);
    evtZones.forEach((zone: any) => {
      const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
      zoneLots.forEach((lot: any) => { fInc += Number(lot.price) * Number(lot.quantity); });
    });
    gFInc += fInc; gFExp += fExp; gTInc += tInc; gTExp += tExp;
    if (isComparison) {
      summaryRows.push([evt.name, fInc, tInc, fExp, tExp, fInc - fExp, tInc - tExp, (tInc - tExp) - (fInc - fExp)]);
    } else {
      summaryRows.push([evt.name, fInc, fExp, fInc - fExp]);
    }
  });

  summaryRows.push([]);
  if (isComparison) {
    summaryRows.push(["TOTAL", gFInc, gTInc, gFExp, gTExp, gFInc - gFExp, gTInc - gTExp, (gTInc - gTExp) - (gFInc - gFExp)]);
  } else {
    summaryRows.push(["TOTAL", gFInc, gFExp, gFInc - gFExp]);
  }

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs["!cols"] = isComparison
    ? [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
    : [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Resumo");

  events.forEach((evt) => {
    const evtF = forecasts.filter((f: any) => f.event_id === evt.id);
    const evtT = transactions.filter((t: any) => t.event_id === evt.id);
    if (evtF.length === 0 && evtT.length === 0) return;
    const pl = buildPLForExport(evtF, evtT, categories, ticketZones, ticketLots, evt.id);
    const rows: any[][] = [
      [`P&L - ${evt.name}`],
      [],
      isComparison
        ? ["Rubrica", "Qtd", "Preço Unit. (€)", "Previsto (€)", "Real (€)", "Variação (€)"]
        : ["Rubrica", "Qtd", "Preço Unit. (€)", "Previsto (€)"],
    ];
    pl.forEach((line) => {
      const prefix = line.subIndent ? "      " : line.indent ? "  " : "";
      if (isComparison) {
        rows.push([
          prefix + line.label,
          line.quantity != null ? line.quantity : "",
          line.unitPrice != null ? line.unitPrice : "",
          line.forecast,
          line.subIndent ? "" : line.actual,
          line.subIndent ? "" : line.variance,
        ]);
      } else {
        rows.push([
          prefix + line.label,
          line.quantity != null ? line.quantity : "",
          line.unitPrice != null ? line.unitPrice : "",
          line.forecast,
        ]);
      }
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = isComparison
      ? [{ wch: 35 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }]
      : [{ wch: 35 }, { wch: 10 }, { wch: 16 }, { wch: 18 }];
    const sheetName = evt.name.substring(0, 31).replace(/[\\/*?[\]:]/g, "");
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, `PL_Relatorio_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportPLToPDF(
  events: any[], forecasts: any[], transactions: any[], categories: any[],
  ticketZones: any[] = [], ticketLots: any[] = [], mode: PLMode = "comparison"
) {
  const doc = new jsPDF({ orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = 14;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let y = 14;
  const isComparison = mode === "comparison";

  const colWidths = isComparison
    ? [contentWidth * 0.28, contentWidth * 0.10, contentWidth * 0.14, contentWidth * 0.16, contentWidth * 0.16, contentWidth * 0.16]
    : [contentWidth * 0.40, contentWidth * 0.14, contentWidth * 0.20, contentWidth * 0.26];
  const colX = [marginLeft];
  for (let i = 1; i < colWidths.length; i++) colX.push(colX[i - 1] + colWidths[i - 1]);

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
    doc.text("Qtd", colX[1] + colWidths[1] - 2, y + 5.5, { align: "right" });
    doc.text("Preço Unit.", colX[2] + colWidths[2] - 2, y + 5.5, { align: "right" });
    doc.text("Previsto (€)", colX[3] + colWidths[3] - 2, y + 5.5, { align: "right" });
    if (isComparison) {
      doc.text("Real (€)", colX[4] + colWidths[4] - 2, y + 5.5, { align: "right" });
      doc.text("Variação (€)", colX[5] + colWidths[5] - 2, y + 5.5, { align: "right" });
    }
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  function fmtVal(v: number): string {
    return v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  // Logo + title
  try {
    doc.addImage(logoHorizontal, "PNG", marginLeft, y, 78, 22);
    y += 28;
  } catch {
    y += 4;
  }

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(isComparison ? "Relatório P&L — Previsão vs Realizado" : "Relatório P&L — Previsão", marginLeft, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-PT")}`, marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 10;

  // Per-event
  events.forEach((evt, evtIdx) => {
    const evtF = forecasts.filter((f: any) => f.event_id === evt.id);
    const evtT = transactions.filter((t: any) => t.event_id === evt.id);
    if (evtF.length === 0 && evtT.length === 0) return;

    const pl = buildPLForExport(evtF, evtT, categories, ticketZones, ticketLots, evt.id);

    // Each event on its own page (except first which follows the title)
    if (evtIdx > 0) {
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
    doc.text(`P&L — ${evt.name}`, marginLeft + 4, y + 7);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${evtF.length} previsões · ${evtT.length} transações`, pageWidth - marginRight - 4, y + 7, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 14;

    drawTableHeader();

    pl.forEach((line) => {
      checkNewPage(8);
      const rowH = line.subIndent ? 6 : 7;

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
      } else if (line.isSubTotal) {
        doc.setFillColor(242, 242, 248);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(80, 80, 80);
      } else if (line.subIndent) {
        doc.setFillColor(248, 248, 252);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
      }

      const label = line.subIndent ? `       ${line.label}` : line.indent ? `    ${line.label}` : line.label;
      doc.text(label, colX[0] + 2, y + 4);

      // Qtd & Preço Unit columns
      if (line.quantity != null) {
        doc.text(line.quantity.toLocaleString("pt-PT"), colX[1] + colWidths[1] - 2, y + 4, { align: "right" });
      }
      if (line.unitPrice != null) {
        doc.text(fmtVal(line.unitPrice), colX[2] + colWidths[2] - 2, y + 4, { align: "right" });
      }

      const showAbsForecast = !line.isGrandTotal;
      doc.text(fmtVal(showAbsForecast ? Math.abs(line.forecast) : line.forecast), colX[3] + colWidths[3] - 2, y + 4, { align: "right" });

      if (isComparison) {
        if (line.subIndent) {
          doc.text("—", colX[4] + colWidths[4] - 2, y + 4, { align: "right" });
          doc.text("—", colX[5] + colWidths[5] - 2, y + 4, { align: "right" });
        } else {
          const showAbsActual = !line.isGrandTotal;
          doc.text(fmtVal(showAbsActual ? Math.abs(line.actual) : line.actual), colX[4] + colWidths[4] - 2, y + 4, { align: "right" });
          const v = line.variance;
          if (line.isGrandTotal || line.isTotal) {
            doc.setTextColor(v >= 0 ? 34 : 200, v >= 0 ? 139 : 50, v >= 0 ? 34 : 50);
          }
          doc.text((v >= 0 ? "+" : "") + fmtVal(v), colX[5] + colWidths[5] - 2, y + 4, { align: "right" });
        }
      }
      doc.setTextColor(0, 0, 0);

      y += rowH;
    });

    y += 8;
  });

  // Global summary page at the end
  doc.addPage();
  y = 14;

  try {
    doc.addImage(logoHorizontal, "PNG", marginLeft, y, 60, 17);
    y += 22;
  } catch {
    y += 4;
  }

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Resumo Geral", marginLeft, y);
  y += 10;

  let gFInc = 0, gFExp = 0, gTInc = 0, gTExp = 0;
  events.forEach((evt) => {
    const evtF = forecasts.filter((f: any) => f.event_id === evt.id);
    const evtT = transactions.filter((t: any) => t.event_id === evt.id);
    let evtFInc = evtF.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const evtZones = ticketZones.filter((z: any) => z.event_id === evt.id);
    evtZones.forEach((zone: any) => {
      const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
      zoneLots.forEach((lot: any) => { evtFInc += Number(lot.price) * Number(lot.quantity); });
    });
    gFInc += evtFInc;
    gFExp += evtF.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
    gTInc += evtT.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    gTExp += evtT.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
  });

  // Summary table per event
  const numSumCols = isComparison ? 5 : 4;
  const sumColW = contentWidth / numSumCols;
  doc.setFillColor(30, 30, 40);
  doc.rect(marginLeft, y, contentWidth, 8, "F");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("Evento", marginLeft + 2, y + 5.5);
  doc.text("Receitas Prev.", marginLeft + sumColW * 2 - 2, y + 5.5, { align: "right" });
  doc.text("Despesas Prev.", marginLeft + sumColW * 3 - 2, y + 5.5, { align: "right" });
  doc.text("Resultado Prev.", marginLeft + sumColW * 4 - 2, y + 5.5, { align: "right" });
  if (isComparison) {
    doc.text("Resultado Real", marginLeft + sumColW * 5 - 2, y + 5.5, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);
  y += 10;

  events.forEach((evt) => {
    const evtF = forecasts.filter((f: any) => f.event_id === evt.id);
    const evtT = transactions.filter((t: any) => t.event_id === evt.id);
    let evtFInc = evtF.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const evtFExp = evtF.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const evtTInc = evtT.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const evtTExp = evtT.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const evtZones = ticketZones.filter((z: any) => z.event_id === evt.id);
    evtZones.forEach((zone: any) => {
      const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
      zoneLots.forEach((lot: any) => { evtFInc += Number(lot.price) * Number(lot.quantity); });
    });
    const fResult = evtFInc - evtFExp;
    const tResult = evtTInc - evtTExp;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(evt.name, marginLeft + 2, y + 4);
    doc.text(fmtVal(evtFInc), marginLeft + sumColW * 2 - 2, y + 4, { align: "right" });
    doc.text(fmtVal(evtFExp), marginLeft + sumColW * 3 - 2, y + 4, { align: "right" });
    doc.setTextColor(fResult >= 0 ? 34 : 200, fResult >= 0 ? 139 : 50, fResult >= 0 ? 34 : 50);
    doc.text(fmtVal(fResult), marginLeft + sumColW * 4 - 2, y + 4, { align: "right" });
    if (isComparison) {
      doc.setTextColor(tResult >= 0 ? 34 : 200, tResult >= 0 ? 139 : 50, tResult >= 0 ? 34 : 50);
      doc.text(fmtVal(tResult), marginLeft + sumColW * 5 - 2, y + 4, { align: "right" });
    }
    doc.setTextColor(0, 0, 0);
    y += 7;
  });

  // Totals row
  y += 2;
  doc.setFillColor(230, 240, 255);
  doc.rect(marginLeft, y - 1, contentWidth, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TOTAL", marginLeft + 2, y + 5);
  doc.text(fmtVal(gFInc), marginLeft + sumColW * 2 - 2, y + 5, { align: "right" });
  doc.text(fmtVal(gFExp), marginLeft + sumColW * 3 - 2, y + 5, { align: "right" });
  const gFRes = gFInc - gFExp;
  doc.setTextColor(gFRes >= 0 ? 34 : 200, gFRes >= 0 ? 139 : 50, gFRes >= 0 ? 34 : 50);
  doc.text(fmtVal(gFRes), marginLeft + sumColW * 4 - 2, y + 5, { align: "right" });
  if (isComparison) {
    const gTRes = gTInc - gTExp;
    doc.setTextColor(gTRes >= 0 ? 34 : 200, gTRes >= 0 ? 139 : 50, gTRes >= 0 ? 34 : 50);
    doc.text(fmtVal(gTRes), marginLeft + sumColW * 5 - 2, y + 5, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Mundo Propício - Relatório P&L", marginLeft, pageHeight - 8);
    doc.text(`Página ${p}/${totalPages}`, pageWidth - marginRight, pageHeight - 8, { align: "right" });
  }

  doc.save(`PL_Relatorio_${new Date().toISOString().slice(0, 10)}.pdf`);
}
