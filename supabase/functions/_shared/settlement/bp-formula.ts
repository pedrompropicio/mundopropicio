/**
 * #263 / D-ERP149 — Linhas de BP com fórmula.
 *
 * Função PURA (sem React, sem supabase). O valor s/IVA da linha recalcula-se a
 * partir da venda de bilhetes de QUALQUER bilheteira (ticket_sales, ligada pelas
 * zonas do evento) e dos convites de `event_courtesies`.
 *
 *  • pct_ticket_revenue → rate% × receita de bilhetes (bruta ou líquida; IVA linha a linha pelo lote, D11)
 *  • per_head           → unit_amount × (vendidos [+ convites])
 *
 * Antes do evento: receita/vendidos do simulador (computeLiveTicketForecast) quando
 * a linha é do evento todo; com filtro de zonas o simulador não dá o detalhe por
 * zona → usa-se o real até hoje (assinalado). Depois do evento: real.
 * Convites: antes do evento scenario 'forecast' (sem 'forecast' → 'real');
 * depois do evento 'real' (sem 'real' → 'forecast' + "convites finais por preencher").
 * 'breakeven' nunca entra. NUNCA usar event_zone_capacities nem vendas a 0 € como convites.
 */
import { roundCents } from "./iva.ts";

export type BpFormulaType = "pct_ticket_revenue" | "per_head";

export interface PctTicketRevenueParams {
  rate: number;
  basis: "gross" | "net";
  zone_ids: string[] | null;
  min?: number | null;
  max?: number | null;
}
export interface PerHeadParams {
  unit_amount: number;
  include_courtesies: boolean;
  zone_ids: string[] | null;
  min?: number | null;
  max?: number | null;
}
export type BpFormulaParams = PctTicketRevenueParams | PerHeadParams;

export interface FormulaSale {
  zone_id: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  total_value?: number | string | null;
  /** taxa do lote (%) */
  iva_rate: number | string | null;
}
export interface FormulaCourtesy {
  zone_id: string | null;
  event_date_id: string | null;
  scenario: string;
  quantity: number | string | null;
}
export interface FormulaLiveForecast {
  gross: number | null;
  net: number | null;
  totalQty: number;
}

export interface BpFormulaInput {
  formulaType: BpFormulaType;
  params: BpFormulaParams;
  sales: FormulaSale[];
  courtesies: FormulaCourtesy[];
  realized: boolean;
  liveForecast?: FormulaLiveForecast | null;
}

export interface BpFormulaComposition {
  source: "real" | "simulador";
  /** receita usada (na base pedida) — só pct_ticket_revenue */
  revenue: number | null;
  basis: "gross" | "net" | null;
  sold: number;
  courtesies: number;
  courtesiesSource: "forecast" | "real" | "misto" | null;
  pendingFinalCourtesies: boolean;
  /** com filtro de zonas antes do evento o simulador não se aplica */
  zoneFilterUsesReal: boolean;
  clamped: "min" | "max" | null;
  unitAmount: number | null;
  rate: number | null;
}
export interface BpFormulaResult {
  amount: number;
  composition: BpFormulaComposition;
}

export function isFormulaType(t: string | null | undefined): t is BpFormulaType {
  return t === "pct_ticket_revenue" || t === "per_head";
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function saleGross(s: FormulaSale): number {
  const tv = s.total_value;
  if (tv !== null && tv !== undefined && tv !== "" && Number.isFinite(Number(tv))) return Number(tv);
  return n(s.quantity) * n(s.unit_price);
}

function inZones(zoneId: string | null, zoneIds: string[] | null): boolean {
  if (!zoneIds || zoneIds.length === 0) return true;
  return !!zoneId && zoneIds.includes(zoneId);
}

/** Receita e vendidos REAIS (todas as fontes), por filtro de zonas. */
export function realTicketTotals(sales: FormulaSale[], zoneIds: string[] | null) {
  let gross = 0;
  let net = 0;
  let sold = 0;
  for (const s of sales) {
    if (!inZones(s.zone_id, zoneIds)) continue;
    const g = saleGross(s);
    const rate = n(s.iva_rate);
    gross += g;
    net += roundCents(g / (1 + rate / 100));
    if (n(s.unit_price) > 0) sold += n(s.quantity);
  }
  return { gross: roundCents(gross), net: roundCents(net), sold };
}

/**
 * Regra ÚNICA previsto/final dos convites (D-ERP149): escolhe, por (dia, zona),
 * as linhas do cenário que conta. Usada pelo motor das fórmulas, pelo Simulador
 * e pelo A&B (useEventAttendance) — nunca reimplementar.
 */
export function selectCourtesyRows<T extends FormulaCourtesy>(rows: T[], zoneIds: string[] | null, realized: boolean) {
  const byKey = new Map<string, { real: T[]; forecast: T[] }>();
  for (const r of rows) {
    if (r.scenario !== "real" && r.scenario !== "forecast") continue; // breakeven fora
    if (zoneIds && zoneIds.length > 0 && !inZones(r.zone_id, zoneIds)) continue;
    const k = `${r.event_date_id ?? ""}|${r.zone_id ?? ""}`;
    const cur = byKey.get(k) ?? { real: [], forecast: [] };
    (r.scenario === "real" ? cur.real : cur.forecast).push(r);
    byKey.set(k, cur);
  }
  const out: T[] = [];
  let pending = false;
  const used = new Set<"forecast" | "real">();
  for (const v of byKey.values()) {
    const primary = realized ? v.real : v.forecast;
    const fallback = realized ? v.forecast : v.real;
    if (primary.length) {
      out.push(...primary);
      used.add(realized ? "real" : "forecast");
    } else if (fallback.length) {
      out.push(...fallback);
      used.add(realized ? "forecast" : "real");
      if (realized) pending = true;
    }
  }
  const src = used.size === 0 ? null : used.size > 1 ? "misto" : [...used][0];
  return { rows: out, pending, source: src as BpFormulaComposition["courtesiesSource"] };
}

/** Convites nas zonas pedidas, com a regra previsto/final. */
export function courtesyTotals(rows: FormulaCourtesy[], zoneIds: string[] | null, realized: boolean) {
  const sel = selectCourtesyRows(rows, zoneIds, realized);
  const total = sel.rows.reduce((a, r) => a + n(r.quantity), 0);
  return { total, pending: sel.pending, source: sel.source };
}

export function computeBpFormula(input: BpFormulaInput): BpFormulaResult {
  const p = input.params as any;
  const zoneIds: string[] | null = Array.isArray(p?.zone_ids) && p.zone_ids.length > 0 ? p.zone_ids : null;
  const real = realTicketTotals(input.sales, zoneIds);
  const lf = input.liveForecast;
  const useSim = !input.realized && !zoneIds && !!lf && lf.gross !== null && lf.net !== null;
  const zoneFilterUsesReal = !input.realized && !!zoneIds;

  const gross = useSim ? roundCents(lf!.gross!) : real.gross;
  const net = useSim ? roundCents(lf!.net!) : real.net;
  const sold = useSim ? Math.round(lf!.totalQty) : real.sold;

  let raw = 0;
  let revenue: number | null = null;
  let basis: "gross" | "net" | null = null;
  let courtesies = 0;
  let courtesiesSource: BpFormulaComposition["courtesiesSource"] = null;
  let pending = false;

  if (input.formulaType === "pct_ticket_revenue") {
    basis = p.basis === "net" ? "net" : "gross";
    revenue = basis === "net" ? net : gross;
    raw = revenue * (n(p.rate) / 100);
  } else {
    if (p.include_courtesies) {
      const c = courtesyTotals(input.courtesies, zoneIds, input.realized);
      courtesies = c.total;
      courtesiesSource = c.source;
      pending = c.pending;
    }
    raw = (sold + courtesies) * n(p.unit_amount);
  }

  let amount = roundCents(raw);
  let clamped: BpFormulaComposition["clamped"] = null;
  const min = p.min === null || p.min === undefined || p.min === "" ? null : n(p.min);
  const max = p.max === null || p.max === undefined || p.max === "" ? null : n(p.max);
  if (min !== null && amount < min) {
    amount = roundCents(min);
    clamped = "min";
  }
  if (max !== null && amount > max) {
    amount = roundCents(max);
    clamped = "max";
  }

  return {
    amount,
    composition: {
      source: useSim ? "simulador" : "real",
      revenue,
      basis,
      sold,
      courtesies,
      courtesiesSource,
      pendingFinalCourtesies: pending,
      zoneFilterUsesReal,
      clamped,
      unitAmount: input.formulaType === "per_head" ? n(p.unit_amount) : null,
      rate: input.formulaType === "pct_ticket_revenue" ? n(p.rate) : null,
    },
  };
}

const eur = (v: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
const int = (v: number) => Math.round(v).toLocaleString("pt-PT");

/** Texto curto da composição para o ecrã. */
export function describeBpFormula(r: BpFormulaResult): string {
  const c = r.composition;
  let s: string;
  if (c.rate !== null) {
    s = `${String(c.rate).replace(".", ",")}% × ${eur(c.revenue ?? 0)} (${c.basis === "net" ? "líquida" : "bruta"}${c.source === "simulador" ? ", previsto do simulador" : ""})`;
  } else {
    const conv =
      c.courtesiesSource === null
        ? ""
        : ` + ${int(c.courtesies)} convites ${c.courtesiesSource === "real" ? "finais" : c.courtesiesSource === "forecast" ? "previstos" : "(previstos e finais)"}`;
    s = `${int(c.sold)} vendidos${c.source === "simulador" ? " (previsto)" : ""}${conv} × ${eur(c.unitAmount ?? 0)}`;
  }
  if (c.clamped === "min") s += " · mínimo aplicado";
  if (c.clamped === "max") s += " · máximo aplicado";
  if (c.zoneFilterUsesReal) s += " · zonas: real até hoje";
  if (c.pendingFinalCourtesies) s += " · convites finais por preencher";
  return s;
}
