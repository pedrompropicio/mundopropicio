import { describe, it, expect } from "vitest";
import { validatePassword, PASSWORD_RULES } from "../PasswordStrengthIndicator";

describe("validatePassword", () => {
  it("rejects short password", () => {
    expect(validatePassword("Ab1!")).not.toBeNull();
  });
  it("rejects password without uppercase", () => {
    expect(validatePassword("abcdefg1!")).not.toBeNull();
  });
  it("rejects password without number", () => {
    expect(validatePassword("Abcdefgh!")).not.toBeNull();
  });
  it("rejects password without special char", () => {
    expect(validatePassword("Abcdefg1")).not.toBeNull();
  });
  it("accepts strong password", () => {
    expect(validatePassword("Abcdefg1!")).toBeNull();
  });
});

describe("PASSWORD_RULES", () => {
  it("has 4 rules", () => {
    expect(PASSWORD_RULES).toHaveLength(4);
  });
  it("each rule has label and test function", () => {
    PASSWORD_RULES.forEach((rule) => {
      expect(rule.label).toBeTruthy();
      expect(typeof rule.test).toBe("function");
    });
  });
});
