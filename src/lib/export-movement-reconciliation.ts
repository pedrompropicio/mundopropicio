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
  const periodLabel = dateFrom && dateTo
    ? `${fmtDate(dateFrom)} a ${fmtDate(dateTo)}`
    : "Período Completo";

  const rows: any[][] = [
    [`RELATÓRIO DE MOVIMENTAÇÕES`],
    [`Contas: ${accountLabel}`],
    [`Período: ${periodLabel}`],
    [],
    ["Data", "Tipo", "Descrição", "Especificação", "Evento", "Fornecedor", "Conta", "Estado", "Valor (€)", "Pago (€)", "Aberto (€)", "IVA %", "Nº Doc", "Vencimento"],
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
      fmtVal(m.isExpense ? -m.amount : m.amount),
      fmtVal(m.paidAmount),
      fmtVal(m.balance),
      m.ivaRate,
      m.invoiceRef || "",
      m.dueDate ? fmtDate(m.dueDate) : "",
    ]);
  });

  const totalExpenses = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.amount, 0);
  const totalIncome = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.amount, 0);
  const totalOpenExp = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.balance, 0);
  const totalOpenInc = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.balance, 0);

  rows.push([]);
  rows.push(["", "", "", "", "", "", "", "Total Despesas:", fmtVal(-totalExpenses), fmtVal(totalPaid), fmtVal(totalOpenExp)]);
  rows.push(["", "", "", "", "", "", "", "Total Receitas:", fmtVal(totalIncome), fmtVal(totalReceived), fmtVal(totalOpenInc)]);
  rows.push(["", "", "", "", "", "", "", "Saldo:", fmtVal(totalIncome - totalExpenses)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 20 }, { wch: 20 },
    { wch: 20 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 6 }, { wch: 15 }, { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Movimentações");
  const fileName = dateFrom && dateTo
    ? `Movimentacoes_${dateFrom}_${dateTo}.xlsx`
    : `Movimentacoes_Completo.xlsx`;
  XLSX.writeFile(wb, fileName);
}
