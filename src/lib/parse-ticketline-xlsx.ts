import * as XLSX from "xlsx";

export interface TicketlineHeader {
  event_name: string;
  period_from: string;
  period_to: string;
  event_date: string;
  event_time: string;
}

export interface TicketlineDailySale {
  date: string; // YYYY-MM-DD
  zone: string;
  lot: string;
  quantity: number;
  unit_price: number;
  total_value: number;
}

export interface TicketlineSummaryDay {
  date: string;
  total_qty: number;
  sold_qty: number;
  sold_value: number;
}

export interface TicketlineParseResult {
  header: TicketlineHeader;
  summary: TicketlineSummaryDay[];
  sales: TicketlineDailySale[];
  totalSoldQty: number;
  totalSoldValue: number;
}

/** Detect if this workbook is a Ticketline "Resumo de Operações" */
export function isTicketlineFormat(wb: XLSX.WorkBook): boolean {
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return false;
  // Search for "RESUMO DE OPERA" in any cell of the first 15 rows
  for (let r = 1; r <= 15; r++) {
    for (const c of ["A", "B", "C", "D", "E", "F"]) {
      const v = ws[`${c}${r}`]?.v;
      if (typeof v === "string" && v.includes("RESUMO DE OPERA")) return true;
    }
  }
  return false;
}

/** Parse a Portuguese date like "10 Mar 2026" into "2026-03-10" */
function parsePtDate(val: string): string {
  const months: Record<string, string> = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
  };
  const m = val.trim().match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/i);
  if (!m) return "";
  const day = m[1].padStart(2, "0");
  const mon = months[m[2].toLowerCase().slice(0, 3)] || "01";
  return `${m[3]}-${mon}-${day}`;
}

/** Parse "DD-MM-YYYY" to "YYYY-MM-DD" */
function parseDashDate(val: string): string {
  const m = val.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Split "BANCADA | Lote 2" into { zone: "BANCADA", lot: "Lote 2" } */
function splitZoneLot(val: string): { zone: string; lot: string } {
  const parts = val.split("|").map((s) => s.trim());
  if (parts.length >= 2) {
    return { zone: parts[0], lot: parts.slice(1).join(" | ") };
  }
  return { zone: val.trim(), lot: "" };
}

/** Convert 0-based column index to letter (0=A, 1=B, ..., 25=Z, 26=AA) */
function colLetter(idx: number): string {
  let s = "";
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** Get cell value */
function cell(ws: XLSX.WorkSheet, col: number, row: number): any {
  return ws[`${colLetter(col)}${row}`]?.v;
}

/** Search for a cell whose string value matches a test, within a row/col range */
function findCell(
  ws: XLSX.WorkSheet,
  test: (v: string) => boolean,
  rowRange: [number, number],
  colRange: [number, number],
): { row: number; col: number } | null {
  for (let r = rowRange[0]; r <= rowRange[1]; r++) {
    for (let c = colRange[0]; c <= colRange[1]; c++) {
      const v = cell(ws, c, r);
      if (typeof v === "string" && test(v)) return { row: r, col: c };
    }
  }
  return null;
}

/** Find column in a row that contains a specific label */
function findColInRow(ws: XLSX.WorkSheet, row: number, test: (v: string) => boolean, colRange: [number, number]): number {
  for (let c = colRange[0]; c <= colRange[1]; c++) {
    const v = cell(ws, c, row);
    if (typeof v === "string" && test(v)) return c;
  }
  return -1;
}

export function parseTicketlineXlsx(data: ArrayBuffer): TicketlineParseResult {
  const wb = XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const maxRow = range.e.r + 1;
  const maxCol = Math.min(range.e.c, 25); // cap at Z

  // --- Header extraction (search dynamically) ---
  let eventName = "";
  let periodFrom = "";
  let periodTo = "";
  let eventDate = "";
  let eventTime = "";

  for (let r = 1; r <= Math.min(20, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = cell(ws, c, r);
      if (typeof v !== "string") continue;

      // Event name: line containing "/" and " - " (event code pattern)
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

      // Event date: "Data do evento: DD-MM-YYYY HH:MM"
      if (!eventDate) {
        const em = v.match(/(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2})/);
        if (em && v.toLowerCase().includes("data do evento")) {
          eventDate = parseDashDate(em[1]);
          eventTime = em[2];
        }
      }
    }
  }

  const header: TicketlineHeader = { event_name: eventName, period_from: periodFrom, period_to: periodTo, event_date: eventDate, event_time: eventTime };

  // --- Section 1: Summary ---
  // Find summary header row by looking for "VENDIDOS" or "TOTAL" pattern in the first section
  // The summary starts after the header and has columns: Date, TotalQty, ..., SoldQty, SoldValue
  // We detect the summary by finding a row with a parseable Portuguese date in any column
  const summary: TicketlineSummaryDay[] = [];

  // Find the first summary section header — look for a row with "TOTAL" as a column header
  let summaryDateCol = -1;
  let summaryTotalQtyCol = -1;
  let summarySoldQtyCol = -1;
  let summarySoldValueCol = -1;

  // Find summary header row: look for row containing both date-like header and quantity headers
  const summaryHeaderPos = findCell(ws, (v) => v.toUpperCase().includes("TOTAL") && !v.toUpperCase().includes("VENDAS"), [8, Math.min(30, maxRow)], [0, maxCol]);

  // Alternatively look for the first Portuguese date to locate summary data
  let summaryDataStart = 0;
  for (let r = 8; r <= Math.min(50, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = cell(ws, c, r);
      if (typeof v === "string" && parsePtDate(v)) {
        summaryDataStart = r;
        summaryDateCol = c;
        break;
      }
    }
    if (summaryDataStart > 0) break;
  }

  if (summaryDataStart > 0) {
    // Detect value columns from the header row(s) above the first data row
    // Try the row 2 above for sub-headers
    const hdrRow = summaryDataStart - 2;
    if (hdrRow > 0) {
      for (let c = summaryDateCol + 1; c <= maxCol; c++) {
        const v = cell(ws, c, hdrRow);
        if (typeof v !== "string") continue;
        const upper = v.toUpperCase();
        if (upper.includes("TOTAL") && summaryTotalQtyCol < 0) summaryTotalQtyCol = c;
      }
    }

    // Fallback: assume columns are date+1=totalQty, then search for sold columns
    if (summaryTotalQtyCol < 0) summaryTotalQtyCol = summaryDateCol + 1;

    // For sold qty/value, look for "VENDIDOS" or "VENDAS" headers
    for (let sr = Math.max(1, summaryDataStart - 4); sr < summaryDataStart; sr++) {
      for (let c = summaryDateCol + 1; c <= maxCol; c++) {
        const v = cell(ws, c, sr);
        if (typeof v !== "string") continue;
        const upper = v.toUpperCase();
        if (upper.includes("VENDIDO") && summarySoldQtyCol < 0) summarySoldQtyCol = c;
        if (upper.includes("VALOR") || upper.includes("€") || upper.includes("RECEITA")) {
          if (summarySoldValueCol < 0) summarySoldValueCol = c;
        }
      }
    }

    // Fallback positions relative to date column
    if (summarySoldQtyCol < 0) summarySoldQtyCol = summaryDateCol + 3;
    if (summarySoldValueCol < 0) summarySoldValueCol = summarySoldQtyCol + 1;

    // Parse summary rows
    for (let r = summaryDataStart; r <= maxRow; r++) {
      const dateVal = cell(ws, summaryDateCol, r);
      if (typeof dateVal === "string" && dateVal === "TOTAL") break;
      if (dateVal != null) {
        const date = typeof dateVal === "string" ? parsePtDate(dateVal) : "";
        if (date) {
          summary.push({
            date,
            total_qty: Number(cell(ws, summaryTotalQtyCol, r)) || 0,
            sold_qty: Number(cell(ws, summarySoldQtyCol, r)) || 0,
            sold_value: Number(cell(ws, summarySoldValueCol, r)) || 0,
          });
        }
      }
    }
  }

  // --- Section 2: Detail by date/zone ---
  // Find the "ZONA" header dynamically across entire sheet
  let detailHeaderRow = 0;
  let zoneCol = -1;
  let detailDateCol = -1;

  for (let r = 10; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = cell(ws, c, r);
      if (typeof v === "string" && v.toUpperCase() === "ZONA") {
        detailHeaderRow = r;
        zoneCol = c;
        break;
      }
    }
    if (detailHeaderRow > 0) break;
  }

  // Find sold qty and sold value columns from the detail header rows
  // Look for "VENDAS" > "TOTAL VENDAS" sub-headers in the rows around the header
  let detailSoldQtyCol = -1;
  let detailSoldValueCol = -1;

  if (detailHeaderRow > 0) {
    // Search header rows (header row and 1-2 rows below) for column labels
    for (let sr = detailHeaderRow; sr <= detailHeaderRow + 2; sr++) {
      for (let c = zoneCol + 1; c <= maxCol; c++) {
        const v = cell(ws, c, sr);
        if (typeof v !== "string") continue;
        const upper = v.toUpperCase().trim();
        // "QTD" or "QUANTIDADE" for sold qty
        if ((upper === "QTD" || upper.includes("QUANTIDADE") || upper.includes("VENDIDO")) && detailSoldQtyCol < 0) {
          detailSoldQtyCol = c;
        }
        // "VALOR" or "TOTAL" for sold value (but only under VENDAS section)
        if ((upper.includes("VALOR") || upper === "TOTAL" || upper.includes("€")) && detailSoldValueCol < 0 && c > (detailSoldQtyCol >= 0 ? detailSoldQtyCol : zoneCol + 2)) {
          detailSoldValueCol = c;
        }
      }
    }

    // If we found qty but not value, value is typically the next column
    if (detailSoldQtyCol >= 0 && detailSoldValueCol < 0) {
      detailSoldValueCol = detailSoldQtyCol + 1;
    }

    // Fallback: use relative positions from zone column (original logic: zone=D(3), qty=H(7), value=I(8) → offset 4 and 5)
    if (detailSoldQtyCol < 0) detailSoldQtyCol = zoneCol + 4;
    if (detailSoldValueCol < 0) detailSoldValueCol = zoneCol + 5;

    // Date column is typically one column before zone column
    detailDateCol = zoneCol > 0 ? zoneCol - 1 : 0;

    // Data starts 2-3 rows after header (skip sub-header rows)
    const detailStart = detailHeaderRow + 3;

    const sales: TicketlineDailySale[] = [];
    let currentDate = "";

    for (let r = detailStart; r <= maxRow; r++) {
      const dateVal = cell(ws, detailDateCol, r);
      const zoneVal = cell(ws, zoneCol, r);

      if (typeof zoneVal === "string" && zoneVal === "TOTAL") break;

      // New date marker
      if (dateVal != null && typeof dateVal === "string") {
        const parsed = parsePtDate(dateVal);
        if (parsed) currentDate = parsed;
      }

      if (!zoneVal || !currentDate) continue;

      const zoneLotStr = String(zoneVal);
      // Skip if the "zone" is purely numeric — it's likely a misread from another section
      if (/^\d+$/.test(zoneLotStr.trim())) continue;

      const { zone, lot } = splitZoneLot(zoneLotStr);

      const soldQty = Number(cell(ws, detailSoldQtyCol, r)) || 0;
      const soldValue = Number(cell(ws, detailSoldValueCol, r)) || 0;

      if (soldQty <= 0) continue;

      const unitPrice = soldQty > 0 ? Math.round((soldValue / soldQty) * 100) / 100 : 0;

      sales.push({ date: currentDate, zone, lot, quantity: soldQty, unit_price: unitPrice, total_value: soldValue });
    }

    const totalSoldQty = sales.reduce((s, r) => s + r.quantity, 0);
    const totalSoldValue = sales.reduce((s, r) => s + r.total_value, 0);

    return { header, summary, sales, totalSoldQty, totalSoldValue };
  }

  // Fallback: no detail section found
  return { header, summary, sales: [], totalSoldQty: 0, totalSoldValue: 0 };
}
