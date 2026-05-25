// Parser server-side do Ticketline sale_summary.xlsx?granularity=2
// Estrutura:
//   - Cabeçalho com nome do evento, "Operações de DD-MM-YYYY a DD-MM-YYYY", data sessão
//   - Header da grelha contém "DATA" e "TOTAL GERAL"
//   - Secção 1 (a importar): col[date] = data "DD Mmm YYYY"; col[qty] = número; col[val] = número
//   - Secção 2 (breakdown por dia × tipo): primeira coluna passa a STRING (nome do tipo) → STOP
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

export interface TicketlineDailyPoint {
  date: string;     // YYYY-MM-DD
  quantity: number; // pode ser negativo
  value: number;    // euros, pode ser negativo
}

export interface TicketlineSaleSummaryHeader {
  event_name: string;
  period_from: string;
  period_to: string;
  event_date: string;
  event_time: string;
}

export interface TicketlineSaleSummaryResult {
  header: TicketlineSaleSummaryHeader;
  daily: TicketlineDailyPoint[];
  totalQty: number;
  totalValue: number;
  warnings: string[];
}

const PT_MONTHS: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

function parsePtDate(val: string): string {
  const m = String(val).trim().match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/i);
  if (!m) return "";
  const day = m[1].padStart(2, "0");
  const mon = PT_MONTHS[m[2].toLowerCase().slice(0, 3)] || "01";
  return `${m[3]}-${mon}-${day}`;
}

function parseDashDate(val: string): string {
  const m = String(val).trim().match(/(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function colLetter(idx: number): string {
  let s = ""; let n = idx;
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}
function cell(ws: XLSX.WorkSheet, col: number, row: number): any {
  return ws[`${colLetter(col)}${row}`]?.v;
}

export function parseTicketlineSaleSummaryXlsx(buf: ArrayBuffer): TicketlineSaleSummaryResult {
  const warnings: string[] = [];
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("Workbook vazio");
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const maxRow = range.e.r + 1;
  const maxCol = Math.min(range.e.c, 25);

  // --- Cabeçalho (primeiras ~20 linhas) ---
  let eventName = "", periodFrom = "", periodTo = "", eventDate = "", eventTime = "";
  for (let r = 1; r <= Math.min(20, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = cell(ws, c, r);
      if (typeof v !== "string") continue;
      if (!eventName && v.match(/^\d+\/\d+\s*-\s*/)) {
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

  // --- Localizar row do header da grelha (contém "DATA") ---
  let headerRow = 0;
  let dateCol = -1;
  for (let r = 1; r <= Math.min(30, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = cell(ws, c, r);
      if (typeof v === "string" && v.trim().toUpperCase() === "DATA") {
        headerRow = r; dateCol = c; break;
      }
    }
    if (headerRow > 0) break;
  }
  if (headerRow === 0) {
    warnings.push("Header 'DATA' não encontrado.");
    return {
      header: { event_name: eventName, period_from: periodFrom, period_to: periodTo, event_date: eventDate, event_time: eventTime },
      daily: [], totalQty: 0, totalValue: 0, warnings,
    };
  }

  // Sub-header "Qt." / "Valor" tipicamente 1-2 linhas abaixo
  let qtyCol = -1, valCol = -1;
  for (let sr = headerRow; sr <= headerRow + 3; sr++) {
    for (let c = dateCol + 1; c <= maxCol; c++) {
      const v = cell(ws, sr, c) ?? cell(ws, c, sr);
      const s = typeof v === "string" ? v.trim().toLowerCase() : "";
      if (s === "qt." || s === "qt" || s === "quantidade") { if (qtyCol < 0) qtyCol = c; }
      if (s === "valor" || s.includes("€")) { if (valCol < 0 && c > qtyCol) valCol = c; }
    }
  }
  if (qtyCol < 0) qtyCol = dateCol + 1;
  if (valCol < 0) valCol = qtyCol + 1;

  // Procurar primeira linha de dados (data PT) abaixo de headerRow
  let dataStart = 0;
  for (let r = headerRow + 1; r <= Math.min(headerRow + 6, maxRow); r++) {
    const v = cell(ws, dateCol, r);
    if (typeof v === "string" && parsePtDate(v)) { dataStart = r; break; }
  }
  if (dataStart === 0) dataStart = headerRow + 3;

  // --- Parse secção 1 (TOTAL GERAL por dia) ---
  // STOP quando: col[date] string não-data, OU col[date] = "Total" / "TOTAL", OU primeira coluna vira string com nome de tipo
  const daily: TicketlineDailyPoint[] = [];
  let totalQty = 0, totalValue = 0;

  for (let r = dataStart; r <= maxRow; r++) {
    const dateVal = cell(ws, dateCol, r);
    // Linha vazia → considera fim de secção
    if (dateVal == null || dateVal === "") {
      // permitir 1 linha vazia; se a próxima também for vazia, para
      const next = cell(ws, dateCol, r + 1);
      if (next == null || next === "") break;
      continue;
    }
    if (typeof dateVal === "string") {
      const trimmed = dateVal.trim();
      const upper = trimmed.toUpperCase();
      if (upper === "TOTAL" || upper === "TOTAL GERAL" || upper === "SOMA") break;
      const iso = parsePtDate(trimmed);
      if (!iso) {
        // não-data string na primeira coluna = transição p/ secção 2 (breakdown por tipo)
        break;
      }
      const q = Number(cell(ws, qtyCol, r)) || 0;
      const v = Number(cell(ws, valCol, r)) || 0;
      daily.push({ date: iso, quantity: q, value: Math.round(v * 100) / 100 });
      totalQty += q;
      totalValue += v;
    } else if (typeof dateVal === "number") {
      // Excel serial → converter
      const d = XLSX.SSF.parse_date_code(dateVal);
      if (!d) break;
      const iso = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
      const q = Number(cell(ws, qtyCol, r)) || 0;
      const v = Number(cell(ws, valCol, r)) || 0;
      daily.push({ date: iso, quantity: q, value: Math.round(v * 100) / 100 });
      totalQty += q;
      totalValue += v;
    } else {
      break;
    }
  }

  totalValue = Math.round(totalValue * 100) / 100;

  return {
    header: { event_name: eventName, period_from: periodFrom, period_to: periodTo, event_date: eventDate, event_time: eventTime },
    daily,
    totalQty,
    totalValue,
    warnings,
  };
}
