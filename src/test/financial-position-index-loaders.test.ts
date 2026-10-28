// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { loadPositionReads } from "../../supabase/functions/_shared/financial-position/position-reads";
import { assembleFinancialPosition } from "../../supabase/functions/_shared/financial-position/assemble";
import { assembleFutureCoverage } from "../../supabase/functions/_shared/financial-position/future-coverage";

describe("D-ERP328 — named concurrent edge loaders", () => {
  it("edge binds each named slot to the correct loader, including workers", () => {
    const src = readFileSync("supabase/functions/financial-position/index.ts", "utf8");
    for (const [slot, loader] of [["structure", "loadStructure"], ["paidContracts", "loadPaidContracts"],
      ["participations", "loadParticipations"], ["futureCoverage", "loadIndependentFutureCoverage"]]) {
      expect(src).toContain(`${slot}: () => ${loader}(`);
    }
    expect(src).toContain("workers: () => Promise.all(");
  });

  it("fixtures run concurrent reads through the edge assembler without swapping coverage/participations", async () => {
    const company = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
    const base = { meta: { company_id: company, year: 2026, reference_date: "2026-10-28", version: "p4-v1", balances_visible: true },
      eventos_por_estagio: {}, a_pagar: { total: 0, por_evento: [], transitorias: { total: 0 } }, a_receber: { total: 0, transitorias: { total: 0 } },
      retido: { visivel: [], ocultas: [], total_visiveis: 0, total_ocultas: 0 }, posicao: { caixa: 100, cartoes: 0 }, alertas: {}, acerto_informativo: {} };
    const coverage = assembleFutureCoverage({ base, rootOf: {}, sales: [], cash: [], preCutoff: [], aportes: [] });
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fixtures = { structure: [], paidContracts: { proof: 12 }, participations: { cloudscape: { valor: 123.45, linhas: 2 } }, futureCoverage: coverage };
    const make = <T,>(value: T) => vi.fn(async () => { await gate; return value; });
    const loaders = { structure: make(fixtures.structure), paidContracts: make(fixtures.paidContracts),
      participations: make(fixtures.participations), futureCoverage: make(fixtures.futureCoverage), workers: make([]) };
    const pending = loadPositionReads(loaders);
    for (const loader of Object.values(loaders)) expect(loader).toHaveBeenCalledTimes(1);
    release?.();
    const reads = await pending;
    expect(reads).toEqual(fixtures);
    const output = assembleFinancialPosition({ base, events: [], ...reads, generatedAt: "2026-10-28T03:17:00Z" });
    expect(output.cobertura_futuros).toEqual(coverage);
    expect(output.resultado_mp_ano?.participacoes.cloudscape.valor).toBe(123.45);
    expect(output.resultado_mp_ano?.total_mp).toBe(123.45);
  });

  it("loader failures reject rather than assembling partial financial totals", async () => {
    await expect(loadPositionReads({ structure: async () => { throw new Error("fixture_failure"); }, paidContracts: async () => ({}),
      participations: async () => ({}), futureCoverage: async () => ({}), workers: async () => [] })).rejects.toThrow("fixture_failure");
  });
});