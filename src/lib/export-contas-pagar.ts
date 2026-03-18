import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrencyDecimal, formatDate } from "@/lib/mock-data";

interface ContasPagarItem {
  description: string;
  specification: string | null;
  event_name: string;
  supplier_name: string;
  iban: string;
  category_name: string;
  amount: number;
  iva_rate: number;
  paid_amount: number;
  due_date: string | null;
  date: string;
  status: string;
}

interface ContasPagarExport {
  dateFrom: string | null;
  dateTo: string | null;
  eventNames: string[] | null;
  items: ContasPagarItem[];
}

function calcWithIva(amount: number, ivaRate: number): number {
  return amount * (1 + ivaRate / 100);
}

function buildSubtitle(data: ContasPagarExport): string {
  const parts: string[] = [];
  if (data.dateFrom || data.dateTo) {
    parts.push(`Período: ${data.dateFrom ?? "—"} a ${data.dateTo ?? "—"}`);
  }
  if (data.eventNames && data.eventNames.length > 0) {
    parts.push(`Eventos: ${data.eventNames.join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" | ") : "Todos os eventos, sem filtro de data";
}

export function exportContasPagarToExcel(data: ContasPagarExport) {
  const wb = XLSX.utils.book_new();
  const subtitle = buildSubtitle(data);

  const rows: any[][] = [
    ["RELATÓRIO DE CONTAS A PAGAR"],
    [subtitle],
    [],
    ["#", "Data", "Evento", "Fornecedor", "Descrição", "Especificação", "Estado", "Valor Base (€)", "IVA (%)", "Valor c/IVA (€)", "Já Pago (€)", "Saldo (€)", "Vencimento"],
  ];

  let totalWithIva = 0;
  let totalPaid = 0;

  data.items.forEach((item, i) => {
    const withIva = calcWithIva(item.amount, item.iva_rate);
    const balance = withIva - item.paid_amount;
    totalWithIva += withIva;
    totalPaid += item.paid_amount;
    rows.push([
      i + 1,
      formatDate(item.date),
      item.event_name,
      item.supplier_name,
      item.description,
      item.specification ?? "",
      item.status,
      item.amount,
      `${item.iva_rate}%`,
      withIva,
      item.paid_amount,
      balance,
      item.due_date ? formatDate(item.due_date) : "-",
    ]);
  });

  rows.push([]);
  rows.push(["", "", "", "", "TOTAL", "", "", "", "", totalWithIva, totalPaid, totalWithIva - totalPaid, ""]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 4 }, { wch: 12 }, { wch: 22 }, { wch: 20 }, { wch: 30 }, { wch: 20 },
    { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Contas a Pagar");

  const filename = `Contas_Pagar_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportContasPagarToPDF(data: ContasPagarExport) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  let y = 14;

  try {
    doc.addImage(logoHorizontal, "PNG", marginLeft, y, 78, 22);
    y += 28;
  } catch {
    y += 4;
  }

  doc.setFontSize(16);
  doc.text("Relatório de Contas a Pagar", marginLeft, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(buildSubtitle(data), marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 8;

  let totalWithIva = 0;
  let totalPaid = 0;

  const tableData = data.items.map((item, i) => {
    const withIva = calcWithIva(item.amount, item.iva_rate);
    const balance = withIva - item.paid_amount;
    totalWithIva += withIva;
    totalPaid += item.paid_amount;
    return [
      String(i + 1),
      formatDate(item.date),
      item.event_name,
      item.supplier_name,
      item.description,
      item.status,
      formatCurrencyDecimal(withIva),
      formatCurrencyDecimal(item.paid_amount),
      formatCurrencyDecimal(balance),
      item.due_date ? formatDate(item.due_date) : "-",
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["#", "Data", "Evento", "Fornecedor", "Descrição", "Estado", "Valor c/IVA", "Pago", "Saldo", "Vencimento"]],
    body: tableData,
    foot: [["", "", "", "", "TOTAL", "", formatCurrencyDecimal(totalWithIva), formatCurrencyDecimal(totalPaid), formatCurrencyDecimal(totalWithIva - totalPaid), ""]],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: marginLeft, right: 14 },
  });

  const filename = `Contas_Pagar_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
