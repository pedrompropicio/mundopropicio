import type { WorkSheet } from "xlsx";
import { utils } from "xlsx";

/**
 * Apply Portuguese number format (#.##0,00 €) to all numeric cells in a worksheet.
 * This ensures numbers display with dot as thousands separator and comma as decimal.
 */
export function applyPTNumberFormat(ws: WorkSheet): void {
  const fmt = '#.##0,00\\ "€"';
  const range = utils.decode_range(ws["!ref"] || "A1");
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && cell.t === "n" && typeof cell.v === "number") {
        cell.z = fmt;
      }
    }
  }
}
