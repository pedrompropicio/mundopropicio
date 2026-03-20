import * as XLSX from "xlsx";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("pt-PT");
}

function fmtDateTime(d: string) {
  const dt = new Date(d);
  return `${dt.toLocaleDateString("pt-PT")} ${dt.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`;
}

function fmtVal(v: number): number {
  return Math.round(v * 100) / 100;
}

export function exportMovementReconciliationToExcel(
  movements: any[],
  accountLabel: string,
  dateFrom: string,
  dateTo: string,
  totalPayments: number,
  totalReceipts: number
) {
  const wb = XLSX.utils.book_new();

  const rows: any[][] = [
    [`RELATÓRIO DE MOVIMENTAÇÕES — CONCILIAÇÃO`],
    [`Contas: ${accountLabel}`],
    [`Período: ${fmtDate(dateFrom)} a ${fmtDate(dateTo)}`],
    [],
    ["Data/Hora", "Tipo", "Conta", "Descrição", "Evento", "Fornecedor", "Nº Doc", "Valor Mov. (€)", "Valor Total (€)", "IVA %", "Nota", "Utilizador"],
  ];

  movements.forEach((m) => {
    rows.push([
      fmtDateTime(m.date),
      m.type,
      m.accountName,
      m.transactionDescription,
      m.eventName,
      m.supplierName,
      m.invoiceRef || "",
      fmtVal(m.isPayment ? -m.movementAmount : m.movementAmount),
      fmtVal(m.totalAmount),
      m.ivaRate,
      m.note || "",
      m.changedBy,
    ]);
  });

  rows.push([]);
  rows.push(["", "", "", "", "", "", "Total Pagamentos:", fmtVal(-totalPayments)]);
  rows.push(["", "", "", "", "", "", "Total Recebimentos:", fmtVal(totalReceipts)]);
  rows.push(["", "", "", "", "", "", "Saldo:", fmtVal(totalReceipts - totalPayments)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 30 }, { wch: 20 },
    { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 6 },
    { wch: 25 }, { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Movimentações");
  XLSX.writeFile(wb, `Movimentacoes_${dateFrom}_${dateTo}.xlsx`);
}
