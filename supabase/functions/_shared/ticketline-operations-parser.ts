// Parser server-side do sale_summary.xlsx?granularity=2 do Ticketline.
//
// Layout (descoberto 2026-05-25):
//   Secção 1: header "DATA | TOTAL GERAL | TOTAL VENDAS | ..." em ~3 linhas
//     empilhadas (com merges). Linhas: totais diários — só auditoria.
//   Linha "Operações por dia no período de ..." marca transição.
//   Secção 2: header "ZONA | TOTAL GERAL | TOTAL VENDAS | ..." em ~3 linhas
//     com merges. Data PT só aparece na 1ª linha de cada bloco-dia (col à
//     esquerda da ZONA). Sub-header "QT / Valor".
//
// O importador só usa o par (qt, valor) da coluna "TOTAL VENDAS" da secção 2.
//
// Robustez (fixes 2026-05-25 v2):
//   - Expansão de !merges: o valor do anchor é propagado para TODAS as
//     células cobertas, para que findHeaderCols ache labels merged em
//     qualquer coluna que o merge visualmente cubra.
//   - Procura de "TOTAL VENDAS" / "TOTAL GERAL" numa JANELA de 4 linhas
//     a partir da linha-âncora ("DATA" / "ZONA"), não em ±1.
//   - QT/Valor são procurados na linha imediatamente abaixo da linha onde
//     o label-pai foi encontrado (não numa linha fixa).
//   - Fallback determinístico: se "TOTAL VENDAS" não for encontrado por
//     label, deriva-se da posição de "TOTAL GERAL" (qty = +2, val = +2).
//   - Início dos dados: primeira linha abaixo do sub-header em que a
//     célula de data ou de zona/label-âncora tem conteúdo válido.
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const PT_MONTHS: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

export interface ZoneLabelParts {
  zone: string;
  lot: string;
  ticketType: string | null;
  raw: string;
}

export function parseZoneLabel(raw: string): ZoneLabelParts {
  const r = String(raw || "").trim();
  if (!r) return { zone: "", lot: "Lote 1", ticketType: null, raw: r };
  let main = r;
  let ticketType: string | null = null;
  const pipeIdx = main.indexOf(" | ");
  if (pipeIdx >= 0) {
    ticketType = main.slice(pipeIdx + 3).trim() || null;
    main = main.slice(0, pipeIdx).trim();
  }
  let zone = main;
  let lot = "Lote 1";
  const dashIdx = main.lastIndexOf(" - ");
  if (dashIdx >= 0) {
    zone = main.slice(0, dashIdx).trim();
    lot = main.slice(dashIdx + 3).trim() || "Lote 1";
  }
  return { zone, lot, ticketType, raw: r };
}

export interface OperationRow {
  date: string;
  zone: string;
  lot: string;
  ticketType: string | null;
  rawLabel: string;
  totalGeralQty: number;
  totalGeralValue: number;
  totalVendasQty: number;
  totalVendasValue: number;
}

export interface SaleSummaryHeader {
  event_name: string;
  period_from: string;
  period_to: string;
  event_date: string;
  event_time: string;
}

export interface DailyTotal {
  date: string;
  vendasQty: number;
  vendasValue: number;
  geralQty: number;
  geralValue: number;
}

export interface ParseDebug {
  mergesExpanded: number;
  section1: {
    headerRow: number; dateCol: number;
    geralAt: { row: number; col: number } | null;
    vendasAt: { row: number; col: number } | null;
    vendasFromFallback: boolean;
    geometricFallback?: boolean;
    qtCol: number; valCol: number;
    dataStartRow: number;
  };
  section2: {
    markerRow: number;
    headerRow: number; zoneCol: number; dateCol: number;
    geralAt: { row: number; col: number } | null;
    vendasAt: { row: number; col: number } | null;
    vendasFromFallback: boolean;
    geometricFallback?: boolean;
    qtCol: number; valCol: number;
    dataStartRow: number;
  };
  rawHeaderCells?: {
    section1: Record<string, Record<string, string>>;
    section2: Record<string, Record<string, string>>;
  };
}


export interface OperationsParseResult {
  header: SaleSummaryHeader;
  rows: OperationRow[];
  section1Daily: DailyTotal[];
  section2DailyTotals: DailyTotal[];
  warnings: string[];
  debug: ParseDebug;
}

function colLetter(idx: number): string {
  let s = ""; let n = idx;
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}
function cell(ws: XLSX.WorkSheet, col: number, row: number): any {
  return ws[`${colLetter(col)}${row}`]?.v;
}
function setCell(ws: XLSX.WorkSheet, col: number, row: number, v: any) {
  const addr = `${colLetter(col)}${row}`;
  if (!ws[addr]) ws[addr] = { t: typeof v === "number" ? "n" : "s", v };
}
function asString(v: any): string {
  return v == null ? "" : String(v).trim();
}
function asNum(v: any): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function parsePtDate(val: any): string {
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (!d) return "";
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = asString(val);
  if (!s) return "";
  const m = s.match(/^(\d{1,2})\s+(\w{3,})\s+(\d{4})$/i);
  if (!m) return "";
  const day = m[1].padStart(2, "0");
  const mon = PT_MONTHS[m[2].toLowerCase().slice(0, 3)] || "";
  if (!mon) return "";
  return `${m[3]}-${mon}-${day}`;
}
function parseDashDate(s: string): string {
  const m = s.match(/(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// Propaga o valor do anchor de cada merge para TODAS as células cobertas.
// Devolve o nº de merges expandidos.
function expandMerges(ws: XLSX.WorkSheet): number {
  const merges = (ws as any)["!merges"] as Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> | undefined;
  if (!merges || merges.length === 0) return 0;
  for (const m of merges) {
    const anchorAddr = `${colLetter(m.s.c)}${m.s.r + 1}`;
    const anchor = ws[anchorAddr];
    if (!anchor || anchor.v == null) continue;
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        setCell(ws, c, r + 1, anchor.v);
      }
    }
  }
  return merges.length;
}

// Procura `label` em qualquer linha da janela [rowStart..rowEnd]; devolve
// a primeira ocorrência { row, col } ou null.
function findLabelInWindow(
  ws: XLSX.WorkSheet, rowStart: number, rowEnd: number, maxCol: number, label: string,
): { row: number; col: number } | null {
  const want = label.trim().toLowerCase();
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = asString(cell(ws, c, r)).toLowerCase();
      if (v === want) return { row: r, col: c };
    }
  }
  return null;
}

// Dado o col-pai e a linha onde o label-pai está, encontra QT/Valor na
// linha imediatamente abaixo. QT na própria coluna ou na seguinte; Valor
// imediatamente a seguir ao QT.
function findSubColsBelow(
  ws: XLSX.WorkSheet, parentCol: number, parentRow: number, maxCol: number,
): { qtCol: number; valCol: number } {
  const subRow = parentRow + 1;
  let qtCol = -1;
  for (let c = parentCol; c <= Math.min(parentCol + 3, maxCol); c++) {
    const v = asString(cell(ws, c, subRow)).toLowerCase().replace(/\.$/, "");
    if (v === "qt" || v === "quantidade" || v === "qtde") { qtCol = c; break; }
  }
  if (qtCol < 0) qtCol = parentCol;
  let valCol = -1;
  for (let c = qtCol + 1; c <= Math.min(qtCol + 3, maxCol); c++) {
    const v = asString(cell(ws, c, subRow)).toLowerCase();
    if (v.startsWith("valor") || v.includes("€") || v === "vlr") { valCol = c; break; }
  }
  if (valCol < 0) valCol = qtCol + 1;
  return { qtCol, valCol };
}

export function parseTicketlineOperationsXlsx(buf: ArrayBuffer): OperationsParseResult {
  const warnings: string[] = [];
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("Workbook vazio");
  const mergesExpanded = expandMerges(ws);
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const maxRow = range.e.r + 1;
  const maxCol = Math.min(range.e.c, 40);

  // --- Cabeçalho do evento ---
  let eventName = "", periodFrom = "", periodTo = "", eventDate = "", eventTime = "";
  for (let r = 1; r <= Math.min(25, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = cell(ws, c, r);
      if (typeof v !== "string") continue;
      if (!eventName && /^\d+\/\d+\s*-\s*/.test(v)) {
        let name = v;
        const dash = name.indexOf(" - ");
        if (dash >= 0) name = name.slice(dash + 3);
        const pipe = name.indexOf(" | ");
        if (pipe >= 0) name = name.slice(0, pipe);
        eventName = name.trim();
      }
      if (!periodFrom) {
        const pm = v.match(/(\d{2}-\d{2}-\d{4})\s+a\s+(\d{2}-\d{2}-\d{4})/);
        if (pm) { periodFrom = parseDashDate(pm[1]); periodTo = parseDashDate(pm[2]); }
      }
      if (!eventDate) {
        const em = v.match(/(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2})/);
        if (em && v.toLowerCase().includes("data do evento")) {
          eventDate = parseDashDate(em[1]); eventTime = em[2];
        }
      }
    }
  }
  const header: SaleSummaryHeader = {
    event_name: eventName, period_from: periodFrom, period_to: periodTo,
    event_date: eventDate, event_time: eventTime,
  };

  const debug: ParseDebug = {
    mergesExpanded,
    section1: { headerRow: 0, dateCol: -1, geralAt: null, vendasAt: null, vendasFromFallback: false, qtCol: -1, valCol: -1, dataStartRow: 0 },
    section2: { markerRow: 0, headerRow: 0, zoneCol: -1, dateCol: -1, geralAt: null, vendasAt: null, vendasFromFallback: false, qtCol: -1, valCol: -1, dataStartRow: 0 },
  };

  // --- Transição secção 1 → secção 2 ---
  let section2Marker = 0;
  for (let r = 100; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = asString(cell(ws, c, r)).toLowerCase();
      if (v.includes("opera") && v.includes("por dia")) { section2Marker = r; break; }
    }
    if (section2Marker > 0) break;
  }
  debug.section2.markerRow = section2Marker;
  if (section2Marker === 0) warnings.push("Marcador 'Operações por dia' não encontrado.");

  // ============ SECÇÃO 1 ============
  let s1HeaderRow = 0, s1DateCol = -1;
  for (let r = 1; r <= Math.min(40, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = asString(cell(ws, c, r)).toUpperCase();
      if (v === "DATA") { s1HeaderRow = r; s1DateCol = c; break; }
    }
    if (s1HeaderRow > 0) break;
  }
  debug.section1.headerRow = s1HeaderRow;
  debug.section1.dateCol = s1DateCol;

  const section1Daily: DailyTotal[] = [];
  if (s1HeaderRow > 0) {
    const winEnd = s1HeaderRow + 3;
    const geral1 = findLabelInWindow(ws, s1HeaderRow, winEnd, maxCol, "TOTAL GERAL");
    let vendas1 = findLabelInWindow(ws, s1HeaderRow, winEnd, maxCol, "TOTAL VENDAS");
    debug.section1.geralAt = geral1;
    debug.section1.vendasAt = vendas1;

    let qtCol = -1, valCol = -1;
    let geralSub: { qtCol: number; valCol: number } | null = null;
    if (geral1) geralSub = findSubColsBelow(ws, geral1.col, geral1.row, maxCol);

    if (vendas1) {
      const sub = findSubColsBelow(ws, vendas1.col, vendas1.row, maxCol);
      qtCol = sub.qtCol; valCol = sub.valCol;
    } else if (geralSub) {
      // Fallback: TOTAL VENDAS qty = geralQty + 2, val = geralVal + 2
      qtCol = geralSub.qtCol + 2;
      valCol = geralSub.valCol + 2;
      debug.section1.vendasFromFallback = true;
      warnings.push("Secção 1: 'TOTAL VENDAS' resolvido por offset relativo (fallback).");
    } else if (s1DateCol >= 0) {
      // Último recurso: fallback geométrico ancorado em DATA.
      // Layout secção 1: DATA | GERAL(qt,val) | VENDAS(qt,val) | ...
      geralSub = { qtCol: s1DateCol + 1, valCol: s1DateCol + 2 };
      qtCol = s1DateCol + 3;
      valCol = s1DateCol + 4;
      debug.section1.vendasFromFallback = true;
      debug.section1.geometricFallback = true;
      warnings.push("Secção 1: colunas resolvidas por offset relativo à DATA (fallback geométrico).");
    } else {
      warnings.push("Secção 1: nem 'TOTAL VENDAS' nem 'TOTAL GERAL' foram encontrados.");
    }
    debug.section1.qtCol = qtCol;
    debug.section1.valCol = valCol;


    // Início dos dados: primeira linha abaixo do sub-header (que está na linha
    // do label-pai + 1) em que a célula de DATA faz parse como data PT.
    const subRowMax = Math.max(
      vendas1?.row ?? 0, geral1?.row ?? 0, s1HeaderRow,
    ) + 1;
    let dataStart = 0;
    const stop = section2Marker > 0 ? section2Marker : maxRow;
    for (let r = subRowMax + 1; r < stop; r++) {
      if (parsePtDate(cell(ws, s1DateCol, r))) { dataStart = r; break; }
    }
    debug.section1.dataStartRow = dataStart;

    if (dataStart > 0 && qtCol >= 0 && valCol >= 0) {
      for (let r = dataStart; r < stop; r++) {
        const iso = parsePtDate(cell(ws, s1DateCol, r));
        if (!iso) {
          const s = asString(cell(ws, s1DateCol, r)).toUpperCase();
          if (s === "TOTAL" || s === "TOTAL GERAL" || s === "SOMA") break;
          continue;
        }
        const vendasQty = asNum(cell(ws, qtCol, r));
        const vendasValue = asNum(cell(ws, valCol, r));
        const geralQty = geralSub ? asNum(cell(ws, geralSub.qtCol, r)) : 0;
        const geralValue = geralSub ? asNum(cell(ws, geralSub.valCol, r)) : 0;
        section1Daily.push({
          date: iso,
          vendasQty, vendasValue: Math.round(vendasValue * 100) / 100,
          geralQty, geralValue: Math.round(geralValue * 100) / 100,
        });
      }
    }
  } else {
    warnings.push("Header da secção 1 ('DATA') não encontrado.");
  }

  // ============ SECÇÃO 2 ============
  let s2HeaderRow = 0, s2ZoneCol = -1;
  const searchStart = section2Marker > 0 ? section2Marker : 120;
  for (let r = searchStart; r <= Math.min(searchStart + 15, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = asString(cell(ws, c, r)).toUpperCase();
      if (v === "ZONA") { s2HeaderRow = r; s2ZoneCol = c; break; }
    }
    if (s2HeaderRow > 0) break;
  }
  debug.section2.headerRow = s2HeaderRow;
  debug.section2.zoneCol = s2ZoneCol;
  if (s2HeaderRow === 0) {
    warnings.push("Header da secção 2 ('ZONA') não encontrado — sem dados a importar.");
    return { header, rows: [], section1Daily, section2DailyTotals: [], warnings, debug };
  }
  const s2DateCol = Math.max(0, s2ZoneCol - 1);
  debug.section2.dateCol = s2DateCol;

  const winEnd2 = s2HeaderRow + 3;
  const geral2 = findLabelInWindow(ws, s2HeaderRow, winEnd2, maxCol, "TOTAL GERAL");
  let vendas2 = findLabelInWindow(ws, s2HeaderRow, winEnd2, maxCol, "TOTAL VENDAS");
  debug.section2.geralAt = geral2;
  debug.section2.vendasAt = vendas2;

  let qtCol2 = -1, valCol2 = -1;
  let geralSub2: { qtCol: number; valCol: number } | null = null;
  if (geral2) geralSub2 = findSubColsBelow(ws, geral2.col, geral2.row, maxCol);

  if (vendas2) {
    const sub = findSubColsBelow(ws, vendas2.col, vendas2.row, maxCol);
    qtCol2 = sub.qtCol; valCol2 = sub.valCol;
  } else if (geralSub2) {
    qtCol2 = geralSub2.qtCol + 2;
    valCol2 = geralSub2.valCol + 2;
    debug.section2.vendasFromFallback = true;
    warnings.push("Secção 2: 'TOTAL VENDAS' resolvido por offset relativo (fallback).");
  } else {
    warnings.push("Secção 2: nem 'TOTAL VENDAS' nem 'TOTAL GERAL' foram encontrados — sem dados a importar.");
    return { header, rows: [], section1Daily, section2DailyTotals: [], warnings, debug };
  }
  debug.section2.qtCol = qtCol2;
  debug.section2.valCol = valCol2;

  // Início dos dados: primeira linha abaixo do sub-header com ou data válida
  // (col DATA) ou string de zona não-vazia/não-header.
  const subRowMax2 = Math.max(vendas2?.row ?? 0, geral2?.row ?? 0, s2HeaderRow) + 1;
  let dataStart2 = 0;
  for (let r = subRowMax2 + 1; r <= maxRow; r++) {
    const dateOk = !!parsePtDate(cell(ws, s2DateCol, r));
    const zoneStr = asString(cell(ws, s2ZoneCol, r));
    const zoneOk = zoneStr.length > 0 && !["ZONA", "TOTAL", "TOTAL GERAL"].includes(zoneStr.toUpperCase());
    if (dateOk || zoneOk) { dataStart2 = r; break; }
  }
  debug.section2.dataStartRow = dataStart2;

  // --- Iterar linhas da secção 2 ---
  const rows: OperationRow[] = [];
  let currentDate = "";
  let emptyStreak = 0;
  if (dataStart2 > 0) {
    for (let r = dataStart2; r <= maxRow; r++) {
      const zoneRaw = cell(ws, s2ZoneCol, r);
      const zoneStr = asString(zoneRaw);

      if (!zoneStr) {
        const qtv = asNum(cell(ws, qtCol2, r));
        const valv = asNum(cell(ws, valCol2, r));
        if (qtv === 0 && valv === 0) {
          emptyStreak++;
          if (emptyStreak >= 5) break;
          continue;
        }
        emptyStreak = 0;
        continue;
      }
      emptyStreak = 0;
      const zUpper = zoneStr.toUpperCase();
      if (zUpper === "TOTAL" || zUpper.startsWith("TOTAL ") || zUpper === "TOTAL GERAL") continue;

      const iso = parsePtDate(cell(ws, s2DateCol, r));
      if (iso) currentDate = iso;
      if (!currentDate) continue;

      const parts = parseZoneLabel(zoneStr);
      if (!parts.zone) continue;
      if (!zoneStr.includes(" - ") && !zoneStr.includes(" | ")) {
        warnings.push(`Linha ${r}: rótulo "${zoneStr}" sem separador — assumido zone="${parts.zone}", lot="Lote 1".`);
      }

      const vQty = asNum(cell(ws, qtCol2, r));
      const vVal = asNum(cell(ws, valCol2, r));
      const gQty = geralSub2 ? asNum(cell(ws, geralSub2.qtCol, r)) : vQty;
      const gVal = geralSub2 ? asNum(cell(ws, geralSub2.valCol, r)) : vVal;

      if (vQty === 0 && vVal === 0 && gQty === 0 && gVal === 0) continue;

      rows.push({
        date: currentDate,
        zone: parts.zone,
        lot: parts.lot,
        ticketType: parts.ticketType,
        rawLabel: parts.raw,
        totalGeralQty: gQty,
        totalGeralValue: Math.round(gVal * 100) / 100,
        totalVendasQty: vQty,
        totalVendasValue: Math.round(vVal * 100) / 100,
      });
    }
  }

  // Totais agregados secção 2 por dia
  const byDay = new Map<string, DailyTotal>();
  for (const row of rows) {
    const acc = byDay.get(row.date) || { date: row.date, vendasQty: 0, vendasValue: 0, geralQty: 0, geralValue: 0 };
    acc.vendasQty += row.totalVendasQty;
    acc.vendasValue += row.totalVendasValue;
    acc.geralQty += row.totalGeralQty;
    acc.geralValue += row.totalGeralValue;
    byDay.set(row.date, acc);
  }
  const section2DailyTotals = Array.from(byDay.values())
    .map(d => ({ ...d, vendasValue: Math.round(d.vendasValue * 100) / 100, geralValue: Math.round(d.geralValue * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Validação secção 1 vs secção 2
  if (section1Daily.length > 0 && section2DailyTotals.length > 0) {
    const s1Map = new Map(section1Daily.map(d => [d.date, d]));
    for (const d2 of section2DailyTotals) {
      const d1 = s1Map.get(d2.date);
      if (!d1) { warnings.push(`Dia ${d2.date} existe na secção 2 mas não na secção 1.`); continue; }
      if (d1.vendasQty !== d2.vendasQty) warnings.push(`Divergência qty ${d2.date}: secção1=${d1.vendasQty} vs secção2=${d2.vendasQty}.`);
      if (Math.abs(d1.vendasValue - d2.vendasValue) > 0.05) warnings.push(`Divergência valor ${d2.date}: secção1=${d1.vendasValue} vs secção2=${d2.vendasValue}.`);
    }
  }

  return { header, rows, section1Daily, section2DailyTotals, warnings, debug };
}
