import * as XLSX from "xlsx";

export interface ZoneReportHeader {
  event_name: string;
  venue_name: string;
  session_date: string;
  session_time: string;
  period_from: string;
  period_to: string;
}

export interface ZoneReportRow {
  zona: string;
  tipo_bilhete: string;
  preco_unitario: number;
  quantidade_total: number;
  quantidade_vendida: number;
  valor_vendido: number;
  iva_rate: number;
}

export interface ZoneReportResult {
  header: ZoneReportHeader;
  rows: ZoneReportRow[];
  totalQuantityAll: number;
  totalQuantitySold: number;
  totalRevenue: number;
}

/** Detect if workbook is a Ticketline "Relatório por Zona / Tipo de Bilhete" */
export function isTicketlineZoneFormat(wb: XLSX.WorkBook): boolean {
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return false;
  for (let r = 1; r <= 10; r++) {
    for (const c of ["A", "B", "C", "D", "E"]) {
      const v = ws[`${c}${r}`]?.v;
      if (typeof v === "string" && v.toUpperCase().includes("RELAT") && v.toUpperCase().includes("ZONA")) return true;
    }
  }
  return false;
}

function colLetter(idx: number): string {
  let s = "";
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function cell(ws: XLSX.WorkSheet, col: number, row: number): any {
  return ws[`${colLetter(col)}${row}`]?.v;
}

function parseDashDate(val: string): string {
  const m = val.trim().match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseTicketlineZoneXlsx(data: ArrayBuffer): ZoneReportResult {
  const wb = XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const maxRow = range.e.r + 1;
  const maxCol = Math.min(range.e.c, 30);

  let eventName = "";
  let venueName = "";
  let sessionDate = "";
  let sessionTime = "";
  let periodFrom = "";
  let periodTo = "";

  // --- Header extraction (first 20 rows) ---
  for (let r = 1; r <= Math.min(20, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = cell(ws, c, r);
      if (typeof v !== "string") continue;

      // Event name: line with code pattern "NNNNN/NNNNN - Name"
      if (!eventName && v.match(/^\d+\/\d+\s*-\s*/)) {
        let name = v;
        const dashIdx = name.indexOf(" - ");
        if (dashIdx >= 0) name = name.slice(dashIdx + 3);
        const pipeIdx = name.indexOf(" | ");
        if (pipeIdx >= 0) name = name.slice(0, pipeIdx);
        eventName = name.trim();
      }

      // Period: "Operações de DD-MM-YYYY a DD-MM-YYYY"
      if (!periodFrom) {
        const pm = v.match(/(\d{2}-\d{2}-\d{4})\s+a\s+(\d{2}-\d{2}-\d{4})/);
        if (pm) {
          periodFrom = parseDashDate(pm[1]);
          periodTo = parseDashDate(pm[2]);
        }
      }

      // Session: "Sessão: DD-MM-YYYY HH:MM"
      if (!sessionDate) {
        const sm = v.match(/Sess[ãa]o:\s*(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2})/i);
        if (sm) {
          sessionDate = parseDashDate(sm[1]);
          sessionTime = sm[2];
        }
      }

      // Venue: "Local Evento: ..."
      if (!venueName) {
        const vm = v.match(/Local\s+Evento:\s*(.+)/i);
        if (vm) venueName = vm[1].trim();
      }
    }
  }

  const header: ZoneReportHeader = { event_name: eventName, venue_name: venueName, session_date: sessionDate, session_time: sessionTime, period_from: periodFrom, period_to: periodTo };

  // --- Find the data header row (row containing "ZONA" and "P.UN.") ---
  let headerRow = 0;
  let zonaCol = -1;
  let precoCol = -1;
  let tipoCol = -1;
  let totalQtCol = -1;    // "TOTAL GERAL" Qt.
  let totalValCol = -1;   // "TOTAL GERAL" Valor
  let vendasQtCol = -1;   // "VENDAS > TOTAL VENDAS" Qt.
  let vendasValCol = -1;  // "VENDAS > TOTAL VENDAS" Valor

  for (let r = 1; r <= Math.min(30, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = cell(ws, c, r);
      if (typeof v === "string" && v.toUpperCase() === "ZONA") {
        headerRow = r;
        zonaCol = c;
        break;
      }
    }
    if (headerRow > 0) break;
  }

  if (headerRow === 0) {
    return { header, rows: [], totalQuantityAll: 0, totalQuantitySold: 0, totalRevenue: 0 };
  }

  // Scan the header row for other columns
  for (let c = 0; c <= maxCol; c++) {
    const v = cell(ws, c, headerRow);
    if (typeof v !== "string") continue;
    const u = v.toUpperCase().trim();
    if (u === "P.UN." || u === "P. UN.") precoCol = c;
    if (u.includes("TIPO") && u.includes("BILHETE")) tipoCol = c;
    if (u === "TOTAL GERAL") totalQtCol = c;
    if (u === "VENDAS") vendasQtCol = c;
  }

  // Look for sub-headers in the rows below (Qt./Valor pairs)
  // "TOTAL GERAL" header spans col F, with Qt. in F and Valor in G (headerRow+2)
  // "VENDAS > TOTAL VENDAS" header spans col H, with Qt. in H and Valor in I
  const subRow = headerRow + 2; // row with "Qt." and "Valor" labels
  if (totalQtCol >= 0) totalValCol = totalQtCol + 1;
  if (vendasQtCol >= 0) {
    // The "TOTAL VENDAS" sub-header is in the row below "VENDAS"
    // Qt./Valor are at vendasQtCol and vendasQtCol+1
    vendasValCol = vendasQtCol + 1;
  }

  // Verify by checking for "Qt." labels in subRow
  for (let c = 0; c <= maxCol; c++) {
    const v = cell(ws, c, subRow);
    if (typeof v !== "string") continue;
    if (v.trim() === "Qt." && c === totalQtCol) { /* confirmed */ }
    if (v.trim() === "Qt." && c === vendasQtCol) { /* confirmed */ }
  }

  // Fallback: if columns weren't found, use offsets from zona
  if (precoCol < 0) precoCol = zonaCol + 1;
  if (tipoCol < 0) tipoCol = zonaCol + 2;
  if (totalQtCol < 0) totalQtCol = zonaCol + 3;
  if (totalValCol < 0) totalValCol = totalQtCol + 1;
  if (vendasQtCol < 0) vendasQtCol = totalQtCol + 2;
  if (vendasValCol < 0) vendasValCol = vendasQtCol + 1;

  // --- Parse data rows ---
  const rows: ZoneReportRow[] = [];
  let currentZona = "";
  const dataStart = subRow + 1; // first data row after sub-headers

  let grandTotalAll = 0;
  let grandTotalSold = 0;
  let grandTotalRevenue = 0;

  for (let r = dataStart; r <= maxRow; r++) {
    const zonaVal = cell(ws, zonaCol, r);
    const tipoVal = cell(ws, tipoCol, r);
    const precoVal = cell(ws, precoCol, r);

    // "Total" row = grand total
    if (typeof zonaVal === "string" && zonaVal.trim().toLowerCase() === "total") {
      grandTotalAll = Number(cell(ws, totalQtCol, r)) || 0;
      grandTotalSold = Number(cell(ws, vendasQtCol, r)) || 0;
      grandTotalRevenue = Number(cell(ws, vendasValCol, r)) || 0;
      break;
    }

    // Skip "Soma" (subtotal) rows
    if (typeof zonaVal === "string" && zonaVal.trim().toLowerCase() === "soma") continue;

    // New zone name
    if (zonaVal != null && typeof zonaVal === "string" && zonaVal.trim()) {
      currentZona = zonaVal.trim();
    }

    // Must have a ticket type and price to be a data row
    if (tipoVal == null || precoVal == null) continue;
    const tipo = String(tipoVal).trim();
    if (!tipo) continue;

    const preco = Number(precoVal) || 0;
    const qtTotal = Number(cell(ws, totalQtCol, r)) || 0;
    const qtVendida = Number(cell(ws, vendasQtCol, r)) || 0;
    const valVendido = Number(cell(ws, vendasValCol, r)) || 0;

    rows.push({
      zona: currentZona,
      tipo_bilhete: tipo,
      preco_unitario: preco,
      quantidade_total: qtTotal,
      quantidade_vendida: qtVendida,
      valor_vendido: valVendido,
      iva_rate: 6,
    });
  }

  return {
    header,
    rows,
    totalQuantityAll: grandTotalAll || rows.reduce((s, r) => s + r.quantidade_total, 0),
    totalQuantitySold: grandTotalSold || rows.reduce((s, r) => s + r.quantidade_vendida, 0),
    totalRevenue: grandTotalRevenue || rows.reduce((s, r) => s + r.valor_vendido, 0),
  };
}
