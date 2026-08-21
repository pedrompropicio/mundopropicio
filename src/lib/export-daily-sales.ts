/**
 * Exportação PDF do relatório "Vendas Diárias".
 *
 * Os números vêm já calculados pela página (mesmo dataset da RPC
 * `get_daily_sales_series`); este módulo só formata e escreve.
 * Cabeçalho institucional partilhado via `src/lib/export-header.ts`.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchExportBranding, drawPdfExportHeader } from "@/lib/export-header";

const nfInt = new Intl.NumberFormat("pt-PT");
const nfMoney = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const money = (v: number) => `${nfMoney.format(Number(v || 0))} €`;
const int = (v: number) => nfInt.format(Number(v || 0));

export interface DailySalesExportDayRow {
  sale_date: string;
  qty: number;
  value: number;
  /** Por bilheteira (quando a decomposição está ativa). */
  byProvider?: Record<string, { qty: number; value: number }>;
}

export interface DailySalesExportEvent {
  event_name: string;
  event_date: string | null;
  days: DailySalesExportDayRow[];
  totalQty: number;
  totalValue: number;
}

export interface DailySalesExportData {
  companyId?: string | null;
  periodLabel: string;
  providerLabel: string;
  eventsLabel: string;
  /** Colunas de bilheteira quando a decomposição está ativa. */
  providers: string[];
  events: DailySalesExportEvent[];
  /** Resumo consolidado (total por evento no período). */
  summary: { event_name: string; qty: number; value: number }[];
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return y && m && d ? `${d}/${m}/${y}` : String(iso);
};

export async function exportDailySalesPdf(data: DailySalesExportData) {
  const branding = await fetchExportBranding(data.companyId ?? null);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let y = drawPdfExportHeader(doc, {
    branding,
    title: "Vendas Diárias",
    subtitles: [
      `Período: ${data.periodLabel}`,
      `Bilheteira: ${data.providerLabel}`,
      `Eventos: ${data.eventsLabel}`,
    ],
  });

  if (data.summary.length > 1) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo consolidado", 14, y);
    y += 2;
    autoTable(doc, {
      startY: y + 2,
      head: [["Evento", "Bilhetes", "Valor"]],
      body: data.summary.map((s) => [s.event_name, int(s.qty), money(s.value)]),
      foot: [[
        "TOTAL",
        int(data.summary.reduce((a, s) => a + s.qty, 0)),
        money(data.summary.reduce((a, s) => a + s.value, 0)),
      ]],
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [40, 40, 40] },
      footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  for (const ev of data.events) {
    if (y > 250) {
      doc.addPage();
      y = 16;
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`${ev.event_name}${ev.event_date ? ` · ${fmtDate(ev.event_date)}` : ""}`, 14, y);

    const withProviders = data.providers.length > 0;
    const head = withProviders
      ? [["Dia", ...data.providers.flatMap((p) => [`${p} (bilh.)`, `${p} (€)`]), "Bilhetes", "Valor"]]
      : [["Dia", "Bilhetes", "Valor"]];

    const body = ev.days.map((d) => {
      const base = [fmtDate(d.sale_date)];
      if (withProviders) {
        for (const p of data.providers) {
          const cell = d.byProvider?.[p];
          base.push(cell ? int(cell.qty) : "—", cell ? money(cell.value) : "—");
        }
      }
      base.push(int(d.qty), money(d.value));
      return base;
    });

    const footRow = ["TOTAL"];
    if (withProviders) {
      for (const p of data.providers) {
        const q = ev.days.reduce((a, d) => a + (d.byProvider?.[p]?.qty ?? 0), 0);
        const v = ev.days.reduce((a, d) => a + (d.byProvider?.[p]?.value ?? 0), 0);
        footRow.push(int(q), money(v));
      }
    }
    footRow.push(int(ev.totalQty), money(ev.totalValue));

    autoTable(doc, {
      startY: y + 3,
      head,
      body,
      foot: [footRow],
      styles: { fontSize: 7.5, cellPadding: 1.4 },
      headStyles: { fillColor: [40, 40, 40] },
      footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold" },
      columnStyles: Object.fromEntries(
        head[0].map((_, i) => [i, { halign: i === 0 ? "left" : "right" }]),
      ) as any,
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (data.events.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Sem vendas no período selecionado.", 14, y + 4);
  }

  doc.save(`vendas-diarias-${new Date().toISOString().slice(0, 10)}.pdf`);
}
