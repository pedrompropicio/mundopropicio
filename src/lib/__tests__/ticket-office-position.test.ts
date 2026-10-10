import { describe, expect, it } from "vitest";
import { statementTypeTotals, ticketOfficePosition } from "../ticket-office-position";

describe("posição da bilheteira #303", () => {
  it("inclui liquidados a zero e exclui eventos com fecho OU apuramento", () => {
    const result = ticketOfficePosition([
      { id: "mm", name: "M&M", balance: 0 },
      { id: "rg", name: "RG", balance: 248692 },
      { id: "closed", name: "Fechado", balance: 100 },
      { id: "statement", name: "Apurado", balance: 200 },
    ], ["closed"], ["statement"], -49050.59, 207301.17);
    expect(result.openEvents.map((event) => event.id)).toEqual(["mm", "rg"]);
    expect(result.openTotal).toBe(248692);
    expect(result.advanced).toBe(49050.59);
    expect(result.calendarDifference).toBe(7659.76);
    expect(Math.round((result.openTotal - result.advanced + result.calendarDifference) * 100)).toBe(20730117);
  });
  it("preserva a posição positiva como valor a entregar", () => {
    expect(ticketOfficePosition([], [], [], 100, 100).calendarDifference).toBe(0);
  });
  it("soma os tipos do 3163 ao cêntimo", () => {
    const result = statementTypeTotals([
      { line_type: "event_right", amount: 194527.58 },
      { line_type: "event_right", amount: 226454.85 },
      { line_type: "event_right", amount: 20659 },
      { line_type: "venue_settlement", amount: -265 },
      { line_type: "ticketline_invoice", amount: -20010.65 },
      { line_type: "advance", amount: -199000 },
      { line_type: "carry_over", amount: -271416.37 },
    ]);
    expect(result.event_right).toBe(441641.43);
    expect(Math.round(Object.values(result).reduce((sum, value) => sum + value, 0) * 100)).toBe(-4905059);
  });
});