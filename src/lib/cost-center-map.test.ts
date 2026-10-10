import { describe, it, expect } from "vitest";
import { normCentroCusto, suggestCategoryForCostCenter, resolveCostCenter, type CcCategory } from "./cost-center-map";

const cats: CcCategory[] = [
  { id: "l2", code: "2.1", name: "Artístico", parent_id: null },
  { id: "c1", code: "2.1.01", name: "Cachês", parent_id: "l2" },
  { id: "c2", code: "2.7.02", name: "Seguros", parent_id: null },
  { id: "c3", code: "2.2.02", name: "Hospedagem", parent_id: null },
  { id: "acl", code: "0.0.99", name: "A Classificar", parent_id: null },
];

describe("normCentroCusto (#230)", () => {
  it("acentos, espaços, maiúsculas e invisíveis", () => {
    expect(normCentroCusto("  Cachê   Artístico ")).toBe("cache artistico");
    expect(normCentroCusto("Cachê Artistico")).toBe(normCentroCusto("Cache\u00A0Artístico"));
    expect(normCentroCusto("Seguro\u200BViagem")).toBe("seguro viagem");
    expect(normCentroCusto(null)).toBe("");
  });
});

describe("suggestCategoryForCostCenter", () => {
  it("histórico manual dominante ganha", () => {
    const s = suggestCategoryForCostCenter("Cachê Artístico", cats, [{ category_id: "c1" }, { category_id: "c1" }, { category_id: "c2" }]);
    expect(s).toMatchObject({ category_id: "c1", via: "historico" });
  });
  it("histórico disperso cai para o nome", () => {
    const s = suggestCategoryForCostCenter("Hospedagem Equipe", cats, [{ category_id: "c1" }, { category_id: "c2" }]);
    expect(s).toMatchObject({ category_id: "c3", via: "nome" });
  });
  it("nunca sugere A Classificar nem L2", () => {
    const s = suggestCategoryForCostCenter("A classificar", cats);
    expect(s?.category_id).not.toBe("acl");
    expect(s?.category_id).not.toBe("l2");
  });
  it("sem semelhança → null", () => {
    expect(suggestCategoryForCostCenter("zzzz", cats)).toBeNull();
  });
});

describe("resolveCostCenter", () => {
  it("mapa primeiro, depois nome exacto, senão null", () => {
    const map = new Map([["cache artistico", "c1"]]);
    expect(resolveCostCenter("Cachê Artístico", map, cats)).toBe("c1");
    expect(resolveCostCenter("seguros", new Map(), cats)).toBeNull(); // parent_id null → não é L3 no critério antigo
    expect(resolveCostCenter("Cachês", new Map(), cats)).toBe("c1");
    expect(resolveCostCenter("", map, cats)).toBeNull();
  });
});
