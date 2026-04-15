import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrencyDecimal, formatDate } from "@/lib/mock-data";
import { applyPTNumberFormat } from "@/lib/excel-format";

export interface PaymentItem {
  description: string;
  specification?: string;
  category?: string;
  event_name: string;
  supplier_name: string;
  supplier_id?: string | null;
  iban: string;
  amount: number;
  iva_rate: number;
  paid_amount: number;
  due_date: string | null;
  date: string;
  payment_method?: string;
  payment_entity?: string | null;
  payment_reference?: string | null;
  invoice_ref?: string | null;
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

export interface PaymentGroup {
  supplier_name: string;
  supplier_id: string | null;
  invoice_ref: string;
  iban: string;
  payment_method?: string;
  payment_entity?: string | null;
  payment_reference?: string | null;
  items: PaymentItem[];
  totalWithIva: number;
}

/** Groups items that share the same supplier + invoice_ref (>1 item). Others remain ungrouped. */
export function groupPaymentItems(items: PaymentItem[]): { groups: PaymentGroup[]; ungrouped: PaymentItem[] } {
  const groups: PaymentGroup[] = [];
  const ungrouped: PaymentItem[] = [];
  const map = new Map<string, PaymentItem[]>();

  for (const item of items) {
    const ref = item.invoice_ref?.trim();
    const sid = item.supplier_id ?? "";
    if (ref && sid) {
      const key = `${sid}::${ref}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    } else {
      ungrouped.push(item);
    }
  }

  for (const [, groupItems] of map) {
    if (groupItems.length > 1) {
      const first = groupItems[0];
      const totalWithIva = groupItems.reduce((s, i) => s + calcWithIva(i.amount, i.iva_rate), 0);
      groups.push({
        supplier_name: first.supplier_name,
        supplier_id: first.supplier_id ?? null,
        invoice_ref: first.invoice_ref!,
        iban: first.iban,
        payment_method: first.payment_method,
        payment_entity: first.payment_entity,
        payment_reference: first.payment_reference,
        items: groupItems,
        totalWithIva,
      });
    } else {
      ungrouped.push(...groupItems);
    }
  }

  return { groups, ungrouped };
}

export function exportPaymentListToExcel(data: PaymentListExport) {
  const wb = XLSX.utils.book_new();
  const { groups, ungrouped } = groupPaymentItems(data.items);

  const rows: any[][] = [
    [`CONTAS A PAGAR DO DIA - ${data.title}`],
    [`Data: ${formatDate(data.payment_date)}`],
    ...(data.approved_by ? [[`Aprovado por: ${data.approved_by} em ${data.approved_at ? formatDate(data.approved_at) : ""}`]] : []),
    [],
    ["#", "Evento", "Categoria", "Descrição", "Especificação", "Fornecedor", "Nº Fatura", "IBAN / Dados Pgto", "Valor Base (€)", "IVA (%)", "Valor c/IVA (€)", "Já Pago (€)", "Saldo (€)", "Vencimento"],
  ];

  let totalWithIva = 0;
  let totalPaid = 0;
  let idx = 1;

  // Render grouped items first
  for (const group of groups) {
    const isRefPayment = group.payment_method === "service_payment" || group.payment_method === "state_payment";
    const paymentInfo = isRefPayment
      ? `Ent: ${group.payment_entity ?? "-"} / Ref: ${group.payment_reference ?? "-"}`
      : group.iban;

    // Group header row
    rows.push([
      `${idx}`,
      "",
      "",
      `AGRUPADO — Fatura: ${group.invoice_ref}`,
      "",
      group.supplier_name,
      group.invoice_ref,
      paymentInfo,
      "",
      "",
      group.totalWithIva,
      "",
      "",
      "",
    ]);
    totalWithIva += group.totalWithIva;

    // Sub-items
    for (const item of group.items) {
      const withIva = calcWithIva(item.amount, item.iva_rate);
      const balance = withIva - item.paid_amount;
      totalPaid += item.paid_amount;

      rows.push([
        "",
        item.event_name,
        item.category || "-",
        `  ↳ ${item.description}`,
        item.specification || "-",
        "",
        "",
        "",
        item.amount,
        `${item.iva_rate}%`,
        withIva,
        item.paid_amount,
        balance,
        item.due_date ? formatDate(item.due_date) : "-",
      ]);
    }
    idx++;
  }

  // Render ungrouped items
  for (const item of ungrouped) {
    const withIva = calcWithIva(item.amount, item.iva_rate);
    const balance = withIva - item.paid_amount;
    totalWithIva += withIva;
    totalPaid += item.paid_amount;

    const isRefPayment = item.payment_method === "service_payment" || item.payment_method === "state_payment";
    const paymentInfo = isRefPayment
      ? `Ent: ${item.payment_entity ?? "-"} / Ref: ${item.payment_reference ?? "-"}`
      : item.iban;

    rows.push([
      idx,
      item.event_name,
      item.category || "-",
      item.description,
      item.specification || "-",
      item.supplier_name,
      item.invoice_ref || "-",
      paymentInfo,
      item.amount,
      `${item.iva_rate}%`,
      withIva,
      item.paid_amount,
      balance,
      item.due_date ? formatDate(item.due_date) : "-",
    ]);
    idx++;
  }

  rows.push([]);
  rows.push(["", "", "", "", "TOTAL", "", "", "", totalWithIva, "", "", totalPaid, totalWithIva - totalPaid, ""]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 4 },
    { wch: 22 },
    { wch: 20 },
    { wch: 30 },
    { wch: 20 },
    { wch: 20 },
    { wch: 16 },
    { wch: 28 },
    { wch: 14 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];
  applyPTNumberFormat(ws);
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
  let itemIdx = 0;

  const { groups, ungrouped } = groupPaymentItems(data.items);

  const labelX = marginLeft + 8;
  const valueX = marginLeft + 38;

  const checkPage = (linesNeeded: number) => {
    if (y + lineHeight * linesNeeded > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 18;
    }
  };

  const renderSeparator = () => {
    if (itemIdx > 0) {
      doc.setDrawColor(200, 200, 200);
      doc.line(marginLeft, y - 2, pageWidth - marginLeft, y - 2);
      y += 2;
    }
  };

  // Render grouped items
  for (const group of groups) {
    checkPage(6 + group.items.length * 4);
    renderSeparator();

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`${itemIdx + 1}.`, marginLeft, y);
    doc.setFont("helvetica", "normal");

    // Supplier + invoice header
    doc.setTextColor(120, 120, 120);
    doc.text("Fornecedor:", labelX, y);
    doc.setTextColor(0, 0, 0);
    doc.text(group.supplier_name, valueX, y);
    y += lineHeight;

    doc.setTextColor(120, 120, 120);
    doc.text("Fatura:", labelX, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text(group.invoice_ref, valueX, y);
    doc.setFont("helvetica", "normal");
    y += lineHeight;

    const isRefPayment = group.payment_method === "service_payment" || group.payment_method === "state_payment";
    if (isRefPayment) {
      doc.setTextColor(120, 120, 120);
      doc.text("Entidade:", labelX, y);
      doc.setTextColor(0, 0, 0);
      doc.text(group.payment_entity ?? "-", valueX, y);
      y += lineHeight;

      doc.setTextColor(120, 120, 120);
      doc.text("Referência:", labelX, y);
      doc.setTextColor(0, 0, 0);
      doc.text(group.payment_reference ?? "-", valueX, y);
      y += lineHeight;
    } else {
      doc.setTextColor(120, 120, 120);
      doc.text("IBAN:", labelX, y);
      doc.setTextColor(0, 0, 0);
      doc.text(group.iban || "-", valueX, y);
      y += lineHeight;
    }

    // Sub-items
    for (const item of group.items) {
      checkPage(3);
      const withIva = calcWithIva(item.amount, item.iva_rate);
      doc.setTextColor(120, 120, 120);
      doc.text("  ↳", labelX, y);
      doc.setTextColor(0, 0, 0);
      const descLine = `${item.description}${item.event_name ? ` (${item.event_name})` : ""} — ${formatCurrencyDecimal(withIva)}`;
      doc.text(descLine, labelX + 10, y);
      y += lineHeight;
    }

    // Group total
    doc.setTextColor(120, 120, 120);
    doc.text("Total Fatura:", labelX, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrencyDecimal(group.totalWithIva), valueX, y);
    doc.setFont("helvetica", "normal");
    y += lineHeight + 4;

    totalValue += group.totalWithIva;
    itemIdx++;
  }

  // Render ungrouped items
  for (const item of ungrouped) {
    const withIva = calcWithIva(item.amount, item.iva_rate);
    totalValue += withIva;

    checkPage(6);
    renderSeparator();

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`${itemIdx + 1}.`, marginLeft, y);
    doc.setFont("helvetica", "normal");

    doc.setTextColor(120, 120, 120);
    doc.text("Evento:", labelX, y);
    doc.setTextColor(0, 0, 0);
    doc.text(item.event_name, valueX, y);
    y += lineHeight;

    if (item.category) {
      doc.setTextColor(120, 120, 120);
      doc.text("Categoria:", labelX, y);
      doc.setTextColor(0, 0, 0);
      doc.text(item.category, valueX, y);
      y += lineHeight;
    }

    const isRefPayment = item.payment_method === "service_payment" || item.payment_method === "state_payment";
    if (isRefPayment) {
      doc.setTextColor(120, 120, 120);
      doc.text("Entidade:", labelX, y);
      doc.setTextColor(0, 0, 0);
      doc.text(item.payment_entity ?? "-", valueX, y);
      y += lineHeight;

      doc.setTextColor(120, 120, 120);
      doc.text("Referência:", labelX, y);
      doc.setTextColor(0, 0, 0);
      doc.text(item.payment_reference ?? "-", valueX, y);
      y += lineHeight;
    } else {
      doc.setTextColor(120, 120, 120);
      doc.text("IBAN:", labelX, y);
      doc.setTextColor(0, 0, 0);
      doc.text(item.iban || "-", valueX, y);
      y += lineHeight;
    }

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

    if (item.specification) {
      doc.setTextColor(120, 120, 120);
      doc.text("Especificação:", labelX, y);
      doc.setTextColor(0, 0, 0);
      doc.text(item.specification, valueX, y);
      y += lineHeight;
    }

    doc.setTextColor(120, 120, 120);
    doc.text("Valor:", labelX, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrencyDecimal(withIva), valueX, y);
    doc.setFont("helvetica", "normal");
    y += lineHeight + 4;

    itemIdx++;
  }

  doc.setDrawColor(100, 100, 100);
  doc.line(marginLeft, y - 2, pageWidth - marginLeft, y - 2);
  y += 4;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${formatCurrencyDecimal(totalValue)}`, marginLeft, y);

  doc.save(`Contas_Pagar_${data.payment_date}.pdf`);
}
