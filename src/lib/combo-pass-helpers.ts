/**
 * Helpers para Bilhetes Combo/Passe (Fase 2).
 *
 * Regras de negócio:
 * - 1 Combo Pass = 1 produto multi-zona num festival multi-dia
 * - 1 venda de Combo = 1 receita única no DRE
 * - 1 venda de Combo = 1 pessoa em CADA dia que o combo cobre (presença/A&B)
 * - applies_to_days = 0 → cobre todos os dias do festival
 * - applies_to_days = N → cobre N dias (a partir do dia 1)
 */

export interface ComboPassLotLike {
  id?: string;
  combo_pass_id: string;
  quantity: number | string;
  price: number | string;
  iva_rate?: number | string;
}

export interface ComboPassLike {
  id: string;
  applies_to_days?: number | null;
}

/** Receita BRUTA total de um lote de combo (qty × price). */
export function comboPassLotGrossRevenue(lot: ComboPassLotLike): number {
  return Number(lot.quantity || 0) * Number(lot.price || 0);
}

/** Receita LÍQUIDA (ex-IVA) de um lote de combo. */
export function comboPassLotNetRevenue(lot: ComboPassLotLike): number {
  const gross = comboPassLotGrossRevenue(lot);
  const iva = Number(lot.iva_rate ?? 6);
  return gross / (1 + iva / 100);
}

/**
 * Quantos dias de presença um combo cobre dentro de um festival com `eventDaysCount`
 * dias totais. applies_to_days=0 (default) ou N>=eventDaysCount → todos os dias.
 */
export function comboCoveredDays(combo: ComboPassLike | undefined | null, eventDaysCount: number): number {
  const requested = Number(combo?.applies_to_days ?? 0);
  if (requested <= 0) return eventDaysCount;
  return Math.min(requested, eventDaysCount);
}

/**
 * Multiplicador de presença para o A&B/Simulador: 1 venda de combo = N presenças,
 * sendo N o nº de dias que o combo cobre.
 */
export function comboAttendanceMultiplier(
  combo: ComboPassLike | undefined | null,
  eventDaysCount: number,
): number {
  return Math.max(1, comboCoveredDays(combo, eventDaysCount));
}

export interface ZoneCapacityUsage {
  zoneId: string;
  used: number;
  capacity: number;
  exceeded: boolean;
}

/**
 * Calcula consumo de capacidade por zona considerando lotes simples + combos
 * que dão acesso à zona. Cada combo lot consome quantity em CADA zona ligada.
 */
export function calcZoneCapacityUsage(
  zones: Array<{ id: string; total_capacity: number }>,
  simpleLotsByZone: Record<string, number>,
  comboPassZones: Array<{ combo_pass_id: string; zone_id: string }>,
  comboLotsByPass: Record<string, number>,
): ZoneCapacityUsage[] {
  const passQtyByZone: Record<string, number> = {};
  for (const link of comboPassZones) {
    passQtyByZone[link.zone_id] = (passQtyByZone[link.zone_id] || 0) + (comboLotsByPass[link.combo_pass_id] || 0);
  }
  return zones.map((z) => {
    const used = (simpleLotsByZone[z.id] || 0) + (passQtyByZone[z.id] || 0);
    return {
      zoneId: z.id,
      used,
      capacity: z.total_capacity,
      exceeded: used > z.total_capacity,
    };
  });
}
