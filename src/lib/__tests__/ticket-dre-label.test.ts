import { describe, it, expect } from "vitest";
import { buildDREForExport } from "@/lib/export-dre";
import { isTicketDreLine, ticketDreDisplayLabel } from "@/lib/ticket-category";

const categories = [
  { id: "r1", code: "1", name: "Receitas", parent_id: null },
  { id: "g11", code: "1.1", name: "Receitas de evento", parent_id: "r1" },
  { id: "c1101", code: "1.1.01", name: "Venda de Bilhetes", parent_id: "g11" },
  { id: "c1102", code: "1.1.02", name: "Merchandising", parent_id: "g11" },
  { id: "r2", code: "2", name: "Despesas", parent_id: null },
  { id: "g26", code: "2.6", name: "Operação", parent_id: "r2" },
  { id: "c2607", code: "2.6.07", name: "Comissão da ticketeira/bilheteiras", parent_id: "g26" },
  { id: "c2613", code: "2.6.13", name: "Controlo de acesso e staff de bilheteira", parent_id: "g26" },
];

const tx = (type: "income" | "expense", category_id: string) => ({
  type, category_id, amount: 100, iva_rate: 6, event_id: "ev1",
});

describe("rótulo de bilheteira só pelo código 1.1.01", () => {
  it("função partilhada: só 1.1.01 recebe o sufixo", () => {
    expect(isTicketDreLine({ label: "Venda de Bilhetes", code: "1.1.01" })).toBe(true);
    expect(ticketDreDisplayLabel({ label: "Venda de Bilhetes", code: "1.1.01" })).toBe("Venda de Bilhetes (-6% IVA)");
    expect(ticketDreDisplayLabel({ label: "Bilheteira local", code: "1.1.05" })).toBe("Bilheteira local");
    expect(ticketDreDisplayLabel({ label: "Venda de Bilhetes" })).toBe("Venda de Bilhetes");
    // despesa nunca, mesmo com o código certo por engano
    expect(isTicketDreLine({ label: "x", code: "1.1.01", isExpenseSide: true })).toBe(false);
  });

  it("2.6.07 e 2.6.13 (despesa, «bilheteira» no nome) não são bilheteira", () => {
    for (const [label, code] of [
      ["Comissão da ticketeira/bilheteiras", "2.6.07"],
      ["Controlo de acesso e staff de bilheteira", "2.6.13"],
    ]) {
      expect(isTicketDreLine({ label, code })).toBe(false);
      expect(isTicketDreLine({ label, code, isExpenseSide: true })).toBe(false);
      expect(ticketDreDisplayLabel({ label, code })).toBe(label);
    }
  });

  it("buildDREForExport (usado por Excel/PDF e pelo DRE Brasil): as linhas trazem o código e só a 1.1.01 é bilheteira", () => {
    const lines = buildDREForExport(
      [tx("income", "c1101"), tx("income", "c1102"), tx("expense", "c2607"), tx("expense", "c2613")],
      categories, "transactions", [], [], [], "ev1", "c1101", [], [], true, [],
    );
    const ticketLabels = lines.filter((l) => isTicketDreLine(l)).map((l) => l.label);
    expect(ticketLabels).toEqual(["Venda de Bilhetes"]);
    expect(lines.find((l) => l.code === "2.6.07")).toBeDefined();
    expect(lines.find((l) => l.code === "2.6.13")).toBeDefined();
    const shown = lines.map((l) => ticketDreDisplayLabel(l));
    expect(shown).toContain("Venda de Bilhetes (-6% IVA)");
    expect(shown).toContain("Comissão da ticketeira/bilheteiras");
    expect(shown).toContain("Controlo de acesso e staff de bilheteira");
    expect(shown.filter((s) => s.includes("-6% IVA"))).toHaveLength(1);
  });
});
