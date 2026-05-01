/**
 * Exportador do Simulador Coala — XLSX e PDF com layout idêntico
 * ao ficheiro de referência Simulador_Coala_2026.xlsx
 *
 * 4 abas: Resumo · Sessões · Custos · IVA
 */
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ---------- Tipos esperados (mínimos) ----------
export type ExportScenario = {
  ticketsRevenue: number;
  drinkRevenue: number;
  foodRevenue: number;
  sponsorRevenue: number;
  souvenirRevenue: number;
  otherCredits: number;
  totalRevenue: number;
};
export type ExportCosts = {
  totalCost: number;
  abDrinkCost?: number;
  abFoodCost?: number;
  souvenirCost: number;
  eventCost?: number;
};
export type ExportResult = { general: number; event: number; ab: number; souvenir: number };
export type ExportKpis = {
  totalPublic: number; tmTickets: number; tmAB: number;
  costPerPerson: number; resultPerPerson: number; revenuePerPerson?: number;
};
export type ExportSession = {
  day_label: string; zone_label: string; capacity?: number; price?: number;
  real_qty: number; real_eur: number; projected_qty: number; courtesy_qty: number;
  forecast_qty: number; forecast_eur: number;
};
export type ExportCostLine = {
  category_code: string | null; label: string;
  prior_year: number; actual: number; break_even: number; forecast: number;
};
export type ExportIvaRow = {
  day_label: string; zone_label: string; gross: number; iva_pct: number; iva: number; net: number;
};

export type SimulatorExportData = {
  eventName: string;
  subtitle?: string;
  today: ExportScenario; breakeven: ExportScenario; forecast: ExportScenario;
  todayCosts: ExportCosts; beCosts: ExportCosts; fcCosts: ExportCosts;
  todayRes: ExportResult; beRes: ExportResult; fcRes: ExportResult;
  todayKpis: ExportKpis; beKpis: ExportKpis; fcKpis: ExportKpis;
  ivaTotalToday: number;
  sessions: ExportSession[];
  costs: ExportCostLine[];
  iva: ExportIvaRow[];
};

// ---------- helpers ----------
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const delta = (fc: number, today: number) => r2(fc - today);

// Build the "Resumo" 2D matrix matching the Excel
function buildResumoAoA(d: SimulatorExportData): any[][] {
  const t = d.today, be = d.breakeven, fc = d.forecast;
  const tc = d.todayCosts, bc = d.beCosts, fcc = d.fcCosts;
  const tr = d.todayRes, br = d.beRes, fr = d.fcRes;
  const tk = d.todayKpis;
  const cmvBe = (be.drinkRevenue + be.foodRevenue) - br.ab; // CMV implícito = receita A&B - resultado A&B
  const cmvToday = (t.drinkRevenue + t.foodRevenue) - tr.ab;
  const cmvFc = (fc.drinkRevenue + fc.foodRevenue) - fr.ab;
  const totalCostToday = (tc.eventCost ?? (tc.totalCost - cmvToday - tc.souvenirCost)) + cmvToday + tc.souvenirCost;
  const totalCostBe = (bc.eventCost ?? (bc.totalCost - cmvBe - bc.souvenirCost)) + cmvBe + bc.souvenirCost;
  const totalCostFc = (fcc.eventCost ?? (fcc.totalCost - cmvFc - fcc.souvenirCost)) + cmvFc + fcc.souvenirCost;

  const eventCostToday = tc.eventCost ?? (tc.totalCost - cmvToday - tc.souvenirCost);
  const eventCostBe = bc.eventCost ?? (bc.totalCost - cmvBe - bc.souvenirCost);
  const eventCostFc = fcc.eventCost ?? (fcc.totalCost - cmvFc - fcc.souvenirCost);

  const totalQtyToday = d.sessions.reduce((a, s) => a + (s.real_qty || 0), 0);
  const totalQtyBe = Math.round(totalQtyToday * (be.totalRevenue / Math.max(1, t.totalRevenue))); // estimativa
  const totalQtyFc = d.sessions.reduce((a, s) => a + (s.forecast_qty || 0), 0);
  const totalCourtesy = d.sessions.reduce((a, s) => a + (s.courtesy_qty || 0), 0);

  return [
    [`Simulador ${d.eventName}`],
    [d.subtitle ?? "2025 (manual) · Hoje Edição 2026 (TX+BP) · Break Even · Forecast DVT"],
    [],
    ["Indicador", "Hoje (Edição 2026)", "Break Even", "Forecast DVT", "Δ Forecast vs Hoje"],
    ["Bilhetes vendidos (qty)", totalQtyToday, totalQtyBe, totalQtyFc, totalQtyFc - totalQtyToday],
    ["Cortesias (qty)", totalCourtesy, totalCourtesy, totalCourtesy, 0],
    ["Receita Bilheteira", r2(t.ticketsRevenue), r2(be.ticketsRevenue), r2(fc.ticketsRevenue), delta(fc.ticketsRevenue, t.ticketsRevenue)],
    ["Receita A&B Bebida", r2(t.drinkRevenue), r2(be.drinkRevenue), r2(fc.drinkRevenue), delta(fc.drinkRevenue, t.drinkRevenue)],
    ["Receita A&B Alimento", r2(t.foodRevenue), r2(be.foodRevenue), r2(fc.foodRevenue), delta(fc.foodRevenue, t.foodRevenue)],
    ["Patrocínio", r2(t.sponsorRevenue), r2(be.sponsorRevenue), r2(fc.sponsorRevenue), delta(fc.sponsorRevenue, t.sponsorRevenue)],
    ["Souvenir", r2(t.souvenirRevenue), r2(be.souvenirRevenue), r2(fc.souvenirRevenue), delta(fc.souvenirRevenue, t.souvenirRevenue)],
    ["Outros Créditos", r2(t.otherCredits), r2(be.otherCredits), r2(fc.otherCredits), delta(fc.otherCredits, t.otherCredits)],
    ["RECEITA TOTAL", r2(t.totalRevenue), r2(be.totalRevenue), r2(fc.totalRevenue), delta(fc.totalRevenue, t.totalRevenue)],
    ["Custos de Evento", r2(eventCostToday), r2(eventCostBe), r2(eventCostFc), delta(eventCostFc, eventCostToday)],
    ["CMV A&B", r2(cmvToday), r2(cmvBe), r2(cmvFc), delta(cmvFc, cmvToday)],
    ["Custo Souvenir", r2(tc.souvenirCost), r2(bc.souvenirCost), r2(fcc.souvenirCost), delta(fcc.souvenirCost, tc.souvenirCost)],
    ["CUSTO TOTAL", r2(totalCostToday), r2(totalCostBe), r2(totalCostFc), delta(totalCostFc, totalCostToday)],
    ["Resultado Evento", r2(tr.event), r2(br.event), r2(fr.event), delta(fr.event, tr.event)],
    ["Resultado A&B", r2(tr.ab), r2(br.ab), r2(fr.ab), delta(fr.ab, tr.ab)],
    ["Resultado Souvenir", r2(tr.souvenir), r2(br.souvenir), r2(fr.souvenir), delta(fr.souvenir, tr.souvenir)],
    ["RESULTADO GERAL", r2(tr.general), r2(br.general), r2(fr.general), delta(fr.general, tr.general)],
    ["IVA Bilheteira (6%)", r2(d.ivaTotalToday), "", "", ""],
    [],
    ["Indicadores per capita (Forecast)"],
    ["Ticket Médio Bilheteira", r2(tk.tmTickets)],
    ["Ticket Médio A&B / pessoa", r2(tk.tmAB)],
    ["Custo / pessoa", r2(tk.costPerPerson)],
    ["Receita / pessoa", r2(tk.revenuePerPerson ?? (tk.totalPublic ? t.totalRevenue / tk.totalPublic : 0))],
    ["Resultado / pessoa", r2(tk.resultPerPerson)],
  ];
}

function buildSessoesAoA(d: SimulatorExportData): any[][] {
  const rows: any[][] = [
    ["Matriz Dia × Zona"],
    [],
    ["Dia", "Zona", "Capacidade", "Preço", "Real Qty", "Real €", "Projeção Qty", "Cortesias", "Forecast Qty", "Forecast €"],
  ];
  for (const s of d.sessions) {
    rows.push([
      s.day_label, s.zone_label, s.capacity ?? "", s.price ?? "",
      s.real_qty, r2(s.real_eur), s.projected_qty, s.courtesy_qty, s.forecast_qty, r2(s.forecast_eur),
    ]);
  }
  const tot = d.sessions.reduce((a, s) => ({
    cap: a.cap + (s.capacity || 0), real: a.real + s.real_qty, realEur: a.realEur + s.real_eur,
    proj: a.proj + s.projected_qty, court: a.court + s.courtesy_qty,
    fc: a.fc + s.forecast_qty, fcEur: a.fcEur + s.forecast_eur,
  }), { cap: 0, real: 0, realEur: 0, proj: 0, court: 0, fc: 0, fcEur: 0 });
  rows.push(["TOTAL", "", tot.cap, "", tot.real, r2(tot.realEur), tot.proj, tot.court, tot.fc, r2(tot.fcEur)]);
  return rows;
}

function buildCustosAoA(d: SimulatorExportData): any[][] {
  const rows: any[][] = [
    ["Custos por categoria L3 (3 cenários)"],
    [],
    ["Categoria L3", "2025 (Hoje)", "Break Even", "Forecast DVT", "Δ FC vs 2025"],
  ];
  for (const c of d.costs) {
    const label = c.category_code ? `${c.category_code} ${c.label}` : c.label;
    rows.push([label, r2(c.prior_year), r2(c.break_even), r2(c.forecast), delta(c.forecast, c.prior_year)]);
  }
  const tot = d.costs.reduce((a, c) => ({
    p: a.p + c.prior_year, b: a.b + c.break_even, f: a.f + c.forecast,
  }), { p: 0, b: 0, f: 0 });
  rows.push(["TOTAL CUSTOS", r2(tot.p), r2(tot.b), r2(tot.f), delta(tot.f, tot.p)]);
  return rows;
}

function buildIvaAoA(d: SimulatorExportData): any[][] {
  const rows: any[][] = [
    ["IVA Bilheteira por sessão (6%)"],
    [],
    ["Dia", "Zona", "Receita Forecast €", "IVA %", "IVA €", "Líquido €"],
  ];
  for (const r of d.iva) {
    rows.push([r.day_label, r.zone_label, r2(r.gross), r.iva_pct / 100, r2(r.iva), r2(r.net)]);
  }
  return rows;
}

// ---------- XLSX ----------
export function exportSimulatorToXlsx(d: SimulatorExportData): void {
  const wb = XLSX.utils.book_new();

  const wsResumo = XLSX.utils.aoa_to_sheet(buildResumoAoA(d));
  wsResumo["!cols"] = [{ wch: 38 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
  if (wsResumo["A1"]) wsResumo["A1"].s = { font: { bold: true, sz: 14 } };
  // Currency format on numeric cells (cols B-E from row 5..)
  const fmtMoney = '#,##0.00 "€";[Red]-#,##0.00 "€"';
  const ref = wsResumo["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let R = 4; R <= range.e.r; R++) {
      for (let C = 1; C <= 4; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = wsResumo[addr];
        if (cell && typeof cell.v === "number") cell.z = fmtMoney;
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

  const wsSes = XLSX.utils.aoa_to_sheet(buildSessoesAoA(d));
  wsSes["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsSes, "Sessões");

  const wsCustos = XLSX.utils.aoa_to_sheet(buildCustosAoA(d));
  wsCustos["!cols"] = [{ wch: 38 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsCustos, "Custos");

  const wsIva = XLSX.utils.aoa_to_sheet(buildIvaAoA(d));
  wsIva["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsIva, "IVA");

  const fname = `Simulador_${d.eventName.replace(/[^\w]+/g, "_")}.xlsx`;
  XLSX.writeFile(wb, fname);
}

// ---------- PDF ----------
export function exportSimulatorToPdf(d: SimulatorExportData): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // Capa / Resumo
  doc.setFont("helvetica", "bold").setFontSize(16);
  doc.text(`Simulador — ${d.eventName}`, 40, 40);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(100);
  doc.text(d.subtitle ?? "3 cenários paralelos · Hoje · Break Even · Forecast DVT", 40, 58);
  doc.setTextColor(0);

  const resumo = buildResumoAoA(d);
  autoTable(doc, {
    startY: 75,
    head: [resumo[3]],
    body: resumo.slice(4, 22).map(r => r.map((v, i) => (i === 0 ? v : (typeof v === "number" ? formatMoney(v) : v)))),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: { 0: { cellWidth: 220 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    didParseCell: (data) => {
      const label = String(resumo[data.row.index + 4]?.[0] ?? "");
      if (/TOTAL|RESULTADO/i.test(label)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  // KPIs per capita
  const kpiStartY = (doc as any).lastAutoTable.finalY + 12;
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("Indicadores per capita (Hoje)", 40, kpiStartY);
  autoTable(doc, {
    startY: kpiStartY + 6,
    body: resumo.slice(24).filter(r => r.length >= 2).map(r => [r[0], typeof r[1] === "number" ? formatMoney(r[1] as number) : r[1]]),
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 220 }, 1: { halign: "right", cellWidth: 120 } },
    theme: "grid",
  });

  // Sessões
  doc.addPage();
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("Sessões — Matriz Dia × Zona", 40, 40);
  const ses = buildSessoesAoA(d);
  autoTable(doc, {
    startY: 55,
    head: [ses[2]],
    body: ses.slice(3).map(r => r.map((v, i) => (i >= 4 && typeof v === "number" ? (i === 5 || i === 9 ? formatMoney(v) : String(v)) : v ?? ""))),
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" } },
  });

  // Custos
  doc.addPage();
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("Custos por categoria L3", 40, 40);
  const cs = buildCustosAoA(d);
  autoTable(doc, {
    startY: 55,
    head: [cs[2]],
    body: cs.slice(3).map(r => r.map((v, i) => (i === 0 ? v : (typeof v === "number" ? formatMoney(v) : v)))),
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: { 0: { cellWidth: 260 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    didParseCell: (data) => {
      const label = String(cs[data.row.index + 3]?.[0] ?? "");
      if (/TOTAL/i.test(label)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  // IVA
  doc.addPage();
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("IVA Bilheteira por sessão (6%)", 40, 40);
  const ivaA = buildIvaAoA(d);
  autoTable(doc, {
    startY: 55,
    head: [ivaA[2]],
    body: ivaA.slice(3).map(r => [
      r[0], r[1],
      formatMoney(Number(r[2]) || 0),
      `${((Number(r[3]) || 0) * 100).toFixed(1)}%`,
      formatMoney(Number(r[4]) || 0),
      formatMoney(Number(r[5]) || 0),
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  });

  // Footer
  const pages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8).setTextColor(140);
    doc.text(`MP Gestão Eventos · Simulador ${d.eventName} · Página ${p}/${pages}`, pageW / 2, doc.internal.pageSize.getHeight() - 18, { align: "center" });
  }

  doc.save(`Simulador_${d.eventName.replace(/[^\w]+/g, "_")}.pdf`);
}

function formatMoney(v: number): string {
  if (v == null || isNaN(v as any)) return "—";
  const sign = v < 0 ? "(" : "";
  const close = v < 0 ? ")" : "";
  const abs = Math.abs(v).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${abs} €${close}`;
}
