/**
 * (g15) PDF do relatório interno do Encontro de Contas.
 *
 * A4 retrato, cabeçalho repetido em todas as páginas, sem quebra de página
 * forçada por secção: as tabelas pequenas mantêm-se inteiras (keep-together) e
 * as grandes quebram com o cabeçalho repetido. Mesmo layout na raiz e nos
 * fechamentos abaixo.
 *
 * Vista de staff: nomeia o fechamento e todos os sócios.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/mock-data";
import { safeFileToken } from "@/lib/partner-statement-doc";
import {
  buildInternalSettlementReport,
  internalReportCloses,
  overviewMismatch,
  partnerAccountLines,
  partnerBlockMismatch,
  reconcileDisplayValues,
  type InternalPartnerBlock,
  type InternalReportInput,
} from "@/lib/partner-settlement-internal-report";

const MARGIN = 14;
const TOP = 30;
const DARK: [number, number, number] = [41, 41, 41];
const GREY: [number, number, number] = [240, 240, 240];
const ROW_H = 5.2;

const money = (v: number) => formatCurrency(v);
const dt = (d?: string | null) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");

export function exportPartnerSettlementInternalPdf(input: InternalReportInput): void {
  const report = buildInternalSettlementReport(input);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const width = pageW - MARGIN * 2;
  let y = TOP;

  let sec = 0;
  const nextSection = (title: string, minRows = 3) => {
    ensure(8 + minRows * ROW_H);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(`${++sec}. ${title}`, MARGIN, y);
    y += 5;
  };
  const subTitle = (t: string) => {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(70);
    doc.text(t, MARGIN, y);
    doc.setTextColor(0);
    y += 3.2;
  };
  const note = (t: string, size = 7.5) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(90);
    const lines = doc.splitTextToSize(t, width);
    ensure(lines.length * 3.2 + 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 3.2 + 2;
    doc.setTextColor(0);
  };
  const warn = (t: string) => {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(190, 30, 30);
    const lines = doc.splitTextToSize(t, width);
    ensure(lines.length * 3.6 + 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 3.6 + 3;
    doc.setTextColor(0);
  };

  function ensure(needed: number) {
    if (y + needed > pageH - 14) {
      doc.addPage();
      y = TOP;
    }
  }

  /** Tabela pequena: nunca se divide (keep-together). */
  function smallTable(opts: {
    head: any[];
    body: any[][];
    foot?: any[][];
    widths: number[];
    aligns?: Array<"left" | "right" | "center">;
    boldRows?: Set<number>;
    fontSize?: number;
  }) {
    const rows = opts.body.length + (opts.foot?.length ?? 0) + 1;
    ensure(rows * ROW_H + 4);
    table({ ...opts, keepTogether: true });
  }

  function table(opts: {
    head: any[];
    body: any[][];
    foot?: any[][];
    widths: number[];
    aligns?: Array<"left" | "right" | "center">;
    boldRows?: Set<number>;
    fontSize?: number;
    keepTogether?: boolean;
    rowStyle?: (i: number) => { fill?: [number, number, number]; bold?: boolean } | null;
  }) {
    const aligns = opts.aligns ?? opts.widths.map((_, i) => (i === 0 ? "left" : "right"));
    const columnStyles: Record<number, any> = {};
    opts.widths.forEach((w, i) => {
      columnStyles[i] = { cellWidth: w, halign: aligns[i] };
    });
    autoTable(doc, {
      startY: y,
      head: [opts.head],
      body: opts.body,
      foot: opts.foot,
      showFoot: opts.foot ? "lastPage" : undefined,
      margin: { left: MARGIN, right: MARGIN, top: TOP },
      tableWidth: width,
      rowPageBreak: opts.keepTogether ? "avoid" : "auto",
      styles: { fontSize: opts.fontSize ?? 8.2, cellPadding: 1.6, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: DARK, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: GREY, textColor: [0, 0, 0], fontStyle: "bold" },
      columnStyles,
      didParseCell: (data) => {
        if (data.section === "head" || data.section === "foot") {
          data.cell.styles.halign = aligns[data.column.index] ?? "right";
        }
        if (data.section === "body") {
          if (opts.boldRows?.has(data.row.index)) data.cell.styles.fontStyle = "bold";
          const st = opts.rowStyle?.(data.row.index);
          if (st?.fill) data.cell.styles.fillColor = st.fill;
          if (st?.bold) data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // ===== 1. RESULTADO DO EVENTO (PERÍMETRO RAIZ) =====
  nextSection("Resultado do evento (perímetro raiz)", 5);
  smallTable({
    head: ["", "Valor"],
    body: [
      ["Receitas s/IVA", money(input.rootTotals.revenueNet)],
      ["Despesas s/IVA", money(input.rootTotals.expensesNet)],
      ["IVA das despesas", money(report.rootExpenseIva)],
      ["Despesas c/IVA", money(input.rootTotals.expensesGross)],
      [`Resultado (${report.expenseBasisLabel})`, money(report.rootResult)],
    ],
    widths: [width - 45, 45],
    boldRows: new Set([4]),
    fontSize: 9,
  });

  // ===== 2. CASCATA ATÉ ESTE FECHAMENTO =====
  nextSection(
    report.hasCascade ? "Cascata até este fechamento" : "Resultado deste fechamento",
    report.cascade.length,
  );
  const cascadeBody: any[][] = [];
  const cascadeStyle: Array<{ fill?: [number, number, number]; bold?: boolean } | null> = [];
  for (const line of report.cascade) {
    cascadeBody.push([line.label, line.pctLabel ?? "", money(line.value)]);
    cascadeStyle.push(
      line.kind === "total"
        ? { fill: [225, 235, 225], bold: true }
        : line.kind === "quota"
          ? { fill: GREY, bold: true }
          : null,
    );
    // (g15-b) Os itens do termo somam exactamente o valor do termo.
    const items = line.items ?? [];
    const itemValues = reconcileDisplayValues(items.map((it) => it.value), line.value);
    items.forEach((it, i) => {
      cascadeBody.push([`      ${it.label}`, "", money(itemValues[i])]);
      cascadeStyle.push(null);
    });
  }
  table({
    head: ["Conta do resultado", "%", "Valor"],
    body: cascadeBody,
    widths: [width - 68, 22, 46],
    aligns: ["left", "center", "right"],
    fontSize: 8.6,
    rowStyle: (i) => cascadeStyle[i] ?? null,
  });
  if (!internalReportCloses(report.cascadeMismatch)) {
    warn(
      `Aviso: a conta não fecha (diferença ${money(report.cascadeMismatch)}). O resultado do fechamento apurado pelo motor é ${money(input.nodeResult)}.`,
    );
  }

  // ===== 3. DISTRIBUIÇÃO NESTE FECHAMENTO =====
  if (input.distribution.length > 0) {
    nextSection("Distribuição neste fechamento", input.distribution.length + 1);
    // (g15-b) O TOTAL é o resultado do fechamento vindo do motor; as partes são
    // apresentação e absorvem o residual de arredondamento.
    const shares = reconcileDisplayValues(
      input.distribution.map((r) => r.share),
      input.nodeResult,
    );
    smallTable({
      head: ["Participante", "Modo", "% lucro / prejuízo", "Base efectiva", "Parte", "Onde acerta"],
      body: input.distribution.map((r, i) => [
        r.isHouse ? `${r.name} (casa)` : r.name,
        r.mode === "settles" ? "acerta" : "nominal",
        r.lossPct != null ? `${r.profitPct}% / ${r.lossPct}%` : `${r.profitPct}%`,
        r.basisLabel,
        money(shares[i]),
        r.settlesAt || "—",
      ]),
      foot: [["TOTAL", "", "", "", money(input.nodeResult), ""]],
      widths: [38, 16, 24, 34, 32, width - 144],
      aligns: ["left", "center", "center", "left", "right", "left"],
      fontSize: 7.8,
    });
  }

  // ===== 4. POR SÓCIO EXTERNO =====
  for (const p of input.partners) {
    // Quem não acerta aqui aparece como posição nominal: a conta liquida-se
    // onde o participante está marcado como quem acerta.
    const nominal = p.mode === "nominal";
    nextSection(nominal ? `Posição nominal de ${p.name}` : `Acerto com ${p.name}`, 6);
    const pctLabel = p.lossPct != null ? `${p.profitPct}% lucro / ${p.lossPct}% prejuízo` : `${p.profitPct}%`;
    note(
      nominal && p.settlesAt
        ? `Participação: ${pctLabel} · acerta em ${p.settlesAt}`
        : `Participação: ${pctLabel}`,
      8,
    );

    const account = partnerAccountLines(p);
    smallTable({
      head: ["A conta do sócio", "Valor"],
      body: account.map((r) => [r.label, money(r.value)]),
      widths: [width - 45, 45],
      boldRows: new Set(account.map((r, i) => (r.bold ? i : -1)).filter((i) => i >= 0)),
      fontSize: 8.6,
    });
    const mismatch = partnerBlockMismatch(p);
    if (Math.abs(mismatch) > 0.01) {
      warn(`Aviso: o detalhe não fecha com a base a transferir (diferença ${money(mismatch)}).`);
    }

    if (p.bpLines.length > 0) {
      subTitle("Business Plan pago pelo sócio, por rubrica");
      // (g15-b) As linhas absorvem o residual; o TOTAL é o do modelo.
      const bpAmounts = reconcileDisplayValues(p.bpLines.map((l) => l.amount), p.bpTotal);
      const bpLines = p.bpLines.map((l, i) => ({ ...l, amount: bpAmounts[i] }));
      const groups = new Map<string, typeof bpLines>();
      for (const l of bpLines) {
        const arr = groups.get(l.rubrica);
        if (arr) arr.push(l);
        else groups.set(l.rubrica, [l]);
      }
      const body: any[][] = [];
      const styles: Array<{ fill?: [number, number, number]; bold?: boolean } | null> = [];
      for (const [rubrica, lines] of groups) {
        const sub = lines.reduce((s, l) => s + l.amount, 0);
        body.push([rubrica, "", "", money(sub)]);
        styles.push({ fill: GREY, bold: true });
        for (const l of lines) {
          body.push([`      ${l.description}`, l.cityLabel, l.hasTransaction ? "sim" : "não", money(l.amount)]);
          styles.push(null);
        }
      }
      table({
        head: ["Rubrica / linha", "Cidade", "Tem transação", "Valor"],
        body,
        foot: [["TOTAL", "", "", money(p.bpTotal)]],
        widths: [width - 92, 30, 24, 38],
        aligns: ["left", "left", "center", "right"],
        fontSize: 7.6,
        rowStyle: (i) => styles[i] ?? null,
      });
    }

    if (p.paidExpenses.length > 0) {
      subTitle("Transações pagas pelo sócio");
      const paid = reconcileDisplayValues(p.paidExpenses.map((e) => e.amount), p.paidExpensesTotal);
      table({
        head: ["Descrição", "Cidade", "Categoria", "Data", "Valor"],
        body: p.paidExpenses.map((e, i) => [e.description, e.cityLabel, e.category, dt(e.date), money(paid[i])]),
        foot: [["TOTAL", "", "", "", money(p.paidExpensesTotal)]],
        widths: [width - 116, 26, 40, 18, 32],
        aligns: ["left", "left", "left", "center", "right"],
        fontSize: 7.6,
      });
    }

    if (p.adjustments.length > 0) {
      subTitle("Ajustes ao desembolso");
      const adj = reconcileDisplayValues(p.adjustments.map((a) => a.amount), p.adjustmentsTotal);
      smallTable({
        head: ["Descrição", "Cidade", "Data", "Valor"],
        body: p.adjustments.map((a, i) => [a.description, a.cityLabel, dt(a.date), money(adj[i])]),
        foot: [["TOTAL", "", "", money(p.adjustmentsTotal)]],
        widths: [width - 92, 30, 22, 40],
        aligns: ["left", "left", "center", "right"],
        fontSize: 7.6,
      });
    }

    if (p.revenuesHeld.length > 0) {
      subTitle("Receitas do evento em poder do sócio");
      const held = reconcileDisplayValues(p.revenuesHeld.map((r) => r.amount), p.revenuesHeldTotal);
      table({
        head: ["Fonte", "Conta / operação", "Descrição", "Data", "Valor"],
        body: p.revenuesHeld.map((r, i) => [r.sourceLabel, r.accountName, r.description, dt(r.date), money(held[i])]),
        foot: [["TOTAL", "", "", "", money(p.revenuesHeldTotal)]],
        widths: [32, 40, width - 124, 20, 32],
        aligns: ["left", "left", "left", "center", "right"],
        fontSize: 7.6,
      });
    }

    if (p.extras.length > 0) {
      subTitle("Extras / adiantamentos ao sócio");
      const ex = reconcileDisplayValues(p.extras.map((e) => e.amount), p.extrasTotal);
      smallTable({
        head: ["Origem", "Descrição", "Cidade", "Data", "Valor"],
        body: p.extras.map((e, i) => [e.originLabel ?? "—", e.description, e.cityLabel, dt(e.date), money(ex[i])]),
        foot: [["TOTAL", "", "", "", money(p.extrasTotal)]],
        widths: [22, width - 118, 30, 20, 46],
        aligns: ["left", "left", "left", "center", "right"],
        fontSize: 7.6,
      });
    }

    if (p.transitoryItems.length > 0) {
      subTitle("Cauções / transitórias pagas pelo sócio");
      table({
        head: ["Descrição", "Categoria", "Data", "Tipo", "Valor"],
        body: p.transitoryItems.map((t) => [
          t.description,
          t.category,
          dt(t.date),
          t.sign > 0 ? "Caução" : "Devolução",
          `${t.sign > 0 ? "+" : "-"}${money(t.amount)}`,
        ]),
        foot: [["Crédito líquido", "", "", "", money(p.transitoryCredit)]],
        widths: [46, width - 152, 20, 20, 46],
        aligns: ["left", "left", "center", "center", "right"],
        fontSize: 7.6,
      });
    }
  }

  // ===== 5. POSIÇÃO DA MUNDO PROPÍCIO =====
  if (input.house) {
    const h = input.house;
    nextSection("Posição da Mundo Propício (interno)", 4 + h.deductions.length);
    const body: any[][] = [["Resultado do evento (s/IVA)", money(h.resultRealNet)]];
    for (const d of h.deductions) body.push([`(-) ${d.name} · ${d.basisLabel}`, money(-Math.abs(d.value))]);
    body.push(["Posição real", money(h.positionReal)]);
    body.push(["Quota nominal", money(h.nominalShare)]);
    body.push(["IVA dedutível retido", money(h.ivaDeductibleGain)]);
    if (Math.abs(h.vatNonRecoverableCost) > 0.004) {
      body.push(["IVA não recuperável (custo, fora da devolução)", money(-Math.abs(h.vatNonRecoverableCost))]);
      for (const l of h.vatNonRecoverableLines) body.push([`      ${l.label}`, money(l.vat)]);
    }
    const boldIdx = new Set([1 + h.deductions.length]);
    smallTable({
      head: ["", "Valor"],
      body,
      widths: [width - 45, 45],
      boldRows: boldIdx,
      fontSize: 8.4,
    });
  }

  // ===== 6. ANEXOS =====
  if (input.ticketing.length > 0) {
    nextSection(`Anexo A · Bilheteira — totais vendidos (${input.ticketingGroupLabel})`, 4);
    table({
      head: [input.ticketingGroupLabel, "Qtd.", "Total c/IVA"],
      body: input.ticketing.map((r) => [r.label, String(r.quantity), money(r.totalGross)]),
      foot: [[
        "TOTAL",
        String(input.ticketing.reduce((s, r) => s + r.quantity, 0)),
        money(input.ticketing.reduce((s, r) => s + r.totalGross, 0)),
      ]],
      widths: [width - 68, 22, 46],
      aligns: ["left", "right", "right"],
      fontSize: 8,
    });
  }

  if (input.expenseCategories.length > 0) {
    nextSection("Anexo B · Despesas por categoria na base do critério", 4);
    note(`Base: ${input.criterion}. Não são transações realizadas — é a base de custo do critério do evento.`);
    const byL1 = new Map<string, typeof input.expenseCategories>();
    for (const r of input.expenseCategories) {
      const k = `${r.l1Code}|${r.l1Name}`;
      const arr = byL1.get(k);
      if (arr) arr.push(r);
      else byL1.set(k, [r]);
    }
    const body: any[][] = [];
    const styles: Array<{ fill?: [number, number, number]; bold?: boolean } | null> = [];
    // (g15-b) O TOTAL do anexo é o do modelo (a mesma base da secção 1); os
    // grupos absorvem o residual de arredondamento.
    const l1Entries = [...byL1.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
    const modelBase = input.rootTotals.expensesNet;
    const modelIva = report.rootExpenseIva;
    const modelTotal = input.rootTotals.expensesGross;
    const l1Base = reconcileDisplayValues(
      l1Entries.map(([, rows]) => rows.reduce((s, r) => s + r.base, 0)),
      modelBase,
    );
    const l1Iva = reconcileDisplayValues(
      l1Entries.map(([, rows]) => rows.reduce((s, r) => s + r.iva, 0)),
      modelIva,
    );
    const l1Total = reconcileDisplayValues(
      l1Entries.map(([, rows]) => rows.reduce((s, r) => s + r.total, 0)),
      modelTotal,
    );
    l1Entries.forEach(([k, rows], gi) => {
      const [code, name] = k.split("|");
      body.push([`${code} ${name}`.trim(), money(l1Base[gi]), money(l1Iva[gi]), money(l1Total[gi])]);
      styles.push({ fill: [230, 230, 230], bold: true });
      const byL2 = new Map<string, typeof rows>();
      for (const r of rows) {
        const k2 = `${r.l2Code}|${r.l2Name}`;
        const arr2 = byL2.get(k2);
        if (arr2) arr2.push(r);
        else byL2.set(k2, [r]);
      }
      for (const [k2, rows2] of [...byL2.entries()].sort(([a], [z]) =>
        a.localeCompare(z, undefined, { numeric: true }),
      )) {
        const [c2, n2] = k2.split("|");
        body.push([
          `      ${c2} ${n2}`.trim(),
          money(rows2.reduce((s, r) => s + r.base, 0)),
          money(rows2.reduce((s, r) => s + r.iva, 0)),
          money(rows2.reduce((s, r) => s + r.total, 0)),
        ]);
        styles.push({ fill: [245, 245, 245] });
        if (input.expenseCategoryLevel === "l3") {
          for (const r of rows2.sort((a, z) =>
            String(a.l3Code ?? "").localeCompare(String(z.l3Code ?? ""), undefined, { numeric: true }),
          )) {
            if (!r.l3Code || (r.l3Code === r.l2Code && r.l3Name === r.l2Name)) continue;
            body.push([
              `            ${r.l3Code} ${r.l3Name}`.trim(),
              money(r.base),
              money(r.iva),
              money(r.total),
            ]);
            styles.push(null);
          }
        }
      }
    });
    table({
      head: ["Categoria", "Valor s/IVA", "IVA", "Total c/IVA"],
      body,
      foot: [["TOTAL", money(modelBase), money(modelIva), money(modelTotal)]],
      widths: [width - 120, 40, 34, 46],
      aligns: ["left", "right", "right", "right"],
      fontSize: 7.8,
      rowStyle: (i) => styles[i] ?? null,
    });
  }

  // ===== CABEÇALHO E RODAPÉ EM TODAS AS PÁGINAS =====
  const generatedAt = input.generatedAt ?? new Date();
  const total = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(report.title, MARGIN, 12);
    doc.setFontSize(7.4);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110);
    doc.text(`Critério: ${input.criterion}`, MARGIN, 17);
    doc.text(`Emitido em ${format(generatedAt, "dd/MM/yyyy HH:mm")}`, MARGIN, 21);
    doc.text(`Página ${p}/${total}`, pageW - MARGIN, 21, { align: "right" });
    doc.setDrawColor(200);
    doc.line(MARGIN, 23.5, pageW - MARGIN, 23.5);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text("MP Gestão Eventos", MARGIN, pageH - 6);
    doc.setTextColor(0);
  }

  doc.save(`Fecho_${safeFileToken(input.eventName)}_${safeFileToken(input.settlementName)}.pdf`);
}

export type { InternalPartnerBlock };
