import { describe, expect, it } from "vitest";
import { bpCommitmentUntilEvent, DEFAULT_BP_HORIZON_DAYS, effectiveBpHorizon, withinBpHorizon } from "@/lib/bp-horizon";

const ref = "2026-10-28";
const madrid = { event_id: "madrid", nome: "Madrid", first_day: "2026-11-21", bp_por_lancar: 265641 };
const rg = { event_id: "rg", nome: "RG 2027", first_day: "2027-02-11", bp_por_lancar: 143982 };

describe("#389 — horizonte puro do BP (critério 1)", () => {
  it("NULL e ausência usam 30 dias; zero e valores explícitos prevalecem", () => {
    expect(DEFAULT_BP_HORIZON_DAYS).toBe(30);
    expect(effectiveBpHorizon(null)).toBe(30);
    expect(effectiveBpHorizon(undefined)).toBe(30);
    expect(effectiveBpHorizon(0)).toBe(0);
    expect(effectiveBpHorizon(120)).toBe(120);
  });

  it("Madrid com NULL está dentro e conserva o BP por lançar", () => {
    expect(bpCommitmentUntilEvent([madrid], { madrid: null }, ref)).toEqual({
      total: 265641, eventos: [{ event_id: "madrid", nome: "Madrid", dias: 30, valor: 265641 }],
    });
    expect(bpCommitmentUntilEvent([madrid], {}, ref).total).toBe(265641);
  });

  it("RG com NULL fica fora e com 120 dias fica dentro", () => {
    expect(bpCommitmentUntilEvent([rg], { rg: null }, ref)).toEqual({ total: 0, eventos: [] });
    expect(bpCommitmentUntilEvent([rg], { rg: 120 }, ref)).toEqual({
      total: 143982, eventos: [{ event_id: "rg", nome: "RG 2027", dias: 120, valor: 143982 }],
    });
  });

  it("zero desliga Madrid e ausência de primeira data fica fora", () => {
    expect(bpCommitmentUntilEvent([madrid], { madrid: 0 }, ref)).toEqual({ total: 0, eventos: [] });
    expect(bpCommitmentUntilEvent([{ ...madrid, first_day: null }], {}, ref)).toEqual({ total: 0, eventos: [] });
  });

  it("o limite exacto é inclusivo em dias UTC", () => {
    expect(withinBpHorizon("2026-10-22", madrid.first_day, 30)).toBe(true);
    expect(withinBpHorizon("2026-10-21", madrid.first_day, 30)).toBe(false);
    expect(withinBpHorizon("2026-11-21", madrid.first_day, 1)).toBe(true);
    expect(withinBpHorizon("2026-03-01", "2026-03-31", 30)).toBe(true);
  });

  it.each([
    ["inválida", "2026-11-21"], [ref, "inválida"], [ref, null],
    ["2026-02-30", "2026-03-01"], [ref, "2026-02-30"], ["", "2026-11-21"],
  ])("datas inválidas ficam fora (%s / %s)", (reference, firstDay) => {
    expect(withinBpHorizon(reference!, firstDay, 30)).toBe(false);
  });

  it("Madrid + RG(120) totalizam 409.623 sem alterar as entradas", () => {
    const eventos = Object.freeze([Object.freeze({ ...madrid }), Object.freeze({ ...rg })]);
    const horizons = Object.freeze({ madrid: null, rg: 120 });
    const result = bpCommitmentUntilEvent(eventos, horizons, ref);
    expect(result.total).toBe(409623);
    expect(result.eventos.map(e => [e.event_id, e.dias, e.valor])).toEqual([["madrid", 30, 265641], ["rg", 120, 143982]]);
    expect(eventos).toEqual([madrid, rg]);
  });

  it("arredonda apenas o total a cêntimos e admite um compromisso de zero", () => {
    expect(bpCommitmentUntilEvent([{ ...madrid, bp_por_lancar: 0.1 }, { ...rg, bp_por_lancar: 0.2 }], { rg: 120 }, ref).total).toBe(0.3);
    expect(bpCommitmentUntilEvent([{ ...madrid, bp_por_lancar: 1.005 }], {}, ref).total).toBe(1.01);
    expect(bpCommitmentUntilEvent([{ ...madrid, bp_por_lancar: 0 }], {}, ref).eventos).toHaveLength(1);
    expect(bpCommitmentUntilEvent([], {}, ref)).toEqual({ total: 0, eventos: [] });
  });
});
