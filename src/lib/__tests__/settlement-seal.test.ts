import { describe, it, expect } from "vitest";
import {
  buildSealSnapshot,
  canSeal,
  parseSealSnapshot,
  sealDeviation,
  subtreeIds,
} from "@/lib/settlement-seal";
import type { EngineResult } from "@/lib/event-settlement-engine";

const participant = (id: string, name: string, share: number) => ({
  id,
  settlementId: "root",
  name,
  kind: "partner" as const,
  mode: "settles" as const,
  profitPct: 50,
  lossPct: null,
  effectivePct: 50,
  usesGrossExpenses: false,
  share,
  shareNet: share,
  paidByPartner: 0,
  extras: 0,
  settlementAmount: share,
});

const node = (id: string, parentId: string | null, resultNet: number, parts: any[]) =>
  ({
    id,
    name: id === "root" ? "Fechamento do evento" : `Filho ${id}`,
    parentId,
    depth: parentId ? 1 : 0,
    isSealed: false,
    parentQuota: parentId ? 100 : null,
    parentQuotaBasis: parentId ? "net_result" : null,
    parentSharePct: parentId ? 30 : null,
    perimeter: {
      revenueNet: 0,
      expensesNet: 0,
      expensesGross: 0,
      bpLines: 0,
      txLines: 0,
      isRoot: !parentId,
    },
    resultNet,
    resultGross: resultNet,
    moneyNet: resultNet,
    childQuotasNet: 0,
    participants: parts,
    operations: [],
    additionalActiveTotal: 0,
  }) as any;

const makeResult = (opts?: { c1?: number; c2?: number; rootResult?: number; share?: number }): EngineResult =>
  ({
    nodes: [
      node("root", null, opts?.rootResult ?? 1000, [participant("p1", "SÓCIO A", opts?.share ?? 500)]),
      node("child", "root", 300, [participant("p2", "SÓCIO B", 100)]),
    ],
    eventNetResult: opts?.rootResult ?? 1000,
    partnersPaidTotal: opts?.share ?? 500,
    additionalActivesTotal: 0,
    house: {} as any,
    c1: { label: "C1", value: opts?.c1 ?? 0, ok: (opts?.c1 ?? 0) === 0 },
    c2: { label: "C2", value: opts?.c2 ?? 0, ok: (opts?.c2 ?? 0) === 0 },
    errors: [],
  }) as any;

const basis = { expenseSource: "committed", includeOverhead: true };

describe("selo do fechamento", () => {
  it("recusa selar quando a C2 não está a zero", () => {
    expect(canSeal(makeResult({ c2: 12.34 })).ok).toBe(false);
    expect(canSeal(makeResult()).ok).toBe(true);
  });

  it("aceita diferenças dentro da tolerância do motor", () => {
    expect(canSeal(makeResult({ c1: 0.004, c2: -0.004 })).ok).toBe(true);
    expect(canSeal(makeResult({ c1: 0.01 })).ok).toBe(false);
  });

  it("guarda o fechamento e os que dele dependem", () => {
    const r = makeResult();
    expect(subtreeIds(r, "root")).toEqual(["root", "child"]);
    expect(subtreeIds(r, "child")).toEqual(["child"]);
    const snap = buildSealSnapshot(r, "root", basis);
    expect(snap.nodes.map((n) => n.id)).toEqual(["root", "child"]);
    expect(snap.nodes[0].participants[0]).toMatchObject({ name: "SÓCIO A", share: 500 });
    expect(snap.basis).toEqual(basis);
  });

  it("lê o snapshot guardado e rejeita lixo", () => {
    const snap = buildSealSnapshot(makeResult(), "root", basis);
    expect(parseSealSnapshot(JSON.parse(JSON.stringify(snap)))?.settlement_id).toBe("root");
    expect(parseSealSnapshot(null)).toBeNull();
    expect(parseSealSnapshot({ version: 2, nodes: [] })).toBeNull();
  });

  it("mostra o desvio entre o selado e o valor ao vivo", () => {
    const snap = buildSealSnapshot(makeResult({ rootResult: 1000, share: 500 }), "root", basis);
    const live = makeResult({ rootResult: 1200, share: 600 });
    const dev = sealDeviation(snap, live, "root");
    expect(dev.total).toBe(200);
    expect(dev.rows).toEqual([{ name: "SÓCIO A", sealed: 500, live: 600, diff: 100 }]);
  });

  it("sem desvio quando nada mudou", () => {
    const r = makeResult();
    expect(sealDeviation(buildSealSnapshot(r, "root", basis), r, "root")).toEqual({ total: 0, rows: [] });
  });
});
