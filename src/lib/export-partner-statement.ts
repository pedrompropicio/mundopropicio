/**
 * Prestação de contas do sócio (Excel + PDF).
 *
 * Espelha, ao cêntimo, o Excel enviado aos sócios. Regras invioláveis:
 *  R1 — IVA SEMPRE linha a linha (calcIvaAmount/calcTotalWithIva) e só depois soma.
 *  R2 — o filtro canónico das despesas é aplicado por quem fornece os forecasts.
 *  R3 — receitas s/IVA; despesas c/IVA; resultado = receitas s/IVA − despesas c/IVA.
 *  R6 — parte do sócio = ROUND(resultado × %, 2); a parte restante sai por subtracção
 *       para que as partes somem exactamente o resultado.
 */
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { calcIvaAmount, calcTotalWithIva, roundCents } from "@/lib/iva";
import { buildCategoryLookup } from "@/lib/category-hierarchy";
import { compareHierarchicalCodes, formatDatePT } from "@/lib/utils";
import { HOUSE_PARTNER_NAME } from "@/lib/house-partner";

export interface PartnerShareInput {
  name: string;
  percentage: number;
}

export interface PartnerRevenueLine {
  label: string;
  net: number;
}

export interface PartnerStatementInput {
  eventName: string;
  eventDate: string | null;
  eventLocation?: string | null;
  companyName?: string | null;
  logoDataUrl?: string | null;
  /** Forecasts de despesa já filtrados pelo universo canónico (R2) e já rateados. */
  forecasts: Array<{
    category_id: string | null;
    amount: number | string | null;
    iva_rate: number | string | null;
  }>;
  categories: any[];
  /** Receitas por origem, s/IVA (R3/R5). */
  revenues: PartnerRevenueLine[];
  /** Nº de documentos por rubrica L3 (RPC get_bp_l3_attachments — nunca por linha). */
  documentsByCategoryId: Record<string, number>;
  shares: PartnerShareInput[];
}

interface Rubrica {
  code: string;
  name: string;
  base: number;
  iva: number;
  total: number;
  documents: number;
}
interface Family {
  code: string;
  name: string;
  base: number;
  iva: number;
  total: number;
  rubricas: Rubrica[];
}

export interface PartnerStatement {
  families: Family[];
  expenseBase: number;
  expenseIva: number;
  expenseTotal: number;
  revenues: PartnerRevenueLine[];
  revenueNet: number;
  result: number;
  shares: Array<{ name: string; percentage: number; value: number }>;
  lineCount: number;
}

export function buildPartnerStatement(input: PartnerStatementInput): PartnerStatement {
  const lookup = buildCategoryLookup(input.categories);

  const famMap = new Map<string, Family>();
  let expenseBase = 0;
  let expenseIva = 0;

  for (const f of input.forecasts) {
    const base = Number(f.amount) || 0;
    const rate = Number(f.iva_rate) || 0;
    // R1 — linha a linha
    const iva = calcIvaAmount(base, rate);
    expenseBase = roundCents(expenseBase + base);
    expenseIva = roundCents(expenseIva + iva);

    const info = f.category_id ? lookup[f.category_id] : null;
    const famCode = info?.l1Code ?? info?.code ?? "Z";
    const famName = info?.l1Name ?? info?.name ?? "Sem grupo";
    const rubCode = info?.code ?? "";
    const rubName = info?.name ?? "Sem rubrica";
    const rubKey = `${rubCode}|${rubName}`;

    let fam = famMap.get(famCode);
    if (!fam) {
      fam = { code: famCode, name: famName, base: 0, iva: 0, total: 0, rubricas: [] };
      famMap.set(famCode, fam);
    }
    fam.base = roundCents(fam.base + base);
    fam.iva = roundCents(fam.iva + iva);
    fam.total = roundCents(fam.base + fam.iva);

    let rub = fam.rubricas.find((r) => `${r.code}|${r.name}` === rubKey);
    if (!rub) {
      rub = {
        code: rubCode,
        name: rubName,
        base: 0,
        iva: 0,
        total: 0,
        documents: f.category_id ? input.documentsByCategoryId[f.category_id] ?? 0 : 0,
      };
      fam.rubricas.push(rub);
    }
    rub.base = roundCents(rub.base + base);
    rub.iva = roundCents(rub.iva + iva);
    rub.total = roundCents(rub.base + rub.iva);
  }

  const families = [...famMap.values()]
    .map((f) => ({ ...f, rubricas: f.rubricas.sort((a, b) => compareHierarchicalCodes(a.code, b.code)) }))
    .sort((a, b) => compareHierarchicalCodes(a.code, b.code));

  const expenseTotal = roundCents(expenseBase + expenseIva);
  const revenues = input.revenues.map((r) => ({ ...r, net: roundCents(r.net) }));
  const revenueNet = roundCents(revenues.reduce((s, r) => s + r.net, 0));
  const result = roundCents(revenueNet - expenseTotal);

  // R6 — última quota por subtracção. Cálculo em cêntimos para evitar
  // desvios de floating-point (ex.: 597183.45 × 0.70 = 418028.415).
  const ordered = [...input.shares].sort((a, b) => Number(b.percentage) - Number(a.percentage));
  const resultCents = Math.round(result * 100);
  let shares = ordered.map((s) => ({
    name: s.name,
    percentage: Number(s.percentage) || 0,
    value: Math.round(resultCents * ((Number(s.percentage) || 0) / 100)) / 100,
  }));
  const pctSum = roundCents(shares.reduce((s, x) => s + x.percentage, 0));
  if (pctSum >= 99.995 && shares.length > 1) {
    const othersCents = shares.slice(0, -1).reduce((s, x) => s + Math.round(x.value * 100), 0);
    shares[shares.length - 1].value = (resultCents - othersCents) / 100;
  } else if (pctSum < 99.995) {
    const assignedCents = shares.reduce((s, x) => s + Math.round(x.value * 100), 0);
    shares.push({
      name: input.companyName ? `${input.companyName} (parte restante)` : "Parte restante",
      percentage: roundCents(100 - pctSum),
      value: (resultCents - assignedCents) / 100,
    });
  }

  // Agregação para prestação de contas: o maior sócio EXTERNO fica visível;
  // todo o resto (outros externos + Mundo Propício/residual) colapsa em
  // "Sócios locais", com valor por subtracção para fechar ao cêntimo.
  const isHouseName = (n: string) =>
    n.toLowerCase().includes(HOUSE_PARTNER_NAME.toLowerCase());
  const sorted = [...shares].sort((a, b) => b.percentage - a.percentage);
  const mainIdx = sorted.findIndex((s) => !isHouseName(s.name));
  const hasExternal = mainIdx !== -1;

  const aggregatedShares: Array<{ name: string; percentage: number; value: number }> = [];
  if (!hasExternal) {
    // Só existe quota da casa: apresenta-a como "Sócios locais"
    aggregatedShares.push({ name: "Sócios locais", percentage: 100, value: result });
  } else {
    const main = sorted[mainIdx];
    const rest = sorted.filter((_, i) => i !== mainIdx);
    const restPct = roundCents(rest.reduce((s, x) => s + x.percentage, 0));
    const mainCents = Math.round(main.value * 100);
    const restValue = (resultCents - mainCents) / 100;
    aggregatedShares.push(main);
    if (restPct > 0 || Math.abs(restValue) > 0.001) {
      aggregatedShares.push({ name: "Sócios locais", percentage: restPct, value: restValue });
    }
  }
  shares = aggregatedShares;

  return {
    families,
    expenseBase,
    expenseIva,
    expenseTotal,
    revenues,
    revenueNet,
    result,
    shares,
    lineCount: input.forecasts.length,
  };
}

const MONEY = '#,##0.00\\ "€"';

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
}

export async function exportPartnerStatementExcel(input: PartnerStatementInput): Promise<void> {
  const st = buildPartnerStatement(input);
  const wb = new ExcelJS.Workbook();
  wb.creator = input.companyName || "MP Gestão Eventos";
  const ws = wb.addWorksheet("Prestação de Contas");
  ws.columns = [
    { key: "a", width: 52 },
    { key: "b", width: 18 },
    { key: "c", width: 18 },
    { key: "d", width: 18 },
    { key: "e", width: 14 },
  ];

  const title = (text: string) => {
    const r = ws.addRow([text]);
    r.font = { name: "Arial", bold: true, size: 12 };
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9E9E9" } };
    ws.mergeCells(`A${r.number}:E${r.number}`);
    return r;
  };
  const money = (row: ExcelJS.Row, cols: number[]) => {
    cols.forEach((c) => { row.getCell(c).numFmt = MONEY; });
  };

  const h = ws.addRow([input.eventName]);
  h.font = { name: "Arial", bold: true, size: 14 };
  const sub = [
    input.eventDate ? formatDatePT(input.eventDate) : null,
    input.eventLocation || null,
    `Gerado a ${formatDatePT(new Date().toISOString())}`,
  ].filter(Boolean).join(" · ");
  ws.addRow([sub]).font = { name: "Arial", italic: true, size: 9 };
  ws.addRow([]);

  // 1. O acordo
  title("1. O acordo");
  const accHead = ws.addRow(["Sócio", "Quota"]);
  accHead.font = { name: "Arial", bold: true };
  st.shares.forEach((s) => {
    const r = ws.addRow([s.name, s.percentage / 100]);
    r.getCell(2).numFmt = "0.00%";
  });
  ws.addRow([]);

  // 2. Receitas
  title("2. As receitas do evento (s/IVA)");
  const recHead = ws.addRow(["Origem", "Valor s/IVA"]);
  recHead.font = { name: "Arial", bold: true };
  st.revenues.forEach((r) => {
    const row = ws.addRow([r.label, r.net]);
    money(row, [2]);
  });
  const recTotal = ws.addRow(["Total das receitas", st.revenueNet]);
  recTotal.font = { name: "Arial", bold: true };
  money(recTotal, [2]);
  ws.addRow([]);

  // 3. Despesas
  title("3. As despesas do evento (c/IVA)");
  const famHead = ws.addRow(["Família", "Valor", "IVA", "Total"]);
  famHead.font = { name: "Arial", bold: true };
  st.families.forEach((f) => {
    const row = ws.addRow([`${f.code} · ${f.name}`, f.base, f.iva, f.total]);
    money(row, [2, 3, 4]);
  });
  const famTotal = ws.addRow(["Total das despesas", st.expenseBase, st.expenseIva, st.expenseTotal]);
  famTotal.font = { name: "Arial", bold: true };
  money(famTotal, [2, 3, 4]);
  ws.addRow([]);

  const detHead = ws.addRow(["Rubrica", "Valor", "IVA", "Total", "Documentos"]);
  detHead.font = { name: "Arial", bold: true };
  st.families.forEach((f) => {
    const fr = ws.addRow([`${f.code} · ${f.name}`, f.base, f.iva, f.total, ""]);
    fr.font = { name: "Arial", bold: true };
    money(fr, [2, 3, 4]);
    f.rubricas.forEach((r) => {
      const row = ws.addRow([`    ${r.code} · ${r.name}`, r.base, r.iva, r.total, r.documents || ""]);
      money(row, [2, 3, 4]);
    });
  });
  ws.addRow([]);

  // 4. Resultado
  title("4. O resultado do evento");
  const resRow = ws.addRow(["Receitas s/IVA − Despesas c/IVA", st.result]);
  resRow.font = { name: "Arial", bold: true, size: 12 };
  money(resRow, [2]);
  ws.addRow([]);

  // 5. Parte dos sócios
  title("5. A parte dos sócios");
  const shHead = ws.addRow(["Sócio", "Quota", "Valor"]);
  shHead.font = { name: "Arial", bold: true };
  st.shares.forEach((s) => {
    const row = ws.addRow([s.name, s.percentage / 100, s.value]);
    row.font = { name: "Arial", bold: true, size: 12 };
    row.getCell(2).numFmt = "0.00%";
    money(row, [3]);
  });

  ws.eachRow((row) => {
    row.eachCell((cell) => {
      if (!cell.font?.name) cell.font = { ...(cell.font || {}), name: "Arial" };
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Prestacao_Contas_${safeName(input.eventName)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);

export function exportPartnerStatementPdf(input: PartnerStatementInput): void {
  const st = buildPartnerStatement(input);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  if (input.logoDataUrl) {
    try { doc.addImage(input.logoDataUrl, "PNG", margin, y, 38, 12); } catch { /* ignore */ }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Prestação de Contas", pageWidth - margin, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Gerado a ${formatDatePT(new Date().toISOString())}`, pageWidth - margin, y + 10, { align: "right" });
  doc.setTextColor(0);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(input.eventName, margin, y);
  y += 5;
  const subParts = [input.eventDate ? formatDatePT(input.eventDate) : null, input.eventLocation || null].filter(Boolean);
  if (subParts.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(subParts.join(" · "), margin, y);
    doc.setTextColor(0);
    y += 5;
  }

  const nextY = () => ((doc as any).lastAutoTable?.finalY ?? y) + 7;
  const sectionTitle = (text: string, atY: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(text, margin, atY);
    return atY + 2;
  };
  const head = [[{ content: "" }]];
  const baseStyles = { fontSize: 8.5, cellPadding: 1.6 } as any;
  const headStyles = { fillColor: [40, 40, 40], textColor: 255, fontStyle: "bold" } as any;

  // 1. O acordo
  y = sectionTitle("1. O acordo", y + 2);
  autoTable(doc, {
    startY: y,
    head: [["Sócio", "Quota"]],
    body: st.shares.map((s) => [s.name, `${s.percentage.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%`]),
    theme: "grid",
    styles: baseStyles,
    headStyles,
    columnStyles: { 1: { halign: "right", cellWidth: 30 } },
    margin: { left: margin, right: margin },
  });

  // 2. Receitas
  y = sectionTitle("2. As receitas do evento (s/IVA)", nextY());
  autoTable(doc, {
    startY: y,
    head: [["Origem", "Valor s/IVA"]],
    body: [
      ...st.revenues.map((r) => [r.label, fmt(r.net)]),
      [{ content: "Total das receitas", styles: { fontStyle: "bold" } }, { content: fmt(st.revenueNet), styles: { fontStyle: "bold", halign: "right" } }],
    ],
    theme: "grid",
    styles: baseStyles,
    headStyles,
    columnStyles: { 1: { halign: "right", cellWidth: 40 } },
    margin: { left: margin, right: margin },
  });

  // 3. Despesas — por família
  y = sectionTitle("3. As despesas do evento (c/IVA)", nextY());
  autoTable(doc, {
    startY: y,
    head: [["Família", "Valor", "IVA", "Total"]],
    body: [
      ...st.families.map((f) => [`${f.code} · ${f.name}`, fmt(f.base), fmt(f.iva), fmt(f.total)]),
      [
        { content: "Total das despesas", styles: { fontStyle: "bold" } },
        { content: fmt(st.expenseBase), styles: { fontStyle: "bold", halign: "right" } },
        { content: fmt(st.expenseIva), styles: { fontStyle: "bold", halign: "right" } },
        { content: fmt(st.expenseTotal), styles: { fontStyle: "bold", halign: "right" } },
      ],
    ],
    theme: "grid",
    styles: baseStyles,
    headStyles,
    columnStyles: { 1: { halign: "right", cellWidth: 30 }, 2: { halign: "right", cellWidth: 26 }, 3: { halign: "right", cellWidth: 30 } },
    margin: { left: margin, right: margin },
  });

  // 3b. Detalhe por rubrica
  const detailBody: any[] = [];
  st.families.forEach((f) => {
    detailBody.push([
      { content: `${f.code} · ${f.name}`, styles: { fontStyle: "bold", fillColor: [235, 235, 235] } },
      { content: fmt(f.base), styles: { fontStyle: "bold", halign: "right", fillColor: [235, 235, 235] } },
      { content: fmt(f.iva), styles: { fontStyle: "bold", halign: "right", fillColor: [235, 235, 235] } },
      { content: fmt(f.total), styles: { fontStyle: "bold", halign: "right", fillColor: [235, 235, 235] } },
      { content: "", styles: { fillColor: [235, 235, 235] } },
    ]);
    f.rubricas.forEach((r) => {
      detailBody.push([
        `    ${r.code} · ${r.name}`,
        { content: fmt(r.base), styles: { halign: "right" } },
        { content: fmt(r.iva), styles: { halign: "right" } },
        { content: fmt(r.total), styles: { halign: "right" } },
        { content: r.documents ? String(r.documents) : "—", styles: { halign: "center" } },
      ]);
    });
  });
  y = sectionTitle("Detalhe por rubrica", nextY());
  autoTable(doc, {
    startY: y,
    head: [["Rubrica", "Valor", "IVA", "Total", "Docs"]],
    body: detailBody,
    theme: "grid",
    styles: { ...baseStyles, fontSize: 8 },
    headStyles,
    columnStyles: {
      1: { halign: "right", cellWidth: 26 },
      2: { halign: "right", cellWidth: 24 },
      3: { halign: "right", cellWidth: 26 },
      4: { halign: "center", cellWidth: 14 },
    },
    margin: { left: margin, right: margin },
  });

  // 4. Resultado
  let ry = nextY();
  if (ry > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); ry = margin; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setFillColor(20, 20, 20);
  doc.setTextColor(255);
  doc.rect(margin, ry, pageWidth - margin * 2, 9, "F");
  doc.text("4. O resultado do evento", margin + 3, ry + 6);
  doc.text(fmt(st.result), pageWidth - margin - 3, ry + 6, { align: "right" });
  doc.setTextColor(0);

  // 5. Parte dos sócios
  const sy = sectionTitle("5. A parte dos sócios", ry + 16);
  autoTable(doc, {
    startY: sy,
    head: [["Sócio", "Quota", "Valor"]],
    body: st.shares.map((s) => [
      { content: s.name, styles: { fontStyle: "bold" } },
      { content: `${s.percentage.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%`, styles: { halign: "right" } },
      { content: fmt(s.value), styles: { fontStyle: "bold", halign: "right" } },
    ]),
    theme: "grid",
    styles: { ...baseStyles, fontSize: 9.5 },
    headStyles,
    columnStyles: { 1: { halign: "right", cellWidth: 26 }, 2: { halign: "right", cellWidth: 40 } },
    margin: { left: margin, right: margin },
  });

  const pageCount = (doc as any).internal.getNumberOfPages?.() ?? 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 6, { align: "right" });
    doc.setTextColor(0);
  }

  const datePart = input.eventDate ? input.eventDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
  doc.save(`Prestacao_Contas_${safeName(input.eventName)}_${datePart}.pdf`);
}

/** Exposto para verificação/teste (mantém a fórmula ao alcance de quem audita). */
export const __internals = { calcIvaAmount, calcTotalWithIva };
