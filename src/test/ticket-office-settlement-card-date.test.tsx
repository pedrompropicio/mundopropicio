import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, isAdmin: false, hasPermission: () => false }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [{ id: "s1", status: "confirmed", settlement_date: "2026-10-09", created_at: "2026-10-09T00:00:00Z", events: { name: "Evento", date: "2026-10-03" }, net_calculated: 0, transfer: { status: "paid", payment_date: "2026-10-09" } }], isLoading: false }),
  useMutation: () => ({}), useQueryClient: () => ({}),
}));
vi.mock("@/components/TicketOfficeSettlementModal", () => ({ TicketOfficeSettlementModal: () => null }));
vi.mock("@/components/TicketOfficeSettlementViewDialog", () => ({ TicketOfficeSettlementViewDialog: () => null }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
import { TicketOfficeSettlementsPanel } from "@/components/TicketOfficeSettlementsPanel";

afterEach(() => vi.restoreAllMocks());
describe("Datas civis nos cartões de fecho", () => {
  it("mantém 09/10 em Fortaleza, também na data do crédito", () => {
    // Simula a formatação do browser num fuso atrás de Lisboa: o código antigo
    // formataria a meia-noite UTC como 08/10, independentemente do TZ do runner.
    const original = Date.prototype.toLocaleDateString;
    vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(function (this: Date, locales, options) {
      return original.call(this, locales, { ...options, timeZone: "America/Fortaleza" });
    });
    expect(new Date("2026-10-09").toLocaleDateString("pt-PT")).toBe("08/10/2026");
    const { container } = render(<TicketOfficeSettlementsPanel officeId="tl" officeName="Ticketline" />);
    expect(container.textContent).toContain("03/10/2026 • Fecho em 09/10/2026");
    expect(container.querySelector('[title="Crédito em 09/10/2026"]')).toBeTruthy();
    expect(container.textContent).not.toContain("08/10/2026");
  });
});