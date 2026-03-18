import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrency } from "@/lib/mock-data";

interface SupplierStat {
  name: string;
  nif: string | null;
  category: string | null;
  is_active: boolean;
  totalExpenses: number;
  totalPaid: number;
  balance: number;
  txCount: number;
}

export function exportSuppliersToPDF(suppliers: SupplierStat[]) {
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
  doc.text("Relatório de Fornecedores", marginLeft, y);
  y += 7;

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-PT")}`, marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 8;

  const totals = suppliers.reduce(
    (acc, s) => ({
      totalExpenses: acc.totalExpenses + s.totalExpenses,
      totalPaid: acc.totalPaid + s.totalPaid,
      balance: acc.balance + s.balance,
    }),
    { totalExpenses: 0, totalPaid: 0, balance: 0 }
  );

  const tableData = suppliers.map((s) => [
    s.name,
    s.nif ?? "—",
    s.category ?? "—",
    s.is_active ? "Ativo" : "Inativo",
    String(s.txCount),
    formatCurrency(s.totalExpenses),
    formatCurrency(s.totalPaid),
    formatCurrency(s.balance),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Fornecedor", "NIF", "Categoria", "Estado", "Transações", "Total Despesas", "Pago", "Em Aberto"]],
    body: tableData,
    foot: [["TOTAL", "", "", "", "", formatCurrency(totals.totalExpenses), formatCurrency(totals.totalPaid), formatCurrency(totals.balance)]],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: marginLeft, right: 14 },
  });

  doc.save(`Fornecedores_${new Date().toISOString().slice(0, 10)}.pdf`);
}
