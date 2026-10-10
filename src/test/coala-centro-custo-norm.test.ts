import { describe, it, expect } from "vitest";
import { normCentroCusto, FALLBACK_CATEGORY_CODE } from "../../supabase/functions/_shared/coala-centro-custo";

// #230 — variantes reais da planilha Coala 2026.
describe("#230 normCentroCusto", () => {
  it("acentos, espaços e maiúsculas colapsam para a mesma chave", () => {
    expect(normCentroCusto("Cachê Artistico")).toBe(normCentroCusto("Cachê Artístico"));
    expect(normCentroCusto("Aéreo Artistico")).toBe(normCentroCusto("Aéreo Artístico"));
    expect(normCentroCusto("Aéreo Artístico")).toBe("aereo artistico");
    expect(normCentroCusto("Seguro Viagem ")).toBe("seguro viagem");
    expect(normCentroCusto("Evento  CMC ")).toBe("evento cmc");
    expect(normCentroCusto("Cachê Artístico")).toBe("cache artistico");
  });
  it("fallback é A Classificar, nunca Despesas Extras", () => {
    expect(FALLBACK_CATEGORY_CODE).toBe("0.0.99");
  });
});
