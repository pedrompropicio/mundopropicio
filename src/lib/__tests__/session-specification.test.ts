import { describe, it, expect } from "vitest";
import {
  buildCardSessionSpecification,
  buildCamarimSessionSpecification,
} from "../../../supabase/functions/_shared/session-specification";

describe("Issue #343 — especificação curta das sessões", () => {
  it("cartão: só o cabeçalho pedido", () => {
    const s = buildCardSessionSpecification({
      cardName: "Visa MP", holderName: "Ana", eventName: "Coala 2026",
      catCode: "2.6.04", catName: "Camarins", itemCount: 12, ivaRate: 23,
    });
    expect(s.split("\n")).toEqual([
      "Sessão de cartão: Visa MP · portador Ana",
      "Evento: Coala 2026",
      "Rubrica: 2.6.04 — Camarins",
      "Itens consolidados: 12",
      "IVA: 23%",
    ]);
    expect(s).not.toMatch(/Fornecedores:/);
    expect(s).not.toMatch(/€/);
  });

  it("cartão sem evento", () => {
    const s = buildCardSessionSpecification({
      cardName: "C", holderName: "P", eventName: null, catCode: "10.8", catName: "Estrutura", itemCount: 1, ivaRate: 0,
    });
    expect(s.split("\n")[1]).toBe("Sem evento (custo de estrutura)");
  });

  it("camarim sem desvio de IVA", () => {
    const s = buildCamarimSessionSpecification({
      title: "Ivete Lisboa", itemCount: 7, originLabel: "Cartão", ivaRate: 13, ivaDriftNote: null,
    });
    expect(s.split("\n")).toEqual([
      "Sessão de Camarim: Ivete Lisboa",
      "Itens consolidados: 7",
      "Origem: Cartão",
      "IVA: 13%",
    ]);
    expect(s).not.toMatch(/Fornecedores:|Análise:/);
  });

  it("camarim com desvio de IVA na última linha", () => {
    const note = "IVA real do recibo: 10.00€ · IVA recalculado a 13%: 9.50€ · desvio 0.50€ (taxas mistas no recibo)";
    const s = buildCamarimSessionSpecification({
      title: "T", itemCount: 2, originLabel: "Cartão", ivaRate: 13, ivaDriftNote: note,
    });
    const lines = s.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe(note);
  });
});
