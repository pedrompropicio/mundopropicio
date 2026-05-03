/**
 * Validação de capacidade por zona considerando lotes simples + lotes combo
 * unificados em event_ticket_lots (Fase 3, decisão 2026-05-03 — Opção B).
 *
 * Modelo novo:
 *  - Cada lote vive em UMA zona âncora (`zone_id`).
 *  - Se `is_combo = true`, esse lote consome 1 unidade de capacidade em CADA
 *    zona listada em `consumes_zone_ids` (que normalmente inclui várias
 *    zonas-dia da mesma zona física: Relvado-Sáb, Relvado-Dom, …).
 *  - Se `is_combo = false`, esse lote consome 1 unidade só em `zone_id`.
 *  - `event_ticket_zones.total_capacity` é por-zona-por-dia. 0 = sem limite.
 *
 * Soma alocada na zona Z = Σ(qty de lotes simples em Z) +
 *                          Σ(qty de lotes combo cujo consumes_zone_ids ∋ Z).
 */

export interface CapZone {
  id: string;
  name: string;
  total_capacity: number | null | undefined;
}

export interface CapLot {
  id: string;
  zone_id: string;
  quantity: number | null | undefined;
  is_combo?: boolean | null;
  consumes_zone_ids?: string[] | null;
}

export interface ZoneAllocation {
  zone_id: string;
  zone_name: string;
  capacity: number;
  used_simple: number;
  used_combo: number;
  used_total: number;
  remaining: number;
  exceeded: boolean;
}

function lotConsumesZone(lot: CapLot, zoneId: string): boolean {
  if (lot.is_combo) {
    const list = lot.consumes_zone_ids ?? [];
    if (list.length === 0) return lot.zone_id === zoneId;
    return list.includes(zoneId);
  }
  return lot.zone_id === zoneId;
}

export function computeZoneAllocations(
  zones: CapZone[],
  lots: CapLot[],
  opts: { excludeLotId?: string | null } = {},
): ZoneAllocation[] {
  return zones.map((z) => {
    const cap = Number(z.total_capacity || 0);
    let usedSimple = 0;
    let usedCombo = 0;
    for (const l of lots) {
      if (l.id === opts.excludeLotId) continue;
      if (!lotConsumesZone(l, z.id)) continue;
      const q = Number(l.quantity || 0);
      if (l.is_combo) usedCombo += q;
      else usedSimple += q;
    }
    const total = usedSimple + usedCombo;
    return {
      zone_id: z.id,
      zone_name: z.name,
      capacity: cap,
      used_simple: usedSimple,
      used_combo: usedCombo,
      used_total: total,
      remaining: Math.max(cap - total, 0),
      exceeded: cap > 0 && total > cap,
    };
  });
}

/**
 * Valida se um lote (simples OU combo) cabe nas zonas que consome, dado o
 * estado actual dos demais lotes. Devolve mensagem de erro ou null.
 */
export function validateLotAgainstCapacity(
  lot: { zone_id: string; quantity: number; is_combo?: boolean; consumes_zone_ids?: string[] },
  zones: CapZone[],
  otherLots: CapLot[],
  excludeLotId: string | null = null,
): string | null {
  const consumed: string[] = lot.is_combo
    ? (lot.consumes_zone_ids && lot.consumes_zone_ids.length ? lot.consumes_zone_ids : [lot.zone_id])
    : [lot.zone_id];

  const allocs = computeZoneAllocations(zones, otherLots, { excludeLotId });
  for (const zid of consumed) {
    const a = allocs.find((x) => x.zone_id === zid);
    if (!a || a.capacity <= 0) continue;
    if (a.used_total + lot.quantity > a.capacity) {
      return (
        `Capacidade excedida! A zona "${a.zone_name}" tem capacidade para ${a.capacity.toLocaleString()}. ` +
        `Já alocado: ${a.used_total.toLocaleString()} (${a.used_simple} simples + ${a.used_combo} via combos). ` +
        `Restam ${a.remaining.toLocaleString()} disponíveis.`
      );
    }
  }
  return null;
}
