import { describe, expect, it } from "vitest";
import { forecastZone, forecastEvent, forecastRoot, revenueCoverage, REAL_SCENARIO, type PlanningEvent } from "../../supabase/functions/_shared/ticketing/planning-forecast";
import { assembleFutureCoverage } from "../../supabase/functions/_shared/financial-position/future-coverage";
import { futureCoverageSchema } from "@/lib/financial-position-p5";

const ROOT = "10000000-0000-4000-8000-000000000001";
const CHILD = "10000000-0000-4000-8000-000000000002";
const CHILD2 = "10000000-0000-4000-8000-000000000003";
const ZONE = "20000000-0000-4000-8000-000000000001";
const event = (id = ROOT, o: Partial<PlanningEvent> = {}): PlanningEvent => ({ event_id: id, nivel: id === ROOT ? 0 : 1, nome: id,
  previsto_original: 999999, cenario: null, zonas: [], ...o });
const zone = { zone_id: ZONE, total_capacity: 100, lotes: [{ quantity: 100, price: 10 }, { quantity: 100, price: 30 }] };
const scenario = { ...REAL_SCENARIO, modo: "previsao" as const, percentagem: 50 };

describe("P5c pure shared forecast", () => {
  it("cuts proportionally per zone: 200 tickets/4000 gross at capacity100 yields 2000", () => {
    expect(forecastZone(zone)).toMatchObject({ quantity: 200, gross: 4000, factor: 0.5, forecast: 2000 });
  });
  it("null and zero capacity are unlimited; cuts are not applied across zones", () => {
    expect(forecastZone({ ...zone, total_capacity: null }).forecast).toBe(4000);
    expect(forecastZone({ ...zone, total_capacity: 0 }).forecast).toBe(4000);
    expect(forecastEvent([zone, { ...zone, zone_id: CHILD, total_capacity: 0 }], null).value).toBe(6000);
  });
  it("lots outrank manual revenue even when manual is larger", () => {
    expect(forecastEvent([zone], 8000)).toMatchObject({ source: "lotes", value: 2000 });
  });
  it("manual is used only without lots, including explicit zero", () => {
    expect(forecastEvent([], 1500)).toMatchObject({ source: "manual", value: 1500 });
    expect(forecastEvent([], 0)).toMatchObject({ source: "manual", value: 0 });
  });
  it("no lots/manual means no forecast; original baseline is reference only", () => {
    expect(forecastRoot([event()], ROOT, {}, "2026-10-28", null)).toMatchObject({ previsao_bruta: null, receita_considerada: 0 });
  });
  it("root sums own zones plus descendants once and child inherits root percentage", () => {
    const root = event(ROOT, { cenario: scenario });
    const child = event(CHILD, { zonas: [zone] });
    const result = forecastRoot([root, child, child, event(CHILD2, { zonas: [{ ...zone, zone_id: CHILD2 }] })], ROOT, {}, "2026-10-28", "2027-01-01");
    expect(result.previsao_bruta).toBe(4000);
    expect(result.receita_considerada).toBe(2000);
    expect(result.eventos).toHaveLength(3);
    expect(result.eventos[1]).toMatchObject({ herdado: true, cenario: { percentagem: 50 } });
  });
  it("child override takes precedence; root manual is never cloned into its children", () => {
    const result = forecastRoot([event(ROOT, { cenario: { ...scenario, receita_manual_bruta: 1000 } }),
      event(CHILD), event(CHILD2, { cenario: REAL_SCENARIO, zonas: [zone] })], ROOT, { [CHILD2]: 300 }, "2026-10-28", null);
    expect(result.receita_considerada).toBe(800);
    expect(result.eventos[1].previsao_bruta).toBeNull();
  });
  it("considered revenue never falls below actual sales; no Ticketline apportionment", () => {
    const result = forecastRoot([event(ROOT, { cenario: scenario }), event(CHILD, { zonas: [zone] })], ROOT, { [ROOT]: 1200, [CHILD]: 1500 }, "2026-10-28", null);
    expect(result.receita_considerada).toBe(2700);
    expect(result.eventos[0].vendas_bruto).toBe(1200);
    expect(result.eventos[1].vendas_bruto).toBe(1500);
  });
  it("turnaround defaults empty and switches to Real on the inclusive boundary", () => {
    const events = [event(ROOT, { cenario: { ...scenario, viragem_real_dias: 10 }, zonas: [zone] })];
    expect(forecastRoot(events, ROOT, { [ROOT]: 100 }, "2026-10-20", "2026-10-31").receita_considerada).toBe(1000);
    expect(forecastRoot(events, ROOT, { [ROOT]: 100 }, "2026-10-21", "2026-10-31").receita_considerada).toBe(100);
    expect(REAL_SCENARIO.viragem_real_dias).toBeNull();
  });
  it("potential subtracts minimum out once, and both needs clamp at zero", () => {
    expect(revenueCoverage({ com_sem_linha: 2000, sem_linha_cobre_bp: 500 }, 1800, 300)).toEqual({
      receita_considerada_total: 1800, potencial_total: 1500, necessidade_com_receita: { com_sem_linha: 500, sem_linha_cobre_bp: 0 } });
    expect(revenueCoverage({ com_sem_linha: 20, sem_linha_cobre_bp: 10 }, 0, 300).potencial_total).toBe(0);
    expect(revenueCoverage({ com_sem_linha: 20, sem_linha_cobre_bp: 10 }, 1000, null).necessidade_com_receita).toBeNull();
  });
});

const base = (planning?: PlanningEvent[]) => ({ meta: { reference_date: "2026-10-28", balances_visible: true },
  eventos_por_estagio: { planeamento: [{ event_id: ROOT, name: "Future" }] }, retido: { visivel: [], ocultas: [] },
  a_pagar: { por_evento: [{ evento_id: ROOT, estagio: "planeamento", first_day: "2027-01-01", a_pagar_lancado: 500,
    a_pagar_sem_linha: 100, bp_por_lancar: 2000, despesas_pagas: 0, planeamento: planning }] } });
const input = (planning?: PlanningEvent[]) => ({ base: base(planning), rootOf: { [CHILD]: ROOT }, sales: [], cash: [], preCutoff: [], aportes: [] });
describe("P5c coverage integration fixtures", () => {
  it("Real and 0% preserve complete legacy JSON byte for byte", () => {
    const legacy = JSON.stringify(assembleFutureCoverage(input()));
    for (const config of [REAL_SCENARIO, { ...scenario, percentagem: 0 }]) {
      expect(JSON.stringify(assembleFutureCoverage(input([event(ROOT, { cenario: config, zonas: [zone] })])))).toBe(legacy);
    }
  });
  it("active forecast adds side-by-side needs without changing any legacy field", () => {
    const output = assembleFutureCoverage(input([event(ROOT, { cenario: scenario, zonas: [zone] })]));
    const receita_prevista = "receita_prevista" in output ? output.receita_prevista : undefined;
    const { receita_prevista: ignored, ...rest } = output as typeof output & { receita_prevista?: unknown };
    expect(rest).toEqual(assembleFutureCoverage(input()));
    expect(receita_prevista).toMatchObject({ receita_considerada_total: 1000, potencial_total: 1000,
      necessidade_com_receita: { com_sem_linha: 1500, sem_linha_cobre_bp: 1400 } });
    expect(futureCoverageSchema.safeParse(output).success).toBe(true);
  });
  it("forecast cannot introduce another company's event or 35% Coala participation", () => {
    const output = assembleFutureCoverage({ ...input([event(ROOT, { cenario: scenario, zonas: [zone] })]),
      sales: [{ account_id: ZONE, name: "Other", rows: [{ event_id: CHILD2, revenue: 1807425 }] }] });
    expect(output.eventos?.map(e => e.event_id)).toEqual([ROOT]);
    expect("receita_prevista" in output ? output.receita_prevista?.receita_considerada_total : undefined).toBe(1000);
    expect(output.total?.vendas_futuras).toBe(0);
  });
});