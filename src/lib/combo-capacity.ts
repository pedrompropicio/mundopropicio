/**
 * Validação de capacidade por zona considerando lotes simples + combo passes.
 *
 * Regra (Fase 2, decisão 2026-05-03 — revista):
 *  - Combo é SEMPRE mono-zona: 1 venda combo = 1 unidade na zona do passe,
 *    em cada dia coberto. Como `event_ticket_zones.total_capacity` é
 *    por-zona-por-dia, a unidade vendida abate da disponibilidade dessa zona.
 *  - Soma alocada na zona Z = Σ(quantity de lotes simples em Z) +
 *                             Σ(quantity de combo lots cujo passe → Z).
 *  - Tem de ser ≤ Z.total_capacity (quando capacity > 0; 0 = sem limite).
 */

export interface CapZone {
  id: string;
  name: string;
  total_capacity: number | null | undefined;
}
export interface CapSimpleLot {
  id: string;
  zone_id: string;
  quantity: number | null | undefined;
}
export interface CapComboPass {
  id: string;
  zone_id: string | null;
}
export interface CapComboLot {
  id: string;
  combo_pass_id: string;
  quantity: number | null | undefined;
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

export function computeZoneAllocations(
  zones: CapZone[],
  simpleLots: CapSimpleLot[],
  combos: CapComboPass[],
  comboLots: CapComboLot[],
  opts: { excludeSimpleLotId?: string | null; excludeComboLotId?: string | null } = {},
): ZoneAllocation[] {
  const zoneByCombo = new Map(combos.map((c) => [c.id, c.zone_id]));
  return zones.map((z) => {
    const cap = Number(z.total_capacity || 0);
    const usedSimple = simpleLots
      .filter((l) => l.zone_id === z.id && l.id !== opts.excludeSimpleLotId)
      .reduce((s, l) => s + Number(l.quantity || 0), 0);
    const usedCombo = comboLots
      .filter((l) => l.id !== opts.excludeComboLotId)
      .reduce((s, l) => {
        const zid = zoneByCombo.get(l.combo_pass_id) ?? null;
        return zid === z.id ? s + Number(l.quantity || 0) : s;
      }, 0);
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

export function validateSimpleLotAgainstCapacity(
  zoneId: string,
  addQty: number,
  zones: CapZone[],
  simpleLots: CapSimpleLot[],
  combos: CapComboPass[],
  comboLots: CapComboLot[],
  excludeSimpleLotId: string | null = null,
): string | null {
  const allocs = computeZoneAllocations(zones, simpleLots, combos, comboLots, { excludeSimpleLotId });
  const a = allocs.find((x) => x.zone_id === zoneId);
  if (!a || a.capacity <= 0) return null;
  if (a.used_total + addQty > a.capacity) {
    return `Capacidade excedida! A zona "${a.zone_name}" tem capacidade para ${a.capacity.toLocaleString()}. ` +
      `Já alocado: ${a.used_total.toLocaleString()} (${a.used_simple} simples + ${a.used_combo} via combos). ` +
      `Restam ${a.remaining.toLocaleString()} disponíveis.`;
  }
  return null;
}

export function validateComboLotAgainstCapacity(
  comboPassId: string,
  addQty: number,
  zones: CapZone[],
  simpleLots: CapSimpleLot[],
  combos: CapComboPass[],
  comboLots: CapComboLot[],
  excludeComboLotId: string | null = null,
): string | null {
  const targetCombo = combos.find((c) => c.id === comboPassId);
  if (!targetCombo || !targetCombo.zone_id) return null;
  const allocs = computeZoneAllocations(zones, simpleLots, combos, comboLots, { excludeComboLotId });
  const a = allocs.find((x) => x.zone_id === targetCombo.zone_id);
  if (!a || a.capacity <= 0) return null;
  if (a.used_total + addQty > a.capacity) {
    return `Capacidade excedida! A zona "${a.zone_name}" tem capacidade para ${a.capacity.toLocaleString()}. ` +
      `Já alocado: ${a.used_total.toLocaleString()} (${a.used_simple} simples + ${a.used_combo} via combos). ` +
      `Restam ${a.remaining.toLocaleString()} disponíveis.`;
  }
  return null;
}
