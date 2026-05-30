/**
 * Cálculo PURO de "público por dia" para um evento multi-dia.
 *
 * Espelha exactamente a lógica de `useEventAttendance` mas sem dependências de
 * Supabase / React Query — para ser testado e reutilizado.
 *
 * Regras (decidido 2026-05-03):
 *  - Apenas 2 tipos de bilhete: 'simple' (1 dia) e 'combo' (todos os dias do evento).
 *  - Simples conta no seu dia (via session_id da zona ou day_index_hint).
 *  - Combo conta como 1 pessoa em CADA dia do evento.
 *  - Cortesias somam ao público mas NÃO geram receita.
 *  - Receita de bilheteira nunca é multiplicada pelo nº de dias (1 combo = 1 receita).
 */
export type LotKind = "simple" | "combo";

export interface AttendanceLot {
  id: string;
  zone_id: string;
  kind: LotKind;
  /** preço unitário (para receita; opcional) */
  price?: number;
  /** zonas (1 por dia coberto) que o combo consome; obrigatório quando kind="combo" */
  consumes_zone_ids?: string[];
}


export interface AttendanceZone {
  id: string;
  name: string;
  /** dia ao qual a zona pertence (0..N-1). null = não vinculada (cai no dia 0). */
  day_index?: number | null;
}

export interface AttendanceMovement {
  zone_id: string;
  lot_id: string | null;
  qty: number;
}

export interface AttendanceCourtesy {
  day_index: number;
  zone_id: string;
  qty: number;
}

export interface AttendanceCell {
  day_index: number;
  zone_id: string;
  zone_name: string;
  paying: number;
  courtesy: number;
  total: number;
}

export interface AttendanceResult {
  cells: AttendanceCell[];
  totalsByDay: Record<number, number>;
  totalsByZone: Record<string, number>;
  /** total agregado contando cada dia (combo soma N×). */
  grandTotalDayPeople: number;
  /** Receita de bilheteira: 1 venda × preço, sem multiplicação por dia. */
  ticketRevenue: number;
  ticketsSold: number;
}

export interface AttendanceInput {
  /** N dias do evento, ordenados (0..N-1). */
  numDays: number;
  zones: AttendanceZone[];
  lots: AttendanceLot[];
  movements: AttendanceMovement[];
  courtesies?: AttendanceCourtesy[];
}

export function computeEventAttendance(input: AttendanceInput): AttendanceResult {
  const { numDays, zones, lots, movements, courtesies = [] } = input;
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));

  const grid = new Map<string, AttendanceCell>();
  const ensure = (day_index: number, zone_id: string): AttendanceCell => {
    const k = `${day_index}|${zone_id}`;
    let c = grid.get(k);
    if (!c) {
      c = {
        day_index,
        zone_id,
        zone_name: zoneById.get(zone_id)?.name ?? "—",
        paying: 0,
        courtesy: 0,
        total: 0,
      };
      grid.set(k, c);
    }
    return c;
  };
  for (let d = 0; d < numDays; d++) for (const z of zones) ensure(d, z.id);

  let ticketRevenue = 0;
  let ticketsSold = 0;

  for (const mv of movements) {
    const qty = Number(mv.qty || 0);
    if (qty === 0) continue;
    const lot = mv.lot_id ? lotById.get(mv.lot_id) : undefined;
    const kind: LotKind = lot?.kind === "combo" ? "combo" : "simple";
    const price = Number(lot?.price ?? 0);

    // Receita: 1 bilhete vendido = 1 receita (combo NÃO multiplica por dia).
    ticketRevenue += qty * price;
    ticketsSold += qty;

    if (kind === "combo") {
      // Distribui por CADA zona em consumes_zone_ids (uma por dia coberto).
      // Fallback: zona âncora em todos os dias (modelo antigo; mantém compat).
      const consumed = lot?.consumes_zone_ids?.length ? lot.consumes_zone_ids : null;
      if (consumed) {
        for (const zid of consumed) {
          const zd = zoneById.get(zid)?.day_index;
          const dayIdx = typeof zd === "number" ? zd : 0;
          if (dayIdx >= 0 && dayIdx < numDays) ensure(dayIdx, zid).paying += qty;
        }
      } else {
        for (let d = 0; d < numDays; d++) ensure(d, mv.zone_id).paying += qty;
      }
    } else {
      const zd = zoneById.get(mv.zone_id)?.day_index;
      const dayIdx = typeof zd === "number" ? zd : 0;
      if (dayIdx >= 0 && dayIdx < numDays) ensure(dayIdx, mv.zone_id).paying += qty;
    }

  }

  for (const c of courtesies) {
    if (c.day_index < 0 || c.day_index >= numDays) continue;
    ensure(c.day_index, c.zone_id).courtesy += Number(c.qty || 0);
  }

  const cells = Array.from(grid.values());
  for (const c of cells) c.total = c.paying + c.courtesy;

  const totalsByDay: Record<number, number> = {};
  const totalsByZone: Record<string, number> = {};
  let grand = 0;
  for (const c of cells) {
    totalsByDay[c.day_index] = (totalsByDay[c.day_index] ?? 0) + c.total;
    totalsByZone[c.zone_id] = (totalsByZone[c.zone_id] ?? 0) + c.total;
    grand += c.total;
  }

  return {
    cells,
    totalsByDay,
    totalsByZone,
    grandTotalDayPeople: grand,
    ticketRevenue,
    ticketsSold,
  };
}

/**
 * Validação de configuração por zona — garante que só os tipos permitidos
 * podem ser registados na zona. Lança erro descritivo se violado.
 */
export function assertLotKindAllowed(
  zoneName: string,
  allowedKinds: LotKind[],
  newLotKind: LotKind,
): void {
  if (!allowedKinds.includes(newLotKind)) {
    throw new Error(
      `Zona "${zoneName}" não permite bilhetes do tipo "${newLotKind}". Permitidos: ${allowedKinds.join(", ")}.`,
    );
  }
}
