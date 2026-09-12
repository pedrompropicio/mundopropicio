import { describe, it, expect } from "vitest";
import { groupStatementLines, type StatementGroup } from "@/lib/statement-grouping";

interface L {
  id: string;
  date: string;
  signedAmount: number;
  /** Saldo plano, mantido só para provar que já NÃO é usado no desenho. */
  runningBalance: number;
  event: string | null;
}

const opts = (
  byTx: Map<string, string>,
  groups: Map<string, StatementGroup>,
  openingBalance = 0,
) => ({
  getId: (l: L) => l.id,
  getAmount: (l: L) => l.signedAmount,
  getDate: (l: L) => l.date,
  getEventName: (l: L) => l.event,
  openingBalance,
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

/** Saldo da última unidade desenhada. */
const lastBalance = (items: ReturnType<typeof groupStatementLines<L>>) => {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "tx" || it.kind === "group-header") return it.runningBalance;
  }
  return null;
};

describe("consolidação de movimentos do banco no extrato", () => {
  const byTx = new Map([["a", "g1"], ["b", "g1"], ["c", "g1"]]);
  const groups = new Map([["g1", group()]]);

  it("emite header + filhas como uma unidade, pela data da unidade", () => {
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

  it("o header soma as filhas e traz o saldo acumulado da ordem consolidada", () => {
    const items = groupStatementLines(lines, opts(byTx, groups));
    const h = items.find((i) => i.kind === "group-header")!;
    if (h.kind !== "group-header") throw new Error("kind");
    expect(h.total).toBe(-100);
    expect(h.runningBalance).toBe(400);
    expect(h.childCount).toBe(3);
    expect(h.totalChildCount).toBe(3);
    expect(h.eventLabel).toBe("Vários (2)");
  });

  it("o saldo respeita o openingBalance recebido", () => {
    const items = groupStatementLines(lines, opts(byTx, groups, 1_000));
    const first = items[0];
    if (first.kind !== "tx") throw new Error("kind");
    expect(first.runningBalance).toBe(1_500);
    expect(lastBalance(items)).toBe(1_390);
  });

  it("o saldo da última unidade é o saldo de fecho (soma de todas as parcelas)", () => {
    const items = groupStatementLines(lines, opts(byTx, groups, 250));
    const closing = lines.reduce((s, l) => s + l.signedAmount, 250);
    expect(lastBalance(items)).toBeCloseTo(closing, 6);
  });

  it("as filhas não mostram saldo", () => {
    const items = groupStatementLines(lines, opts(byTx, groups));
    const children = items.filter((i) => i.kind === "group-child");
    expect(children.length).toBe(3);
    children.forEach((c) => expect("runningBalance" in c).toBe(false));
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

  it("filtro de período a esconder filhas mantém visível/total e reacumula o saldo", () => {
    const partial = lines.filter((l) => l.id !== "c");
    const items = groupStatementLines(partial, opts(byTx, groups));
    const h = items.find((i) => i.kind === "group-header")!;
    if (h.kind !== "group-header") throw new Error("kind");
    expect(h.childCount).toBe(2);
    expect(h.totalChildCount).toBe(3);
    expect(h.total).toBe(-70);
    expect(h.runningBalance).toBe(430);
    expect(lastBalance(items)).toBe(420);
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

describe("saldo na ordem consolidada", () => {
  // O defeito real: uma SAÍDA solta desenhada depois do cabeçalho do lote
  // aparecia com saldo MAIOR, porque herdava o saldo plano calculado noutro
  // ponto da sequência.
  const spread: L[] = [
    { id: "a", date: "2026-09-02", signedAmount: -60, runningBalance: 440, event: "Coala" },
    { id: "z", date: "2026-09-02", signedAmount: -100, runningBalance: 340, event: null },
    { id: "b", date: "2026-09-03", signedAmount: -40, runningBalance: 300, event: "Coala" },
  ];
  const byTx = new Map([["a", "g1"], ["b", "g1"]]);
  const groups = new Map([["g1", group({ txIds: ["a", "b"], bankAmount: -100 })]]);

  it("a unidade solta e o grupo saem pela data da unidade", () => {
    const items = groupStatementLines(spread, opts(byTx, groups, 500));
    expect(items.map((i) => i.kind)).toEqual(["tx", "group-header", "group-child", "group-child"]);
    expect((items[0] as any).line.id).toBe("z");
  });

  it("uma saída NUNCA aumenta o saldo mostrado", () => {
    const items = groupStatementLines(spread, opts(byTx, groups, 500));
    const shown = items
      .filter((i) => i.kind === "tx" || i.kind === "group-header")
      .map((i) => (i as any).runningBalance);
    expect(shown).toEqual([400, 300]);
    expect(lastBalance(items)).toBeCloseTo(spread.reduce((s, l) => s + l.signedAmount, 500), 6);
  });
});

describe("ajustes de caixa", () => {
  const withAdj: L[] = [
    { id: "a", date: "2026-09-02", signedAmount: -60, runningBalance: 440, event: null },
    { id: "b", date: "2026-09-03", signedAmount: -40, runningBalance: 400, event: null },
    // Data anterior a tudo, de propósito: tem de ficar em ÚLTIMO.
    {
      id: "__cash_adjustments__",
      date: "2026-01-01",
      signedAmount: -25,
      runningBalance: 375,
      event: null,
    },
  ];
  const byTx = new Map([["a", "g1"], ["b", "g1"]]);
  const groups = new Map([["g1", group({ txIds: ["a", "b"], bankAmount: -100 })]]);

  it("a linha pseudo dos ajustes fica sempre em último, seja qual for a data", () => {
    const items = groupStatementLines(withAdj, opts(byTx, groups, 500));
    const last = items[items.length - 1];
    if (last.kind !== "tx") throw new Error("kind");
    expect(last.line.id).toBe("__cash_adjustments__");
    expect(last.runningBalance).toBe(375);
    expect(lastBalance(items)).toBeCloseTo(withAdj.reduce((s, l) => s + l.signedAmount, 500), 6);
  });
});
