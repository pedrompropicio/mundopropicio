import { afterEach, describe, expect, it, vi } from "vitest";
import jsPDF from "jspdf";
import { buildSettlementView } from "@/lib/ticket-office-settlement-view";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/export-header", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/export-header")>();
  return { ...original, fetchExportBranding: vi.fn(async () => ({ displayName: "Mundo Propício", logoDataUrl: null })) };
});

import { exportTicketOfficeSettlementPdf, sanitizeSettlementPdfText } from "@/lib/export-ticket-office-settlement-pdf";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("PDF do fecho", () => {
  it("normaliza menos e traços, incluindo as notas da base, e usa um único carimbo em Lisboa", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T16:17:00Z"));
    const texts: string[] = [];
    const originalText = jsPDF.API.text;
    vi.spyOn(jsPDF.API, "text").mockImplementation(function (this: jsPDF, ...args: Parameters<typeof originalText>) {
      const value = args[0];
      texts.push(...(Array.isArray(value) ? value.map(String) : [String(value)]));
      return originalText.apply(this, args);
    });
    vi.spyOn(jsPDF.API, "save").mockImplementation(function (this: jsPDF) { return this; });
    const view = buildSettlementView({
      id: "s1", status: "confirmed", events: { name: "Deive Leonardo - Braga", date: "2026-10-03" },
      settlement_date: "2026-10-09", gross_revenue: 20659, total_deductions: 9.89,
      net_calculated: 20384.11, venue_retained_amount: 265, venue_retained_notes: "265,00 − 6,15 – comissão — sala",
      closed_at: "2026-10-10T16:17:00Z",
    }, "Ticketline", { deductions: [], statementNumber: "3163", closedByName: "Pedro" });
    await exportTicketOfficeSettlementPdf(view);
    expect(sanitizeSettlementPdfText("− – —")).toBe("- - -");
    expect(texts.join("\n")).toContain("265,00 - 6,15 - comissão - sala");
    expect(texts.join("\n")).not.toMatch(/[\u2212\u2013\u2014]/);
    expect(texts.filter((text) => text.includes("Gerado em"))).toEqual(["Gerado em 10/10/2026, 17:17"]);
    expect(texts.join("\n")).toContain("Pedro em 10/10/2026, 17:17");
  });
});