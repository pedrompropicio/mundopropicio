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
/**
 * Tenta encontrar a zona-"irmã" para um dado dia destino quando o combo é
 * expandido para um dia que não é o seu dia âncora.
 *
 * Caso típico (Coala): zona ancorada "Relvado — Sábado" tem um combo
 * (Passe 2 dias) que deve aparecer no Domingo NA zona "Relvado — Domingo",
 * e não duplicado como "Relvado — Sábado" no dia 2.
 *
 * Heurística: separa por " — " ou " - " → stem + sufixo dia-da-semana.
 * Substitui o sufixo pelo weekday curto da `targetDate` (pt-PT) e procura
 * uma zona com esse nome. Se não houver, devolve a label original.
 */
function pickSiblingZoneLabel(
  originalLabel: string,
  targetDate: string | null,
  allZoneNames: string[],
): string {
  if (!targetDate) return originalLabel;
  const sepMatch = originalLabel.match(/^(.+?)\s+[—-]\s+(.+)$/);
  if (!sepMatch) return originalLabel;
  const stem = sepMatch[1].trim();
  // weekday curto pt-PT a partir de YYYY-MM-DD (sem TZ shifts)
  const m = targetDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return originalLabel;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const weekdayShort = dt
    .toLocaleDateString("pt-PT", { weekday: "long" })
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase(); // ex: "domingo", "sabado"
  const stripDay = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // procura zona "Stem — <dia>" cujo sufixo bata com o weekday alvo
  const candidate = allZoneNames.find((zn) => {
    const mm = zn.match(/^(.+?)\s+[—-]\s+(.+)$/);
    if (!mm) return false;
    if (stripDay(mm[1].trim()) !== stripDay(stem)) return false;
    return stripDay(mm[2].trim()) === weekdayShort;
  });
  return candidate ?? originalLabel;
}

export function expandLotSalesToDailyAttendance(
  lotSales: LotSale[],
  zones: { name: string }[],
  totalEventDays: number,
  comboKeywordsCsv: string,
  dates: { date: string | null }[],
  courtesyByDayZone: Map<string, number>, // key = `${day_index}|${zone_label}`
): DailyAttendanceRow[] {
  const allZoneNames = zones.map((z) => z.name);
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
    if (sale.sale_day_index != null && days <= 1) {
      // Bilhete simples em zona vinculada a um dia específico do festival.
      const cell = ensureCell(sale.sale_day_index, sale.zone_name);
      cell.paying += sale.qty;
      cell.total += sale.qty;
    } else if (sale.sale_day_index != null) {
      // Combo/Passe importado dentro da zona do sábado: conta 1 pessoa em
      // cada dia coberto, não apenas no dia âncora da venda.
      for (let offset = 0; offset < days; offset++) {
        const day = sale.sale_day_index + offset;
        if (day >= totalEventDays) break;
        const cell = ensureCell(day, sale.zone_name);
        cell.paying += sale.qty;
        cell.total += sale.qty;
      }
    } else {
      // Zona sem dia fixo (ex: "Passe 2 dias") → expande para N dias consecutivos.
      for (let offset = 0; offset < days; offset++) {
        if (offset >= totalEventDays) break;
        const cell = ensureCell(offset, sale.zone_name);
        cell.paying += sale.qty;
        cell.total += sale.qty;
      }
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
