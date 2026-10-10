import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const cap = vi.hoisted(() => ({ uploads: [] as string[], inserts: [] as any[], texts: [] as string[], cells: [] as string[] }));

vi.mock("@/hooks/useCompany", () => ({ getCurrentCompanyId: vi.fn(async () => "7c858982-6ccd-47ca-bd65-e0dd3eebf01c") }));
vi.mock("@/lib/storage-delete", () => ({ deleteStorageObject: vi.fn(async () => "trashed") }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload: async (path: string) => { cap.uploads.push(path); return { data: { path }, error: null }; } }) },
    from: () => ({
      insert: (row: any) => {
        cap.inserts.push(row);
        const b: any = { select: () => b, single: async () => ({ data: { id: "d1", ...row, created_at: "2026-10-10T19:00:00Z" }, error: null }) };
        return b;
      },
    }),
  },
}));
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
vi.mock("@/lib/export-header", async (orig) => {
  const o = await orig<typeof import("@/lib/export-header")>();
  return { ...o, fetchExportBranding: vi.fn(async () => ({ displayName: "Mundo Propício", logoDataUrl: null })) };
});

import { TicketOfficeStatementDocuments } from "@/components/TicketOfficeStatementDocuments";
import { buildStatementDocumentPath, uploadStatementDocument } from "@/lib/ticket-office-statement-documents";
import { buildSettlementView } from "@/lib/ticket-office-settlement-view";
import { exportTicketOfficeSettlementPdf } from "@/lib/export-ticket-office-settlement-pdf";

const CO = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const docs = [{ id: "d1", file_path: "x/a.pdf", file_name: "MUNDOPROPICIO-28SETA04OUT26-AP.pdf", mime_type: "application/pdf", file_size: null, document_source: "apuramento" as const, created_at: "2026-10-10T10:00:00Z" }];
const wrap = (ui: React.ReactNode) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;

beforeEach(() => { cap.uploads.length = 0; cap.inserts.length = 0; cap.texts.length = 0; cap.cells.length = 0; });

describe("Documentos do apuramento", () => {
  it("lista e é só de leitura para quem não pode gerir", () => {
    const { container } = render(wrap(<TicketOfficeStatementDocuments statementId="s1" documents={docs} canManage={false} />));
    expect(screen.getByText("MUNDOPROPICIO-28SETA04OUT26-AP.pdf")).toBeTruthy();
    expect(screen.getByText("Apuramento")).toBeTruthy();
    expect(screen.queryByText("Carregar documento")).toBeNull();
    expect(container.querySelector('[aria-label^="Remover"]')).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("quem gere vê carregar e remover", () => {
    render(wrap(<TicketOfficeStatementDocuments statementId="s1" documents={docs} canManage />));
    expect(screen.getByText("Carregar documento")).toBeTruthy();
    expect(screen.getByLabelText(/Remover/)).toBeTruthy();
  });

  it("caminho começa pelo company_id, nunca pela conta", () => {
    const p = buildStatementDocumentPath(CO, "s1", "Fatura FA 3411.pdf", 123);
    expect(p).toBe(`${CO}/statements/s1/123_Fatura_FA_3411.pdf`);
  });

  it("upload grava a natureza escolhida e os dados reais do ficheiro", async () => {
    const file = new File([new Uint8Array(42)], "FA.2026-3411.pdf", { type: "application/pdf" });
    await uploadStatementDocument({ statementId: "s1", file, source: "fatura", userId: "u1" });
    expect(cap.uploads[0].startsWith(`${CO}/statements/s1/`)).toBe(true);
    expect(cap.inserts[0]).toMatchObject({ document_source: "fatura", file_name: "FA.2026-3411.pdf", mime_type: "application/pdf", file_size: 42, file_path: cap.uploads[0], company_id: CO });
  });

  it("PDF do fecho lista os documentos do apuramento e não os do fecho", async () => {
    const v = buildSettlementView(
      { id: "f1", status: "draft", statement_id: "s1", events: { name: "Deive" }, settlement_date: "2026-10-09", document_url: "bb741051/COMPROVATIVO-DO-FECHO.pdf" },
      "Ticketline",
      { deductions: [], statementNumber: "3163/2026", closedByName: null, statementDocuments: [
        { id: "d1", fileName: "MUNDOPROPICIO-28SETA04OUT26-AP.pdf", source: "apuramento", filePath: "a" },
        { id: "d2", fileName: "FA.2026-3411.pdf", source: "fatura", filePath: "b" },
      ] },
    );
    await exportTicketOfficeSettlementPdf(v);
    const all = [...cap.texts, ...cap.cells].join("\n");
    expect(all).toContain("Documentos do apuramento 3163/2026");
    expect(all).toContain("MUNDOPROPICIO-28SETA04OUT26-AP.pdf");
    expect(all).toContain("FA.2026-3411.pdf");
    expect(all).toContain("Fatura");
    expect(all).not.toContain("COMPROVATIVO-DO-FECHO");
  });

  it("sem apuramento, a secção não existe", () => {
    const v = buildSettlementView({ id: "f2", status: "draft", events: { name: "X" } }, "T",
      { deductions: [], statementNumber: null, closedByName: null, statementDocuments: [{ id: "d", fileName: "z", source: "outro", filePath: "z" }] });
    expect(v.statementDocuments).toEqual([]);
  });
});
