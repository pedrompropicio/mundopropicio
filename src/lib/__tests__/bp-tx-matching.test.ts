import { describe, expect, it } from "vitest";
import {
  normalizeMatchText,
  scoreDescriptionMatch,
  findMatchingTransactionsForForecast,
  findCategoryOrphanTransactions,
} from "../bp-tx-matching";

const EV = "ev-1";
const CAT = "cat-1";

const f = (over: Partial<any>) => ({
  id: "f", event_id: EV, category_id: CAT, type: "expense", description: "", transaction_id: null, ...over,
});
const tx = (over: Partial<any>) => ({
  id: "t", event_id: EV, category_id: CAT, type: "expense", description: "", amount: 100, iva_rate: 23, ...over,
});

describe("normalizeMatchText", () => {
  it("remove acentos, caixa e caracteres especiais", () => {
    expect(normalizeMatchText("DIARIAS/Per-Diem")).toBe("diarias per diem");
    expect(normalizeMatchText("Diárias")).toBe("diarias");
  });
});

describe("scoreDescriptionMatch", () => {
  it("casa descrição sem acentos com linha com acentos", () => {
    expect(scoreDescriptionMatch("Cachês e diárias - Equipa EDA", "Diarias/Per Diem")).toBeGreaterThan(0);
  });
  it("exact match após normalização vale 1000", () => {
    expect(scoreDescriptionMatch("Diárias", "diarias")).toBe(1000);
  });
  it("sem tokens comuns dá 0", () => {
    expect(scoreDescriptionMatch("Voos Lisboa", "Catering camarim")).toBe(0);
  });
});

describe("findMatchingTransactionsForForecast", () => {
  it("linha única reclama todas as TXs da categoria", () => {
    const fa = f({ id: "fa", description: "Voos" });
    const txs = [tx({ id: "t1", description: "Voo TAP" }), tx({ id: "t2", description: "Qualquer coisa" })];
    expect(findMatchingTransactionsForForecast(fa, txs, [fa]).map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("com várias linhas, o match ignora acentos", () => {
    const fa = f({ id: "fa", description: "Cachês e diárias - Equipa EDA" });
    const fb = f({ id: "fb", description: "Voos internacionais" });
    const t1 = tx({ id: "t1", description: "Diarias/Per Diem" });
    expect(findMatchingTransactionsForForecast(fa, [t1], [fa, fb]).map((t) => t.id)).toEqual(["t1"]);
    expect(findMatchingTransactionsForForecast(fb, [t1], [fa, fb])).toEqual([]);
  });
});

describe("findCategoryOrphanTransactions", () => {
  const base = { categoryId: CAT, type: "expense", eventId: EV };

  it("devolve TX que nenhuma linha reclama (empate/score 0)", () => {
    const fa = f({ id: "fa", description: "Voos" });
    const fb = f({ id: "fb", description: "Hotel" });
    const t1 = tx({ id: "t1", description: "Algo totalmente diferente" });
    const t2 = tx({ id: "t2", description: "Voo TAP para Voos" });
    const orphans = findCategoryOrphanTransactions({ ...base, transactions: [t1, t2], allForecasts: [fa, fb] });
    expect(orphans.map((t) => t.id)).toEqual(["t1"]);
  });

  it("categoria sem nenhuma linha BP: todas as TX ficam no bucket", () => {
    const t1 = tx({ id: "t1", description: "Despesa avulsa" });
    const orphans = findCategoryOrphanTransactions({ ...base, transactions: [t1], allForecasts: [] });
    expect(orphans.map((t) => t.id)).toEqual(["t1"]);
  });

  it("vinculada por FK deixa de ser órfã", () => {
    const t1 = tx({ id: "t1", description: "Algo diferente" });
    const fa = f({ id: "fa", description: "Voos" });
    const fb = f({ id: "fb", description: "Hotel", transaction_id: "t1" });
    expect(findCategoryOrphanTransactions({ ...base, transactions: [t1], allForecasts: [fa, fb] })).toEqual([]);
  });

  it("linha única na categoria não deixa órfãs", () => {
    const fa = f({ id: "fa", description: "Per Diems / Ajudas de Custo - Equipa EDA" });
    const txs = Array.from({ length: 63 }, (_, i) => tx({ id: `t${i}`, description: "Diarias/Per Diem" }));
    expect(findCategoryOrphanTransactions({ ...base, transactions: txs, allForecasts: [fa] })).toEqual([]);
  });
});

describe("issue #59 — TX reclamada por FK por OUTRA linha não conta nem bloqueia", () => {
  it("exclui a TX reclamada por outra linha, mesmo com descrição semelhante", () => {
    // Caso real: linha "Digital Decor - estrutura metálica" (2.5.03) não pode
    // reclamar a TX "Digital Decor - telas pórtico", cujo FK pertence a outra linha.
    const alvo = f({ id: "f-estrutura", description: "Digital Decor - estrutura metálica" });
    const outra = f({ id: "f-telas", description: "Tecido - Telas Porticos", transaction_id: "t-telas" });
    const tTelas = tx({ id: "t-telas", description: "Digital Decor - telas portico" });
    expect(
      findMatchingTransactionsForForecast(alvo, [tTelas], [alvo, outra]).map((t) => t.id),
    ).toEqual([]);
  });

  it("REGRESSÃO Anitta 2.6.04: linha mantém a sua TX por FK + a órfã da rubrica", () => {
    // "Mobiliário Camarins - Anitta e Family and Friends" (2.977,00) =
    // 2.145,00 vinculada por FK + 832,00 órfã. A exclusão só apanha TXs de OUTRA linha.
    const linha = f({
      id: "f-mob",
      description: "Mobiliário Camarins - Anitta e Family and Friends",
      transaction_id: "t-2145",
    });
    const outraLinha = f({ id: "f-outra", description: "Outra coisa qualquer" });
    const t2145 = tx({ id: "t-2145", description: "Mobiliario camarins Anitta", amount: 2145 });
    const t832 = tx({ id: "t-832", description: "Mobiliario camarins family friends", amount: 832 });
    const got = findMatchingTransactionsForForecast(linha, [t2145, t832], [linha, outraLinha]).map((t) => t.id);
    expect(got).toContain("t-2145");
    expect(got).toContain("t-832");
    expect(got).toHaveLength(2);
  });
});
