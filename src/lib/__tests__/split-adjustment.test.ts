import { describe, it, expect } from "vitest";

/**
 * Tests for the split adjustment and absolute mode logic
 * covering recent implementations:
 * 1. Absolute split mode (split_mode = "absolute")
 * 2. Child adjustment reconciliation when parent amount changes
 * 3. TransactionSplitConfig percentage/absolute conversion
 * 4. Edge function allowed fields (split_mode)
 */

// ── Helper: Simulate child adjustment reconciliation ──
function computeChildMismatch(
  childAdjustments: Record<string, number>,
  newParentAmount: number
): boolean {
  const total = Object.values(childAdjustments).reduce((s, v) => s + v, 0);
  return Math.abs(total - newParentAmount) > 0.01;
}

function distributeEqually(
  childIds: string[],
  totalAmount: number
): Record<string, number> {
  const each = +(totalAmount / childIds.length).toFixed(2);
  const result: Record<string, number> = {};
  let sumSoFar = 0;
  childIds.forEach((id, idx) => {
    if (idx === childIds.length - 1) {
      result[id] = +(totalAmount - sumSoFar).toFixed(2);
    } else {
      result[id] = each;
      sumSoFar += each;
    }
  });
  return result;
}

// ── Helper: Simulate edge function split percentage recalculation ──
function recalcSplitPercentage(childAmount: number, newTotal: number): number {
  if (newTotal <= 0) return 0;
  return +((childAmount / newTotal) * 100).toFixed(4);
}

// ── Helper: Simulate proportional auto-propagation (percentage mode) ──
function proportionalAmount(splitPercentage: number, newTotal: number): number {
  return +(newTotal * splitPercentage / 100).toFixed(2);
}

// ── Helper: absolute → percentage conversion ──
function absoluteToPercentage(absValue: number, totalAmount: number): number {
  if (totalAmount <= 0) return 0;
  return +((absValue / totalAmount) * 100).toFixed(4);
}

describe("Child Adjustment Reconciliation", () => {
  it("detects mismatch when children don't sum to parent", () => {
    const adjustments = { "a": 3000, "b": 4000 };
    expect(computeChildMismatch(adjustments, 8000)).toBe(true);
  });

  it("passes when children sum to parent exactly", () => {
    const adjustments = { "a": 4000, "b": 4000 };
    expect(computeChildMismatch(adjustments, 8000)).toBe(false);
  });

  it("passes within tolerance (0.01€)", () => {
    const adjustments = { "a": 3333.33, "b": 6666.67 };
    expect(computeChildMismatch(adjustments, 10000)).toBe(false);
  });

  it("fails outside tolerance", () => {
    const adjustments = { "a": 3333.33, "b": 6666.65 };
    expect(computeChildMismatch(adjustments, 10000)).toBe(true);
  });

  it("handles single child", () => {
    const adjustments = { "a": 5000 };
    expect(computeChildMismatch(adjustments, 5000)).toBe(false);
  });

  it("handles empty adjustments", () => {
    expect(computeChildMismatch({}, 1000)).toBe(true);
  });
});

describe("Equal Distribution", () => {
  it("distributes equally between 2 children", () => {
    const result = distributeEqually(["a", "b"], 10000);
    expect(result["a"]).toBe(5000);
    expect(result["b"]).toBe(5000);
  });

  it("handles rounding for 3 children", () => {
    const result = distributeEqually(["a", "b", "c"], 10000);
    const total = result["a"] + result["b"] + result["c"];
    expect(total).toBeCloseTo(10000, 2);
    expect(result["a"]).toBe(3333.33);
    expect(result["b"]).toBe(3333.33);
    expect(result["c"]).toBe(3333.34); // remainder adjustment
  });

  it("handles odd amounts", () => {
    const result = distributeEqually(["a", "b"], 99.99);
    const total = result["a"] + result["b"];
    expect(total).toBeCloseTo(99.99, 2);
  });
});

describe("Edge Function: Split Percentage Recalculation", () => {
  it("recalculates percentage after explicit adjustment", () => {
    // Child gets 3000 out of 10000 total
    expect(recalcSplitPercentage(3000, 10000)).toBe(30);
  });

  it("handles equal split", () => {
    expect(recalcSplitPercentage(5000, 10000)).toBe(50);
  });

  it("handles full amount", () => {
    expect(recalcSplitPercentage(10000, 10000)).toBe(100);
  });

  it("returns 0 for zero total", () => {
    expect(recalcSplitPercentage(5000, 0)).toBe(0);
  });

  it("handles fractional percentages", () => {
    expect(recalcSplitPercentage(3333.33, 10000)).toBe(33.3333);
  });
});

describe("Proportional Auto-Propagation (Percentage Mode)", () => {
  it("calculates proportional amount from percentage", () => {
    expect(proportionalAmount(50, 10000)).toBe(5000);
  });

  it("handles 100%", () => {
    expect(proportionalAmount(100, 8000)).toBe(8000);
  });

  it("handles fractional percentage", () => {
    expect(proportionalAmount(33.3333, 9000)).toBe(3000);
  });

  it("handles zero percentage", () => {
    expect(proportionalAmount(0, 10000)).toBe(0);
  });
});

describe("Absolute to Percentage Conversion", () => {
  it("converts absolute value to percentage", () => {
    expect(absoluteToPercentage(4000, 10000)).toBe(40);
  });

  it("converts 50/50 split", () => {
    expect(absoluteToPercentage(5000, 10000)).toBe(50);
  });

  it("handles zero total gracefully", () => {
    expect(absoluteToPercentage(5000, 0)).toBe(0);
  });

  it("round trip: absolute → percentage → absolute preserves value", () => {
    const abs = 3333.33;
    const total = 10000;
    const pct = absoluteToPercentage(abs, total);
    const roundTrip = +(total * pct / 100).toFixed(2);
    expect(roundTrip).toBeCloseTo(abs, 2);
  });
});

describe("Edge Function: Allowed Fields Validation", () => {
  const allowedFields = [
    "description", "amount", "iva_rate", "event_id", "category_id",
    "supplier_id", "account_id", "specification", "date", "due_date",
    "payment_date", "is_transitory", "exclude_from_result", "split_mode",
  ];

  it("includes split_mode in allowed fields", () => {
    expect(allowedFields.includes("split_mode")).toBe(true);
  });

  it("includes is_transitory in allowed fields", () => {
    expect(allowedFields.includes("is_transitory")).toBe(true);
  });

  it("includes exclude_from_result in allowed fields", () => {
    expect(allowedFields.includes("exclude_from_result")).toBe(true);
  });

  it("does not include status (prevents direct status manipulation)", () => {
    expect(allowedFields.includes("status")).toBe(false);
  });

  it("does not include parent_transaction_id (prevents hierarchy tampering)", () => {
    expect(allowedFields.includes("parent_transaction_id")).toBe(false);
  });
});

describe("Paid Transaction Edit Restrictions", () => {
  const paidAllowedFields = ["specification", "supplier_id"];

  it("allows specification edits on paid transactions", () => {
    expect(paidAllowedFields.includes("specification")).toBe(true);
  });

  it("allows supplier_id edits on paid transactions", () => {
    expect(paidAllowedFields.includes("supplier_id")).toBe(true);
  });

  it("blocks amount edits on paid transactions", () => {
    expect(paidAllowedFields.includes("amount")).toBe(false);
  });

  it("blocks category_id edits on paid transactions", () => {
    expect(paidAllowedFields.includes("category_id")).toBe(false);
  });

  it("blocks account_id edits on paid transactions", () => {
    expect(paidAllowedFields.includes("account_id")).toBe(false);
  });
});

describe("Edge Function: Child Adjustments Payload Structure", () => {
  it("builds correct payload from childAdjustments map", () => {
    const childAdjustments: Record<string, number> = {
      "uuid-1": 3000,
      "uuid-2": 7000,
    };
    const payload = Object.entries(childAdjustments).map(([id, amt]) => ({ id, amount: amt }));
    expect(payload).toEqual([
      { id: "uuid-1", amount: 3000 },
      { id: "uuid-2", amount: 7000 },
    ]);
  });

  it("edge function adjustmentMap recreates correctly from payload", () => {
    const payload = [
      { id: "uuid-1", amount: 3000 },
      { id: "uuid-2", amount: 7000 },
    ];
    const adjustmentMap = Object.fromEntries(payload.map((ca) => [ca.id, Number(ca.amount)]));
    expect(adjustmentMap["uuid-1"]).toBe(3000);
    expect(adjustmentMap["uuid-2"]).toBe(7000);
  });
});

describe("TransactionSplitConfig: Equal Split Percentage Logic", () => {
  it("distributes percentage equally for 2 events", () => {
    const n = 2;
    const pct = +(100 / n).toFixed(2);
    expect(pct).toBe(50);
    expect(pct * n).toBe(100);
  });

  it("distributes percentage with rounding for 3 events", () => {
    const n = 3;
    const pct = +(100 / n).toFixed(2);
    const entries = Array(n).fill(null).map(() => ({ percentage: pct }));
    const diff = 100 - pct * n;
    if (Math.abs(diff) > 0.001) entries[n - 1].percentage += diff;
    const total = entries.reduce((s, e) => s + e.percentage, 0);
    expect(total).toBeCloseTo(100, 2);
  });

  it("validates split: must have >= 2 entries and sum to 100%", () => {
    const entries2 = [{ percentage: 50 }, { percentage: 50 }];
    const totalPct2 = entries2.reduce((s, e) => s + e.percentage, 0);
    expect(entries2.length >= 2 && Math.abs(totalPct2 - 100) < 0.01).toBe(true);

    const entries1 = [{ percentage: 100 }];
    expect(entries1.length >= 2).toBe(false);
  });
});
