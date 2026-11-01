import { describe, expect, it } from "vitest";
import { limiteDaValidade } from "@/lib/executor/travas";

describe("E2b aceitação — limiteDaValidade", () => {
  it("devolve o limite com hora quando o texto tem data e hora", () => {
    expect(limiteDaValidade("validade 2026-11-03T08:15")?.toISOString()).toBe("2026-11-03T08:15:59.000Z");
  });

  it("devolve null quando o texto não tem data", () => {
    expect(limiteDaValidade("sem prazo")).toBeNull();
  });
});
