import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "admin" }) }));

import { OFFSET_INVALIDATE_KEYS, invalidateAfterOffset } from "@/lib/offset-plan/load";
import { offsetBadgeLabel } from "@/lib/transaction-offsets";
import { OffsetGroupDetailDialog } from "../OffsetGroupDetailDialog";
import { BankLineOffsetModal } from "../bank/BankLineOffsetModal";
import { checkOffsetEligibility } from "@/lib/offset-plan/eligibility";

const REQUIRED = [
  "transactions",
  "payment-timeline",
  "transaction-offsets",
  "offset-groups",
  "offset-control",
  "bank-recon-lines",
  "bank-recon-txns",
  "bank-recon-open-txns",
  "bank-recon-statements",
  "bank-recon-system-balance",
  "bank_line_documents_counts",
  "payment-lists",
  "event_forecasts",
  "financial-accounts",
  "financial-accounts-list",
];

function spyClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const keys = () => spy.mock.calls.map((c: any[]) => c[0]?.queryKey?.[0]).filter(Boolean);
  return { qc, keys };
}

describe("invalidação explícita", () => {
  it("lista inclui todas as keys exigidas", () => {
    for (const k of REQUIRED) expect(OFFSET_INVALIDATE_KEYS).toContain(k);
  });
  it("invalidateAfterOffset invalida cada key por queryKey exacta", () => {
    const { qc, keys } = spyClient();
    invalidateAfterOffset(qc);
    for (const k of OFFSET_INVALIDATE_KEYS) expect(keys()).toContain(k);
  });

  it("depois de estornar: cada key invalidada", async () => {
    const { qc, keys } = spyClient();
    const reverse = vi.fn(async () => ({ ok: true as const }));
    render(
      <QueryClientProvider client={qc}>
        <OffsetGroupDetailDialog
          groupId="g1"
          onClose={() => {}}
          control={{ enabled: false, reverse_enabled: true }}
          reverse={reverse as any}
          detail={{ id: "g1", status: "applied", operation_date: "2026-10-13", movement_amount: 1, supplier_name: "X", reversed_at: null, reversal_reason: null, bank_line: null, items: [] }}
        />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Motivo do estorno"), { target: { value: "erro" } });
    fireEvent.click(screen.getByLabelText("Confirmo o estorno integral"));
    fireEvent.click(screen.getByRole("button", { name: "Estornar encontro" }));
    await screen.findByText("Encontro estornado.");
    for (const k of OFFSET_INVALIDATE_KEYS) expect(keys()).toContain(k);
  });

  it("depois de aplicar: cada key invalidada", async () => {
    const { qc, keys } = spyClient();
    const cand = (id: string, sign: "income" | "expense", euros: number) => ({
      id, kind: "transaction" as const, sign, label: id, invoice_ref: null, event_name: null,
      gross_cents: euros * 100, paid_cents: 0, open_cents: euros * 100,
      eligibility: checkOffsetEligibility({ id, kind: "transaction", open_amount: euros, currency: "EUR" }),
    });
    const wrap = (ui: ReactNode) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
    wrap(
      <BankLineOffsetModal
        line={{ id: "L1", amount: 23406, booking_date: "2026-10-13", description: "TRF" }}
        onClose={() => {}}
        initialSupplierId="s1"
        services={{
          client: { rpc: vi.fn(), from: vi.fn() } as any,
          readControl: async () => ({ enabled: true, reverse_enabled: true }),
          loadSuppliers: async () => [{ id: "s1", name: "Casino" }],
          loadDocuments: async () => [cand("rec", "income", 30996), cand("desp", "expense", 7590)],
          loadEvents: async () => [],
          loadForecasts: async () => [],
          newRequestId: () => "req-1",
          today: () => "2026-10-22",
          apply: vi.fn(async () => ({ ok: true as const, group: { id: "g-1", status: "applied" } })) as any,
        }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Seguinte" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "rec" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "desp" }));
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver prévia" }));
    await screen.findAllByTestId("preview-row");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar encontro" }));
    await screen.findByText("Encontro aplicado.");
    await waitFor(() => {
      for (const k of OFFSET_INVALIDATE_KEYS) expect(keys()).toContain(k);
    });
  });
});

describe("etiqueta do par legado", () => {
  it("par adoptado por encontro aplicado → Aplicada no encontro", () => {
    expect(offsetBadgeLabel({ applied: false, offset_group_id: "g1", group_status: "applied" })).toBe("Aplicada no encontro");
  });
  it("encontro estornado → Por aplicar", () => {
    expect(offsetBadgeLabel({ applied: false, offset_group_id: "g1", group_status: "reversed" })).toBe("Por aplicar");
  });
  it("sem encontro → Por aplicar; aplicado por offset_id → Aplicada", () => {
    expect(offsetBadgeLabel({ applied: false, offset_group_id: null, group_status: null })).toBe("Por aplicar");
    expect(offsetBadgeLabel({ applied: true, offset_group_id: null, group_status: null })).toBe("Aplicada");
  });
});

describe("coluna Valor visível", () => {
  const src = readFileSync("src/pages/BankReconciliation.tsx", "utf8");
  it("valor com largura mínima e acções em flex-wrap com largura limitada", () => {
    expect(src).toMatch(/data-testid="unmatched-amount" className=\{`min-w-\[7\.5rem\]/);
    const i = src.indexOf('data-testid="unmatched-actions"');
    expect(i).toBeGreaterThan(0);
    const cell = src.slice(i, i + 400);
    expect(cell).not.toContain("whitespace-nowrap");
    expect(cell).toMatch(/flex max-w-\[15rem\] flex-wrap/);
  });
  it("nenhuma acção removida", () => {
    const i = src.indexOf('data-testid="unmatched-actions"');
    const cell = src.slice(i, src.indexOf("</TableCell>", i));
    for (const a of ["Conciliar", "Lançar", "OffsetLineButton", "Lançar taxas", "Ignorar", "Paperclip"]) expect(cell).toContain(a);
  });
});
