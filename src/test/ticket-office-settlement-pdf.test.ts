import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { buildSettlementView } from "@/lib/ticket-office-settlement-view";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const captured = vi.hoisted(() => ({ texts: [] as string[] }));
vi.mock("jspdf", async (importOriginal) => {
  const { default: RealPdf } = await importOriginal<typeof import("jspdf")>();
  return { default: class extends RealPdf {
    constructor(...args: ConstructorParameters<typeof RealPdf>) {
      super(...args);
      const originalText = this.text.bind(this);
      this.text = ((...textArgs: Parameters<typeof this.text>) => {
        const value = textArgs[0];
        captured.texts.push(...(Array.isArray(value) ? value.map(String) : [String(value)]));
        return originalText(...textArgs);
      }) as typeof this.text;
      this.save = (() => {
        writeFileSync("/tmp/settlement-pdf-qa.pdf", Buffer.from(this.output("arraybuffer")));
        return this;
      }) as typeof this.save;
    }
  } };
});
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
    const texts = captured.texts;
    texts.length = 0;
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