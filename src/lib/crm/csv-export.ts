// Exportação CSV do Dashboard MP Audience (Fase 2).
// Exporta o que está no ecrã: linhas visíveis, colunas visíveis, período seleccionado.
// Números em formato neutro (ponto decimal, sem separador de milhares) e
// `sep=;` na primeira linha para o Excel abrir sem passo de importação.
import {
  computeCpa,
  computeCpcAvg,
  computeCpm,
  computeCpp,
  computeCtrAvg,
  computeFreqAvg,
  computeTicket,
  computeUniqueCtr,
  type Aggregate,
} from "@/lib/crm/aggregate";
import type { MetricColumnDef, MetricColumnId } from "@/lib/crm/columns";
import type { InsightRow } from "@/components/crm/dashboard/types";

export interface CsvExportRow {
  /** Evento / tour / "Sem evento" — contexto da linha. */
  group: string;
  /** Cidade (split) quando aplicável. */
  city?: string;
  campaign: string;
  status: string;
  agg: Aggregate;
  rows: InsightRow[];
  dailyBudgetCents: number | null;
}

function num(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "";
  return v.toFixed(decimals);
}

function metricCell(id: MetricColumnId, agg: Aggregate, rows: InsightRow[]): string {
  switch (id) {
    case "spend":
      return num(agg.spendCents / 100);
    case "revenue":
      return num(agg.revenueCents / 100);
    case "conversions":
      return num(agg.conversions, 0);
    case "cpa": {
      const v = computeCpa(agg);
      return v == null ? "" : num(v / 100);
    }
    case "ticket": {
      const v = computeTicket(agg);
      return v == null ? "" : num(v / 100);
    }
    case "cpc": {
      const v = computeCpcAvg(agg);
      return v == null ? "" : num(v / 100);
    }
    case "ctr": {
      const v = computeCtrAvg(agg);
      return v == null ? "" : num(v * 100, 3);
    }
    case "cpm": {
      const v = computeCpm(agg);
      return v == null ? "" : num(v / 100);
    }
    case "freq":
      return num(computeFreqAvg(rows), 2);
    case "reach":
      return num(agg.reachSum, 0);
    case "impressions":
      return num(agg.impressions, 0);
    case "cpp": {
      const v = computeCpp(agg);
      return v == null ? "" : num(v / 100);
    }
    case "uniqueClicks":
      return num(agg.uniqueClicks, 0);
    case "uniqueCtr": {
      const v = computeUniqueCtr(agg);
      return v == null ? "" : num(v * 100, 3);
    }
    case "viewContent":
      return num(agg.viewContent, 0);
    case "addToCart":
      return num(agg.addToCart, 0);
    case "initiateCheckout":
      return num(agg.initiateCheckout, 0);
    default:
      return "";
  }
}

/** Cabeçalho da coluna com unidade explícita (moeda / %). */
function headerLabel(col: MetricColumnDef, currency: string): string {
  const money: MetricColumnId[] = ["spend", "revenue", "cpa", "ticket", "cpc", "cpm", "cpp"];
  const pct: MetricColumnId[] = ["ctr", "uniqueCtr"];
  if (money.includes(col.id)) return `${col.label} (${currency})`;
  if (pct.includes(col.id)) return `${col.label} (%)`;
  return col.label;
}

function esc(s: string): string {
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildDashboardCsv(opts: {
  rows: CsvExportRow[];
  columns: MetricColumnDef[];
  currency: string;
  from: string;
  to: string;
}): string {
  const { rows, columns, currency, from, to } = opts;
  const header = [
    "Período",
    "Evento",
    "Cidade",
    "Campanha",
    "Status",
    "ROAS",
    ...columns.map((c) => headerLabel(c, currency)),
    `Verba/dia (${currency})`,
  ];
  const lines = [`sep=;`, header.map(esc).join(";")];
  for (const r of rows) {
    const cells = [
      `${from} a ${to}`,
      r.group,
      r.city ?? "",
      r.campaign,
      r.status,
      num(r.agg.roas, 2),
      ...columns.map((c) => metricCell(c.id, r.agg, r.rows)),
      r.dailyBudgetCents ? num(r.dailyBudgetCents / 100) : "",
    ];
    lines.push(cells.map((c) => esc(String(c))).join(";"));
  }
  return lines.join("\r\n");
}

export function downloadCsv(csv: string, filename: string): void {
  // BOM para o Excel reconhecer UTF-8 (acentos nos nomes de evento).
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
