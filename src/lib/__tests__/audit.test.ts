import { describe, it, expect, vi } from "vitest";
import { getAuditUser } from "../audit";

describe("getAuditUser", () => {
  it("returns full_name when available", () => {
    expect(getAuditUser({ user_metadata: { full_name: "João" }, email: "j@x.com" })).toBe("João");
  });
  it("falls back to email", () => {
    expect(getAuditUser({ user_metadata: {}, email: "j@x.com" })).toBe("j@x.com");
  });
  it("returns sistema for null user", () => {
    expect(getAuditUser(null)).toBe("sistema");
  });
  it("returns sistema for undefined", () => {
    expect(getAuditUser(undefined)).toBe("sistema");
  });
});
