import { describe, it, expect } from "vitest";
import { TICKET_CATEGORY_CODE, findTicketCategoryId } from "@/lib/ticket-category";

const bilheteira = { id: "cat-1101", code: "1.1.01", name: "Venda de Bilhetes" };
const merch = { id: "cat-1102", code: "1.1.02", name: "Merchandising" };

describe("findTicketCategoryId — rubrica de bilheteira pelo código", () => {
  it("encontra por código 1.1.01", () => {
    expect(findTicketCategoryId([merch, bilheteira])).toBe("cat-1101");
    expect(TICKET_CATEGORY_CODE).toBe("1.1.01");
  });

  it("devolve null quando não existe", () => {
    expect(findTicketCategoryId([merch, { id: "cat-1201", code: "1.2.01", name: "Patrocínio" }])).toBeNull();
  });

  it("NÃO escolhe «Bilheteira local (recebida da sala)» com código diferente, mesmo antes na lista", () => {
    const sala = { id: "cat-9001", code: "1.1.05", name: "Bilheteira local (recebida da sala)" };
    expect(findTicketCategoryId([sala, bilheteira])).toBe("cat-1101");
    expect(findTicketCategoryId([sala])).toBeNull();
  });

  it("lista vazia, null e undefined devolvem null", () => {
    expect(findTicketCategoryId([])).toBeNull();
    expect(findTicketCategoryId(null)).toBeNull();
    expect(findTicketCategoryId(undefined)).toBeNull();
  });
});
