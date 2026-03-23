import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrencyDecimal, formatDate } from "@/lib/mock-data";
import { applyPTNumberFormat } from "@/lib/excel-format";

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
  groupByEvent?: boolean;
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

function renderPdfTable(doc: jsPDF, items: ContasPagarItem[], startY: number, marginLeft: number, showEventCol: boolean) {
  let totalWithIva = 0;
  let totalPaid = 0;

  const tableData = items.map((item, i) => {
    const withIva = calcWithIva(item.amount, item.iva_rate);
    const balance = withIva - item.paid_amount;
    totalWithIva += withIva;
    totalPaid += item.paid_amount;
    const row = [
      String(i + 1),
      formatDate(item.date),
      ...(showEventCol ? [item.event_name] : []),
      item.supplier_name,
      item.description,
      item.status,
      formatCurrencyDecimal(withIva),
      formatCurrencyDecimal(item.paid_amount),
      formatCurrencyDecimal(balance),
      item.due_date ? formatDate(item.due_date) : "-",
    ];
    return row;
  });

  const head = [
    "#", "Data",
    ...(showEventCol ? ["Evento"] : []),
    "Fornecedor", "Descrição", "Estado", "Valor c/IVA", "Pago", "Saldo", "Vencimento",
  ];

  const footPadding = showEventCol ? ["", "", "", "", "TOTAL", ""] : ["", "", "", "TOTAL", ""];

  autoTable(doc, {
    startY,
    head: [head],
    body: tableData,
    foot: [[...footPadding, formatCurrencyDecimal(totalWithIva), formatCurrencyDecimal(totalPaid), formatCurrencyDecimal(totalWithIva - totalPaid), ""]],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: marginLeft, right: 14 },
  });

  return { totalWithIva, totalPaid };
}

export function exportContasPagarToPDF(data: ContasPagarExport) {
  const doc = new jsPDF({ orientation: "landscape" });
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

  if (data.groupByEvent) {
    // Group items by event
    const eventMap = new Map<string, ContasPagarItem[]>();
    for (const item of data.items) {
      const key = item.event_name || "Sem evento";
      if (!eventMap.has(key)) eventMap.set(key, []);
      eventMap.get(key)!.push(item);
    }
    const sortedEvents = Array.from(eventMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    let grandTotalWithIva = 0;
    let grandTotalPaid = 0;

    for (const [eventName, items] of sortedEvents) {
      // Check if we need a new page
      const finalY = (doc as any).lastAutoTable?.finalY ?? y;
      if (finalY > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        y = 14;
      } else {
        y = finalY + 6;
      }

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(eventName, marginLeft, y);
      doc.setFont("helvetica", "normal");
      y += 5;

      const { totalWithIva, totalPaid } = renderPdfTable(doc, items, y, marginLeft, false);
      grandTotalWithIva += totalWithIva;
      grandTotalPaid += totalPaid;
    }

    // Grand total
    const finalY = (doc as any).lastAutoTable?.finalY ?? y;
    y = finalY + 8;
    if (y > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 14;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL GERAL — Valor c/IVA: ${formatCurrencyDecimal(grandTotalWithIva)}  |  Pago: ${formatCurrencyDecimal(grandTotalPaid)}  |  Saldo: ${formatCurrencyDecimal(grandTotalWithIva - grandTotalPaid)}`, marginLeft, y);
  } else {
    renderPdfTable(doc, data.items, y, marginLeft, true);
  }

  const filename = `Contas_Pagar_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
