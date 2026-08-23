// Parser do RELATÓRIO POR TIPO DE BILHETE da Ticketline Manager
// (`/managers/events/{id}/ticket_type.xlsx?period=5&filter_start_date=…&filter_end_date=…`).
//
// Regras críticas (issue #73):
//  - Usa SEMPRE o grupo de colunas **VENDAS** (sub-coluna "TOTAL VENDAS"), nunca
//    "TOTAL GERAL" — o Total Geral inclui vales, convites, cativos e bloqueados
//    (ex.: 20→23/08/2026 dá 87 no Geral vs 83 em Vendas).
//  - O nome do tipo é texto OPACO. Há tipos com ` | ` no nome
//    ("Exclusivo FNAC | Portador Cartão FNAC") — nunca partir por "|".
//  - Cada tipo tem N linhas (uma por PVP) seguidas de uma linha SOMA; no fim há
//    uma linha TOTAL. Validamos SOMA vs linhas e TOTAL vs soma dos tipos.

export interface TicketTypeRow {
  ticket_type: string;
  quantity: number;
  total_value: number;
}

export interface TicketTypesResult {
  rows: TicketTypeRow[];
  totalRow: { qty: number; value: number } | null;
  sums: { qty: number; value: number };
  headerRange: { start: string | null; end: string | null } | null;
  empty: boolean;
  debug: Record<string, unknown>;
}

type Cell = string | number | null | undefined;
export type Grid = Cell[][];

const txt = (c: Cell): string =>
  c === null || c === undefined ? "" : String(c).replace(/\u00a0/g, " ").trim();

const num = (c: Cell): number => {
  if (typeof c === "number") return c;
  const s = txt(c);
  if (!s) return 0;
  // formatos PT: 1.234,56 €
  const cleaned = s.replace(/[^\d,.\-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : 0;
};

const upper = (c: Cell): string =>
  txt(c).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

function ddmmToIso(s: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** "Operações de 22-08-2026 a 22-08-2026" em qualquer célula do topo. */
export function extractTicketTypesRange(grid: Grid): { start: string | null; end: string | null } | null {
  for (const row of grid.slice(0, 14)) {
    for (const cell of row) {
      const s = txt(cell);
      const m = s.match(/Opera[cç][õo]es\s+de\s+(\d{2}-\d{2}-\d{4})\s+a\s+(\d{2}-\d{2}-\d{4})/i);
      if (m) return { start: ddmmToIso(m[1]), end: ddmmToIso(m[2]) };
    }
  }
  return null;
}

export function parseTicketTypesGrid(grid: Grid): TicketTypesResult {
  const headerRange = extractTicketTypesRange(grid);

  // Relatório sem dados no período → 0 linhas (ausência = 0, não é erro).
  const flatUpper = grid.map((r) => r.map(upper).join(" | ")).join("\n");
  if (/NAO HA DADOS REFERENTES AO PERIODO/.test(flatUpper)) {
    return { rows: [], totalRow: null, sums: { qty: 0, value: 0 }, headerRange, empty: true, debug: { reason: "no_data_label" } };
  }

  // 1. localizar o cabeçalho
  let headerRow = -1;
  let nameCol = -1;
  for (let r = 0; r < grid.length; r++) {
    const i = grid[r].findIndex((c) => upper(c) === "TIPO DE BILHETE");
    if (i >= 0) { headerRow = r; nameCol = i; break; }
  }
  if (headerRow < 0) {
    throw Object.assign(new Error("ticket_type: cabeçalho 'TIPO DE BILHETE' não encontrado"), { phase: "ticket_types_parse_failed" });
  }

  // 2. coluna do grupo VENDAS (nunca TOTAL GERAL)
  const vendasCol = grid[headerRow].findIndex((c) => upper(c) === "VENDAS");
  if (vendasCol < 0) {
    throw Object.assign(new Error("ticket_type: grupo de colunas 'VENDAS' não encontrado"), { phase: "ticket_types_parse_failed" });
  }
  // linha das sub-colunas Qt./Valor (até 3 linhas abaixo)
  let subRow = -1;
  for (let r = headerRow + 1; r <= headerRow + 3 && r < grid.length; r++) {
    if (/^QT/.test(upper(grid[r][vendasCol])) && /^VALOR/.test(upper(grid[r][vendasCol + 1]))) { subRow = r; break; }
  }
  if (subRow < 0) {
    throw Object.assign(new Error("ticket_type: sub-colunas Qt./Valor de VENDAS não localizadas"), { phase: "ticket_types_parse_failed" });
  }
  const qtyCol = vendasCol;
  const valCol = vendasCol + 1;

  // 3. percorrer blocos por tipo
  const rows: TicketTypeRow[] = [];
  let totalRow: { qty: number; value: number } | null = null;
  let current: string | null = null;
  let accQty = 0;
  let accVal = 0;
  const somaChecks: Array<{ ticket_type: string; soma: [number, number]; acc: [number, number] }> = [];

  const flush = (soma?: { qty: number; value: number }) => {
    if (current === null) return;
    const qty = soma ? soma.qty : accQty;
    const value = soma ? soma.value : accVal;
    if (soma) somaChecks.push({ ticket_type: current, soma: [soma.qty, soma.value], acc: [accQty, accVal] });
    rows.push({ ticket_type: current, quantity: Math.round(qty), total_value: Math.round(value * 100) / 100 });
    current = null;
    accQty = 0;
    accVal = 0;
  };

  for (let r = subRow + 1; r < grid.length; r++) {
    const label = txt(grid[r][nameCol]);
    const key = upper(grid[r][nameCol]);
    const qty = num(grid[r][qtyCol]);
    const value = num(grid[r][valCol]);

    if (key === "SOMA") { flush({ qty, value }); continue; }
    if (key === "TOTAL" || key === "TOTAL GERAL") { flush(); totalRow = { qty: Math.round(qty), value: Math.round(value * 100) / 100 }; break; }

    if (label) {
      // novo tipo (o anterior ficou sem SOMA — usa o acumulado)
      flush();
      current = label;
      accQty = qty;
      accVal = value;
      continue;
    }
    if (current !== null) {
      // linha adicional de PVP do mesmo tipo
      accQty += qty;
      accVal += value;
    }
  }
  flush();

  // 4. validações bloqueantes
  for (const c of somaChecks) {
    if (Math.round(c.soma[0]) !== Math.round(c.acc[0]) || Math.abs(c.soma[1] - c.acc[1]) > 0.005) {
      throw Object.assign(
        new Error(`ticket_type: SOMA de "${c.ticket_type}" (${c.soma[0]}, ${c.soma[1]}) ≠ linhas (${c.acc[0]}, ${c.acc[1]})`),
        { phase: "ticket_types_total_mismatch" },
      );
    }
  }

  const sumQty = rows.reduce((s, r) => s + r.quantity, 0);
  const sumValue = Math.round(rows.reduce((s, r) => s + r.total_value, 0) * 100) / 100;

  if (rows.length === 0) {
    return { rows, totalRow, sums: { qty: 0, value: 0 }, headerRange, empty: true, debug: { headerRow, subRow, vendasCol, reason: "no_type_rows" } };
  }

  if (totalRow) {
    const qtyOk = totalRow.qty === sumQty;
    const valOk = Math.abs(totalRow.value - sumValue) <= 0.005;
    if (!qtyOk || !valOk) {
      throw Object.assign(
        new Error(`ticket_type: TOTAL (${totalRow.qty}, ${totalRow.value}) ≠ soma dos tipos (${sumQty}, ${sumValue})`),
        { phase: "ticket_types_total_mismatch" },
      );
    }
  }

  return {
    rows,
    totalRow,
    sums: { qty: sumQty, value: sumValue },
    headerRange,
    empty: false,
    debug: { headerRow, subRow, nameCol, qtyCol, valCol, typesParsed: rows.length, somaChecks },
  };
}
