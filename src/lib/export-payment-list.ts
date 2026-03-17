import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrencyDecimal, formatDate } from "@/lib/mock-data";

interface PaymentItem {
  description: string;
  event_name: string;
  supplier_name: string;
  iban: string;
  amount: number;
  iva_rate: number;
  paid_amount: number;
  due_date: string | null;
  date: string;
}

interface PaymentListExport {
  title: string;
  payment_date: string;
  approved_by: string | null;
  approved_at: string | null;
  items: PaymentItem[];
}

function calcWithIva(amount: number, ivaRate: number): number {
  return amount * (1 + ivaRate / 100);
}

export function exportPaymentListToExcel(data: PaymentListExport) {
  const wb = XLSX.utils.book_new();

  const rows: any[][] = [
    [`CONTAS A PAGAR DO DIA - ${data.title}`],
    [`Data: ${formatDate(data.payment_date)}`],
    ...(data.approved_by ? [[`Aprovado por: ${data.approved_by} em ${data.approved_at ? formatDate(data.approved_at) : ""}`]] : []),
    [],
    ["#", "Evento", "Descrição", "Fornecedor", "IBAN", "Valor Base (€)", "IVA (%)", "Valor c/IVA (€)", "Já Pago (€)", "Saldo (€)", "Vencimento"],
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
      item.event_name,
      item.description,
      item.supplier_name,
      item.iban,
      item.amount,
      `${item.iva_rate}%`,
      withIva,
      item.paid_amount,
      balance,
      item.due_date ? formatDate(item.due_date) : "-",
    ]);
  });

  rows.push([]);
  rows.push(["", "", "TOTAL", "", "", "", "", totalWithIva, totalPaid, totalWithIva - totalPaid, ""]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 4 },
    { wch: 22 },
    { wch: 30 },
    { wch: 20 },
    { wch: 28 },
    { wch: 14 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Contas a Pagar");
  XLSX.writeFile(wb, `Contas_Pagar_${data.payment_date}.xlsx`);
}

export function exportPaymentListToPDF(data: PaymentListExport) {
  const doc = new jsPDF({ orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const lineHeight = 6;
  let y = 14;

  try {
    const logoHeight = 22;
    const logoWidth = 78;
    doc.addImage(logoHorizontal, "PNG", marginLeft, y, logoWidth, logoHeight);
    y += logoHeight + 6;
  } catch {
    y += 4;
  }

  doc.setFontSize(16);
  doc.text(`Contas a Pagar do Dia - ${data.title}`, marginLeft, y);
  y += 10;
  doc.setFontSize(10);
  doc.text(`Data: ${formatDate(data.payment_date)}`, marginLeft, y);
  y += 6;

  if (data.approved_by) {
    doc.text(`Aprovado por: ${data.approved_by} em ${data.approved_at ? formatDate(data.approved_at) : ""}`, marginLeft, y);
    y += 6;
  }

  y += 4;
  let totalValue = 0;

  data.items.forEach((item, i) => {
    const withIva = calcWithIva(item.amount, item.iva_rate);
    totalValue += withIva;

    if (y + lineHeight * 6 > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 18;
    }

    if (i > 0) {
      doc.setDrawColor(200, 200, 200);
      doc.line(marginLeft, y - 2, pageWidth - marginLeft, y - 2);
      y += 2;
    }

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`${i + 1}.`, marginLeft, y);
    doc.setFont("helvetica", "normal");

    const labelX = marginLeft + 8;
    const valueX = marginLeft + 38;

    doc.setTextColor(120, 120, 120);
    doc.text("Evento:", labelX, y);
    doc.setTextColor(0, 0, 0);
    doc.text(item.event_name, valueX, y);
    y += lineHeight;

    doc.setTextColor(120, 120, 120);
    doc.text("IBAN:", labelX, y);
    doc.setTextColor(0, 0, 0);
    doc.text(item.iban || "-", valueX, y);
    y += lineHeight;

    doc.setTextColor(120, 120, 120);
    doc.text("Fornecedor:", labelX, y);
    doc.setTextColor(0, 0, 0);
    doc.text(item.supplier_name, valueX, y);
    y += lineHeight;

    doc.setTextColor(120, 120, 120);
    doc.text("Descrição:", labelX, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text(item.description, valueX, y);
    doc.setFont("helvetica", "normal");
    y += lineHeight;

    doc.setTextColor(120, 120, 120);
    doc.text("Valor:", labelX, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrencyDecimal(withIva), valueX, y);
    doc.setFont("helvetica", "normal");
    y += lineHeight + 4;
  });

  doc.setDrawColor(100, 100, 100);
  doc.line(marginLeft, y - 2, pageWidth - marginLeft, y - 2);
  y += 4;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${formatCurrencyDecimal(totalValue)}`, marginLeft, y);

  doc.save(`Contas_Pagar_${data.payment_date}.pdf`);
}