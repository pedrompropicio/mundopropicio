import { describe, it, expect } from "vitest";
import { cn, compareHierarchicalCodes, sortByHierarchicalCode } from "../utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });
  it("resolves tailwind conflicts", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });
});

describe("compareHierarchicalCodes", () => {
  it("equal codes return 0", () => {
    expect(compareHierarchicalCodes("1.1", "1.1")).toBe(0);
  });
  it("sorts numerically not alphabetically", () => {
    expect(compareHierarchicalCodes("1.2", "1.10")).toBeLessThan(0);
  });
  it("handles null/undefined", () => {
    expect(compareHierarchicalCodes(null, "1")).toBeLessThan(0);
    expect(compareHierarchicalCodes("1", null)).toBeGreaterThan(0);
    expect(compareHierarchicalCodes(null, null)).toBe(0);
  });
  it("sorts parent before child", () => {
    expect(compareHierarchicalCodes("1", "1.1")).toBeLessThan(0);
  });
});

describe("sortByHierarchicalCode", () => {
  it("sorts items by code", () => {
    const items = [{ code: "2.1" }, { code: "1.1" }, { code: "1.2" }];
    const sorted = sortByHierarchicalCode(items, (i) => i.code);
    expect(sorted.map((i) => i.code)).toEqual(["1.1", "1.2", "2.1"]);
  });
});
