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
import { filterEventsByNature } from "../event-nature";

describe("filterEventsByNature (#256 fase 2)", () => {
  const fixture = [
    { id: "a", event_nature: "producao_propria", income: 1000, expense: 400 },
    { id: "b", event_nature: "intermediacao", income: 105553.14, expense: 0 },
    { id: "c", event_nature: "coproducao", income: 250.5, expense: 300.25 },
    { id: "d", event_nature: "temporada", income: 10, expense: 1 },
  ];
  const total = (evs: typeof fixture) =>
    Math.round(evs.reduce((s, e) => s + e.income - e.expense, 0) * 100) / 100;

  it("filtro vazio devolve o mesmo conjunto e o mesmo total", () => {
    const out = filterEventsByNature(fixture, []);
    expect(out).toBe(fixture);
    expect(total(out)).toBe(total(fixture));
  });

  it("todas as naturezas seleccionadas = resultado idêntico", () => {
    const out = filterEventsByNature(fixture, EVENT_NATURES.map((n) => n.value));
    expect(out).toBe(fixture);
    expect(total(out)).toBe(total(fixture));
  });

  it("filtro parcial só restringe o conjunto", () => {
    const out = filterEventsByNature(fixture, ["intermediacao"]);
    expect(out.map((e) => e.id)).toEqual(["b"]);
    expect(total(out)).toBe(105553.14);
  });
});
