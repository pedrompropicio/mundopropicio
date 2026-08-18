/**
 * Exportação de uma sessão de cartão (pré-pago / débito) em PDF e Excel.
 *
 * Os números são exatamente os mesmos dos cards da página de detalhe — quem
 * calcula é a página; este módulo só formata e escreve.
 * Cabeçalho institucional partilhado via `src/lib/export-header.ts`.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { fetchExportBranding, drawPdfExportHeader, buildXlsxHeaderRows } from "@/lib/export-header";
import { formatCurrency } from "@/lib/card-session-helpers";

export interface CardSessionExportRow {
  date: string;
  description: string;
  event: string;
  category: string;
  status: string;
  amount: number;
}

export interface CardSessionExportLoad {
  date: string;
  source: string;
  amount: number;
}

export interface CardSessionExportData {
  companyId?: string | null;
  cardName: string;
  holderName: string;
  primaryEventName: string | null;
  statusLabel: string;
  openedAt: string | null;
  closedAt: string | null;
  summary: {
    availableOnCard: number | null;
    delivered: number;
    deliveredNote: string;
    approvedSpent: number;
    approvedCount: number;
    pending: number;
    pendingCount: number;
    theoretical: number;
  };
  byEvent: { name: string; amount: number }[];
  expenses: CardSessionExportRow[];
  loads: CardSessionExportLoad[];
}

const slug = (s: string) =>
  (s || "sessao")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 50) || "sessao";

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-PT");
};

function buildTitleAndSubtitles(data: CardSessionExportData) {
  const title = `Sessão de Cartão — ${data.cardName} — ${data.holderName}`;
  const subtitles = [
    data.primaryEventName ? `Evento principal: ${data.primaryEventName}` : "",
    `Estado: ${data.statusLabel}`,
    `Aberta em ${fmtDate(data.openedAt)}${data.closedAt ? ` · Fechada em ${fmtDate(data.closedAt)}` : ""}`,
  ].filter(Boolean);
  return { title, subtitles };
}

function summaryRows(data: CardSessionExportData): [string, number | null, string][] {
  const s = data.summary;
  return [
    ["Disponível no cartão", s.availableOnCard, "Saldo real da conta (inclui ajustes)"],
    ["Entregue", s.delivered, s.deliveredNote],
    ["Gasto aprovado", s.approvedSpent, `${s.approvedCount} transação(ões)`],
    ["Pendente de aprovação", s.pending, `${s.pendingCount} item(s)`],
    ["Saldo teórico da sessão", s.theoretical, "Abertura + recargas − gasto aprovado − pendente"],
  ];
}

export async function exportCardSessionToPdf(data: CardSessionExportData) {
  const branding = await fetchExportBranding(data.companyId);
  const doc = new jsPDF({ orientation: "portrait" });
  const { title, subtitles } = buildTitleAndSubtitles(data);
  let y = drawPdfExportHeader(doc, { branding, title, subtitles });

  autoTable(doc, {
    startY: y,
    head: [["Resumo", "Valor", "Nota"]],
    body: summaryRows(data).map(([label, value, note]) => [
      label,
      value === null ? "—" : formatCurrency(value),
      note,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 30, 40] },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (data.byEvent.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Despesas por evento", "Total"]],
      body: data.byEvent.map((e) => [e.name, formatCurrency(e.amount)]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [60, 60, 80] },
      columnStyles: { 1: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  const expensesTotal = data.expenses.reduce((s, e) => s + e.amount, 0);
  autoTable(doc, {
    startY: y,
    head: [["Data", "Descrição", "Evento", "Categoria", "Estado", "Valor"]],
    body:
      data.expenses.length > 0
        ? data.expenses.map((e) => [e.date, e.description, e.event, e.category, e.status, formatCurrency(e.amount)])
        : [["—", "Sem despesas registadas", "", "", "", ""]],
    foot: [["", "", "", "", "Total", formatCurrency(expensesTotal)]],
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 30, 40] },
    footStyles: { fillColor: [235, 235, 240], textColor: 20, fontStyle: "bold" },
    columnStyles: { 5: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  const loadsTotal = data.loads.reduce((s, l) => s + l.amount, 0);
  autoTable(doc, {
    startY: y,
    head: [["Recarga (data)", "Origem", "Valor"]],
    body:
      data.loads.length > 0
        ? data.loads.map((l) => [l.date, l.source, formatCurrency(l.amount)])
        : [["—", "Sem recargas", ""]],
    foot: [["", "Total", formatCurrency(loadsTotal)]],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 30, 40] },
    footStyles: { fillColor: [235, 235, 240], textColor: 20, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  doc.save(`sessao-cartao-${slug(`${data.cardName}-${data.holderName}`)}.pdf`);
}

export async function exportCardSessionToExcel(data: CardSessionExportData) {
  const branding = await fetchExportBranding(data.companyId);
  const { title, subtitles } = buildTitleAndSubtitles(data);
  const wb = XLSX.utils.book_new();

  // Resumo
  const resumo: (string | number | null)[][] = [
    ...buildXlsxHeaderRows(branding, title, subtitles),
    ["Resumo", "Valor", "Nota"],
    ...summaryRows(data).map(([label, value, note]) => [label, value, note]),
  ];
  if (data.byEvent.length > 0) {
    resumo.push([], ["Despesas por evento", "Total"]);
    for (const e of data.byEvent) resumo.push([e.name, e.amount]);
  }
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
  wsResumo["!cols"] = [{ wch: 34 }, { wch: 16 }, { wch: 52 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

  // Despesas
  const despesas: (string | number | null)[][] = [
    ...buildXlsxHeaderRows(branding, "Despesas da sessão", subtitles),
    ["Data", "Descrição", "Evento", "Categoria", "Estado", "Valor"],
    ...data.expenses.map((e) => [e.date, e.description, e.event, e.category, e.status, e.amount]),
    [],
    ["", "", "", "", "Total", data.expenses.reduce((s, e) => s + e.amount, 0)],
  ];
  const wsDespesas = XLSX.utils.aoa_to_sheet(despesas);
  wsDespesas["!cols"] = [{ wch: 12 }, { wch: 46 }, { wch: 26 }, { wch: 26 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsDespesas, "Despesas");

  // Recargas
  const recargas: (string | number | null)[][] = [
    ...buildXlsxHeaderRows(branding, "Recargas da sessão", subtitles),
    ["Data", "Origem", "Valor"],
    ...data.loads.map((l) => [l.date, l.source, l.amount]),
    [],
    ["", "Total", data.loads.reduce((s, l) => s + l.amount, 0)],
  ];
  const wsRecargas = XLSX.utils.aoa_to_sheet(recargas);
  wsRecargas["!cols"] = [{ wch: 12 }, { wch: 34 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsRecargas, "Recargas");

  XLSX.writeFile(wb, `sessao-cartao-${slug(`${data.cardName}-${data.holderName}`)}.xlsx`);
}
