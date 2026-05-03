/**
 * Validação de capacidade por zona considerando lotes simples + combo passes.
 *
 * Regra (Fase 2, decisão 2026-05-03):
 *  - 1 venda combo = 1 unidade em CADA zona ligada ao passe (multi-zona) e em
 *    cada dia coberto. Como `event_ticket_zones.total_capacity` é por-zona-por-dia
 *    (zonas com session_id são dia-específicas; zonas sem session_id são cross-day),
 *    a unidade vendida abate da disponibilidade de cada zona ligada.
 *  - Soma alocada na zona Z = Σ(quantity de lotes simples em Z) +
 *                             Σ(quantity de combo lots cujos passes ligam a Z).
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
  zone_ids: string[];
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

/**
 * Calcula alocação por zona. `excludeSimpleLotId` / `excludeComboLotId` permitem
 * recalcular após edição (não somar a versão antiga do lote).
 */
export function computeZoneAllocations(
  zones: CapZone[],
  simpleLots: CapSimpleLot[],
  combos: CapComboPass[],
  comboLots: CapComboLot[],
  opts: { excludeSimpleLotId?: string | null; excludeComboLotId?: string | null } = {},
): ZoneAllocation[] {
  const zonesByCombo = new Map(combos.map((c) => [c.id, c.zone_ids]));
  return zones.map((z) => {
    const cap = Number(z.total_capacity || 0);
    const usedSimple = simpleLots
      .filter((l) => l.zone_id === z.id && l.id !== opts.excludeSimpleLotId)
      .reduce((s, l) => s + Number(l.quantity || 0), 0);
    const usedCombo = comboLots
      .filter((l) => l.id !== opts.excludeComboLotId)
      .reduce((s, l) => {
        const zs = zonesByCombo.get(l.combo_pass_id) || [];
        return zs.includes(z.id) ? s + Number(l.quantity || 0) : s;
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

/**
 * Valida se um NOVO lote simples (na zona zoneId, com `addQty`) cabe na
 * capacidade da zona, contando os combos que já passam por ela.
 * Retorna mensagem de erro ou null.
 */
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

/**
 * Valida se um NOVO lote-combo (com `addQty` para o passe `comboPassId`) cabe na
 * capacidade de TODAS as zonas ligadas a esse passe. Devolve a primeira zona
 * que ultrapassa, ou null.
 */
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
  if (!targetCombo || targetCombo.zone_ids.length === 0) return null;
  const allocs = computeZoneAllocations(zones, simpleLots, combos, comboLots, { excludeComboLotId });
  for (const zid of targetCombo.zone_ids) {
    const a = allocs.find((x) => x.zone_id === zid);
    if (!a || a.capacity <= 0) continue;
    if (a.used_total + addQty > a.capacity) {
      return `Capacidade excedida! A zona "${a.zone_name}" tem capacidade para ${a.capacity.toLocaleString()}. ` +
        `Já alocado: ${a.used_total.toLocaleString()} (${a.used_simple} simples + ${a.used_combo} via combos). ` +
        `Restam ${a.remaining.toLocaleString()} disponíveis.`;
    }
  }
  return null;
}
