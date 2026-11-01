import { describe, expect, it } from "vitest";
import { suggestPattern } from "./rules";

describe("suggestPattern (#402)", () => {
  it("corta sufixo curto depois de '/ '", () => {
    expect(suggestPattern("COB.REC.31.000321941892096/ 15")).toBe("cob.rec.31.000321941892096/");
  });
  it("corta sufixo curto depois de '/', espaço e '.'", () => {
    expect(suggestPattern("COB.REC.31.000321941892096/15")).toBe("cob.rec.31.000321941892096/");
    expect(suggestPattern("PAGAMENTO SERVICOS LISBOA 7")).toBe("pagamento servicos lisboa");
    expect(suggestPattern("PAGAMENTO SERVICOS LISBOA.12")).toBe("pagamento servicos lisboa");
  });
  it("mantém o corte de '-NNNN' colado (não regride)", () => {
    expect(suggestPattern("DÉBITO DIRETO-MERCEDES-BENZ-00016995740")).toBe(
      "debito direto-mercedes-benz",
    );
  });
  it("mantém o número de identidade (apólice)", () => {
    expect(suggestPattern("DÉBITO DIRETO-AEGON SANTANDER -115278470")).toBe(
      "debito direto-aegon santander -115278470",
    );
  });
});
