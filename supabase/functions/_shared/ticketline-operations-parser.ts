// Parser server-side da SECÇÃO 2 do sale_summary.xlsx?granularity=2 do Ticketline
// (título "RESUMO DE OPERAÇÕES").
//
// Layout (descoberto em 2026-05-25):
//   - Secção 1 (~row 10..123): header "DATA | TOTAL GERAL | VENDAS (sub-canais)".
//     Linhas: totais diários. É só para auditoria — NÃO se importa daqui.
//   - Uma linha de transição (~row 126) com texto "Operações por dia no período de ...".
//   - Secção 2 (~row 128 em diante): header "ZONA" + sub-colunas
//     ("TOTAL GERAL", "TOTAL VENDAS", "POSTOS TL", "INTERNET",
//      "BILHETEIRA", "ASSINATURAS", "VALES", "CONVITES", "CATIVOS"...),
//     cada uma com sub-header "QT" / "Valor". A data PT "DD Mmm YYYY"
//     aparece apenas na PRIMEIRA linha de cada bloco-dia (coluna à esquerda
//     do "ZONA"); nas linhas seguintes a data anterior aplica-se.
//
// O importador só usa o par (qt, valor) da coluna "TOTAL VENDAS" da secção 2.
// "TOTAL GERAL" (inclui vales / convites / cativos / bloqueados) fica no
// import_audit para reconciliação, mas NÃO entra em ticket_sales.
//
// O parser é resiliente:
//   - Colunas localizadas por LABEL ("ZONA", "TOTAL VENDAS", ...), nunca por
//     offset fixo. Sub-header (QT/Valor) localizado pela label imediatamente
//     abaixo do label-pai.
//   - Coluna "ZONA" parseada em (zone, lot, ticket_type) por ` - ` (lote)
//     e ` | ` (tipo). Se a string não tiver separadores, guarda o nome
//     inteiro como zona, lot="Lote 1" default, e adiciona warning.
//   - Secção 1 também coletada por dia (TOTAL VENDAS) para validação.
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
  // 1. Separar tipo de ingresso ( | )
  let main = r;
  let ticketType: string | null = null;
  const pipeIdx = main.indexOf(" | ");
  if (pipeIdx >= 0) {
    ticketType = main.slice(pipeIdx + 3).trim() || null;
    main = main.slice(0, pipeIdx).trim();
  }
  // 2. Separar lote ( - )
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
  date: string;            // YYYY-MM-DD
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

export interface OperationsParseResult {
  header: SaleSummaryHeader;
  rows: OperationRow[];
  section1Daily: DailyTotal[];   // soma diária da secção 1 (para validação)
  section2DailyTotals: DailyTotal[]; // soma das rows da secção 2 por dia
  warnings: string[];
}

function colLetter(idx: number): string {
  let s = ""; let n = idx;
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}
function cell(ws: XLSX.WorkSheet, col: number, row: number): any {
  return ws[`${colLetter(col)}${row}`]?.v;
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

interface SubCol { qty: number; value: number }

// Localiza, dentro de uma row de header, todas as colunas cujo valor seja
// (case-insensitive trim) igual a `label`. Devolve idx das colunas.
function findHeaderCols(ws: XLSX.WorkSheet, row: number, maxCol: number, label: string): number[] {
  const want = label.trim().toLowerCase();
  const out: number[] = [];
  for (let c = 0; c <= maxCol; c++) {
    const v = asString(cell(ws, c, row)).toLowerCase();
    if (v === want) out.push(c);
  }
  return out;
}

// Dado o col de um label-pai e a row do sub-header, devolve {qtCol, valCol}.
// Lê o sub-header em (row+1) — Ticketline tem "QT" e "Valor" lado a lado.
// Se sub-header não disser nada, assume qtCol=col, valCol=col+1.
function findSubCols(ws: XLSX.WorkSheet, parentCol: number, subHeaderRow: number, maxCol: number): SubCol & { qtCol: number; valCol: number } {
  // procurar QT a partir de parentCol
  let qtCol = -1, valCol = -1;
  for (let c = parentCol; c <= Math.min(parentCol + 4, maxCol); c++) {
    const v = asString(cell(ws, c, subHeaderRow)).toLowerCase().replace(/\.$/, "");
    if (v === "qt" || v === "quantidade") { qtCol = c; break; }
  }
  if (qtCol < 0) qtCol = parentCol;
  for (let c = qtCol + 1; c <= Math.min(qtCol + 4, maxCol); c++) {
    const v = asString(cell(ws, c, subHeaderRow)).toLowerCase();
    if (v.startsWith("valor") || v.includes("€") || v === "vlr") { valCol = c; break; }
  }
  if (valCol < 0) valCol = qtCol + 1;
  return { qtCol, valCol, qty: 0, value: 0 };
}

export function parseTicketlineOperationsXlsx(buf: ArrayBuffer): OperationsParseResult {
  const warnings: string[] = [];
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("Workbook vazio");
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const maxRow = range.e.r + 1;
  const maxCol = Math.min(range.e.c, 40);

  // --- Header (primeiras ~25 linhas) ---
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

  // --- Localizar transição secção 1 → secção 2 ---
  // Procurar row cujo texto contenha "operações por dia" / "operacoes por dia"
  let section2Marker = 0;
  for (let r = 100; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = asString(cell(ws, c, r)).toLowerCase();
      if (v.includes("opera") && v.includes("por dia") && v.includes("período")) {
        section2Marker = r; break;
      }
      if (v.includes("opera") && v.includes("por dia")) {
        section2Marker = r; break;
      }
    }
    if (section2Marker > 0) break;
  }
  if (section2Marker === 0) {
    warnings.push("Marcador 'Operações por dia' não encontrado.");
  }

  // --- Header da secção 1 (row com "DATA") ---
  let s1HeaderRow = 0, s1DateCol = -1;
  for (let r = 1; r <= Math.min(40, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = asString(cell(ws, c, r)).toUpperCase();
      if (v === "DATA") { s1HeaderRow = r; s1DateCol = c; break; }
    }
    if (s1HeaderRow > 0) break;
  }

  // Secção 1: TOTAL VENDAS por dia (para validação)
  const section1Daily: DailyTotal[] = [];
  if (s1HeaderRow > 0) {
    // Encontrar coluna pai "TOTAL VENDAS" e "TOTAL GERAL"
    const vendasCols = findHeaderCols(ws, s1HeaderRow, maxCol, "TOTAL VENDAS");
    const geralCols = findHeaderCols(ws, s1HeaderRow, maxCol, "TOTAL GERAL");
    // Se "TOTAL VENDAS" não estiver na MESMA row de "DATA", pode estar 1 row acima/abaixo
    // (cabeçalhos podem ter merge). Tentar row±1.
    const tryRows = [s1HeaderRow - 1, s1HeaderRow + 1];
    if (vendasCols.length === 0) for (const rr of tryRows) {
      const v = findHeaderCols(ws, rr, maxCol, "TOTAL VENDAS"); if (v.length) { vendasCols.push(...v); break; }
    }
    if (geralCols.length === 0) for (const rr of tryRows) {
      const v = findHeaderCols(ws, rr, maxCol, "TOTAL GERAL"); if (v.length) { geralCols.push(...v); break; }
    }
    const vendasParent = vendasCols[0] ?? -1;
    const geralParent = geralCols[0] ?? -1;
    const subHeaderRow = s1HeaderRow + 1;
    const vendasSub = vendasParent >= 0 ? findSubCols(ws, vendasParent, subHeaderRow, maxCol) : null;
    const geralSub = geralParent >= 0 ? findSubCols(ws, geralParent, subHeaderRow, maxCol) : null;

    // Linhas de dados — começam 2 rows abaixo do header da secção 1 e param antes de section2Marker
    const stop = section2Marker > 0 ? section2Marker : maxRow;
    for (let r = s1HeaderRow + 2; r < stop; r++) {
      const dateRaw = cell(ws, s1DateCol, r);
      const iso = parsePtDate(dateRaw);
      if (!iso) {
        const s = asString(dateRaw).toUpperCase();
        if (s === "TOTAL" || s === "TOTAL GERAL" || s === "SOMA") continue;
        continue;
      }
      const vendasQty = vendasSub ? asNum(cell(ws, vendasSub.qtCol, r)) : 0;
      const vendasValue = vendasSub ? asNum(cell(ws, vendasSub.valCol, r)) : 0;
      const geralQty = geralSub ? asNum(cell(ws, geralSub.qtCol, r)) : 0;
      const geralValue = geralSub ? asNum(cell(ws, geralSub.valCol, r)) : 0;
      section1Daily.push({
        date: iso,
        vendasQty, vendasValue: Math.round(vendasValue * 100) / 100,
        geralQty, geralValue: Math.round(geralValue * 100) / 100,
      });
    }
  } else {
    warnings.push("Header da secção 1 ('DATA') não encontrado.");
  }

  // --- Header da secção 2 (row com "ZONA") ---
  let s2HeaderRow = 0, s2ZoneCol = -1;
  const searchStart = section2Marker > 0 ? section2Marker : 120;
  for (let r = searchStart; r <= Math.min(searchStart + 15, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = asString(cell(ws, c, r)).toUpperCase();
      if (v === "ZONA") { s2HeaderRow = r; s2ZoneCol = c; break; }
    }
    if (s2HeaderRow > 0) break;
  }
  if (s2HeaderRow === 0) {
    warnings.push("Header da secção 2 ('ZONA') não encontrado — sem dados a importar.");
    return { header, rows: [], section1Daily, section2DailyTotals: [], warnings };
  }
  // Coluna da DATA na secção 2 = coluna imediatamente à esquerda de "ZONA"
  // (briefing: data aparece na coluna C, ZONA em D).
  const s2DateCol = Math.max(0, s2ZoneCol - 1);

  // Localizar colunas pai TOTAL VENDAS / TOTAL GERAL na secção 2.
  const s2VendasCols = findHeaderCols(ws, s2HeaderRow, maxCol, "TOTAL VENDAS");
  const s2GeralCols = findHeaderCols(ws, s2HeaderRow, maxCol, "TOTAL GERAL");
  // tentar rows adjacentes se merge moveu o label
  const tryRows2 = [s2HeaderRow - 1, s2HeaderRow + 1];
  if (s2VendasCols.length === 0) for (const rr of tryRows2) {
    const v = findHeaderCols(ws, rr, maxCol, "TOTAL VENDAS"); if (v.length) { s2VendasCols.push(...v); break; }
  }
  if (s2GeralCols.length === 0) for (const rr of tryRows2) {
    const v = findHeaderCols(ws, rr, maxCol, "TOTAL GERAL"); if (v.length) { s2GeralCols.push(...v); break; }
  }
  if (s2VendasCols.length === 0) {
    warnings.push("Coluna 'TOTAL VENDAS' não encontrada na secção 2.");
    return { header, rows: [], section1Daily, section2DailyTotals: [], warnings };
  }
  const s2SubHeaderRow = s2HeaderRow + 1;
  const vendasSub2 = findSubCols(ws, s2VendasCols[0], s2SubHeaderRow, maxCol);
  const geralSub2 = s2GeralCols.length > 0 ? findSubCols(ws, s2GeralCols[0], s2SubHeaderRow, maxCol) : null;

  // --- Iterar linhas da secção 2 ---
  const rows: OperationRow[] = [];
  let currentDate = "";
  let emptyStreak = 0;
  for (let r = s2HeaderRow + 2; r <= maxRow; r++) {
    const zoneRaw = cell(ws, s2ZoneCol, r);
    const zoneStr = asString(zoneRaw);

    // Linha sem zona: pode ser linha vazia entre dias, ou fim.
    if (!zoneStr) {
      // Pode ser linha "TOTAL" do dia (col DATA vazia, col ZONA vazia, totais preenchidos).
      const qtv = asNum(cell(ws, vendasSub2.qtCol, r));
      const valv = asNum(cell(ws, vendasSub2.valCol, r));
      if (qtv === 0 && valv === 0) {
        emptyStreak++;
        if (emptyStreak >= 5) break;
        continue;
      }
      // ignora linha de total intermédio
      emptyStreak = 0;
      continue;
    }
    emptyStreak = 0;
    // Detetar linha tipo "TOTAL <data>" / "TOTAL"
    const zUpper = zoneStr.toUpperCase();
    if (zUpper === "TOTAL" || zUpper.startsWith("TOTAL ") || zUpper === "TOTAL GERAL") {
      continue;
    }

    // Propagação da data
    const dateRaw = cell(ws, s2DateCol, r);
    const iso = parsePtDate(dateRaw);
    if (iso) currentDate = iso;
    if (!currentDate) {
      // antes de termos data, salta
      continue;
    }

    const parts = parseZoneLabel(zoneStr);
    if (!parts.zone) continue;
    if (!zoneStr.includes(" - ") && !zoneStr.includes(" | ")) {
      warnings.push(`Linha ${r}: rótulo "${zoneStr}" sem separador — assumido zone="${parts.zone}", lot="Lote 1".`);
    }

    const vQty = asNum(cell(ws, vendasSub2.qtCol, r));
    const vVal = asNum(cell(ws, vendasSub2.valCol, r));
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

  // --- Totais agregados secção 2 por dia (para validação) ---
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

  // --- Validação secção 1 vs secção 2 (TOTAL VENDAS) ---
  if (section1Daily.length > 0 && section2DailyTotals.length > 0) {
    const s1Map = new Map(section1Daily.map(d => [d.date, d]));
    for (const d2 of section2DailyTotals) {
      const d1 = s1Map.get(d2.date);
      if (!d1) {
        warnings.push(`Dia ${d2.date} existe na secção 2 mas não na secção 1.`);
        continue;
      }
      if (d1.vendasQty !== d2.vendasQty) {
        warnings.push(`Divergência qty ${d2.date}: secção1=${d1.vendasQty} vs secção2=${d2.vendasQty}.`);
      }
      if (Math.abs(d1.vendasValue - d2.vendasValue) > 0.05) {
        warnings.push(`Divergência valor ${d2.date}: secção1=${d1.vendasValue} vs secção2=${d2.vendasValue}.`);
      }
    }
  }

  return { header, rows, section1Daily, section2DailyTotals, warnings };
}
