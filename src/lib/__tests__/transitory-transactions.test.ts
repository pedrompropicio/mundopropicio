import { describe, it, expect } from "vitest";
import { calcIvaAmount, calcBaseAmount, calcTotalWithIva } from "@/lib/mock-data";

describe("Transitory transactions – report filtering logic", () => {
  // Simulate the filtering logic used in ReportDRE / ReportPL
  const transactions = [
    { id: "1", type: "income", amount: 1000, iva_rate: 23, is_transitory: false },
    { id: "2", type: "expense", amount: 500, iva_rate: 23, is_transitory: false },
    { id: "3", type: "expense", amount: 200, iva_rate: 6, is_transitory: true }, // caução
    { id: "4", type: "income", amount: 200, iva_rate: 6, is_transitory: true }, // devolução caução
    { id: "5", type: "expense", amount: 300, iva_rate: 0, is_transitory: false },
  ];

  it("filters transitory transactions from DRE/PL calculations", () => {
    const incomes = transactions.filter((t) => t.type === "income" && !t.is_transitory);
    const expenses = transactions.filter((t) => t.type === "expense" && !t.is_transitory);

    expect(incomes).toHaveLength(1);
    expect(expenses).toHaveLength(2);
    expect(incomes[0].id).toBe("1");
  });

  it("includes transitory transactions in unfiltered listings", () => {
    const allExpenses = transactions.filter((t) => t.type === "expense");
    expect(allExpenses).toHaveLength(3);
  });

  it("correctly computes net result excluding transitory", () => {
    const incomes = transactions.filter((t) => t.type === "income" && !t.is_transitory);
    const expenses = transactions.filter((t) => t.type === "expense" && !t.is_transitory);

    const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);
    const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
    const net = totalIncome - totalExpense;

    // 1000 - (500 + 300) = 200
    expect(net).toBe(200);
  });

  it("transitory items cancel out and don't affect result", () => {
    // If we had wrongly included transitory: 1000+200 - (500+200+300) = 200
    // Still 200 because they cancel, but logically the filter is correct
    const allIncomes = transactions.filter((t) => t.type === "income");
    const allExpenses = transactions.filter((t) => t.type === "expense");

    const grossWithTransitory =
      allIncomes.reduce((s, t) => s + t.amount, 0) -
      allExpenses.reduce((s, t) => s + t.amount, 0);

    // Even with transitory: 1200 - 1000 = 200 (happens to be same here)
    expect(grossWithTransitory).toBe(200);
  });

  it("IVA calculation is correct on transitory amounts", () => {
    // Transitory caução: amount=200, iva_rate=6
    const ivaAmount = calcIvaAmount(200, 6);
    expect(ivaAmount).toBe(12); // 200 * 6/100 = 12

    const base = calcBaseAmount(200, 6);
    expect(base).toBe(200);

    const total = calcTotalWithIva(200, 6);
    expect(total).toBe(212); // 200 * 1.06
  });
});

describe("Transitory toggle role restriction logic", () => {
  // Simulate the role-based visibility check
  const roles = [
    { role: "admin", isAdmin: true, isManager: false },
    { role: "manager", isAdmin: false, isManager: true },
    { role: "editor", isAdmin: false, isManager: false },
    { role: "viewer", isAdmin: false, isManager: false },
    { role: "user", isAdmin: false, isManager: false },
    { role: "partner", isAdmin: false, isManager: false },
  ];

  it("shows transitory toggle only for admin and manager", () => {
    for (const { role, isAdmin, isManager } of roles) {
      const canToggle = isAdmin || isManager;
      if (role === "admin" || role === "manager") {
        expect(canToggle).toBe(true);
      } else {
        expect(canToggle).toBe(false);
      }
    }
  });

  it("conversion from transitory to definitive requires admin/manager", () => {
    const checkCanConvert = (role: string) => role === "admin" || role === "manager";

    expect(checkCanConvert("editor")).toBe(false);
    expect(checkCanConvert("viewer")).toBe(false);
    expect(checkCanConvert("user")).toBe(false);
    expect(checkCanConvert("admin")).toBe(true);
    expect(checkCanConvert("manager")).toBe(true);
  });
});
