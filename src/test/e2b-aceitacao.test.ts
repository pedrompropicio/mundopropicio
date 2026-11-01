import { describe, expect, it } from "vitest";
import { limiteDaValidade } from "@/lib/executor/travas";

describe("limiteDaValidade (aceitação E2b)", () => {
  it("data com hora devolve esse minuto com segundos 59", () => {
    expect(limiteDaValidade("validade 2026-11-03T08:15")?.toISOString()).toBe("2026-11-03T08:15:59.000Z");
  });

  it("texto sem data devolve null", () => {
    expect(limiteDaValidade("sem prazo")).toBeNull();
  });
});
