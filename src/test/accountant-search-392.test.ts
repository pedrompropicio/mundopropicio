// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isZipBlockedBySearch,
  matchesAllTerms,
  matchesTerm,
  normalizeSearchText,
  parseAmountTerm,
  type AccountantSearchRow,
} from "@/lib/accountant-search";

describe("parseAmountTerm — formatos PT/EN (#392)", () => {
  it("aceita PT com milhares e vírgula decimal", () => {
    expect(parseAmountTerm("1.234,56")).toBeCloseTo(1234.56, 2);
    expect(parseAmountTerm("1234,56")).toBeCloseTo(1234.56, 2);
  });
  it("aceita EN com ponto decimal e vírgula de milhares", () => {
    expect(parseAmountTerm("1234.56")).toBeCloseTo(1234.56, 2);
    expect(parseAmountTerm("1,234.56")).toBeCloseTo(1234.56, 2);
  });
  it("aceita inteiros, € e negativos", () => {
    expect(parseAmountTerm("1234")).toBe(1234);
    expect(parseAmountTerm("€ 1.234,56")).toBeCloseTo(1234.56, 2);
    expect(parseAmountTerm("-50,00")).toBeCloseTo(-50, 2);
  });
  it("milhares sem decimais", () => {
    expect(parseAmountTerm("1.234")).toBe(1234);
    expect(parseAmountTerm("1,234,567")).toBe(1234567);
  });
  it("termo não numérico ou ambíguo devolve null", () => {
    expect(parseAmountTerm("fornecedor")).toBeNull();
    expect(parseAmountTerm("1.2345")).toBeNull();
    expect(parseAmountTerm("1,23,4")).toBeNull();
    expect(parseAmountTerm("")).toBeNull();
  });
});

describe("matchesTerm / matchesAllTerms (#392)", () => {
  const row: AccountantSearchRow = {
    description: "Pagamento produção palco São João",
    invoice_ref: "FT 2026/1234",
    supplier_name: "MÚSICA NO CORAÇÃO LDA",
    supplier_trade_name: "Música no Coração",
    supplier_nif: "509123456",
    account_name: "Conta Principal",
    review_note: "falta a fatura original",
    response_note: "já pedimos ao fornecedor",
    amount: 1234.56,
    paid_amount: 1234.56,
  };

  it("casa em descrição, fornecedor, NIF, nº documento, conta e observações", () => {
    expect(matchesTerm(row, "palco")).toBe(true);
    expect(matchesTerm(row, "coração")).toBe(true);
    expect(matchesTerm(row, "509123456")).toBe(true);
    expect(matchesTerm(row, "2026/1234")).toBe(true);
    expect(matchesTerm(row, "principal")).toBe(true);
    expect(matchesTerm(row, "fatura original")).toBe(true);
    expect(matchesTerm(row, "pedimos")).toBe(true);
    expect(matchesTerm(row, "inexistente")).toBe(false);
  });

  it("não distingue maiúsculas nem acentos (NFD)", () => {
    expect(normalizeSearchText("Música")).toBe("musica");
    expect(matchesTerm(row, "MUSICA")).toBe(true);
    expect(matchesTerm(row, "sao joao")).toBe(true);
  });

  it("valor: igualdade a amount/paid_amount e parte do valor formatado", () => {
    expect(matchesTerm(row, "1.234,56")).toBe(true);
    expect(matchesTerm(row, "1234.56")).toBe(true);
    expect(matchesTerm(row, "1234,56")).toBe(true);
    expect(matchesTerm(row, "234")).toBe(true); // parte de 1.234,56
    expect(matchesTerm(row, "9999,99")).toBe(false);
  });

  it("paid_amount é considerado independentemente do amount", () => {
    const parcial: AccountantSearchRow = { amount: 1000, paid_amount: 250.5 };
    expect(matchesTerm(parcial, "250,50")).toBe(true);
    expect(matchesTerm(parcial, "1000")).toBe(true);
    expect(matchesTerm(parcial, "750")).toBe(false);
  });

  it("termos combinam com E e toleram campos nulos", () => {
    expect(matchesAllTerms(row, "palco coração")).toBe(true);
    expect(matchesAllTerms(row, "palco inexistente")).toBe(false);
    const nulos: AccountantSearchRow = { description: "Rendeiro", invoice_ref: null, supplier_name: null };
    expect(matchesAllTerms(nulos, "rendeiro")).toBe(true);
    expect(matchesAllTerms(nulos, "rendeiro ft")).toBe(false);
    expect(matchesAllTerms(nulos, "")).toBe(true);
  });
});

describe("estado do botão ZIP (#392)", () => {
  it("desativado com pesquisa ativa, ativo sem pesquisa", () => {
    expect(isZipBlockedBySearch("fornecedor")).toBe(true);
    expect(isZipBlockedBySearch("  ")).toBe(false);
    expect(isZipBlockedBySearch("")).toBe(false);
  });
});

describe("travões estruturais contra regressão (#392)", () => {
  const src = readFileSync("src/pages/contabilidade/AccountantDocumentsTab.tsx", "utf8");

  it("a leitura usa fetchAllPagedQuery e nunca .limit()", () => {
    expect(src).toContain('from "@/lib/supabase-paging"');
    expect(src).toContain("fetchAllPagedQuery(q)");
    expect(src).not.toMatch(/\.limit\(/);
  });

  it("com texto na pesquisa ignora o período; sem texto mantém o período", () => {
    expect(src).toContain("if (!searchActive) q = q.gte(\"payment_date\", period.from).lte(\"payment_date\", period.to);");
  });

  it("campo único de pesquisa geral com o placeholder decidido", () => {
    expect(src).toContain("Pesquisar (descrição, fornecedor, NIF, nº documento, valor, conta, observação)");
    expect(src).not.toContain("Buscar fornecedor");
  });
});
