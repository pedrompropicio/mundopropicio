import * as XLSX from "xlsx";

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT");
}

function fmtVal(v: number): number {
  return Math.round(v * 100) / 100;
}

export function exportMovementReconciliationToExcel(
  movements: any[],
  accountLabel: string,
  dateFrom: string,
  dateTo: string,
  totalPaid: number,
  totalReceived: number
) {
  const wb = XLSX.utils.book_new();
  const periodLabel = dateFrom && dateTo ? `${fmtDate(dateFrom)} a ${fmtDate(dateTo)}` : "Período Completo";

  const rows: any[][] = [
    [`RELATÓRIO DE MOVIMENTAÇÕES`],
    [`Contas: ${accountLabel}`],
    [`Período: ${periodLabel}`],
    [],
    ["Data", "Tipo", "Descrição", "Especificação", "Evento", "Fornecedor", "Conta", "Estado",
     "IVA %", "Líquido (€)", "IVA (€)", "Bruto (€)", "Pago (€)", "Aberto (€)", "Vencimento", "Dt Pgto", "Nº Doc"],
  ];

  movements.forEach((m) => {
    rows.push([
      fmtDate(m.date),
      m.type,
      m.description,
      m.specification || "",
      m.eventName,
      m.supplierName,
      m.accountName,
      m.status,
      m.ivaRate,
      fmtVal(m.netAmount),
      fmtVal(m.ivaAmount),
      fmtVal(m.isExpense ? -m.amount : m.amount),
      fmtVal(m.paidAmount),
      fmtVal(m.balance),
      m.dueDate ? fmtDate(m.dueDate) : "",
      m.paymentDate ? fmtDate(m.paymentDate) : "",
      m.invoiceRef || "",
    ]);
  });

  const totalExpenses = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.amount, 0);
  const totalIncome = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.amount, 0);
  const totalNetExp = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.netAmount, 0);
  const totalNetInc = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.netAmount, 0);
  const totalIvaExp = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.ivaAmount, 0);
  const totalIvaInc = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.ivaAmount, 0);
  const totalOpenExp = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.balance, 0);
  const totalOpenInc = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.balance, 0);

  rows.push([]);
  rows.push(["", "", "", "", "", "", "", "DESPESAS", "", fmtVal(totalNetExp), fmtVal(totalIvaExp), fmtVal(-totalExpenses), fmtVal(totalPaid), fmtVal(totalOpenExp)]);
  rows.push(["", "", "", "", "", "", "", "RECEITAS", "", fmtVal(totalNetInc), fmtVal(totalIvaInc), fmtVal(totalIncome), fmtVal(totalReceived), fmtVal(totalOpenInc)]);
  rows.push(["", "", "", "", "", "", "", "SALDO", "", fmtVal(totalNetInc - totalNetExp), fmtVal(totalIvaInc - totalIvaExp), fmtVal(totalIncome - totalExpenses), fmtVal(totalReceived - totalPaid), fmtVal(totalOpenInc - totalOpenExp)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 10 }, { wch: 28 }, { wch: 18 }, { wch: 18 },
    { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 6 }, { wch: 14 },
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 12 }, { wch: 15 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Movimentações");
  const fileName = dateFrom && dateTo ? `Movimentacoes_${dateFrom}_${dateTo}.xlsx` : `Movimentacoes_Completo.xlsx`;
  XLSX.writeFile(wb, fileName);
}
