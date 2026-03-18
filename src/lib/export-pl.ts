import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrency } from "@/lib/mock-data";

interface PLLine {
  label: string;
  forecast: number;
  actual: number;
  variance: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  indent?: boolean;
  subIndent?: boolean;
}

function buildPLForExport(
  forecasts: any[], transactions: any[], categories: any[],
  ticketZones: any[], ticketLots: any[], eventId: string
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
  if (evtZones.length > 0) {
    evtZones.forEach((zone: any) => {
      const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
      zoneLots.forEach((lot: any) => {
        const lotRevenue = Number(lot.price) * Number(lot.quantity);
        ticketForecastRevenue += lotRevenue;
        ticketLines.push({
          label: `${zone.name} — ${lot.name} (${lot.quantity} × ${Number(lot.price).toFixed(2)}€)`,
          forecast: lotRevenue, actual: 0, variance: 0, subIndent: true,
        });
      });
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
  ticketZones: any[] = [], ticketLots: any[] = []
) {
  const wb = XLSX.utils.book_new();

  const summaryRows: any[][] = [
    ["RELATÓRIO P&L - PREVISÃO vs REALIZADO"],
    [],
    ["Evento", "Receita Prev.", "Receita Real", "Despesa Prev.", "Despesa Real", "Resultado Prev.", "Resultado Real", "Variação"],
  ];

  let gFInc = 0, gFExp = 0, gTInc = 0, gTExp = 0;

  events.forEach((evt) => {
    const evtF = forecasts.filter((f: any) => f.event_id === evt.id);
    const evtT = transactions.filter((t: any) => t.event_id === evt.id);
    let fInc = evtF.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const fExp = evtF.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const tInc = evtT.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const tExp = evtT.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
    // Add ticket lot revenue
    const evtZones = ticketZones.filter((z: any) => z.event_id === evt.id);
    evtZones.forEach((zone: any) => {
      const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
      zoneLots.forEach((lot: any) => { fInc += Number(lot.price) * Number(lot.quantity); });
    });
    gFInc += fInc; gFExp += fExp; gTInc += tInc; gTExp += tExp;
    summaryRows.push([evt.name, fInc, tInc, fExp, tExp, fInc - fExp, tInc - tExp, (tInc - tExp) - (fInc - fExp)]);
  });

  summaryRows.push([]);
  summaryRows.push(["TOTAL", gFInc, gTInc, gFExp, gTExp, gFInc - gFExp, gTInc - gTExp, (gTInc - gTExp) - (gFInc - gFExp)]);

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Resumo");

  events.forEach((evt) => {
    const evtF = forecasts.filter((f: any) => f.event_id === evt.id);
    const evtT = transactions.filter((t: any) => t.event_id === evt.id);
    if (evtF.length === 0 && evtT.length === 0) return;
    const pl = buildPLForExport(evtF, evtT, categories, ticketZones, ticketLots, evt.id);
    const rows: any[][] = [
      [`P&L - ${evt.name}`],
      [],
      ["Rubrica", "Previsto (€)", "Real (€)", "Variação (€)"],
    ];
    pl.forEach((line) => {
      const prefix = line.subIndent ? "      " : line.indent ? "  " : "";
      rows.push([prefix + line.label, line.forecast, line.subIndent ? "" : line.actual, line.subIndent ? "" : line.variance]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 45 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    const sheetName = evt.name.substring(0, 31).replace(/[\\/*?[\]:]/g, "");
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, `PL_Relatorio_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportPLToPDF(
  events: any[], forecasts: any[], transactions: any[], categories: any[],
  ticketZones: any[] = [], ticketLots: any[] = []
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
    doc.text("Previsto (€)", colX[1] + colWidths[1] - 2, y + 5.5, { align: "right" });
    doc.text("Real (€)", colX[2] + colWidths[2] - 2, y + 5.5, { align: "right" });
    doc.text("Variação (€)", colX[3] + colWidths[3] - 2, y + 5.5, { align: "right" });
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
  doc.text("Relatório P&L", marginLeft, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Previsão vs Realizado · Gerado em ${new Date().toLocaleDateString("pt-PT")}`, marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 10;

  // Global summary
  let gFInc = 0, gFExp = 0, gTInc = 0, gTExp = 0;
  events.forEach((evt) => {
    const evtF = forecasts.filter((f: any) => f.event_id === evt.id);
    const evtT = transactions.filter((t: any) => t.event_id === evt.id);
    gFInc += evtF.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);
    gFExp += evtF.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
    gTInc += evtT.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    gTExp += evtT.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
  });

  doc.setFillColor(245, 245, 250);
  doc.roundedRect(marginLeft, y, contentWidth, 20, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  const halfW = contentWidth / 4;

  doc.setTextColor(100, 100, 100);
  doc.text("Resultado Previsto", marginLeft + 4, y + 6);
  doc.setFontSize(11);
  const fRes = gFInc - gFExp;
  doc.setTextColor(fRes >= 0 ? 34 : 200, fRes >= 0 ? 139 : 50, fRes >= 0 ? 34 : 50);
  doc.text(fmtVal(fRes), marginLeft + 4, y + 14);

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("Resultado Real", marginLeft + halfW * 1.5, y + 6);
  doc.setFontSize(11);
  const tRes = gTInc - gTExp;
  doc.setTextColor(tRes >= 0 ? 34 : 200, tRes >= 0 ? 139 : 50, tRes >= 0 ? 34 : 50);
  doc.text(fmtVal(tRes), marginLeft + halfW * 1.5, y + 14);

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("Variação", marginLeft + halfW * 3, y + 6);
  doc.setFontSize(11);
  const variance = tRes - fRes;
  doc.setTextColor(variance >= 0 ? 34 : 200, variance >= 0 ? 139 : 50, variance >= 0 ? 34 : 50);
  doc.text((variance >= 0 ? "+" : "") + fmtVal(variance), marginLeft + halfW * 3, y + 14);

  doc.setTextColor(0, 0, 0);
  y += 26;

  // Per-event
  events.forEach((evt, evtIdx) => {
    const evtF = forecasts.filter((f: any) => f.event_id === evt.id);
    const evtT = transactions.filter((t: any) => t.event_id === evt.id);
    if (evtF.length === 0 && evtT.length === 0) return;

    const pl = buildPLForExport(evtF, evtT, categories, ticketZones, ticketLots, evt.id);

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

      const label = line.subIndent ? `          ${line.label}` : line.indent ? `    ${line.label}` : line.label;
      doc.text(label, colX[0] + 2, y + 4);
      doc.text(fmtVal(Math.abs(line.forecast)), colX[1] + colWidths[1] - 2, y + 4, { align: "right" });

      if (line.subIndent) {
        doc.text("—", colX[2] + colWidths[2] - 2, y + 4, { align: "right" });
        doc.text("—", colX[3] + colWidths[3] - 2, y + 4, { align: "right" });
      } else {
        doc.text(fmtVal(Math.abs(line.actual)), colX[2] + colWidths[2] - 2, y + 4, { align: "right" });
        const v = line.variance;
        if (line.isGrandTotal || line.isTotal) {
          doc.setTextColor(v >= 0 ? 34 : 200, v >= 0 ? 139 : 50, v >= 0 ? 34 : 50);
        }
        doc.text((v >= 0 ? "+" : "") + fmtVal(v), colX[3] + colWidths[3] - 2, y + 4, { align: "right" });
      }
      doc.setTextColor(0, 0, 0);

      y += rowH;
    });

    y += 8;
  });

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
