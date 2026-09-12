import { describe, it, expect } from "vitest";
import { groupStatementLines, type StatementGroup } from "@/lib/statement-grouping";

interface L {
  id: string;
  date: string;
  signedAmount: number;
  runningBalance: number;
  event: string | null;
}

const opts = (byTx: Map<string, string>, groups: Map<string, StatementGroup>) => ({
  getId: (l: L) => l.id,
  getAmount: (l: L) => l.signedAmount,
  getRunningBalance: (l: L) => l.runningBalance,
  getDate: (l: L) => l.date,
  getEventName: (l: L) => l.event,
  byTx,
  groups,
});

function group(over: Partial<StatementGroup> = {}): StatementGroup {
  return {
    groupId: "g1",
    source: "bank",
    bankDate: "2026-09-11",
    description: "LOTE TRF CRED SEPA+",
    bankAmount: -100,
    txIds: ["a", "b", "c"],
    ...over,
  };
}

const lines: L[] = [
  { id: "x", date: "2026-09-09", signedAmount: 500, runningBalance: 500, event: "Coala" },
  { id: "a", date: "2026-09-10", signedAmount: -40, runningBalance: 460, event: "Coala" },
  { id: "b", date: "2026-09-10", signedAmount: -30, runningBalance: 430, event: "H&K" },
  { id: "c", date: "2026-09-10", signedAmount: -30, runningBalance: 400, event: "H&K" },
  { id: "y", date: "2026-09-12", signedAmount: -10, runningBalance: 390, event: null },
];

describe("consolidação de movimentos do banco no extrato", () => {
  const byTx = new Map([["a", "g1"], ["b", "g1"], ["c", "g1"]]);
  const groups = new Map([["g1", group()]]);

  it("emite header + filhas no lugar da ÚLTIMA filha, mantendo a ordem", () => {
    const items = groupStatementLines(lines, opts(byTx, groups));
    expect(items.map((i) => i.kind)).toEqual([
      "tx",
      "group-header",
      "group-child",
      "group-child",
      "group-child",
      "tx",
    ]);
    expect(items.filter((i) => i.kind === "group-child").length).toBe(3);
  });

  it("o header soma as filhas e herda o saldo da última filha", () => {
    const h = groupStatementLines(lines, opts(byTx, groups)).find((i) => i.kind === "group-header")!;
    if (h.kind !== "group-header") throw new Error("kind");
    expect(h.total).toBe(-100);
    expect(h.runningBalance).toBe(400);
    expect(h.childCount).toBe(3);
    expect(h.totalChildCount).toBe(3);
    expect(h.eventLabel).toBe("Vários (2)");
  });

  it("usa a data do banco, não a data efetiva das filhas", () => {
    const h = groupStatementLines(lines, opts(byTx, groups)).find((i) => i.kind === "group-header")!;
    if (h.kind !== "group-header") throw new Error("kind");
    expect(h.date).toBe("2026-09-11");
  });

  it("no recurso (sem linha do banco) usa a data efetiva máxima das filhas", () => {
    const g = new Map([["g1", group({ source: "sepa", bankDate: null, bankAmount: null })]]);
    const h = groupStatementLines(lines, opts(byTx, g)).find((i) => i.kind === "group-header")!;
    if (h.kind !== "group-header") throw new Error("kind");
    expect(h.date).toBe("2026-09-10");
    expect(h.divergence).toBe(0);
  });

  it("sinaliza divergência entre o sistema e o banco (retenção na fonte)", () => {
    const g = new Map([["g1", group({ bankAmount: -95 })]]);
    const h = groupStatementLines(lines, opts(byTx, g)).find((i) => i.kind === "group-header")!;
    if (h.kind !== "group-header") throw new Error("kind");
    expect(h.divergence).toBeCloseTo(-5, 5);
  });

  it("um movimento com UMA transação não forma grupo", () => {
    const g = new Map([["g1", group({ txIds: ["a"] })]]);
    const items = groupStatementLines(lines, opts(new Map([["a", "g1"]]), g));
    expect(items.every((i) => i.kind === "tx")).toBe(true);
    expect(items.length).toBe(lines.length);
  });

  it("filtro de período a esconder filhas mantém visível/total", () => {
    const partial = lines.filter((l) => l.id !== "c");
    const h = groupStatementLines(partial, opts(byTx, groups)).find((i) => i.kind === "group-header")!;
    if (h.kind !== "group-header") throw new Error("kind");
    expect(h.childCount).toBe(2);
    expect(h.totalChildCount).toBe(3);
    expect(h.total).toBe(-70);
    expect(h.runningBalance).toBe(430);
  });

  it("preserva todas as linhas: nenhuma transação desaparece nem duplica", () => {
    const items = groupStatementLines(lines, opts(byTx, groups));
    const ids = items.flatMap((i) =>
      i.kind === "tx" ? [i.line.id] : i.kind === "group-child" ? [i.line.id] : [],
    );
    expect(ids.sort()).toEqual(["a", "b", "c", "x", "y"]);
  });

  it("uma transação pertence a no máximo um grupo (índice é 1:1)", () => {
    const two = new Map([...byTx, ["y", "g2"]]);
    const g = new Map([
      ["g1", group()],
      ["g2", group({ groupId: "g2", txIds: ["y", "z"], bankAmount: -10, bankDate: "2026-09-13" })],
    ]);
    const items = groupStatementLines(lines, opts(two, g));
    const headers = items.filter((i) => i.kind === "group-header");
    expect(headers.length).toBe(2);
  });

  it("grupo sem filhas visíveis não é renderizado", () => {
    const items = groupStatementLines(
      lines.filter((l) => ["x", "y"].includes(l.id)),
      opts(byTx, groups),
    );
    expect(items.every((i) => i.kind === "tx")).toBe(true);
  });
});

describe("filhas não contíguas na ordem canónica", () => {
  // Caso real: lote SEPA de 03/09 com transações repartidas por 02/09 e 03/09,
  // com uma linha solta pelo meio. O header tem de sair DEPOIS da última filha
  // para a coluna Saldo continuar monótona de cima a baixo.
  const spread: L[] = [
    { id: "a", date: "2026-09-02", signedAmount: -60, runningBalance: 440, event: "Coala" },
    { id: "z", date: "2026-09-02", signedAmount: -100, runningBalance: 340, event: null },
    { id: "b", date: "2026-09-03", signedAmount: -40, runningBalance: 300, event: "Coala" },
  ];
  const byTx = new Map([["a", "g1"], ["b", "g1"]]);
  const groups = new Map([["g1", group({ txIds: ["a", "b"], bankAmount: -100 })]]);

  it("o header sai na posição da última filha", () => {
    const items = groupStatementLines(spread, opts(byTx, groups));
    expect(items.map((i) => i.kind)).toEqual(["tx", "group-header", "group-child", "group-child"]);
    expect((items[0] as any).line.id).toBe("z");
  });

  it("o saldo do header é o da última filha e precede-o só saldo maior", () => {
    const h = groupStatementLines(spread, opts(byTx, groups)).find(
      (i) => i.kind === "group-header",
    )! as any;
    expect(h.runningBalance).toBe(300);
    expect(h.total).toBe(-100);
    expect(h.childCount).toBe(2);
  });
});
