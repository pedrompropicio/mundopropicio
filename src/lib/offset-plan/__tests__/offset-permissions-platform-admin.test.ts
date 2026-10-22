import { describe, it, expect } from "vitest";
import { canApplyOffset, canReverseOffset } from "../contracts";
const N0 = { enabled: true, reverse_enabled: true };
const OFF = { enabled: false, reverse_enabled: false };
describe("permissões do encontro — platform_admin", () => {
  it("platform_admin aplica com enabled=true", () => expect(canApplyOffset(["platform_admin"], N0)).toBe(true));
  it("platform_admin não aplica com enabled=false", () => expect(canApplyOffset(["platform_admin"], { enabled: false, reverse_enabled: true })).toBe(false));
  it("platform_admin estorna com reverse_enabled=true", () => expect(canReverseOffset(["platform_admin"], { enabled: false, reverse_enabled: true })).toBe(true));
  it("platform_admin não estorna com reverse_enabled=false", () => expect(canReverseOffset(["platform_admin"], { enabled: true, reverse_enabled: false })).toBe(false));
  for (const r of ["viewer", "producer", "accountant", "partner"]) {
    it(`${r} não aplica nem estorna`, () => {
      expect(canApplyOffset([r], N0)).toBe(false);
      expect(canReverseOffset([r], N0)).toBe(false);
    });
  }
  for (const r of ["manager", "editor"]) {
    it(`${r} aplica mas não estorna`, () => {
      expect(canApplyOffset([r], N0)).toBe(true);
      expect(canReverseOffset([r], N0)).toBe(false);
    });
  }
  it("admin inalterado", () => {
    expect(canApplyOffset(["admin"], N0)).toBe(true);
    expect(canReverseOffset(["admin"], N0)).toBe(true);
    expect(canApplyOffset(["admin"], OFF)).toBe(false);
    expect(canReverseOffset(["admin"], OFF)).toBe(false);
  });
});
