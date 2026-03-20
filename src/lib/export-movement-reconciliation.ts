import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrency } from "@/lib/mock-data";

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT");
}

function fmtVal(v: number): number {
  return Math.round(v * 100) / 100;
}

function fmtCur(v: number): string {
  return formatCurrency(v);
}

interface MovementExportParams {
  movements: any[];
  accountLabel: string;
  eventLabel: string;
  dateFrom: string;
  dateTo: string;
  totalPaid: number;
  totalReceived: number;
}

function groupByEvent(movements: any[]) {
  const grouped = new Map<string, { eventName: string; items: any[] }>();
  movements.forEach((m) => {
    const key = m.eventId || "__no_event__";
    if (!grouped.has(key)) grouped.set(key, { eventName: m.eventName, items: [] });
    grouped.get(key)!.items.push(m);
  });
  return grouped;
}

function calcTotals(movements: any[]) {
  const totalExpenses = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.amount, 0);
  const totalIncome = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.amount, 0);
  const totalNetExp = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.netAmount, 0);
  const totalNetInc = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.netAmount, 0);
  const totalIvaExp = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.ivaAmount, 0);
  const totalIvaInc = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.ivaAmount, 0);
  const totalOpenExp = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.balance, 0);
  const totalOpenInc = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.balance, 0);
  return { totalExpenses, totalIncome, totalNetExp, totalNetInc, totalIvaExp, totalIvaInc, totalOpenExp, totalOpenInc };
}

function buildPeriodLabel(dateFrom: string, dateTo: string) {
  return dateFrom && dateTo ? `${fmtDate(dateFrom)} a ${fmtDate(dateTo)}` : "Período Completo";
}

export function exportMovementReconciliationToExcel(params: MovementExportParams) {
  const { movements, accountLabel, dateFrom, dateTo, totalPaid, totalReceived } = params;
  const wb = XLSX.utils.book_new();
  const periodLabel = buildPeriodLabel(dateFrom, dateTo);

  const headerRow = ["Data", "Tipo", "Descrição", "Fornecedor", "Conta", "Estado",
    "IVA %", "Líquido (€)", "IVA (€)", "Bruto (€)", "Pago (€)", "Aberto (€)", "Vencimento", "Dt Pgto", "Nº Doc"];

  const rows: any[][] = [
    [`RELATÓRIO DE MOVIMENTAÇÕES`],
    [`Contas: ${accountLabel}`],
    [`Período: ${periodLabel}`],
    [],
  ];

  const grouped = groupByEvent(movements);

  grouped.forEach((group) => {
    rows.push([group.eventName === "—" ? "Sem Evento" : group.eventName]);
    rows.push(headerRow);

    group.items.forEach((m) => {
      rows.push([
        fmtDate(m.date), m.type, m.description, m.supplierName, m.accountName, m.status,
        m.ivaRate, fmtVal(m.netAmount), fmtVal(m.ivaAmount),
        fmtVal(m.isExpense ? -m.amount : m.amount), fmtVal(m.paidAmount), fmtVal(m.balance),
        m.dueDate ? fmtDate(m.dueDate) : "", m.paymentDate ? fmtDate(m.paymentDate) : "", m.invoiceRef || "",
      ]);
    });
    rows.push([]);
  });

  const t = calcTotals(movements);
  rows.push(["", "", "", "", "", "DESPESAS", "", fmtVal(t.totalNetExp), fmtVal(t.totalIvaExp), fmtVal(-t.totalExpenses), fmtVal(totalPaid), fmtVal(t.totalOpenExp)]);
  rows.push(["", "", "", "", "", "RECEITAS", "", fmtVal(t.totalNetInc), fmtVal(t.totalIvaInc), fmtVal(t.totalIncome), fmtVal(totalReceived), fmtVal(t.totalOpenInc)]);
  rows.push(["", "", "", "", "", "SALDO", "", fmtVal(t.totalNetInc - t.totalNetExp), fmtVal(t.totalIvaInc - t.totalIvaExp), fmtVal(t.totalIncome - t.totalExpenses), fmtVal(totalReceived - totalPaid), fmtVal(t.totalOpenInc - t.totalOpenExp)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 10 }, { wch: 28 }, { wch: 18 },
    { wch: 16 }, { wch: 12 }, { wch: 6 }, { wch: 14 },
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 12 }, { wch: 15 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Movimentações");
  const fileName = dateFrom && dateTo ? `Movimentacoes_${dateFrom}_${dateTo}.xlsx` : `Movimentacoes_Completo.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportMovementReconciliationToPDF(params: MovementExportParams) {
  const { movements, accountLabel, eventLabel, dateFrom, dateTo, totalPaid, totalReceived } = params;
  const doc = new jsPDF({ orientation: "landscape" });
  const marginLeft = 14;
  let y = 14;

  // Logo
  try {
    doc.addImage(logoHorizontal, "PNG", marginLeft, y, 78, 22);
    y += 28;
  } catch {
    y += 4;
  }

  // Title
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text("Relatório de Movimentações", marginLeft, y);
  y += 7;

  // Subtitle
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  const periodLabel = buildPeriodLabel(dateFrom, dateTo);
  doc.text(`Período: ${periodLabel} | Contas: ${accountLabel} | Evento: ${eventLabel}`, marginLeft, y);
  y += 6;
  doc.setTextColor(0, 0, 0);

  const head = ["Data", "Tipo", "Descrição", "Fornecedor", "Conta", "Estado",
    "IVA%", "Líquido", "IVA (€)", "Bruto", "Pago", "Aberto", "Vcto", "Dt Pgto", "Nº Doc"];

  const grouped = groupByEvent(movements);
  const groupEntries = Array.from(grouped.entries());

  groupEntries.forEach(([, group], gi) => {
    if (gi > 0) y += 4;

    // Event header
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(group.eventName === "—" ? "Sem Evento" : group.eventName, marginLeft, y);
    doc.setFont("helvetica", "normal");
    y += 2;

    const tableData = group.items.map((m: any) => [
      fmtDate(m.date),
      m.type,
      m.description.length > 30 ? m.description.substring(0, 28) + "…" : m.description,
      m.supplierName.length > 18 ? m.supplierName.substring(0, 16) + "…" : m.supplierName,
      m.accountName.length > 14 ? m.accountName.substring(0, 12) + "…" : m.accountName,
      m.status,
      `${m.ivaRate}%`,
      fmtCur(m.netAmount),
      fmtCur(m.ivaAmount),
      (m.isExpense ? "-" : "+") + fmtCur(m.amount),
      fmtCur(m.paidAmount),
      fmtCur(m.balance),
      m.dueDate ? fmtDate(m.dueDate) : "—",
      m.paymentDate ? fmtDate(m.paymentDate) : "—",
      m.invoiceRef || "—",
    ]);

    autoTable(doc, {
      startY: y,
      head: [head],
      body: tableData,
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: "bold", fontSize: 6 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: marginLeft, right: 10 },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 12 },
        2: { cellWidth: 36 },
        3: { cellWidth: 22 },
        4: { cellWidth: 18 },
        5: { cellWidth: 14 },
        6: { cellWidth: 10 },
        7: { cellWidth: 16, halign: "right" },
        8: { cellWidth: 14, halign: "right" },
        9: { cellWidth: 16, halign: "right" },
        10: { cellWidth: 16, halign: "right" },
        11: { cellWidth: 16, halign: "right" },
        12: { cellWidth: 14 },
        13: { cellWidth: 14 },
        14: { cellWidth: 18 },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 3;
  });

  // Summary totals
  const t = calcTotals(movements);
  y += 2;

  const summaryData = [
    ["DESPESAS", fmtCur(t.totalNetExp), fmtCur(t.totalIvaExp), fmtCur(t.totalExpenses), fmtCur(totalPaid), fmtCur(t.totalOpenExp)],
    ["RECEITAS", fmtCur(t.totalNetInc), fmtCur(t.totalIvaInc), fmtCur(t.totalIncome), fmtCur(totalReceived), fmtCur(t.totalOpenInc)],
    ["SALDO", fmtCur(t.totalNetInc - t.totalNetExp), fmtCur(t.totalIvaInc - t.totalIvaExp), fmtCur(t.totalIncome - t.totalExpenses), fmtCur(totalReceived - totalPaid), fmtCur(t.totalOpenInc - t.totalOpenExp)],
  ];

  autoTable(doc, {
    startY: y,
    head: [["", "Líquido", "IVA", "Bruto", "Pago/Receb.", "Aberto"]],
    body: summaryData,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: "bold" },
    bodyStyles: { fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: marginLeft, right: 10 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  });

  const fileName = dateFrom && dateTo ? `Movimentacoes_${dateFrom}_${dateTo}.pdf` : `Movimentacoes_Completo.pdf`;
  doc.save(fileName);
}
