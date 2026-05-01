/**
 * Detecção de combos multi-dia em lotes de bilheteira.
 *
 * Regra (decidida 2026-05-01):
 *  - 1 bilhete combo de N dias conta como 1 pessoa em CADA um dos N dias do evento.
 *  - Override explícito: event_ticket_lots.applies_to_days (default 1).
 *  - Heurística por nome: se applies_to_days = 1 mas o nome do lote contém
 *    uma das keywords configuradas (CSV em event_simulator_config.combo_lot_keywords),
 *    tentamos extrair o número de dias do nome ("PASSE 2 DIAS" → 2).
 */

const stripDiacritics = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

/**
 * Devolve o nº de dias a que um lote dá acesso.
 *  - Se `applies_to_days` (DB) > 1 → usa esse valor (override explícito).
 *  - Senão, se o nome contiver uma keyword combo, tenta extrair "(\d+) DIAS" do nome.
 *  - Default 1.
 */
export function lotComboDays(
  lot: { name: string; applies_to_days?: number | null },
  keywordsCsv: string,
  totalEventDays: number,
): number {
  const explicit = Number(lot.applies_to_days || 0);
  if (explicit > 1) return Math.min(explicit, totalEventDays);

  const name = stripDiacritics(lot.name || "");
  const keywords = (keywordsCsv || "")
    .split(",")
    .map((k) => stripDiacritics(k.trim()))
    .filter(Boolean);

  const matchedKeyword = keywords.find((k) => k && name.includes(k));
  if (!matchedKeyword) return 1;

  // Tenta extrair "X DIAS" do nome
  const m = name.match(/(\d+)\s*DIAS?/);
  if (m) {
    const n = Math.max(2, Math.min(parseInt(m[1], 10) || 2, totalEventDays));
    return n;
  }

  // Keyword genérica (COMBO, PASSE, FULL PASS) sem número → assume todos os dias
  return Math.max(2, totalEventDays);
}

export type DailyAttendanceRow = {
  day_index: number;
  day_date: string | null;
  zone_label: string;
  paying: number;       // pagantes (real + projeção, expandidos por combos)
  courtesy: number;     // cortesias (não expandimos — já são por sessão)
  total: number;        // paying + courtesy
};

export type LotSale = {
  lot_id: string;
  lot_name: string;
  applies_to_days: number | null;
  zone_id: string;
  zone_name: string;
  sale_day_index: number | null; // 0-based; null se sem data
  qty: number;
};

/**
 * Expande vendas de lotes para presença diária por zona.
 *
 * Para cada venda de combo de N dias, gera N entradas — uma por dia consecutivo
 * a partir de `sale_day_index` (ou dia 0 se null), até ao limite `totalEventDays`.
 */
export function expandLotSalesToDailyAttendance(
  lotSales: LotSale[],
  zones: { name: string }[],
  totalEventDays: number,
  comboKeywordsCsv: string,
  dates: { date: string | null }[],
  courtesyByDayZone: Map<string, number>, // key = `${day_index}|${zone_label}`
): DailyAttendanceRow[] {
  const grid = new Map<string, DailyAttendanceRow>();
  const ensureCell = (day_index: number, zone_label: string): DailyAttendanceRow => {
    const key = `${day_index}|${zone_label}`;
    let cell = grid.get(key);
    if (!cell) {
      cell = {
        day_index,
        day_date: dates[day_index]?.date ?? null,
        zone_label,
        paying: 0,
        courtesy: 0,
        total: 0,
      };
      grid.set(key, cell);
    }
    return cell;
  };

  // Pre-criar todas as células (dia × zona) para mostrar zeros
  for (let d = 0; d < Math.max(1, totalEventDays); d++) {
    for (const z of zones) ensureCell(d, z.name);
  }

  // Expandir vendas
  for (const sale of lotSales) {
    const days = lotComboDays(
      { name: sale.lot_name, applies_to_days: sale.applies_to_days },
      comboKeywordsCsv,
      totalEventDays,
    );
    const startDay = sale.sale_day_index ?? 0;
    for (let offset = 0; offset < days; offset++) {
      const d = startDay + offset;
      if (d >= totalEventDays) break;
      const cell = ensureCell(d, sale.zone_name);
      cell.paying += sale.qty;
      cell.total += sale.qty;
    }
  }

  // Adicionar cortesias por sessão (vêm do simulador, sem expansão)
  for (const [key, courtesyQty] of courtesyByDayZone.entries()) {
    const [dStr, zoneLabel] = key.split("|");
    const cell = ensureCell(parseInt(dStr, 10), zoneLabel);
    cell.courtesy += courtesyQty;
    cell.total += courtesyQty;
  }

  return Array.from(grid.values()).sort(
    (a, b) => a.day_index - b.day_index || a.zone_label.localeCompare(b.zone_label),
  );
}
