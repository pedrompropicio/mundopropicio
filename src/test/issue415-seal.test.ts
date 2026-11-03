import { describe, it, expect } from "vitest";
import { buildSealSnapshotV2, parseSealSnapshot, parseSealSnapshotV2, type SealSnapshotV2 } from "@/lib/settlement-seal";
import { resolveSettlementContract, type SettlementContractNode } from "@/lib/settlement-contract";
function fixture(): SealSnapshotV2 {
  const raw: SettlementContractNode = { id: "root", company_id: "tenant", event_id: "event", parent_id: null, parent_share_basis: null,
    partner_calc_basis: "net_result", is_sealed: false, contract_expense_source: "committed", contract_include_overhead: true,
    contract_revision: 2, contract_initialized_at: "2026-11-03T10:00:00Z", contract_initialized_by: "approver" };
  return { version: 2, contextVersion: 1, inputHash: "a".repeat(64), settlement_id: "root", check1: 0, check2: 0,
    basis: { expenseSource: "committed", includeOverhead: true }, eventNetResult: 400, partnersPaidTotal: 230,
    residual: { declaredBase: 200, ivaDeductibleBase: 0, nominalGapBase: 0, houseOnlyRevenue: 0, otherBase: 0, overheadAbsorbedByHouse: -30, residualFinal: 170, rest: 0 },
    nodes: [{ id: "root", name: "Fictitious root", parentId: null, parentQuota: null, parentSharePct: null, parentQuotaBasis: null,
      resultNet: 400, resultGross: 400, moneyNet: 400, contract: resolveSettlementContract([raw])[0], documentLineIds: ["OH", "cost"],
      participants: [{ id: "A", name: "A", kind: "partner", mode: "settles", effectivePct: 30, share: 150, shareNet: 150, settlementAmount: 150,
        supportsOverhead: false, shareBase: 120, overheadRelief: 30, shareFinal: 150, overheadSourceLineIds: ["OH"] },
      { id: "B", name: "B", kind: "partner", mode: "settles", effectivePct: 20, share: 80, shareNet: 80, settlementAmount: 80,
        supportsOverhead: true, shareBase: 80, overheadRelief: 0, shareFinal: 80, overheadSourceLineIds: [] }] }] };
}
describe("#415 additive seal v2", () => {
  it("C3: v1 parser keeps exact historical semantics and no invented contract fields", () => {
    const v1 = { version: 1, nodes: [], historical: "preserved" };
    expect(parseSealSnapshot(v1)).toBe(v1);
    expect(parseSealSnapshot({ version: 3, nodes: [] })).toBeNull();
    expect(parseSealSnapshotV2(v1)).toBeNull();
  });
  it("C3: v2 records contract/provenance/revisions/flags/parts/residual and makes detached snapshot", () => {
    const source = fixture();
    const snapshot = buildSealSnapshotV2(source);
    expect(snapshot).toEqual(source);
    expect(parseSealSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    source.nodes[0].contract.revision = 99;
    source.nodes[0].participants[0].share = 999;
    expect(snapshot.nodes[0].contract.revision).toBe(2);
    expect(snapshot.nodes[0].participants[0]).toMatchObject({ shareBase: 120, overheadRelief: 30, shareFinal: 150, supportsOverhead: false });
  });
  it("C3: v2 descendant uses independent inherited origins; selected subtree may start below event root", () => {
    const s = fixture();
    const root = s.nodes[0];
    const child = structuredClone(root);
    child.id = "child"; child.parentId = "root"; child.parentQuota = 120; child.parentSharePct = 30; child.parentQuotaBasis = "net_result"; child.participants = [];
    child.contract = { ...child.contract, settlementId: "child", revision: 0, initializedAt: null, initializedBy: null,
      expenseSourceOrigin: { kind: "inherited", settlementId: "root", revision: 2 }, includeOverheadOrigin: { kind: "inherited", settlementId: "root", revision: 2 },
      revisions: [{ settlementId: "child", revision: 0 }, { settlementId: "root", revision: 2 }], basisOrigin: "parent_share_basis" };
    s.nodes.push(child);
    expect(parseSealSnapshotV2(s)).not.toBeNull();
    s.settlement_id = "child"; s.nodes = [child];
    expect(parseSealSnapshotV2(s)).not.toBeNull();
  });
  it.each([
    ["version", 9], ["contextVersion", 2], ["inputHash", "bad"], ["check1", NaN], ["check2", Infinity],
    ["partnersPaidTotal", "230"], ["extra", true], ["settlement_id", "absent"], ["nodes", []],
  ])("C3: rejects malformed top-level %s without fallback", (key, value) => {
    const bad = { ...fixture(), [key]: value };
    expect(parseSealSnapshot(bad)).toBeNull();
  });
  it("C3: strict nested schemas reject extra/missing fields and inconsistent provenance", () => {
    const mutations: ((s: any) => void)[] = [
      (s) => delete s.nodes[0].contract.revision,
      (s) => { s.nodes[0].contract.unexpected = true; },
      (s) => { s.nodes[0].contract.state = "uninitialized"; },
      (s) => { s.nodes[0].contract.expenseSourceOrigin.revision = 9; },
      (s) => { s.nodes[0].contract.includeOverheadOrigin.kind = "inherited"; },
      (s) => { s.nodes[0].contract.revisions.push(s.nodes[0].contract.revisions[0]); },
      (s) => { s.nodes[0].participants[0].shareFinal = 151; },
      (s) => { s.nodes[0].participants[0].overheadRelief = 29; },
      (s) => { s.nodes[0].participants[0].overheadSourceLineIds = ["OH", "OH"]; },
      (s) => { s.nodes[0].participants[0].overheadSourceLineIds = []; },
      (s) => { s.nodes[0].participants[0].kind = "house"; },
      (s) => { s.nodes[0].participants[0].mode = "nominal"; },
      (s) => { s.nodes[0].participants.push(s.nodes[0].participants[0]); },
      (s) => { s.nodes.push(s.nodes[0]); },
      (s) => { s.nodes[0].parentId = "root"; },
      (s) => { s.nodes[0].participants.pop(); },
      (s) => { s.nodes[0].documentLineIds = ["cost", "cost"]; },
      (s) => { s.nodes[0].participants[0].unexpected = 0; },
      (s) => { s.residual.nominalGapBase = 10; },
      (s) => { s.check2 = 1; },
      (s) => { s.eventNetResult = 401; },
      (s) => { s.basis.includeOverhead = false; },
    ];
    for (const mutate of mutations) {
      const s = fixture(); mutate(s);
      expect(parseSealSnapshotV2(s)).toBeNull();
      expect(() => buildSealSnapshotV2(s)).toThrow();
    }
  });
});
