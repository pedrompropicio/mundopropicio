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
  const c3 = ws["C3"]?.v;
  return typeof c3 === "string" && c3.includes("RESUMO DE OPERA");
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
  // No pipe separator — whole thing is the zone, lot is empty
  return { zone: val.trim(), lot: "" };
}

export function parseTicketlineXlsx(data: ArrayBuffer): TicketlineParseResult {
  const wb = XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // --- Header extraction ---
  const eventNameRaw = String(ws["C5"]?.v || "");
  // Format: "102857/124503 - SIMONE MENDES - TOUR PORTUGAL 2026 - LISBOA | SIMONE MENDES ..."
  // Take after first " - " and before " | "
  let eventName = eventNameRaw;
  const dashIdx = eventNameRaw.indexOf(" - ");
  if (dashIdx >= 0) eventName = eventNameRaw.slice(dashIdx + 3);
  const pipeIdx = eventName.indexOf(" | ");
  if (pipeIdx >= 0) eventName = eventName.slice(0, pipeIdx);
  eventName = eventName.trim();

  // Period: "Operações de DD-MM-YYYY a DD-MM-YYYY"
  const periodRaw = String(ws["C7"]?.v || "");
  const periodMatch = periodRaw.match(/(\d{2}-\d{2}-\d{4})\s+a\s+(\d{2}-\d{2}-\d{4})/);
  const periodFrom = periodMatch ? parseDashDate(periodMatch[1]) : "";
  const periodTo = periodMatch ? parseDashDate(periodMatch[2]) : "";

  // Event date: "Data do evento: DD-MM-YYYY HH:MM"
  const eventDateRaw = String(ws["C8"]?.v || "");
  const evMatch = eventDateRaw.match(/(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2})/);
  const eventDate = evMatch ? parseDashDate(evMatch[1]) : "";
  const eventTime = evMatch ? evMatch[2] : "";

  const header: TicketlineHeader = { event_name: eventName, period_from: periodFrom, period_to: periodTo, event_date: eventDate, event_time: eventTime };

  // --- Section 1: Summary (rows 13 onwards until TOTAL) ---
  const summary: TicketlineSummaryDay[] = [];
  let row = 13;
  while (row < 200) {
    const cVal = ws[`C${row}`]?.v;
    const dVal = ws[`D${row}`]?.v;
    const fVal = ws[`F${row}`]?.v;
    const gVal = ws[`G${row}`]?.v;
    if (typeof cVal === "string" && cVal === "TOTAL") break;
    if (cVal != null) {
      const date = typeof cVal === "string" ? parsePtDate(cVal) : "";
      if (date) {
        summary.push({
          date,
          total_qty: Number(dVal) || 0,
          sold_qty: Number(fVal) || 0,
          sold_value: Number(gVal) || 0,
        });
      }
    }
    row++;
  }

  const maxRow = XLSX.utils.decode_range(ws["!ref"] || "A1").e.r + 1;

  // --- Section 2: Detail by date/zone (find start after "Operações por dia") ---
  // Find the detail header row (contains "ZONA" in D column)
  // Search the entire sheet — summary sections with many days can push this far down
  let detailStart = 0;
  for (let r = 10; r <= maxRow; r++) {
    if (ws[`D${r}`]?.v === "ZONA") {
      detailStart = r + 3; // skip header rows
      break;
    }
  }

  const sales: TicketlineDailySale[] = [];
  let currentDate = "";

  for (let r = detailStart; r <= maxRow; r++) {
    const cVal = ws[`C${r}`]?.v;
    const dVal = ws[`D${r}`]?.v;

    if (typeof dVal === "string" && dVal === "TOTAL") break;

    // New date marker
    if (cVal != null && typeof cVal === "string") {
      const parsed = parsePtDate(cVal);
      if (parsed) currentDate = parsed;
    }

    if (!dVal || !currentDate) continue;

    const zoneLotStr = String(dVal);
    const { zone, lot } = splitZoneLot(zoneLotStr);

    // H = sold qty, I = sold value (VENDAS > TOTAL VENDAS)
    const soldQty = Number(ws[`H${r}`]?.v) || 0;
    const soldValue = Number(ws[`I${r}`]?.v) || 0;

    if (soldQty <= 0) continue;

    const unitPrice = soldQty > 0 ? Math.round((soldValue / soldQty) * 100) / 100 : 0;

    sales.push({
      date: currentDate,
      zone,
      lot,
      quantity: soldQty,
      unit_price: unitPrice,
      total_value: soldValue,
    });
  }

  const totalSoldQty = sales.reduce((s, r) => s + r.quantity, 0);
  const totalSoldValue = sales.reduce((s, r) => s + r.total_value, 0);

  return { header, summary, sales, totalSoldQty, totalSoldValue };
}
