import { describe, expect, it, vi } from "vitest";
import {
  buildTreasuryBridge, emptyTreasuryAmounts, resolveTreasuryResult, treasuryColumns, treasuryDisplayRows, treasuryPeriod,
  type TreasuryEventResult,
} from "@/lib/treasury-bridge";

const result = (amount: number): TreasuryEventResult => ({ result: amount, partnersDue: 10, housePct: 75, source: "base corrente" });
function fixture() {
  return {
    events: [
      { id: "master", name: "Master", parent_event_id: null, business_line_id: "shows" },
      { id: "sub", name: "Cidade", parent_event_id: "master", business_line_id: "other" },
      { id: "single", name: "Sem divisão", parent_event_id: null, business_line_id: null },
      { id: "other", name: "Outro negócio", parent_event_id: null, business_line_id: "other" },
      { id: "old", name: "Histórico", parent_event_id: null },
      { id: "cancelled", name: "Cancelado", parent_event_id: null },
    ],
    stages: { master: "fechado", single: "planeamento", other: "em_fecho", old: "historico", cancelled: "cancelado" },
    businessLines: [{ id: "shows", name: "Espetáculos" }, { id: "other", name: "Outros" }],
    cash: [
      { level: "event" as const, event_id: "master", master_event_id: "master", committed: -20, realized: 80, pending: -5 },
      { level: "event" as const, event_id: "sub", master_event_id: "master", committed: -30, realized: -50, pending: -10 },
      { level: "common" as const, event_id: null, master_event_id: null, committed: -500, realized: -700, pending: -100 },
      { level: "event" as const, event_id: "old", master_event_id: "old", committed: 99999, realized: 99999, pending: 99999 },
    ],
    retained: { master: 100, sub: 40, old: 99999 },
    results: { master: result(1000), single: result(200), other: result(-100) },
  };
}

describe("#646 critério 1 — ponte pura", () => {
  it("a soma algébrica de 1 a 5 é a linha 6 em ambas as colunas", () => {
    const columns = treasuryColumns({ result: 1000, committed: -100, retained: 200, realized: 50, partnersDue: 80, pending: -30 });
    expect(columns.withoutPending).toEqual([1000, -100, -200, -50, -80, 570]);
    expect(columns.withPending).toEqual([1000, -130, -200, -50, -80, 540]);
    for (const values of Object.values(columns)) expect(values.slice(0, 5).reduce((a, b) => a + b, 0)).toBe(values[5]);
  });
  it("a nota 8 não entra na coluna sem pendentes", () => {
    const base = { ...emptyTreasuryAmounts(), result: 300, committed: -50 };
    expect(treasuryColumns({ ...base, pending: -999 }).withoutPending).toEqual(treasuryColumns(base).withoutPending);
    expect(treasuryColumns({ ...base, pending: -999 }).withPending[5]).toBe(-749);
  });
  it.each([[50, -50], [-50, 50]])("realized=%s entra na linha 4 com sinal %s", (realized, expected) => {
    const columns = treasuryColumns({ ...emptyTreasuryAmounts(), realized });
    expect(columns.withoutPending[3]).toBe(expected);
    expect(columns.withPending[3]).toBe(expected);
  });
  it("soma subs ao Master sem duplicar o resultado consolidado ou os sócios", () => {
    const bridge = buildTreasuryBridge(fixture());
    const master = bridge.company.children[0].children[0];
    expect(master.amounts).toEqual({ result: 1000, committed: -50, retained: 140, realized: 30, partnersDue: 10, pending: -15 });
    expect(master.children[0]).toMatchObject({ id: "sub", cashDetail: true, amounts: { committed: -30, retained: 40, realized: -50 } });
    expect(treasuryColumns(master.amounts).withoutPending[5]).toBe(770);
    expect(treasuryColumns(master.amounts).withPending[5]).toBe(755);
  });
  it("os subs herdam a linha do Master, com Sem linha para Masters sem atribuição", () => {
    const lines = buildTreasuryBridge(fixture()).company.children;
    expect(lines.map((l) => [l.name, l.children.map((e) => e.id)])).toEqual([
      ["Espetáculos", ["master"]], ["Outros", ["other"]], ["Sem linha", ["single"]],
    ]);
  });
  it("Comuns aparece separado e não contamina linhas de negócio nem total dos eventos", () => {
    const bridge = buildTreasuryBridge(fixture());
    expect(bridge.common.amounts).toMatchObject({ committed: -500, realized: -700, pending: -100 });
    expect(bridge.company.amounts).toEqual({ result: 1100, committed: -50, retained: 140, realized: 30, partnersDue: 30, pending: -15 });
    expect(bridge.company.children.some((line) => line.name === "Comuns")).toBe(false);
    expect(treasuryDisplayRows(bridge.common)[5].withoutPending).toBeNull();
  });
  it("as linhas de negócio somam ao total da empresa em todas as rubricas e nas duas colunas", () => {
    const { company } = buildTreasuryBridge(fixture());
    for (const key of Object.keys(company.amounts) as (keyof typeof company.amounts)[]) {
      expect(company.children.reduce((total, line) => total + line.amounts[key], 0)).toBe(company.amounts[key]);
    }
    for (const column of ["withoutPending", "withPending"] as const) for (let index = 0; index < 6; index++) {
      expect(company.children.reduce((total, line) => total + treasuryColumns(line.amounts)[column][index], 0)).toBe(treasuryColumns(company.amounts)[column][index]);
    }
  });
  it("não apresenta falsos resultados ou disponibilidade dos subs", () => {
    const sub = buildTreasuryBridge(fixture()).company.children[0].children[0].children[0];
    const rows = treasuryDisplayRows(sub);
    for (const index of [0, 4, 5]) expect(rows[index]).toMatchObject({ withoutPending: null, withPending: null });
    expect(rows[3]).toMatchObject({ withoutPending: 50, withPending: 50 });
  });
  it("exclui históricos e cancelados mesmo quando têm caixa ou retido", () => {
    const bridge = buildTreasuryBridge(fixture());
    expect(bridge.company.children.flatMap((line) => line.children.map((e) => e.id))).toEqual(["master", "other", "single"]);
  });
  it("falha fechada se falta resultado ou catálogo da linha atribuída", () => {
    const input = fixture();
    expect(() => buildTreasuryBridge({ ...input, results: {} })).toThrow("Resultado indisponível");
    expect(() => buildTreasuryBridge({ ...input, businessLines: [] })).toThrow("Linha de negócio indisponível");
  });
  it("confere master_event_id do RPC antes de consolidar a linha de negócio", () => {
    const input = fixture();
    input.cash[1].master_event_id = "single";
    expect(() => buildTreasuryBridge(input)).toThrow("Hierarquia do caixa divergente");
  });
  it.each([null, undefined, "", NaN, Infinity])("rejeita montante indisponível %s sem o converter em zero", (value) => {
    expect(() => treasuryColumns({ ...emptyTreasuryAmounts(), result: value as number })).toThrow();
  });
});

describe("#646 critério 2 — resultado selado", () => {
  const snapshot = { version: 1, nodes: [], eventNetResult: 1234.56, basis: { expenseSource: "committed", includeOverhead: true } };
  const seal = (raw: unknown) => [{ parent_id: null, is_sealed: true, sealed_snapshot: raw }];
  it("fechado lê eventNetResult do snapshot e não chama o motor", () => {
    const engine = vi.fn(() => 999);
    expect(resolveTreasuryResult("fechado", seal(snapshot), engine)).toEqual({ result: 1234.56, source: "selado" });
    expect(engine).not.toHaveBeenCalled();
  });
  it.each([null, { ...snapshot, basis: undefined }, { version: 2, nodes: [] }, { ...snapshot, eventNetResult: NaN }])("sem selo utilizável usa e marca base corrente: %s", (raw) => {
    const engine = vi.fn(() => 432);
    expect(resolveTreasuryResult("fechado", seal(raw), engine)).toEqual({ result: 432, source: "base corrente" });
    expect(engine).toHaveBeenCalledOnce();
  });
  it("evento reaberto ignora um selo antigo", () => {
    expect(resolveTreasuryResult("em_fecho", seal(snapshot), () => 500)).toEqual({ result: 500, source: "base corrente" });
  });
  it("selos contraditórios não geram um total arbitrário", () => {
    expect(() => resolveTreasuryResult("fechado", [...seal(snapshot), ...seal({ ...snapshot, eventNetResult: 999 })], () => 500)).toThrow("divergentes");
  });
});

describe("#646 período no URL", () => {
  it("tempo real passa datas nulas e aceita um só limite", () => {
    expect(treasuryPeriod(new URLSearchParams())).toEqual({ from: null, to: null });
    expect(treasuryPeriod(new URLSearchParams("de=2026-11-01"))).toEqual({ from: "2026-11-01", to: null });
  });
  it.each(["de=2026-02-30", "de=05/11/2026", "de=2026-12-01&ate=2026-11-01"])("rejeita um intervalo inválido: %s", (search) => {
    expect(() => treasuryPeriod(new URLSearchParams(search))).toThrow();
  });
});
