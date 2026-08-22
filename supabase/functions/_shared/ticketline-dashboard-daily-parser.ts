// Parser da SÉRIE DIÁRIA do Resumo de Operações do DASHBOARD da Ticketline
// (/managers/dashboard/sale_summary), lido por SJR.
//
// Contexto (2026-08-21, sondas v2.27/v2.28): nos eventos migrados para a nova
// área de Promotores o relatório POR EVENTO vem sempre a zeros, mas o resumo do
// DASHBOARD filtrado por `bulk_event_ids` traz os números reais. Padrão BOL:
// guardamos apenas a série diária (dia → qty/valor), sem zonas.
//
// Estrutura da tabela: Data | Total Geral (Qt. | Valor) | Total Vendas (Qt. |
// Valor) | ... e uma linha TOTAL no fim.
import { extractTables, parseNumberLabel, unescapeSjr } from "./ticketline-sjr-parser.ts";

const PT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "01 Jan 2026" (PT ou EN) → "2026-01-01". Também aceita 01/01/2026 e 01-01-2026. */
export function dateLabelToIso(txt: string): string | null {
  const t = (txt || "").trim();
  const m = t.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,})\.?\s+(\d{4})$/);
  if (m) {
    const key = m[2].toLowerCase().slice(0, 3);
    let idx = PT_MONTHS.indexOf(key);
    if (idx < 0) idx = EN_MONTHS.indexOf(key);
    if (idx < 0) return null;
    return `${m[3]}-${String(idx + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const n = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (n) return `${n[3]}-${n[2].padStart(2, "0")}-${n[1].padStart(2, "0")}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return t;
  return null;
}

export interface DashboardDailyRow {
  sale_date: string; // ISO
  quantity: number;
  total_value: number;
}

export interface DashboardDailyResult {
  rows: DashboardDailyRow[];
  totalRow: { qty: number | null; value: number | null } | null;
  sums: { qty: number; value: number };
  headerRange: { start: string | null; end: string | null } | null;
  debug: Record<string, unknown>;
}

function upper(row: string[]): string {
  return row.join(" | ").toUpperCase();
}

/** Localiza as colunas Qt./Valor do grupo pedido nos cabeçalhos multi-nível. */
function locateColumns(grid: string[][], groupRe: RegExp): { qtCol: number; valCol: number; groupRow: number; subRow: number } | null {
  for (let r = 0; r < Math.min(grid.length, 8); r++) {
    const row = grid[r];
    const cols = row.map((c, i) => ({ c: (c || "").toUpperCase(), i })).filter((x) => groupRe.test(x.c));
    if (cols.length === 0) continue;
    for (let s = r; s < Math.min(grid.length, r + 4); s++) {
      const sub = grid[s];
      let qtCol = -1;
      let valCol = -1;
      for (const { i } of cols) {
        const t = (sub[i] || "").toUpperCase().replace(/\./g, "").trim();
        if (qtCol < 0 && /^(QT|QTD|QUANT)/.test(t)) qtCol = i;
        else if (valCol < 0 && /^VALOR/.test(t)) valCol = i;
      }
      if (qtCol >= 0 && valCol >= 0) return { qtCol, valCol, groupRow: r, subRow: s };
    }
    // grupo com exactamente 2 colunas e sem sub-cabeçalho reconhecível
    if (cols.length === 2) return { qtCol: cols[0].i, valCol: cols[1].i, groupRow: r, subRow: r };
  }
  return null;
}

/** Extrai "Operações de DD-MM-YYYY a DD-MM-YYYY" (ou datas por extenso) do HTML. */
export function extractHeaderRange(html: string): { start: string | null; end: string | null } | null {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;|\u00a0/g, " ").replace(/\s+/g, " ");
  const m = text.match(/Opera[cç][õo]es\s+de\s+([^\s]+(?:\s+[A-Za-zÀ-ÿ]{3,}\.?\s+\d{4})?)\s+a\s+([^\s]+(?:\s+[A-Za-zÀ-ÿ]{3,}\.?\s+\d{4})?)/i);
  if (!m) return null;
  return { start: dateLabelToIso(m[1]) ?? m[1], end: dateLabelToIso(m[2]) ?? m[2] };
}

/**
 * Parse do corpo SJR (JS) do resumo do dashboard → série diária.
 * Usa as colunas "Total Vendas" (fallback "Total Geral").
 */
export function parseDashboardDailySjr(js: string): DashboardDailyResult {
  const html = unescapeSjr(js);
  const tables = extractTables(html);
  if (tables.length === 0) throw new Error("dashboard daily: nenhuma <table> na resposta SJR");

  // A tabela diária é a que tem cabeçalho DATA e datas na 1ª coluna.
  type Cand = { grid: string[][]; idx: number; dates: number };
  const candidates: Cand[] = tables.map((grid: string[][], idx: number) => ({
    grid,
    idx,
    dates: grid.filter((row: string[]) => dateLabelToIso((row.find((c: string) => !!c && !!c.trim()) || "").trim()) !== null).length,
  }));
  const best: Cand | undefined = candidates
    .filter((c) => c.dates > 0)
    .sort((a, b) => b.dates - a.dates)[0];
  if (!best) throw new Error("dashboard daily: nenhuma tabela com datas encontrada");
  const grid = best.grid;


  let loc = locateColumns(grid, /TOTAL\s*VENDAS/);
  let group = "total_vendas";
  if (!loc) {
    loc = locateColumns(grid, /TOTAL\s*GERAL/);
    group = "total_geral";
  }
  if (!loc) throw new Error(`dashboard daily: colunas Qt./Valor não localizadas (header="${upper(grid[0] || [])}")`);

  const rows: DashboardDailyRow[] = [];
  let totalRow: { qty: number | null; value: number | null } | null = null;
  for (const row of grid) {
    const firstRaw = (row.find((c: string) => !!c && !!c.trim()) || "").trim();
    const iso = dateLabelToIso(firstRaw);
    const qty = parseNumberLabel(row[loc.qtCol] || "") ?? 0;
    const value = parseNumberLabel(row[loc.valCol] || "") ?? 0;
    if (iso) {
      rows.push({ sale_date: iso, quantity: Math.round(qty), total_value: value });
      continue;
    }
    if (/^TOTAL(\s+GERAL)?$/i.test(firstRaw)) {
      totalRow = {
        qty: parseNumberLabel(row[loc.qtCol] || ""),
        value: parseNumberLabel(row[loc.valCol] || ""),
      };
    }
  }
  if (rows.length === 0) throw new Error("dashboard daily: 0 linhas diárias após parse");

  const sumQty = rows.reduce((s, r) => s + r.quantity, 0);
  const sumValue = Math.round(rows.reduce((s, r) => s + r.total_value, 0) * 100) / 100;

  if (totalRow && (totalRow.qty !== null || totalRow.value !== null)) {
    const qtyOk = totalRow.qty === null || totalRow.qty === sumQty;
    const valOk = totalRow.value === null || Math.abs(totalRow.value - sumValue) <= 0.05;
    if (!qtyOk || !valOk) {
      throw new Error(
        `dashboard daily: TOTAL não bate com a soma dos dias — total=(qty=${totalRow.qty}, valor=${totalRow.value}) vs dias=(qty=${sumQty}, valor=${sumValue})`,
      );
    }
  }

  return {
    rows,
    totalRow,
    sums: { qty: sumQty, value: sumValue },
    headerRange: extractHeaderRange(html),
    debug: {
      tablesFound: tables.length,
      dailyTableIndex: best.idx,
      gridRows: grid.length,
      columnGroup: group,
      qtCol: loc.qtCol,
      valCol: loc.valCol,
      groupRow: loc.groupRow,
      subRow: loc.subRow,
      daysParsed: rows.length,
      firstDay: rows[0]?.sale_date ?? null,
      lastDay: rows[rows.length - 1]?.sale_date ?? null,
    },
  };
}
