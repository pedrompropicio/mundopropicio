import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrencyDecimal, formatDate } from "@/lib/mock-data";
import { applyPTNumberFormat } from "@/lib/excel-format";
import { computeNetPayable } from "@/lib/withholding";

export interface PaymentItem {
  description: string;
  specification?: string;
  category?: string;
  event_name: string;
  supplier_name: string;
  supplier_trade_name?: string | null;
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
  /** Grupo de fatura formal (transactions.invoice_group_id). É a chave canónica de agrupamento. */
  invoice_group_id?: string | null;
  /** Nº total de transações que existem nesse grupo de fatura (para detetar grupos parciais). */
  group_total_count?: number;
  /** Retenção de IRS declarada (valor absoluto sobre o bruto c/ IVA). */
  declared_withholding_amount?: number;
  /** True quando a transação tem parcelas; nesse caso a retenção não aplica neste fluxo. */
  has_installments?: boolean;
}

interface PaymentListExport {
  title: string;
  payment_date: string;
  approved_by: string | null;
  approved_at: string | null;
  items: PaymentItem[];
}

function calcWithIva(amount: number, ivaRate: number): number {
  const base = Number(amount) || 0;
  const rate = Number(ivaRate) || 0;
  const iva = Math.round(base * (rate / 100) * 100) / 100;
  return Math.round((base + iva) * 100) / 100;
}

/** Líquido a pagar (c/ IVA − retenção IRS declarada) para um item de lista. */
export function itemNetPayable(item: PaymentItem) {
  const withIva = calcWithIva(item.amount, item.iva_rate);
  return computeNetPayable({
    grossWithIva: withIva,
    declaredWithholding: Number(item.declared_withholding_amount ?? 0),
    hasInstallments: !!item.has_installments,
  });
}

/** Returns "Razão Social (Nome Fantasia)" when both exist and differ; otherwise just the legal name. */
export function formatSupplierFullName(name: string | null | undefined, tradeName?: string | null): string {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const legal = (name ?? "").trim().replace(/\s+/g, " ");
  const trade = (tradeName ?? "").trim().replace(/\s+/g, " ");
  if (!legal) return trade || "-";
  if (!trade || norm(trade) === norm(legal)) return legal;
  return `${legal} (${trade})`;
}

/** Formats a number for bank-form pasting: no currency symbol, no thousand separator, comma decimal. */
export function formatAmountForBank(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export interface PaymentGroup {
  supplier_name: string;
  supplier_trade_name?: string | null;
  supplier_id: string | null;
  invoice_ref: string;
  invoice_group_id?: string | null;
  /** Nº total de itens do grupo de fatura na BD (>= items.length quando parcial). */
  group_total_count?: number;
  iban: string;
  payment_method?: string;
  payment_entity?: string | null;
  payment_reference?: string | null;
  items: PaymentItem[];
  totalWithIva: number;
  /** Soma das retenções IRS dos itens (0 se nenhum). */
  totalWithholding: number;
  /** Total líquido a transferir = totalWithIva − totalWithholding. */
  totalNetPayable: number;
}

/** Groups items that share the same supplier + invoice_ref (>1 item). Others remain ungrouped. */
export function groupPaymentItems(items: PaymentItem[]): { groups: PaymentGroup[]; ungrouped: PaymentItem[] } {
  const groups: PaymentGroup[] = [];
  const ungrouped: PaymentItem[] = [];
  const map = new Map<string, PaymentItem[]>();

  for (const item of items) {
    const ref = item.invoice_ref?.trim();
    const sid = item.supplier_id ?? "";
    // Chave canónica: o grupo de fatura formal. Fallback (legado): fornecedor + nº fatura.
    const key = item.invoice_group_id
      ? `grp::${item.invoice_group_id}`
      : ref && sid
        ? `${sid}::${ref}`
        : null;
    if (key) {
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
      const totalWithholding = groupItems.reduce((s, i) => s + itemNetPayable(i).withholding, 0);
      const totalNetPayable = +(totalWithIva - totalWithholding).toFixed(2);
      groups.push({
        supplier_name: first.supplier_name,
        supplier_trade_name: first.supplier_trade_name ?? null,
        supplier_id: first.supplier_id ?? null,
        invoice_ref: first.invoice_ref ?? "—",
        invoice_group_id: first.invoice_group_id ?? null,
        group_total_count: Math.max(
          ...groupItems.map((i) => Number(i.group_total_count ?? 0)),
          groupItems.length,
        ),
        iban: first.iban,
        payment_method: first.payment_method,
        payment_entity: first.payment_entity,
        payment_reference: first.payment_reference,
        items: groupItems,
        totalWithIva: +totalWithIva.toFixed(2),
        totalWithholding: +totalWithholding.toFixed(2),
        totalNetPayable,
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
    ["#", "Evento", "Categoria", "Descrição", "Especificação", "Fornecedor", "Nº Fatura", "IBAN / Dados Pgto", "Valor Base (€)", "IVA (%)", "Valor c/IVA (€)", "Ret. IRS (€)", "Líquido a pagar (€)", "Já Pago (€)", "Saldo (€)", "Vencimento"],
  ];

  let totalWithIva = 0;
  let totalPaid = 0;
  let totalWithholding = 0;
  let totalNet = 0;
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
      formatSupplierFullName(group.supplier_name, group.supplier_trade_name),
      group.invoice_ref,
      paymentInfo,
      "",
      "",
      group.totalWithIva,
      group.totalWithholding || "",
      group.totalNetPayable,
      "",
      "",
      "",
    ]);
    totalWithIva += group.totalWithIva;
    totalWithholding += group.totalWithholding;
    totalNet += group.totalNetPayable;

    // Sub-items
    for (const item of group.items) {
      const withIva = calcWithIva(item.amount, item.iva_rate);
      const balance = withIva - item.paid_amount;
      const np = itemNetPayable(item);
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
        np.applied ? np.withholding : "",
        np.applied ? np.net : withIva,
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
    const np = itemNetPayable(item);
    totalWithIva += withIva;
    totalWithholding += np.withholding;
    totalNet += np.applied ? np.net : withIva;
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
      formatSupplierFullName(item.supplier_name, item.supplier_trade_name),
      item.invoice_ref || "-",
      paymentInfo,
      item.amount,
      `${item.iva_rate}%`,
      withIva,
      np.applied ? np.withholding : "",
      np.applied ? np.net : withIva,
      item.paid_amount,
      balance,
      item.due_date ? formatDate(item.due_date) : "-",
    ]);
    idx++;
  }

  rows.push([]);
  rows.push(["", "", "", "", "TOTAL", "", "", "", "", "", totalWithIva, totalWithholding, totalNet, totalPaid, totalWithIva - totalPaid, ""]);

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
    { wch: 12 },
    { wch: 16 },
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
    doc.text(formatSupplierFullName(group.supplier_name, group.supplier_trade_name), valueX, y);
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
      const np = itemNetPayable(item);
      doc.setTextColor(120, 120, 120);
      doc.text("  ↳", labelX, y);
      doc.setTextColor(0, 0, 0);
      const descLine = np.applied
        ? `${item.description}${item.event_name ? ` (${item.event_name})` : ""} — ${formatCurrencyDecimal(withIva)} (Ret. IRS −${formatCurrencyDecimal(np.withholding)} • Líquido ${formatCurrencyDecimal(np.net)})`
        : `${item.description}${item.event_name ? ` (${item.event_name})` : ""} — ${formatCurrencyDecimal(withIva)}`;
      doc.text(descLine, labelX + 10, y);
      y += lineHeight;
    }

    // Group total
    doc.setTextColor(120, 120, 120);
    doc.text(group.totalWithholding > 0 ? "Líquido a transferir:" : "Total Fatura:", labelX, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrencyDecimal(group.totalNetPayable), valueX, y);
    doc.setFont("helvetica", "normal");
    if (group.totalWithholding > 0) {
      y += lineHeight;
      doc.setTextColor(150, 80, 0);
      doc.text(`(Bruto ${formatCurrencyDecimal(group.totalWithIva)} − Ret. IRS ${formatCurrencyDecimal(group.totalWithholding)})`, valueX, y);
      doc.setTextColor(0, 0, 0);
    }
    y += lineHeight + 4;

    totalValue += group.totalNetPayable;
    itemIdx++;
  }

  // Render ungrouped items
  for (const item of ungrouped) {
    const withIva = calcWithIva(item.amount, item.iva_rate);
    const np = itemNetPayable(item);
    totalValue += np.applied ? np.net : withIva;

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
    doc.text(formatSupplierFullName(item.supplier_name, item.supplier_trade_name), valueX, y);
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
    y += lineHeight;

    if (np.applied) {
      doc.setTextColor(150, 80, 0);
      doc.text("Ret. IRS:", labelX, y);
      doc.text(`−${formatCurrencyDecimal(np.withholding)}`, valueX, y);
      y += lineHeight;
      doc.setTextColor(0, 110, 0);
      doc.setFont("helvetica", "bold");
      doc.text("Líquido a pagar:", labelX, y);
      doc.text(formatCurrencyDecimal(np.net), valueX, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      y += lineHeight;
    }
    y += 4;

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
