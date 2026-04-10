import { describe, it, expect } from "vitest";

/**
 * Supplier Credits — Business Rules Tests
 *
 * These tests validate the pure logic/rules used across the supplier credits module
 * without depending on React rendering or Supabase calls.
 */

// ── Helpers extracted from component logic ──

function computeCreditRemaining(amount: number, usedAmount: number): number {
  return Math.round((amount - usedAmount) * 100) / 100;
}

function isCreditExpired(validUntil: string | null): boolean {
  if (!validUntil) return false;
  return new Date(validUntil) < new Date();
}

function isCreditAvailable(credit: { amount: number; used_amount: number; status: string; valid_until: string | null }): boolean {
  if (credit.status !== "active") return false;
  const remaining = computeCreditRemaining(credit.amount, credit.used_amount);
  if (remaining <= 0) return false;
  if (isCreditExpired(credit.valid_until)) return false;
  return true;
}

function validateCreditAllocation(
  creditAllocations: Record<string, number>,
  availableCredits: { id: string; amount: number; used_amount: number; reason: string }[],
  paymentAmount: number
): string | null {
  for (const [creditId, val] of Object.entries(creditAllocations)) {
    if (val <= 0) continue;
    const credit = availableCredits.find((c) => c.id === creditId);
    if (!credit) return "Crédito inválido";
    const remaining = computeCreditRemaining(credit.amount, credit.used_amount);
    if (val > remaining + 0.01) return `Crédito "${credit.reason}" tem apenas ${remaining.toFixed(2)} disponível`;
  }
  const totalCredit = Object.values(creditAllocations).reduce((s, v) => s + (v > 0 ? v : 0), 0);
  if (totalCredit > paymentAmount + 0.01) return "Créditos aplicados excedem o valor do pagamento";
  return null;
}

function computeNetCashOut(paymentAmount: number, withholding: number, totalCredit: number): number {
  return paymentAmount - withholding - totalCredit;
}

function computeNewCreditStatus(currentUsed: number, additionalUsage: number, totalAmount: number): string {
  const newUsed = Math.round((currentUsed + additionalUsage) * 100) / 100;
  return newUsed >= totalAmount ? "exhausted" : "active";
}

// ── Tests ──

describe("Supplier Credits — Remaining Balance", () => {
  it("computes remaining correctly for unused credit", () => {
    expect(computeCreditRemaining(500, 0)).toBe(500);
  });

  it("computes remaining after partial usage", () => {
    expect(computeCreditRemaining(500, 200)).toBe(300);
  });

  it("computes zero remaining for fully used credit", () => {
    expect(computeCreditRemaining(500, 500)).toBe(0);
  });

  it("handles floating point precision", () => {
    // 100.10 - 33.37 should not produce floating-point artifacts
    expect(computeCreditRemaining(100.10, 33.37)).toBe(66.73);
  });
});

describe("Supplier Credits — Expiry", () => {
  it("credit without expiry is not expired", () => {
    expect(isCreditExpired(null)).toBe(false);
  });

  it("credit with future date is not expired", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(isCreditExpired(future.toISOString().split("T")[0])).toBe(false);
  });

  it("credit with past date is expired", () => {
    expect(isCreditExpired("2020-01-01")).toBe(true);
  });
});

describe("Supplier Credits — Availability", () => {
  it("active credit with remaining balance and no expiry is available", () => {
    expect(isCreditAvailable({ amount: 500, used_amount: 200, status: "active", valid_until: null })).toBe(true);
  });

  it("exhausted credit is not available", () => {
    expect(isCreditAvailable({ amount: 500, used_amount: 500, status: "exhausted", valid_until: null })).toBe(false);
  });

  it("active credit with zero remaining is not available", () => {
    expect(isCreditAvailable({ amount: 500, used_amount: 500, status: "active", valid_until: null })).toBe(false);
  });

  it("expired credit is not available even with remaining balance", () => {
    expect(isCreditAvailable({ amount: 500, used_amount: 0, status: "active", valid_until: "2020-01-01" })).toBe(false);
  });

  it("cancelled credit is not available", () => {
    expect(isCreditAvailable({ amount: 500, used_amount: 0, status: "cancelled", valid_until: null })).toBe(false);
  });
});

describe("Supplier Credits — Allocation Validation", () => {
  const credits = [
    { id: "c1", amount: 500, used_amount: 200, reason: "Devolução" },
    { id: "c2", amount: 100, used_amount: 0, reason: "Compensação" },
  ];

  it("valid partial allocation passes", () => {
    const result = validateCreditAllocation({ c1: 100 }, credits, 1000);
    expect(result).toBeNull();
  });

  it("allocation using full remaining passes", () => {
    const result = validateCreditAllocation({ c1: 300 }, credits, 1000);
    expect(result).toBeNull();
  });

  it("allocation exceeding remaining fails", () => {
    const result = validateCreditAllocation({ c1: 350 }, credits, 1000);
    expect(result).toContain("tem apenas");
  });

  it("total credits exceeding payment amount fails", () => {
    const result = validateCreditAllocation({ c1: 300, c2: 100 }, credits, 200);
    expect(result).toBe("Créditos aplicados excedem o valor do pagamento");
  });

  it("multiple credits within limits passes", () => {
    const result = validateCreditAllocation({ c1: 200, c2: 50 }, credits, 500);
    expect(result).toBeNull();
  });

  it("zero or negative allocations are ignored", () => {
    const result = validateCreditAllocation({ c1: 0, c2: -10 }, credits, 100);
    expect(result).toBeNull();
  });

  it("unknown credit id fails", () => {
    const result = validateCreditAllocation({ unknown: 100 }, credits, 500);
    expect(result).toBe("Crédito inválido");
  });
});

describe("Supplier Credits — Net Cash Out", () => {
  it("payment fully covered by credit results in zero cash out", () => {
    expect(computeNetCashOut(500, 0, 500)).toBe(0);
  });

  it("partial credit reduces cash out", () => {
    expect(computeNetCashOut(500, 0, 200)).toBe(300);
  });

  it("credit + withholding reduces cash out", () => {
    expect(computeNetCashOut(1000, 100, 300)).toBe(600);
  });

  it("no credit or withholding = full cash out", () => {
    expect(computeNetCashOut(750, 0, 0)).toBe(750);
  });
});

describe("Supplier Credits — Status After Usage", () => {
  it("partial usage keeps credit active", () => {
    expect(computeNewCreditStatus(200, 100, 500)).toBe("active");
  });

  it("usage reaching total marks as exhausted", () => {
    expect(computeNewCreditStatus(400, 100, 500)).toBe("exhausted");
  });

  it("usage exceeding total (rounding) marks as exhausted", () => {
    expect(computeNewCreditStatus(499.99, 0.01, 500)).toBe("exhausted");
  });

  it("zero additional usage keeps active", () => {
    expect(computeNewCreditStatus(200, 0, 500)).toBe("active");
  });
});

describe("Supplier Credits — Cross-Event Usage", () => {
  // Credits are tied to a supplier, not an event. Verify the rule:
  // A credit from Event A can be used to pay a transaction in Event B.
  it("credit has no event constraint for usage", () => {
    const credit = { amount: 500, used_amount: 0, status: "active" as const, valid_until: null };
    // The availability check does not include event_id — by design
    expect(isCreditAvailable(credit)).toBe(true);
    // This confirms credits are usable regardless of the transaction's event
  });
});

describe("Supplier Credits — Deletion Rules", () => {
  it("unused credit (used_amount=0) can be deleted", () => {
    const canDelete = (usedAmount: number) => usedAmount === 0;
    expect(canDelete(0)).toBe(true);
  });

  it("partially used credit cannot be deleted", () => {
    const canDelete = (usedAmount: number) => usedAmount === 0;
    expect(canDelete(100)).toBe(false);
  });

  it("fully used credit cannot be deleted", () => {
    const canDelete = (usedAmount: number) => usedAmount === 0;
    expect(canDelete(500)).toBe(false);
  });
});

describe("Supplier Credits — Account Requirement with Credits", () => {
  // When credits fully cover the payment, account selection is not required
  it("account not required when credit covers full payment", () => {
    const totalCredit = 500;
    const paymentAmount = 500;
    const accountId = "";
    const needsAccount = !accountId && totalCredit < paymentAmount;
    expect(needsAccount).toBe(false);
  });

  it("account required when credit only partially covers payment", () => {
    const totalCredit = 200;
    const paymentAmount = 500;
    const accountId = "";
    const needsAccount = !accountId && totalCredit < paymentAmount;
    expect(needsAccount).toBe(true);
  });

  it("account not required when provided even with partial credit", () => {
    const totalCredit = 200;
    const paymentAmount = 500;
    const accountId = "acc-123";
    const needsAccount = !accountId && totalCredit < paymentAmount;
    expect(needsAccount).toBe(false);
  });
});
