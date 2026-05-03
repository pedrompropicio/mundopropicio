/**
 * Bridge: Bilhetes Combo/Passe (Fase 2) → Simulador.
 *
 * Funções PURAS — sem dependências de Supabase ou React.
 *
 * Regras (decisão 2026-05-03 — revista, mono-zona):
 *  - Combo está sempre ligado a UMA única zona (event_combo_passes.zone_id).
 *  - 1 venda de combo = 1 receita única no DRE (NÃO multiplicar por dia).
 *  - 1 venda de combo = 1 pessoa em CADA dia coberto, NA zona do passe.
 *  - applies_to_days = 0 (default) → cobre TODOS os dias do evento.
 *  - applies_to_days = N → cobre min(N, totalEventDays) dias consecutivos.
 */
import type { LotSale } from "./event-simulator-combos";

export interface ComboPassInput {
  id: string;
  name: string;
  zone_id: string | null;
  applies_to_days?: number | null;
  iva_rate?: number | null;
}
export interface ComboPassLot {
  id: string;
  combo_pass_id: string;
  quantity: number | string | null | undefined;
  price: number | string | null | undefined;
}
export interface ComboPassSale {
  combo_pass_lot_id: string | null;
  quantity: number | string | null | undefined;
  unit_price?: number | string | null;
  total_value?: number | string | null;
}
export interface ZoneRef {
  id: string;
  name: string;
}

export type SimulatorScenario = "real" | "breakeven" | "forecast";

export function effectiveQtyByPass(
  passes: ComboPassInput[],
  lots: ComboPassLot[],
  sales: ComboPassSale[],
  scenario: SimulatorScenario,
): Map<string, number> {
  const out = new Map<string, number>();
  if (scenario === "real") {
    const lotToPass = new Map(lots.map((l) => [l.id, l.combo_pass_id]));
    for (const s of sales) {
      const pid = s.combo_pass_lot_id ? lotToPass.get(s.combo_pass_lot_id) : undefined;
      if (!pid) continue;
      out.set(pid, (out.get(pid) ?? 0) + Number(s.quantity || 0));
    }
    for (const p of passes) if (!out.has(p.id)) out.set(p.id, 0);
    return out;
  }
  const planned = new Map<string, number>();
  for (const l of lots) {
    planned.set(l.combo_pass_id, (planned.get(l.combo_pass_id) ?? 0) + Number(l.quantity || 0));
  }
  for (const p of passes) out.set(p.id, planned.get(p.id) ?? 0);
  return out;
}

/**
 * Converte combos em LotSale sintéticos para `expandLotSalesToDailyAttendance`.
 *  - Um LotSale por combo (mono-zona).
 *  - applies_to_days resolvido para totalDays quando =0 ou maior que total.
 *  - sale_day_index = null → o helper distribui por todos os dias cobertos.
 */
export function comboPassesToLotSales(
  passes: ComboPassInput[],
  lots: ComboPassLot[],
  sales: ComboPassSale[],
  zones: ZoneRef[],
  totalDays: number,
  scenario: SimulatorScenario,
): LotSale[] {
  if (totalDays <= 0 || passes.length === 0) return [];
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const qtyByPass = effectiveQtyByPass(passes, lots, sales, scenario);

  const out: LotSale[] = [];
  for (const p of passes) {
    const qty = qtyByPass.get(p.id) ?? 0;
    if (qty <= 0) continue;
    if (!p.zone_id) continue;
    const z = zoneById.get(p.zone_id);
    if (!z) continue;
    const requested = Number(p.applies_to_days ?? 0);
    const days = requested <= 0 ? totalDays : Math.min(requested, totalDays);
    out.push({
      lot_id: `combo-${p.id}`,
      lot_name: `${p.name} (${days} DIAS)`,
      applies_to_days: days,
      zone_id: p.zone_id,
      zone_name: z.name,
      sale_day_index: null,
      qty,
    });
  }
  return out;
}

export function comboPassesRevenue(
  lots: ComboPassLot[],
  sales: ComboPassSale[],
  scenario: SimulatorScenario,
): { qty: number; revenue: number } {
  if (scenario === "real") {
    const lotById = new Map(lots.map((l) => [l.id, l]));
    let qty = 0;
    let revenue = 0;
    for (const s of sales) {
      const q = Number(s.quantity || 0);
      qty += q;
      const tv = s.total_value;
      if (tv !== null && tv !== undefined && tv !== "") {
        const n = Number(tv);
        if (!Number.isNaN(n)) {
          revenue += n;
          continue;
        }
      }
      const lot = s.combo_pass_lot_id ? lotById.get(s.combo_pass_lot_id) : undefined;
      const unit = Number(s.unit_price ?? lot?.price ?? 0);
      revenue += q * unit;
    }
    return { qty, revenue };
  }
  let qty = 0;
  let revenue = 0;
  for (const l of lots) {
    const q = Number(l.quantity || 0);
    qty += q;
    revenue += q * Number(l.price || 0);
  }
  return { qty, revenue };
}
