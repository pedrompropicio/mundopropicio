import { describe, expect, it } from "vitest";
import { financialPositionFixture } from "./fixtures/financial-position";
import { POSITION_STAGES, type FinancialPosition } from "@/lib/financial-position";
import { explainBpPending, explainCommitment, explainPayableTotal, explainStage, payableSplit, reconcile } from "@/lib/financial-position-explain";

const stage = (lancado: number, confirmado: number, ajustado: number, por_rever: number, sem: number, so: number) => ({
  total: lancado + confirmado + ajustado + por_rever + sem + so, bp: confirmado + ajustado + por_rever + lancado, bp_linhas: 3, linhas_contrato_cache: 0,
  sublinhas: { lancado, confirmado, por_rever, ajustado, partner_paid_fora_do_total: 0 }, sem_bp: { total: sem, n: 1 }, so_transacoes: { total: so, n: 1 },
});
/** JSON fixo de exemplo (valores inventados para o teste). */
function sample(): FinancialPosition {
  const d = financialPositionFixture();
  d.a_pagar.por_estagio = { em_curso: stage(100.1, 50, 20, 5, 1.25, 30), em_fecho: stage(200.2, 10, 0, 0, 0.5, 0), fechado: stage(7.07, 0, 0, 0, 0, 2.5), planeamento: stage(0, 0, 0, 0, 0, 0) };
  d.a_pagar.total = POSITION_STAGES.reduce((a, s) => a + d.a_pagar.por_estagio[s].total, 0);
  return d;
}

describe("composição pura — Posição Financeira", () => {
  it("compromisso = Σ (lançado + sem BP + só transações), tolerância 0,01", () => {
    const d = sample();
    const manual = POSITION_STAGES.reduce((a, s) => { const p = d.a_pagar.por_estagio[s]; return a + p.sublinhas.lancado + p.sem_bp.total + p.so_transacoes.total; }, 0);
    expect(Math.abs(payableSplit(d).compromisso - manual)).toBeLessThanOrEqual(0.01);
    const b = explainCommitment(d);
    expect(Math.abs((b.total as number) - manual)).toBeLessThanOrEqual(0.01);
    expect(reconcile(b).reconciled).toBe(true);
  });
  it("cada composição soma o respectivo total", () => {
    const d = sample();
    for (const b of [explainPayableTotal(d), explainCommitment(d), explainBpPending(d), ...POSITION_STAGES.map(s => explainStage(d, s))]) expect(reconcile(b).reconciled, b.id).toBe(true);
  });
  it("JSON com estágios em falta não rebenta e vale 0", () => {
    const d = sample();
    d.a_pagar.por_estagio = { em_curso: d.a_pagar.por_estagio.em_curso } as FinancialPosition["a_pagar"]["por_estagio"];
    expect(() => { explainPayableTotal(d); explainCommitment(d); explainBpPending(d); explainStage(d, "fechado"); }).not.toThrow();
    expect(explainStage(d, "fechado").total).toBe(0);
    const vazio = { ...d, a_pagar: { ...d.a_pagar, por_estagio: {} } } as unknown as FinancialPosition;
    expect(payableSplit(vazio)).toEqual({ compromisso: 0, bpPorLancar: 0 });
  });
  it("estágio sem sublinhas/sem_bp/so_transacoes vale 0", () => {
    const d = sample();
    d.a_pagar.por_estagio.em_fecho = {} as FinancialPosition["a_pagar"]["por_estagio"]["em_fecho"];
    expect(explainStage(d, "em_fecho").parts.every(p => p.value === 0)).toBe(true);
    expect(Number.isNaN(payableSplit(d).compromisso)).toBe(false);
  });
});
