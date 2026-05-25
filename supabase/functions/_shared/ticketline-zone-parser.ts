// Port server-side de src/lib/parse-ticketline-zone-xlsx.ts
// (cópia direta — sem dependências browser).
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

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

function colLetter(idx: number): string {
  let s = ""; let n = idx;
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}
function cell(ws: XLSX.WorkSheet, col: number, row: number): any {
  return ws[`${colLetter(col)}${row}`]?.v;
}
function parseDashDate(val: string): string {
  const m = String(val).trim().match(/(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

export function parseTicketlineZoneXlsx(data: ArrayBuffer): ZoneReportResult {
  const wb = XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const maxRow = range.e.r + 1;
  const maxCol = Math.min(range.e.c, 30);

  let eventName = "", venueName = "", sessionDate = "", sessionTime = "", periodFrom = "", periodTo = "";

  for (let r = 1; r <= Math.min(20, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = cell(ws, c, r);
      if (typeof v !== "string") continue;
      if (!eventName && v.match(/^\d+\/\d+\s*-\s*/)) {
        let name = v;
        const dash = name.indexOf(" - "); if (dash >= 0) name = name.slice(dash + 3);
        const pipe = name.indexOf(" | "); if (pipe >= 0) name = name.slice(0, pipe);
        eventName = name.trim();
      }
      if (!periodFrom) {
        const pm = v.match(/(\d{2}-\d{2}-\d{4})\s+a\s+(\d{2}-\d{2}-\d{4})/);
        if (pm) { periodFrom = parseDashDate(pm[1]); periodTo = parseDashDate(pm[2]); }
      }
      if (!sessionDate) {
        const sm = v.match(/Sess[ãa]o:\s*(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2})/i);
        if (sm) { sessionDate = parseDashDate(sm[1]); sessionTime = sm[2]; }
      }
      if (!venueName) {
        const vm = v.match(/Local\s+Evento:\s*(.+)/i);
        if (vm) venueName = vm[1].trim();
      }
    }
  }

  const header: ZoneReportHeader = { event_name: eventName, venue_name: venueName, session_date: sessionDate, session_time: sessionTime, period_from: periodFrom, period_to: periodTo };

  let headerRow = 0, zonaCol = -1, precoCol = -1, tipoCol = -1;
  let totalQtCol = -1, totalValCol = -1, vendasQtCol = -1, vendasValCol = -1;

  for (let r = 1; r <= Math.min(30, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      const v = cell(ws, c, r);
      if (typeof v === "string" && v.toUpperCase() === "ZONA") {
        headerRow = r; zonaCol = c; break;
      }
    }
    if (headerRow > 0) break;
  }
  if (headerRow === 0) return { header, rows: [], totalQuantityAll: 0, totalQuantitySold: 0, totalRevenue: 0 };

  for (let c = 0; c <= maxCol; c++) {
    const v = cell(ws, c, headerRow);
    if (typeof v !== "string") continue;
    const u = v.toUpperCase().trim();
    if (u === "P.UN." || u === "P. UN.") precoCol = c;
    if (u.includes("TIPO") && u.includes("BILHETE")) tipoCol = c;
    if (u === "TOTAL GERAL") totalQtCol = c;
    if (u === "VENDAS") vendasQtCol = c;
  }
  if (totalQtCol >= 0) totalValCol = totalQtCol + 1;
  if (vendasQtCol >= 0) vendasValCol = vendasQtCol + 1;
  if (precoCol < 0) precoCol = zonaCol + 1;
  if (tipoCol < 0) tipoCol = zonaCol + 2;
  if (totalQtCol < 0) totalQtCol = zonaCol + 3;
  if (totalValCol < 0) totalValCol = totalQtCol + 1;
  if (vendasQtCol < 0) vendasQtCol = totalQtCol + 2;
  if (vendasValCol < 0) vendasValCol = vendasQtCol + 1;

  const rows: ZoneReportRow[] = [];
  let currentZona = "";
  const dataStart = headerRow + 3;
  let grandTotalAll = 0, grandTotalSold = 0, grandTotalRevenue = 0;

  for (let r = dataStart; r <= maxRow; r++) {
    const zonaVal = cell(ws, zonaCol, r);
    const tipoVal = cell(ws, tipoCol, r);
    const precoVal = cell(ws, precoCol, r);

    if (typeof zonaVal === "string" && zonaVal.trim().toLowerCase() === "total") {
      grandTotalAll = Number(cell(ws, totalQtCol, r)) || 0;
      grandTotalSold = Number(cell(ws, vendasQtCol, r)) || 0;
      grandTotalRevenue = Number(cell(ws, vendasValCol, r)) || 0;
      break;
    }
    if (typeof zonaVal === "string" && zonaVal.trim().toLowerCase() === "soma") continue;
    if (zonaVal != null && typeof zonaVal === "string" && zonaVal.trim()) currentZona = zonaVal.trim();
    if (tipoVal == null || precoVal == null) continue;
    const tipo = String(tipoVal).trim();
    if (!tipo) continue;

    const precoTabela = Number(precoVal) || 0;
    const qtTotal = Number(cell(ws, totalQtCol, r)) || 0;
    const qtVendida = Number(cell(ws, vendasQtCol, r)) || 0;
    const valVendido = Number(cell(ws, vendasValCol, r)) || 0;
    const precoEfetivo = qtVendida > 0
      ? Math.round((valVendido / qtVendida) * 100) / 100
      : precoTabela;

    rows.push({
      zona: currentZona, tipo_bilhete: tipo,
      preco_unitario: precoEfetivo,
      quantidade_total: qtTotal, quantidade_vendida: qtVendida,
      valor_vendido: valVendido, iva_rate: 6,
    });
  }

  return {
    header, rows,
    totalQuantityAll: grandTotalAll || rows.reduce((s, r) => s + r.quantidade_total, 0),
    totalQuantitySold: grandTotalSold || rows.reduce((s, r) => s + r.quantidade_vendida, 0),
    totalRevenue: grandTotalRevenue || rows.reduce((s, r) => s + r.valor_vendido, 0),
  };
}
