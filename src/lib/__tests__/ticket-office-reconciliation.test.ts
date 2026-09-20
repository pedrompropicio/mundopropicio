import { describe, expect, it } from "vitest";
import {
  decomposeTicketOfficeAnalytical,
  ticketOfficeLineKind,
  ticketOfficeOtherMovements,
} from "../ticket-office-reconciliation";

describe("decomposeTicketOfficeAnalytical (#128)", () => {
  const lines = [
    { kind: "sale" as const, amount: 1000, eventId: "e1", eventName: "Evento 1" },
    { kind: "income" as const, amount: 200, eventId: "e1", eventName: "Evento 1" },
    { kind: "expense" as const, amount: -150, eventId: "e1", eventName: "Evento 1" },
    { kind: "transfer" as const, amount: -400, eventId: "e1", eventName: "Evento 1" },
    { kind: "advance" as const, amount: -50, eventId: "e1", eventName: "Evento 1" },
    { kind: "sale" as const, amount: 300, eventId: "e2", eventName: "Evento 2" },
    { kind: "expense" as const, amount: -25, eventId: null, eventName: "—" },
  ];

  it("decompõe cada evento nas cinco parcelas", () => {
    const { groups } = decomposeTicketOfficeAnalytical(lines);
    const e1 = groups.find((g) => g.eventId === "e1")!;
    expect(e1).toMatchObject({ sales: 1000, income: 200, expenses: 150, transfers: 400, advances: 50 });
    expect(e1.balance).toBe(600);
  });

  it("guarda os movimentos sem evento e soma-os no total", () => {
    const { noEvent, total } = decomposeTicketOfficeAnalytical(lines);
    expect(noEvent?.expenses).toBe(25);
    // 600 (e1) + 300 (e2) − 25 (sem evento)
    expect(total).toBe(875);
  });

  it("sem linhas devolve total zero e nenhum grupo", () => {
    const { groups, noEvent, total } = decomposeTicketOfficeAnalytical([]);
    expect(groups).toHaveLength(0);
    expect(noEvent).toBeNull();
    expect(total).toBe(0);
  });

  it("cai para type quando não há kind", () => {
    expect(ticketOfficeLineKind({ type: "income", amount: 1 })).toBe("income");
    expect(ticketOfficeLineKind({ amount: 1 })).toBe("expense");
  });
});

describe("ticketOfficeOtherMovements (#155)", () => {
  it("é zero quando os quatro tiles explicam o retido", () => {
    expect(ticketOfficeOtherMovements(600, { sales: 1000, expenses: 150, transfers: 200, advances: 50 })).toBe(600 - 600);
  });

  it("devolve o resto quando há receitas ou movimentos sem evento", () => {
    // retido 875 contra tiles 1300 − 150 − 400 − 50 = 700 → resto 175
    expect(ticketOfficeOtherMovements(875, { sales: 1300, expenses: 150, transfers: 400, advances: 50 })).toBe(175);
  });

  it("arredonda ao cêntimo", () => {
    expect(ticketOfficeOtherMovements(100.005, { sales: 0, expenses: 0, transfers: 0, advances: 0 })).toBe(100.01);
  });
});
