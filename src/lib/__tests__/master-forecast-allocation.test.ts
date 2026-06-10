import { describe, it, expect } from "vitest";
import {
  classifyTx,
  computeMasterForecastAllocation,
} from "@/lib/master-forecast-allocation";

const SUB = "sub-1";
const MASTER = "master-1";

describe("classifyTx (critério estrito regra 7)", () => {
  it("sem parent → TX_LOCAL_PURA", () => {
    expect(classifyTx({ parent_transaction_id: null, parent_event_id: undefined }, SUB))
      .toBe("TX_LOCAL_PURA");
  });
  it("parent flutuante (event_id NULL) → FILHA_RATEIO_MASTER", () => {
    expect(classifyTx({ parent_transaction_id: "p1", parent_event_id: null }, SUB))
      .toBe("FILHA_RATEIO_MASTER");
  });
  it("parent noutro evento (Master) → FILHA_RATEIO_MASTER", () => {
    expect(classifyTx({ parent_transaction_id: "p1", parent_event_id: MASTER }, SUB))
      .toBe("FILHA_RATEIO_MASTER");
  });
  it("parent no mesmo sub → PARCELA_LOCAL", () => {
    expect(classifyTx({ parent_transaction_id: "p1", parent_event_id: SUB }, SUB))
      .toBe("PARCELA_LOCAL");
  });
});

describe("computeMasterForecastAllocation — cenário Simone Lisboa (Live)", () => {
  // Master BP (expense) — só cats com type=expense
  const bpMaster = [
    { category_id: "2.2.01", amount: 44000, type: "expense" as const }, // Aéreo
    { category_id: "2.2.03", amount: 5400, type: "expense" as const }, // Transp
    { category_id: "2.2.04", amount: 4650, type: "expense" as const }, // Alim (overlap)
    { category_id: "2.7.02", amount: 1971.30, type: "expense" as const }, // Seguros
    { category_id: "2.7.03", amount: 500, type: "expense" as const }, // Alf
    { category_id: "2.7.06", amount: 1306, type: "expense" as const }, // Direitos (overlap)
    { category_id: "3.1.04", amount: 1600, type: "expense" as const }, // Assess
    { category_id: "3.2.01", amount: 12000, type: "expense" as const }, // Digital
    { category_id: "3.2.04", amount: 5093.90, type: "expense" as const }, // Rádio (overlap em Lisboa)
  ];
  // BP do sub Lisboa cobre 2.2.04, 2.7.06, 3.2.04 (overlaps)
  const bpSubCatsLisboa = new Set(["2.1.02","2.2.02","2.2.04","2.3.01","2.3.02","2.5.03","2.6.04","2.6.05","2.6.06","2.6.07","2.6.08","2.7.06","3.1.06","3.2.02","3.2.04","3.2.06","4.1.02","4.1.03","4.1.09","4.2.05"]);
  // TX Lisboa: 2x Aéreo (filhas), 2x Hospedagem (1 local, 1 parcela local), 1 Digital local
  const subTxs = [
    { category_id: "2.2.01", amount: 11086.50, type: "expense" as const, parent_transaction_id: "pAereo", parent_event_id: null },
    { category_id: "2.2.01", amount: 583.50, type: "expense" as const, parent_transaction_id: "pAereo", parent_event_id: null },
    { category_id: "2.2.02", amount: 2209.50, type: "expense" as const, parent_transaction_id: null, parent_event_id: undefined },
    { category_id: "2.2.02", amount: 2209.50, type: "expense" as const, parent_transaction_id: "hosp1", parent_event_id: SUB },
    { category_id: "3.2.01", amount: 608.26, type: "expense" as const, parent_transaction_id: null, parent_event_id: undefined },
  ];

  it("Lisboa: rateioMasterSum = 32.735,65 e txLocalSum = 608,26", () => {
    const r = computeMasterForecastAllocation({
      subId: SUB, N: 2, bpMaster, bpSubCats: bpSubCatsLisboa, subTxs, kind: "expense",
    });
    expect(r.rateioMasterSum).toBeCloseTo(32735.65, 2);
    expect(r.txLocalSum).toBeCloseTo(608.26, 2);
  });

  it("Aéreo: quota = MAX(22.000, 11.670) = 22.000 (filhas não duplicam)", () => {
    const r = computeMasterForecastAllocation({
      subId: SUB, N: 2, bpMaster, bpSubCats: bpSubCatsLisboa, subTxs, kind: "expense",
    });
    const aereo = r.rateioMasterByCat.get("2.2.01")!;
    expect(aereo.quotaPrev).toBe(22000);
    expect(aereo.txFilhas).toBe(11670);
    expect(aereo.quota).toBe(22000);
  });

  it("Hospedagem (2.2.02) está no BP do sub → NÃO rateia nem entra em txLocal", () => {
    const r = computeMasterForecastAllocation({
      subId: SUB, N: 2, bpMaster, bpSubCats: bpSubCatsLisboa, subTxs, kind: "expense",
    });
    expect(r.rateioMasterByCat.has("2.2.02")).toBe(false);
    // 4.419 hosp não somam ao txLocal (cat já está no BP do sub)
    expect(r.txLocalSum).toBeCloseTo(608.26, 2);
  });

  it("Digital: quota Master 6.000 + TX local 608,26 somam separadamente (regra 5)", () => {
    const r = computeMasterForecastAllocation({
      subId: SUB, N: 2, bpMaster, bpSubCats: bpSubCatsLisboa, subTxs, kind: "expense",
    });
    expect(r.rateioMasterByCat.get("3.2.01")!.quota).toBe(6000);
    // 608,26 entra em txLocalSum
    expect(r.txLocalSum).toBeCloseTo(608.26, 2);
  });
});

describe("computeMasterForecastAllocation — guardas", () => {
  it("N=0 → zeros", () => {
    const r = computeMasterForecastAllocation({
      subId: SUB, N: 0, bpMaster: [], bpSubCats: new Set(), subTxs: [], kind: "expense",
    });
    expect(r.rateioMasterSum).toBe(0);
    expect(r.txLocalSum).toBe(0);
  });
  it("subId vazio → zeros", () => {
    const r = computeMasterForecastAllocation({
      subId: "", N: 2, bpMaster: [{ category_id: "a", amount: 100, type: "expense" }],
      bpSubCats: new Set(), subTxs: [], kind: "expense",
    });
    expect(r.rateioMasterSum).toBe(0);
  });
});
