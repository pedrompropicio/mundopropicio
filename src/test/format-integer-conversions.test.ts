import { describe, it, expect } from "vitest";
import { formatInteger } from "@/lib/crm/dashboard-format";
describe("formatInteger (card Conversões)", () => {
  it("arredonda conversões fracionárias da Meta", () => {
    expect(formatInteger(1194.973141)).toBe("1\u00a0195");
  });
  it("zero e nulos", () => {
    expect(formatInteger(0)).toBe("0");
    expect(formatInteger(null)).toBe("—");
  });
  it("milhões", () => expect(formatInteger(1234567.4)).toBe("1\u00a0234\u00a0567"));
});
