import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { SettlementReadContent } from "@/components/TicketOfficeSettlementViewDialog";
import { buildSettlementView, settlementPdfFileName, deductionGross } from "@/lib/ticket-office-settlement-view";

const base = {
  id: "s1",
  events: { name: "Deive Leonardo - Braga", date: "2026-10-03" },
  settlement_date: "2026-10-10",
  gross_revenue: 20392.15,
  total_deductions: 8.04,
  net_calculated: 20384.11,
  net_adjusted: null,
  net_transferred: 0,
  venue_retained_amount: 0,
};
const extras = {
  deductions: [{ id: "t1", description: "Ticketline — convite 3,70 + posto TL 4,34", supplier: "Ticketline", value: 8.04 }],
  statementNumber: "3163",
  closedByName: "Pedro",
};

describe("Ver fecho (só leitura)", () => {
  for (const status of ["draft", "confirmed"]) {
    it(`abre em ${status} com o direito do evento e sem adiantamentos`, () => {
      const v = buildSettlementView({ ...base, status, closed_at: status === "confirmed" ? "2026-10-10T12:00:00Z" : null }, "Ticketline", extras);
      const { container } = render(<SettlementReadContent v={v} />);
      expect(screen.getByText("Direito do evento")).toBeTruthy();
      expect(container.textContent).toContain("20384,11".replace(",", ",").slice(0, 2));
      expect(v.netFinal).toBe(20384.11);
      expect(container.textContent?.toLowerCase()).not.toContain("adiantad");
      expect(container.querySelectorAll("input, textarea, select, button, [contenteditable]").length).toBe(0);
      expect(container.textContent).toContain(status === "confirmed" ? "Fechado por Pedro" : "Rascunho");
    });
  }

  it("nome do ficheiro e valor da dedução", () => {
    expect(settlementPdfFileName("Deive Leonardo - Braga", "2026-10-10")).toBe("fecho-deive-leonardo-braga-2026-10-10.pdf");
    expect(deductionGross(5, 23)).toBe(6.15);
  });
});
