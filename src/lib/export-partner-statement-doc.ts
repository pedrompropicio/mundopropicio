/**
 * (g4) Documento do sócio — XLSX (2 folhas) e PDF com as MESMAS secções.
 *
 * Folha/secção "Resumo do Fecho": marca + 5 secções (1 O ACORDO · 2 AS RECEITAS
 * DO EVENTO (s/IVA) · 3 AS DESPESAS DO EVENTO (c/IVA) · 4 O RESULTADO ·
 * 5 A PARTE DE <SÓCIO>).
 * Folha/secção "Detalhamento": A receitas linha a linha · B despesas
 * família → rubrica → linhas, com subtotais e nota do IVA (art. 18.º CIVA).
 *
 * Sem fórmulas e sem protecção de livro (o sócio tem de poder abrir e filtrar).
 */
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  buildPartnerStatementDoc,
  type PartnerStatementDoc,
  type PartnerStatementDocInput,
} from "@/lib/partner-statement-doc";

const MONEY = '#,##0.00\\ "€"';
const BRAND = "MUNDO PROPÍCIO";

const money = (n: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(n);
const pct = (n: number, locale: string) =>
  `${n.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;

/** Constrói o livro Excel (exposto para teste sem browser). */
export async function buildStatementWorkbook(doc: PartnerStatementDoc): Promise<ExcelJS.Workbook> {
  const t = doc.t;
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND;

  // ===================== Folha 1 — Resumo do Fecho =====================
  const ws = wb.addWorksheet(t.summarySheet);
  ws.columns = [
    { key: "a", width: 56 },
    { key: "b", width: 18 },
    { key: "c", width: 16 },
    { key: "d", width: 18 },
    { key: "e", width: 12 },
  ];

  const arial = (row: ExcelJS.Row, opts: Partial<ExcelJS.Font> = {}) => {
    row.font = { name: "Arial", ...opts };
    return row;
  };
  const section = (text: string) => {
    ws.addRow([]);
    const r = ws.addRow([text]);
    arial(r, { bold: true, size: 12 });
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9E9E9" } };
    ws.mergeCells(`A${r.number}:E${r.number}`);
    return r;
  };
  const moneyCells = (row: ExcelJS.Row, cols: number[]) =>
    cols.forEach((c) => {
      row.getCell(c).numFmt = MONEY;
    });

  arial(ws.addRow([BRAND]), { bold: true, size: 10 });
  arial(ws.addRow([doc.title]), { bold: true, size: 14 });
  arial(ws.addRow([doc.subtitle]), { italic: true, size: 9 });
  arial(ws.addRow([doc.dataNote]), { italic: true, size: 9 });

  // 1. O ACORDO
  section(t.section1);
  arial(ws.addRow([t.partner, t.quota]), { bold: true });
  doc.agreement.forEach((s) => {
    const r = arial(ws.addRow([s.name, s.percentage / 100]));
    r.getCell(2).numFmt = "0.00%";
  });

  // 2. AS RECEITAS DO EVENTO
  section(t.section2);
  arial(ws.addRow([t.origin, t.netValue]), { bold: true });
  doc.revenues.forEach((r) => moneyCells(arial(ws.addRow([r.origin, r.net])), [2]));
  doc.extras.forEach((e) => moneyCells(arial(ws.addRow([e.label, e.value])), [2]));
  moneyCells(
    arial(ws.addRow([t.totalRevenues, doc.revenueNet + doc.extrasTotal]), { bold: true }),
    [2],
  );

  // 3. AS DESPESAS DO EVENTO
  section(t.section3);
  arial(ws.addRow([t.family, t.value, t.iva, t.totalWithIva]), { bold: true });
  doc.families.forEach((f) =>
    moneyCells(arial(ws.addRow([`${f.code} · ${f.name}`, f.base, f.iva, f.total])), [2, 3, 4]),
  );
  moneyCells(
    arial(ws.addRow([t.totalExpenses, doc.expenseBase, doc.expenseIva, doc.expenseTotal]), { bold: true }),
    [2, 3, 4],
  );

  // 4. O RESULTADO
  section(t.section4);
  moneyCells(arial(ws.addRow([t.resultLine, doc.result]), { bold: true, size: 12 }), [2]);

  // 5. A PARTE DE <SÓCIO>
  section(t.section5(doc.recipientName));
  arial(ws.addRow([t.partner, t.quota, t.value]), { bold: true });
  doc.agreement.forEach((s) => {
    const r = arial(
      ws.addRow([
        s.isRecipient ? `${s.name} — ${t.shareOfResult(s.name)}` : s.name,
        s.percentage / 100,
        s.value,
      ]),
      {
        bold: s.isRecipient,
        size: s.isRecipient ? 12 : 11,
      },
    );
    r.getCell(2).numFmt = "0.00%";
    moneyCells(r, [3]);
  });

  // (g4 adenda) Base a transferir + IVA do repasse quando facturado.
  const rcp = doc.recipientName;
  moneyCells(arial(ws.addRow([t.paidByPartnerLine(rcp), null, doc.paidByPartner])), [3]);
  moneyCells(arial(ws.addRow([t.extrasLine, null, -doc.partnerExtras])), [3]);
  moneyCells(arial(ws.addRow([t.advancesLine(rcp), null, -doc.partnerAdvances])), [3]);
  moneyCells(
    arial(
      ws.addRow([
        doc.transferBase >= 0 ? t.transferBaseLine(rcp) : t.receiveBaseLine(rcp),
        null,
        Math.abs(doc.transferBase),
      ]),
      { bold: true, size: 12 },
    ),
    [3],
  );
  if (doc.transferWithVat) {
    moneyCells(arial(ws.addRow([t.vatOnTransfer, null, doc.transferVat])), [3]);
    moneyCells(
      arial(
        ws.addRow([
          doc.transferTotal >= 0 ? t.transferTotalLine(rcp) : t.receiveTotalLine(rcp),
          null,
          Math.abs(doc.transferTotal),
        ]),
        { bold: true, size: 12 },
      ),
      [3],
    );
  }

  // ===================== Folha 2 — Detalhamento =====================
  const wd = wb.addWorksheet(t.detailSheet);
  wd.columns = [
    { key: "a", width: 62 },
    { key: "b", width: 16 },
    { key: "c", width: 10 },
    { key: "d", width: 16 },
    { key: "e", width: 10 },
  ];
  const dSection = (text: string) => {
    wd.addRow([]);
    const r = wd.addRow([text]);
    r.font = { name: "Arial", bold: true, size: 12 };
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9E9E9" } };
    wd.mergeCells(`A${r.number}:E${r.number}`);
  };
  const dMoney = (row: ExcelJS.Row, cols: number[]) =>
    cols.forEach((c) => {
      row.getCell(c).numFmt = MONEY;
    });

  wd.addRow([doc.title]).font = { name: "Arial", bold: true, size: 12 };
  wd.addRow([doc.dataNote]).font = { name: "Arial", italic: true, size: 9 };

  dSection(t.detailARevenues);
  const rh = wd.addRow([t.origin, t.netValue, "", t.description, ""]);
  rh.font = { name: "Arial", bold: true };
  doc.revenues.forEach((r) => {
    const row = wd.addRow([r.origin, r.net, "", r.description || "", ""]);
    row.font = { name: "Arial" };
    dMoney(row, [2]);
  });
  dMoney(
    (() => {
      const row = wd.addRow([t.total, doc.revenueNet]);
      row.font = { name: "Arial", bold: true };
      return row;
    })(),
    [2],
  );

  dSection(t.detailBExpenses);
  const eh = wd.addRow([t.rubrica, t.value, t.iva, t.totalWithIva, t.attachments]);
  eh.font = { name: "Arial", bold: true };
  doc.families.forEach((f) => {
    const fr = wd.addRow([`${f.code} · ${f.name}`, f.base, f.iva, f.total, ""]);
    fr.font = { name: "Arial", bold: true };
    fr.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    dMoney(fr, [2, 3, 4]);
    f.rubricas.forEach((rub) => {
      const rr = wd.addRow([`  ${rub.code} · ${rub.name}`, rub.base, rub.iva, rub.total, rub.documents || ""]);
      rr.font = { name: "Arial", bold: true, size: 10 };
      dMoney(rr, [2, 3, 4]);
      rub.lines.forEach((l) => {
        const lr = wd.addRow([`      ${l.description}`, l.base, l.iva, l.total, l.documents || ""]);
        lr.font = { name: "Arial", size: 10 };
        dMoney(lr, [2, 3, 4]);
      });
      const sr = wd.addRow([`  ${t.subtotal} ${rub.code}`, rub.base, rub.iva, rub.total, ""]);
      sr.font = { name: "Arial", italic: true, size: 10 };
      dMoney(sr, [2, 3, 4]);
    });
  });
  const tr = wd.addRow([t.total, doc.expenseBase, doc.expenseIva, doc.expenseTotal, ""]);
  tr.font = { name: "Arial", bold: true };
  dMoney(tr, [2, 3, 4]);

  wd.addRow([]);
  wd.addRow([t.ivaNote]).font = { name: "Arial", italic: true, size: 9 };

  return wb;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportPartnerStatementDocExcel(input: PartnerStatementDocInput): Promise<void> {
  const doc = buildPartnerStatementDoc(input);
  const wb = await buildStatementWorkbook(doc);
  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${doc.fileBase}.xlsx`,
  );
}

/** Constrói o PDF (devolve o jsPDF para teste/inspecção). */
export function buildStatementPdf(doc: PartnerStatementDoc, logoDataUrl?: string | null): jsPDF {
  const t = doc.t;
  const loc = doc.locale;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  if (logoDataUrl) {
    try {
      pdf.addImage(logoDataUrl, "PNG", margin, y, 34, 11);
    } catch {
      /* ignore */
    }
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(BRAND, pageW - margin, y + 5, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(120);
  pdf.text(doc.dataNote, pageW - margin, y + 10, { align: "right" });
  pdf.setTextColor(0);
  y += 18;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(doc.title, margin, y);
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(90);
  pdf.text(doc.subtitle, margin, y);
  pdf.setTextColor(0);
  y += 4;

  const nextY = () => ((pdf as any).lastAutoTable?.finalY ?? y) + 7;
  const sectionTitle = (text: string, atY: number) => {
    let at = atY;
    if (at > pageH - 40) {
      pdf.addPage();
      at = margin;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    pdf.text(text, margin, at);
    return at + 2;
  };
  const styles = { fontSize: 8.5, cellPadding: 1.6 } as any;
  const headStyles = { fillColor: [40, 40, 40], textColor: 255, fontStyle: "bold" } as any;
  const table = (opts: any) => autoTable(pdf, { margin: { left: margin, right: margin }, theme: "grid", styles, headStyles, ...opts });

  // 1. O ACORDO
  y = sectionTitle(t.section1, y + 4);
  table({
    startY: y,
    head: [[t.partner, t.quota]],
    body: doc.agreement.map((s) => [s.name, pct(s.percentage, loc)]),
    columnStyles: { 1: { halign: "right", cellWidth: 30 } },
  });

  // 2. AS RECEITAS
  y = sectionTitle(t.section2, nextY());
  table({
    startY: y,
    head: [[t.origin, t.netValue]],
    body: [
      ...doc.revenues.map((r) => [r.origin, money(r.net, loc)]),
      ...doc.extras.map((e) => [e.label, money(e.value, loc)]),
      [
        { content: t.totalRevenues, styles: { fontStyle: "bold" } },
        { content: money(doc.revenueNet + doc.extrasTotal, loc), styles: { fontStyle: "bold", halign: "right" } },
      ],
    ],
    columnStyles: { 1: { halign: "right", cellWidth: 40 } },
  });

  // 3. AS DESPESAS
  y = sectionTitle(t.section3, nextY());
  table({
    startY: y,
    head: [[t.family, t.value, t.iva, t.totalWithIva]],
    body: [
      ...doc.families.map((f) => [`${f.code} · ${f.name}`, money(f.base, loc), money(f.iva, loc), money(f.total, loc)]),
      [
        { content: t.totalExpenses, styles: { fontStyle: "bold" } },
        { content: money(doc.expenseBase, loc), styles: { fontStyle: "bold", halign: "right" } },
        { content: money(doc.expenseIva, loc), styles: { fontStyle: "bold", halign: "right" } },
        { content: money(doc.expenseTotal, loc), styles: { fontStyle: "bold", halign: "right" } },
      ],
    ],
    columnStyles: {
      1: { halign: "right", cellWidth: 30 },
      2: { halign: "right", cellWidth: 26 },
      3: { halign: "right", cellWidth: 30 },
    },
  });

  // 4. O RESULTADO
  let ry = nextY();
  if (ry > pageH - 40) {
    pdf.addPage();
    ry = margin;
  }
  pdf.setFillColor(20, 20, 20);
  pdf.setTextColor(255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.rect(margin, ry, pageW - margin * 2, 9, "F");
  pdf.text(t.section4, margin + 3, ry + 6);
  pdf.text(money(doc.result, loc), pageW - margin - 3, ry + 6, { align: "right" });
  pdf.setTextColor(0);

  // 5. A PARTE DE <SÓCIO>
  const sy = sectionTitle(t.section5(doc.recipientName), ry + 16);
  table({
    startY: sy,
    head: [[t.partner, t.quota, t.value]],
    body: [
      ...doc.agreement.map((s) => [
        {
          content: s.isRecipient ? `${s.name} — ${t.shareOfResult(s.name)}` : s.name,
          styles: { fontStyle: s.isRecipient ? "bold" : "normal" },
        },
        { content: pct(s.percentage, loc), styles: { halign: "right" } },
        { content: money(s.value, loc), styles: { fontStyle: s.isRecipient ? "bold" : "normal", halign: "right" } },
      ]),
      [t.paidByPartnerLine(doc.recipientName), "", { content: money(doc.paidByPartner, loc), styles: { halign: "right" } }],
      [t.extrasLine, "", { content: money(-doc.partnerExtras, loc), styles: { halign: "right" } }],
      [t.advancesLine(doc.recipientName), "", { content: money(-doc.partnerAdvances, loc), styles: { halign: "right" } }],
      [
        {
          content: doc.transferBase >= 0 ? t.transferBaseLine(doc.recipientName) : t.receiveBaseLine(doc.recipientName),
          styles: { fontStyle: "bold" },
        },
        "",
        { content: money(Math.abs(doc.transferBase), loc), styles: { fontStyle: "bold", halign: "right" } },
      ],
      ...(doc.transferWithVat
        ? [
            [t.vatOnTransfer, "", { content: money(doc.transferVat, loc), styles: { halign: "right" } }],
            [
              {
                content:
                  doc.transferTotal >= 0
                    ? t.transferTotalLine(doc.recipientName)
                    : t.receiveTotalLine(doc.recipientName),
                styles: { fontStyle: "bold" },
              },
              "",
              { content: money(Math.abs(doc.transferTotal), loc), styles: { fontStyle: "bold", halign: "right" } },
            ],
          ]
        : []),
    ] as any,
    styles: { ...styles, fontSize: 9.5 },
    columnStyles: { 1: { halign: "right", cellWidth: 26 }, 2: { halign: "right", cellWidth: 40 } },
  });

  // ===================== Detalhamento =====================
  pdf.addPage();
  y = margin;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(t.detailSheet, margin, y);
  y += 6;

  y = sectionTitle(t.detailARevenues, y);
  table({
    startY: y,
    head: [[t.origin, t.description, t.netValue]],
    body: [
      ...doc.revenues.map((r) => [r.origin, r.description || "—", money(r.net, loc)]),
      [
        { content: t.total, styles: { fontStyle: "bold" } },
        "",
        { content: money(doc.revenueNet, loc), styles: { fontStyle: "bold", halign: "right" } },
      ],
    ],
    columnStyles: { 2: { halign: "right", cellWidth: 34 } },
  });

  const body: any[] = [];
  doc.families.forEach((f) => {
    body.push([
      { content: `${f.code} · ${f.name}`, styles: { fontStyle: "bold", fillColor: [235, 235, 235] } },
      { content: money(f.base, loc), styles: { fontStyle: "bold", halign: "right", fillColor: [235, 235, 235] } },
      { content: money(f.iva, loc), styles: { fontStyle: "bold", halign: "right", fillColor: [235, 235, 235] } },
      { content: money(f.total, loc), styles: { fontStyle: "bold", halign: "right", fillColor: [235, 235, 235] } },
      { content: "", styles: { fillColor: [235, 235, 235] } },
    ]);
    f.rubricas.forEach((rub) => {
      body.push([
        { content: `  ${rub.code} · ${rub.name}`, styles: { fontStyle: "bold" } },
        { content: money(rub.base, loc), styles: { fontStyle: "bold", halign: "right" } },
        { content: money(rub.iva, loc), styles: { fontStyle: "bold", halign: "right" } },
        { content: money(rub.total, loc), styles: { fontStyle: "bold", halign: "right" } },
        { content: rub.documents ? String(rub.documents) : "—", styles: { halign: "center" } },
      ]);
      rub.lines.forEach((l) => {
        body.push([
          `      ${l.description}`,
          { content: money(l.base, loc), styles: { halign: "right" } },
          { content: money(l.iva, loc), styles: { halign: "right" } },
          { content: money(l.total, loc), styles: { halign: "right" } },
          { content: l.documents ? String(l.documents) : "—", styles: { halign: "center" } },
        ]);
      });
      body.push([
        { content: `  ${t.subtotal} ${rub.code}`, styles: { fontStyle: "italic" } },
        { content: money(rub.base, loc), styles: { fontStyle: "italic", halign: "right" } },
        { content: money(rub.iva, loc), styles: { fontStyle: "italic", halign: "right" } },
        { content: money(rub.total, loc), styles: { fontStyle: "italic", halign: "right" } },
        "",
      ]);
    });
  });
  body.push([
    { content: t.total, styles: { fontStyle: "bold" } },
    { content: money(doc.expenseBase, loc), styles: { fontStyle: "bold", halign: "right" } },
    { content: money(doc.expenseIva, loc), styles: { fontStyle: "bold", halign: "right" } },
    { content: money(doc.expenseTotal, loc), styles: { fontStyle: "bold", halign: "right" } },
    "",
  ]);

  y = sectionTitle(t.detailBExpenses, nextY());
  table({
    startY: y,
    head: [[t.rubrica, t.value, t.iva, t.totalWithIva, t.attachments]],
    body,
    styles: { ...styles, fontSize: 8 },
    columnStyles: {
      1: { halign: "right", cellWidth: 25 },
      2: { halign: "right", cellWidth: 22 },
      3: { halign: "right", cellWidth: 25 },
      4: { halign: "center", cellWidth: 13 },
    },
  });

  let ny = nextY();
  if (ny > pageH - 20) {
    pdf.addPage();
    ny = margin;
  }
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(8);
  pdf.setTextColor(110);
  pdf.text(t.ivaNote, margin, ny, { maxWidth: pageW - margin * 2 });
  pdf.setTextColor(0);

  const pages = (pdf as any).internal.getNumberOfPages?.() ?? 1;
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(140);
    pdf.text(`${t.page} ${i} ${t.of} ${pages}`, pageW - margin, pageH - 6, { align: "right" });
    pdf.setTextColor(0);
  }
  return pdf;
}

export function exportPartnerStatementDocPdf(input: PartnerStatementDocInput): void {
  const doc = buildPartnerStatementDoc(input);
  const pdf = buildStatementPdf(doc, input.logoDataUrl);
  pdf.save(`${doc.fileBase}.pdf`);
}
