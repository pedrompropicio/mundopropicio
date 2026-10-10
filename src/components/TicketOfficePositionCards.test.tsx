import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { TicketOfficePositionCards } from "./TicketOfficePositionCards";

const query = vi.hoisted(() => ({ difference: 0 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    isLoading: false,
    error: null,
    data: {
      openTotal: 248772,
      advanced: 49050.59,
      retained: 199721.41,
      position: -49050.59,
      calendarDifference: query.difference,
      openEvents: [],
      calendarItems: [],
      latest: { number: "3163/2026" },
    },
  }),
}));

describe("TicketOfficePositionCards — observação condicional", () => {
  it.each([0, 0.009, -0.009])("omite observação abaixo de um cêntimo: %s", (difference) => {
    query.difference = difference;
    const html = renderToStaticMarkup(<MemoryRouter><TicketOfficePositionCards officeId="ticketline" /></MemoryRouter>);
    expect(html).toContain("Saldo retido");
    expect(html).toContain("Valor por apurar");
    expect(html).toContain("Já adiantado");
    expect(html).not.toContain("Diferença de calendário:");
    expect(html).not.toContain("Dinheiro verdadeiro que a bilheteira tem");
    expect(html).not.toContain("Tudo certo");
  });

  it.each([0.01, -0.01, 265, -265])("preserva observação a partir de um cêntimo: %s", (difference) => {
    query.difference = difference;
    const html = renderToStaticMarkup(<MemoryRouter><TicketOfficePositionCards officeId="ticketline" /></MemoryRouter>);
    expect(html).toContain("Diferença de calendário:");
    expect(html).toContain("Dinheiro verdadeiro que a bilheteira tem");
  });
});