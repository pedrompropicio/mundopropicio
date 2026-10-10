import { describe, expect, it, vi } from "vitest";

const cap = vi.hoisted(() => ({ texts: [] as string[], cells: [] as string[] }));
const tables: Record<string, any> = {
  camarim_sessions: { id: "s1", title: "Sessão −1", mode: "event", status: "open", currency: "EUR", budget_amount: 10, opened_at: "2026-10-09" },
  camarim_items: [{ id: "i1", service_description: "Desconto −9,89 €", supplier_name_raw: "Loja – X", total_amount: 1, iva_amount: 0, base_amount: 1, payment_origin: "advance", status: "approved", document_date: "2026-10-09" }],
  camarim_fund_moves: [],
  camarim_session_events: [{ is_primary: true, events: { name: "Evento — A", date: "2026-10-09" } }],
};
vi.mock("@/integrations/supabase/client", () => {
  const builder = (t: string) => {
    const res = { data: tables[t], error: null };
    const b: any = { select: () => b, eq: () => b, single: () => Promise.resolve(res), maybeSingle: () => Promise.resolve(res), then: (r: any, j: any) => Promise.resolve(res).then(r, j) };
    return b;
  };
  return { supabase: { from: builder } };
});
vi.mock("jspdf-autotable", () => ({
  default: (doc: any, opts: any) => {
    for (const k of ["head", "body", "foot"]) for (const r of opts[k] ?? []) for (const c of r) cap.cells.push(String(c));
    doc.lastAutoTable = { finalY: 100 };
  },
}));
vi.mock("jspdf", async (orig) => {
  const { default: Real } = await orig<typeof import("jspdf")>();
  return { default: class extends Real {
    constructor(...a: ConstructorParameters<typeof Real>) {
      super(...a);
      const t = this.text.bind(this);
      this.text = ((...x: any[]) => { cap.texts.push(...(Array.isArray(x[0]) ? x[0] : [x[0]]).map(String)); return (t as any)(...x); }) as any;
      this.save = (() => this) as any;
    }
  } };
});

import { exportCamarimSessionPdf } from "@/lib/export-camarim-session-pdf";
import { sanitizePdfText } from "@/lib/pdf-text";

describe("PDF do camarim — saneamento", () => {
  it("troca − – — por hífen em todo o texto", async () => {
    expect(sanitizePdfText("−9,89 – —")).toBe("-9,89 - -");
    await exportCamarimSessionPdf("s1");
    const all = [...cap.texts, ...cap.cells].join("\n");
    expect(all).toContain("Desconto -9,89 €");
    expect(all).toContain("Sessão -1");
    expect(all).not.toMatch(/[\u2212\u2013\u2014]/);
  });
});
