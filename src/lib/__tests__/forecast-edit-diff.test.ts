import { describe, expect, it } from "vitest";
import { forecastEditDiff, preserveUnchangedForecastText } from "../forecast-edit-diff";

describe("#249 forecast edit changes", () => {
  it("preserves a description's trailing space instead of auditing it", () => {
    expect(preserveUnchangedForecastText("Som", "Som ")).toBe("Som ");
    expect(forecastEditDiff({ description: "Som ", amount: "100" }, {
      description: preserveUnchangedForecastText("Som", "Som "), amount: 100,
    })).toEqual({});
  });
  it("includes only genuinely changed values for write and undo", () => {
    expect(forecastEditDiff({ description: "Som ", amount: 100, notes: null }, {
      description: "Som ", amount: 120, notes: null,
    })).toEqual({ amount: 120 });
  });
  it("normalizes new text, not unchanged stored text", () => {
    expect(preserveUnchangedForecastText(" Luz ", "Som ")).toBe("Luz");
  });
});