import { describe, it, expect } from "vitest";
import {
  HOUSE_PARTNER_NAME,
  localPartnersPct,
  residualHousePct,
  toSettlementParticipant,
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

  it("residual da casa ignora a própria casa e os nominais", () => {
    const rows = [
      { percentage: 70, mode: "settles" },
      { percentage: 15, mode: "settles" },
      { percentage: 40, mode: "nominal" },
      { percentage: 15, mode: "settles", isHouse: true },
    ];
    expect(residualHousePct(rows)).toBe(15);
  });

  it("residual zero quando os sócios cobrem 100%", () => {
    expect(residualHousePct([{ percentage: 35, mode: "settles" }, { percentage: 65, mode: "settles" }])).toBe(0);
  });
});
