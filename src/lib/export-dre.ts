import * as XLSX from "xlsx";
import { formatCurrency } from "@/lib/mock-data";

interface DRELine {
  label: string;
  amountExIva: number;
  amountIncIva: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  indent?: boolean;
}

interface EventSummary {
  name: string;
  txCount: number;
  totalIncEx: number;
  totalIncInc: number;
  totalExpEx: number;
  totalExpInc: number;
  resultEx: number;
  resultInc: number;
}

function calcAmountWithIva(amount: number, ivaRate: number): number {
  return amount * (1 + ivaRate / 100);
}

function buildDREForExport(transactions: any[], categories: any[]): DRELine[] {
  const incomes = transactions.filter((t) => t.type === "income");
  const expenses = transactions.filter((t) => t.type === "expense");
  const catMap = Object.fromEntries(categories.map((c: any) => [c.id, c.name]));

  const aggregate = (txs: any[]) => {
    const byCat: Record<string, { exIva: number; incIva: number }> = {};
    txs.forEach((t) => {
      const name = catMap[t.category_id] ?? "Sem categoria";
      const amt = Number(t.amount);
      const iva = Number(t.iva_rate ?? 23);
      if (!byCat[name]) byCat[name] = { exIva: 0, incIva: 0 };
      byCat[name].exIva += amt;
      byCat[name].incIva += calcAmountWithIva(amt, iva);
    });
    return byCat;
  };

  const incByCat = aggregate(incomes);
  const expByCat = aggregate(expenses);
  const totalIncEx = incomes.reduce((s, t) => s + Number(t.amount), 0);
  const totalIncInc = incomes.reduce((s, t) => s + calcAmountWithIva(Number(t.amount), Number(t.iva_rate ?? 23)), 0);
  const totalExpEx = expenses.reduce((s, t) => s + Number(t.amount), 0);
  const totalExpInc = expenses.reduce((s, t) => s + calcAmountWithIva(Number(t.amount), Number(t.iva_rate ?? 23)), 0);

  const lines: DRELine[] = [];
  lines.push({ label: "RECEITAS", amountExIva: totalIncEx, amountIncIva: totalIncInc, isTotal: true });
  Object.entries(incByCat).sort((a, b) => b[1].exIva - a[1].exIva)
    .forEach(([name, val]) => lines.push({ label: name, amountExIva: val.exIva, amountIncIva: val.incIva, indent: true }));
  lines.push({ label: "DESPESAS", amountExIva: totalExpEx, amountIncIva: totalExpInc, isTotal: true });
  Object.entries(expByCat).sort((a, b) => b[1].exIva - a[1].exIva)
    .forEach(([name, val]) => lines.push({ label: name, amountExIva: val.exIva, amountIncIva: val.incIva, indent: true }));
  lines.push({ label: "RESULTADO LÍQUIDO", amountExIva: totalIncEx - totalExpEx, amountIncIva: totalIncInc - totalExpInc, isGrandTotal: true });

  return lines;
}

export function exportDREToExcel(
  events: any[],
  transactions: any[],
  categories: any[]
) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryRows: any[][] = [
    ["RELATÓRIO DRE - RESUMO GERAL"],
    [],
    ["Evento", "Transações", "Receitas S/IVA", "Receitas C/IVA", "Despesas S/IVA", "Despesas C/IVA", "Resultado S/IVA", "Resultado C/IVA"],
  ];

  let gIncEx = 0, gIncInc = 0, gExpEx = 0, gExpInc = 0;

  events.forEach((evt) => {
    const evtTx = transactions.filter((t: any) => t.event_id === evt.id);
    const incEx = evtTx.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const incInc = evtTx.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + calcAmountWithIva(Number(t.amount), Number(t.iva_rate ?? 23)), 0);
    const expEx = evtTx.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const expInc = evtTx.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + calcAmountWithIva(Number(t.amount), Number(t.iva_rate ?? 23)), 0);
    gIncEx += incEx; gIncInc += incInc; gExpEx += expEx; gExpInc += expInc;

    summaryRows.push([evt.name, evtTx.length, incEx, incInc, expEx, expInc, incEx - expEx, incInc - expInc]);
  });

  summaryRows.push([]);
  summaryRows.push(["TOTAL", "", gIncEx, gIncInc, gExpEx, gExpInc, gIncEx - gExpEx, gIncInc - gExpInc]);

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Resumo");

  // Per-event DRE sheets
  events.forEach((evt) => {
    const evtTx = transactions.filter((t: any) => t.event_id === evt.id);
    if (evtTx.length === 0) return;
    const dre = buildDREForExport(evtTx, categories);
    const rows: any[][] = [
      [`DRE - ${evt.name}`],
      [],
      ["Rubrica", "Valor S/IVA (€)", "Valor C/IVA (€)"],
    ];
    dre.forEach((line) => {
      rows.push([line.indent ? `  ${line.label}` : line.label, line.amountExIva, line.amountIncIva]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }];
    const sheetName = evt.name.substring(0, 31).replace(/[\\/*?[\]:]/g, "");
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, `DRE_Relatorio_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
