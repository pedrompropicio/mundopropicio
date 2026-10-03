import { describe, expect, it } from "vitest";
import { EVENT_NATURES, eventNatureLabel } from "../event-nature";

describe("eventNatureLabel", () => {
  it("devolve os cinco rótulos pt-PT e o fallback opcional", () => {
    expect(EVENT_NATURES).toHaveLength(5);
    expect(eventNatureLabel("producao_propria")).toBe("Produção própria");
    expect(eventNatureLabel("intermediacao")).toBe("Intermediação");
    expect(eventNatureLabel("coproducao")).toBe("Coprodução");
    expect(eventNatureLabel("parceiro_local")).toBe("Parceiro local");
    expect(eventNatureLabel("temporada")).toBe("Temporada");
    expect(eventNatureLabel(null)).toBe("— por definir —");
  });
});