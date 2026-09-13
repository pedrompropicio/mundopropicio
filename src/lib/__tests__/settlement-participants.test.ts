import { describe, it, expect } from "vitest";
import {
  HOUSE_PARTNER_NAME,
  localPartnersPct,
  residualHousePct,
  toSettlementParticipant,
  partnerDocRows,
  visibleSettlementIdsForParticipant,
} from "@/lib/settlement-participants";

const base = {
  id: "p1",
  event_id: "e1",
  settlement_id: "s1",
  event_partner_id: null as string | null,
  supplier_id: null as string | null,
  participant_kind: "partner",
  mode: "settles",
  profit_pct: 70,
  loss_pct: null as number | null,
  expense_includes_iva: null as boolean | null,
  visible_in_docs: true,
  can_order: true,
  can_pay: false,
  notes: null as string | null,
};

describe("toSettlementParticipant", () => {
  it("usa o id de event_partners como chave legacy quando existe", () => {
    const p = toSettlementParticipant({ ...base, event_partner_id: "ep-9", suppliers: { name: "ANITTA" } } as any);
    expect(p.id).toBe("ep-9");
    expect(p.participantId).toBe("p1");
    expect(p.percentage).toBe(70);
    expect(p.isHouse).toBe(false);
    expect(p.suppliers?.name).toBe("ANITTA");
  });

  it("cai no id do participante quando não há espelho", () => {
    const p = toSettlementParticipant({ ...base } as any);
    expect(p.id).toBe("p1");
  });

  it("rotula a casa mesmo sem fornecedor", () => {
    const p = toSettlementParticipant({ ...base, participant_kind: "house", profit_pct: 30 } as any);
    expect(p.isHouse).toBe(true);
    expect(p.suppliers?.name).toBe(HOUSE_PARTNER_NAME);
    expect(p.percentage).toBe(30);
  });

  it("preserva o nome do apuramento e a hierarquia", () => {
    const p = toSettlementParticipant({
      ...base,
      event_settlements: { name: "Sub-apuramento A", parent_id: "root", position: 2 },
    } as any);
    expect(p.settlementName).toBe("Sub-apuramento A");
    expect(p.settlementParentId).toBe("root");
    expect(p.settlementPosition).toBe(2);
  });
});

describe("quotas", () => {
  it("Sócios locais = 100 − quota do destinatário", () => {
    expect(localPartnersPct(70)).toBe(30);
    expect(localPartnersPct(100)).toBe(0);
  });

  // (e2) ponto 3: os nominais TAMBÉM reduzem a quota da casa — se a casa
  // absorvesse a parte nominal, o motor contava-a duas vezes (declarada +
  // nominalGap) e a conferência C2 deixava de fechar.
  it("residual da casa desconta todos os sócios, settles e nominais", () => {
    const rows = [
      { percentage: 70, mode: "settles" },
      { percentage: 15, mode: "nominal" },
      { percentage: 15, mode: "settles", isHouse: true },
    ];
    expect(residualHousePct(rows)).toBe(15);
  });


  it("residual zero quando os sócios cobrem 100%", () => {
    expect(residualHousePct([{ percentage: 35, mode: "settles" }, { percentage: 65, mode: "settles" }])).toBe(0);
  });
});

// (e2) ponto 8 — documentos estanques por apuramento.
describe("visibilidade estanque", () => {
  const rows = [
    { participantId: "root-a", settlement_id: "root", supplier_id: "sup-a", percentage: 55, suppliers: { name: "SÓCIO A" } },
    { participantId: "root-h", settlement_id: "root", supplier_id: null, percentage: 45, suppliers: { name: HOUSE_PARTNER_NAME } },
    { participantId: "child-b", settlement_id: "child", supplier_id: "sup-b", percentage: 40, suppliers: { name: "SÓCIO B" } },
  ];

  it("participante só de um filho não obtém a raiz", () => {
    expect(visibleSettlementIdsForParticipant(rows, "sup-b")).toEqual(["child"]);
    expect(visibleSettlementIdsForParticipant(rows, "sup-a")).toEqual(["root"]);
  });

  it("documento do filho não mostra nomes nem % do pai", () => {
    const doc = partnerDocRows(rows, "child-b");
    expect(doc).toEqual([
      { label: "SÓCIO B", pct: 40, isRecipient: true },
      { label: "Sócios locais", pct: 60, isRecipient: false },
    ]);
    const labels = doc.map((r) => r.label);
    expect(labels).not.toContain("SÓCIO A");
    expect(labels).not.toContain(HOUSE_PARTNER_NAME);
  });

  it("sócio com 100% não gera linha de sócios locais", () => {
    const solo = [{ participantId: "x", settlement_id: "child", supplier_id: "s", percentage: 100, suppliers: { name: "X" } }];
    expect(partnerDocRows(solo, "x")).toHaveLength(1);
  });
});
