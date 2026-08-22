// Fallback SJR (Server-generated JavaScript Response) do Ticketline.
//
// Contexto (2026-08-21): nos eventos migrados para a "nova área de Promotores"
// o export `sale_summary.xlsx` devolve sempre a landing HTML (bloqueio
// server-side). A página `/managers/events/<id>/sale_summary` continua a
// funcionar e carrega os dados por SJR:
//   $.get({ url: location.href, data:{post_render_content:"data"}, dataType:"script" })
// A resposta é JavaScript com o HTML das tabelas escapado.
//
// Estratégia: desescapar → extrair as tabelas → reconstruir uma folha
// EQUIVALENTE à do XLSX (mesmas âncoras: "DATA", "Operações por dia",
// "ZONA", "TOTAL GERAL"/"TOTAL VENDAS", sub-linha "Qt."/"Valor") e reutilizar
// `parseTicketlineOperationsXlsx` + `runTicketlineImport` sem alterações.
// Assim o contrato do parser/import mantém-se exactamente igual ao do XLSX.
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import {
  parseTicketlineOperationsXlsx,
  type OperationsParseResult,
} from "./ticketline-operations-parser.ts";

const PT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Desescapa o HTML embutido no JS devolvido pelo SJR. */
export function unescapeSjr(js: string): string {
  return js
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u0027/gi, "'")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\\t/g, " ")
    .replace(/\\\//g, "/");
}

function cleanText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "01 Jan 2026" (PT ou EN) → "01 Jan 2026" normalizado em PT (aceite pelo parser XLSX). */
export function normalizeDateLabel(txt: string): string | null {
  const m = txt.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,})\.?\s+(\d{4})$/);
  if (!m) return null;
  const key = m[2].toLowerCase().slice(0, 3);
  let idx = PT_MONTHS.indexOf(key);
  if (idx < 0) idx = EN_MONTHS.indexOf(key);
  if (idx < 0) return null;
  return `${m[1].padStart(2, "0")} ${PT_MONTHS[idx].charAt(0).toUpperCase()}${PT_MONTHS[idx].slice(1)} ${m[3]}`;
}

/** "1 234,56€" / "1.234,56" / "12" → número. Devolve null se não for numérico. */
export function parseNumberLabel(txt: string): number | null {
  let s = txt.replace(/[€\s\u00a0]/g, "");
  if (!s || s === "-" || s === "—") return null;
  const neg = /^\(.*\)$/.test(s);
  if (neg) s = s.slice(1, -1);
  if (!/^[-+]?[\d.,]+$/.test(s)) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Converte uma <table> em grelha rectangular, expandindo colspan/rowspan. */
export function tableToGrid(inner: string, maxCols = 40): string[][] {
  const trs = Array.from(inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map((x) => x[1]);
  const grid: string[][] = [];
  // pendências de rowspan: col → { text, remaining }
  const pending = new Map<number, { text: string; remaining: number }>();
  for (const tr of trs) {
    const cells = Array.from(tr.matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi));
    if (cells.length === 0) continue;
    const row: string[] = [];
    let c = 0;
    const place = (text: string) => {
      while (row.length <= c) row.push("");
      row[c] = text;
      c++;
    };
    const drainPending = () => {
      while (true) {
        const p = pending.get(c);
        if (!p || p.remaining <= 0) break;
        place(p.text);
        p.remaining--;
        if (p.remaining <= 0) pending.delete(c - 1);
      }
    };
    drainPending();
    for (const cellMatch of cells) {
      const attrs = cellMatch[2] || "";
      const text = cleanText(cellMatch[3]);
      const colspan = Math.max(1, Number(attrs.match(/colspan\s*=\s*["']?(\d+)/i)?.[1] || 1));
      const rowspan = Math.max(1, Number(attrs.match(/rowspan\s*=\s*["']?(\d+)/i)?.[1] || 1));
      for (let k = 0; k < colspan; k++) {
        if (c >= maxCols) break;
        const col = c;
        place(text);
        if (rowspan > 1) pending.set(col, { text, remaining: rowspan - 1 });
        drainPending();
      }
      if (c >= maxCols) break;
    }
    // decrementa rowspans não consumidos nesta linha
    for (const [col, p] of Array.from(pending.entries())) {
      if (col >= row.length) {
        while (row.length <= col) row.push("");
        row[col] = p.text;
        p.remaining--;
        if (p.remaining <= 0) pending.delete(col);
      }
    }
    grid.push(row);
  }
  return grid;
}

export function extractTables(html: string): string[][][] {
  const out: string[][][] = [];
  const re = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const grid = tableToGrid(m[1]);
    if (grid.length > 1) out.push(grid);
  }
  return out;
}

function gridText(grid: string[][]): string {
  return grid.flat().join(" ").toUpperCase();
}

/** Célula → valor de folha (número, data normalizada ou texto). */
function cellValue(txt: string): string | number {
  if (!txt) return "";
  const d = normalizeDateLabel(txt);
  if (d) return d;
  const n = parseNumberLabel(txt);
  if (n !== null) return n;
  return txt;
}

export interface SjrParseDebug {
  tablesFound: number;
  dailyTableIndex: number;
  zoneTableIndex: number;
  dailyRows: number;
  zoneRows: number;
  markerRow: number;
  zoneTotalRow: { qty: number | null; value: number | null } | null;
  totalCheck: { rowsQty: number; rowsValue: number; ok: boolean } | null;
  aoaRows: number;
}

export interface SjrParseOutput extends OperationsParseResult {
  sjrDebug: SjrParseDebug;
}

/**
 * Parse do SJR → mesma estrutura que `parseTicketlineOperationsXlsx`.
 *
 * @param js corpo (JavaScript) devolvido pelo pedido post_render_content=data
 * @param period datas DD-MM-YYYY usadas no filtro (para o header do relatório)
 */
export function parseTicketlineOperationsSjr(
  js: string,
  period?: { start: string; end: string; eventName?: string },
): SjrParseOutput {
  const html = unescapeSjr(js);
  const tables = extractTables(html);
  if (tables.length === 0) throw new Error("SJR: nenhuma <table> encontrada na resposta");

  let zoneIdx = tables.findIndex((g) => /\bZONA\b|\bSETOR\b/.test(gridText(g)));
  let dailyIdx = tables.findIndex((g, i) => i !== zoneIdx && /\bDATA\b/.test(gridText(g)));
  if (zoneIdx < 0 && tables.length >= 2) zoneIdx = 1;
  if (dailyIdx < 0) dailyIdx = tables.findIndex((_, i) => i !== zoneIdx);
  if (zoneIdx < 0) throw new Error("SJR: tabela por ZONA não encontrada");

  const dailyGrid = dailyIdx >= 0 ? tables[dailyIdx] : [];
  const zoneGrid = tables[zoneIdx];

  // ---- montar AOA equivalente ao XLSX ----
  const aoa: Array<Array<string | number>> = [];
  const push = (row: Array<string | number>) => aoa.push(row);

  push([period?.eventName ? `0/0 - ${period.eventName}` : "Resumo de Operações"]);
  if (period) push([`Operações de ${period.start} a ${period.end}`]);
  push([]);

  for (const row of dailyGrid) push(row.map(cellValue));

  // O parser XLSX procura o marcador da secção 2 a partir da linha 100.
  while (aoa.length < 101) push([]);
  push(["Operações por dia no período"]);
  push([]);

  for (const row of zoneGrid) push(row.map(cellValue));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

  const parsed = parseTicketlineOperationsXlsx(buf);

  // ---- validação bloqueante do TOTAL da tabela de zonas ----
  let zoneTotal: { qty: number | null; value: number | null } | null = null;
  const qtCol = parsed.debug.section2.qtCol;
  const valCol = parsed.debug.section2.valCol;
  for (const row of zoneGrid) {
    const first = (row.find((c) => c && c.trim()) || "").trim().toUpperCase();
    if (first === "TOTAL" || first === "TOTAL GERAL") {
      const q = qtCol >= 0 ? parseNumberLabel(row[qtCol] || "") : null;
      const v = valCol >= 0 ? parseNumberLabel(row[valCol] || "") : null;
      zoneTotal = { qty: q, value: v };
    }
  }
  const rowsQty = parsed.rows.reduce((s, r) => s + r.totalVendasQty, 0);
  const rowsValue = Math.round(parsed.rows.reduce((s, r) => s + r.totalVendasValue, 0) * 100) / 100;
  let totalCheck: SjrParseDebug["totalCheck"] = null;
  if (zoneTotal && (zoneTotal.qty !== null || zoneTotal.value !== null)) {
    const qtyOk = zoneTotal.qty === null || zoneTotal.qty === rowsQty;
    const valOk = zoneTotal.value === null || Math.abs(zoneTotal.value - rowsValue) <= 0.05;
    totalCheck = { rowsQty, rowsValue, ok: qtyOk && valOk };
    if (!qtyOk || !valOk) {
      throw new Error(
        `SJR: TOTAL da tabela não bate com a soma das linhas — total=(qty=${zoneTotal.qty}, valor=${zoneTotal.value}) vs linhas=(qty=${rowsQty}, valor=${rowsValue})`,
      );
    }
  }

  return {
    ...parsed,
    header: {
      ...parsed.header,
      event_name: parsed.header.event_name || period?.eventName || "",
    },
    sjrDebug: {
      tablesFound: tables.length,
      dailyTableIndex: dailyIdx,
      zoneTableIndex: zoneIdx,
      dailyRows: dailyGrid.length,
      zoneRows: zoneGrid.length,
      markerRow: 102,
      zoneTotalRow: zoneTotal,
      totalCheck,
      aoaRows: aoa.length,
    },
  };
}
