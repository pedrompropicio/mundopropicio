/**
 * Bridge: Bilhetes Combo/Passe (Fase 2) → Simulador.
 *
 * Funções PURAS — sem dependências de Supabase ou React. Usadas tanto pelo
 * Simulador (matriz Dia×Zona) como pelo `syncSimulatorFromSources` (DRE).
 *
 * Regras (decisão 2026-05-01, reforçadas 2026-05-03):
 *  - 1 venda de combo = 1 receita única no DRE (NÃO multiplicar por dia).
 *  - 1 venda de combo = 1 pessoa em CADA dia coberto, em CADA zona ligada
 *    (multi-zona: o mesmo bilhete dá acesso a N zonas → conta N×nDias presenças).
 *  - applies_to_days = 0 (default) → cobre TODOS os dias do evento.
 *  - applies_to_days = N → cobre min(N, totalEventDays) dias consecutivos.
 *
 * Convertemos os combos em "LotSale sintéticos" (sale_day_index=null,
 * applies_to_days resolvido), de forma a que `expandLotSalesToDailyAttendance`
 * os trate exatamente como antigos lotes-combo por nome de zona.
 */
import type { LotSale } from "./event-simulator-combos";

export interface ComboPassInput {
  id: string;
  name: string;
  applies_to_days?: number | null;
  iva_rate?: number | null;
}
export interface ComboPassLot {
  id: string;
  combo_pass_id: string;
  quantity: number | string | null | undefined;
  price: number | string | null | undefined;
}
export interface ComboPassZoneLink {
  combo_pass_id: string;
  zone_id: string;
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

/**
 * Quantidade efetiva por passe consoante o cenário.
 *  - real:    soma de ticket_sales.combo_pass_lot_id
 *  - BE/Fcst: soma planeada em event_combo_pass_lots.quantity
 */
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
    // garante key=0 mesmo para passes sem vendas (não polui — só usar para iterar)
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
 *  - Um LotSale por (combo, zona ligada).
 *  - applies_to_days resolvido para totalDays quando =0 ou maior que total.
 *  - sale_day_index = null → o helper de expansão distribui por todos os dias cobertos.
 *  - lot_name traz "(N DIAS)" para que a heurística por keyword também o detete
 *    em fluxos legados.
 */
export function comboPassesToLotSales(
  passes: ComboPassInput[],
  lots: ComboPassLot[],
  sales: ComboPassSale[],
  zoneLinks: ComboPassZoneLink[],
  zones: ZoneRef[],
  totalDays: number,
  scenario: SimulatorScenario,
): LotSale[] {
  if (totalDays <= 0 || passes.length === 0) return [];
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const linksByPass = new Map<string, string[]>();
  for (const link of zoneLinks) {
    if (!linksByPass.has(link.combo_pass_id)) linksByPass.set(link.combo_pass_id, []);
    linksByPass.get(link.combo_pass_id)!.push(link.zone_id);
  }
  const qtyByPass = effectiveQtyByPass(passes, lots, sales, scenario);

  const out: LotSale[] = [];
  for (const p of passes) {
    const qty = qtyByPass.get(p.id) ?? 0;
    if (qty <= 0) continue;
    const requested = Number(p.applies_to_days ?? 0);
    const days = requested <= 0 ? totalDays : Math.min(requested, totalDays);
    const linkedZones = linksByPass.get(p.id) ?? [];
    if (linkedZones.length === 0) continue;
    for (const zid of linkedZones) {
      const z = zoneById.get(zid);
      if (!z) continue;
      out.push({
        lot_id: `combo-${p.id}-${zid}`,
        lot_name: `${p.name} (${days} DIAS)`,
        applies_to_days: days,
        zone_id: zid,
        zone_name: z.name,
        sale_day_index: null,
        qty,
      });
    }
  }
  return out;
}

/**
 * Receita TOTAL dos combos, sem multiplicar por dia (1 venda = 1 receita).
 *  - real:    usa total_value quando presente; fallback qty × unit_price ou price do lote.
 *  - BE/Fcst: qty planeada × price do lote.
 */
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
