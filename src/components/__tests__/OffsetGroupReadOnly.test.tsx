import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
let role: string | null = "admin";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role }) }));
vi.mock("@/lib/transaction-offsets", () => ({
  createOffset: vi.fn(),
  removeOffset: vi.fn(),
  offsetOtherLabel: () => "x",
  offsetsFor: () => [],
  useAllTransactionOffsets: () => ({ data: [] }),
  useOffsetsInvalidate: () => () => {},
}));
vi.mock("@/lib/offset-plan/groups", async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    useOffsetControl: () => ({ data: { enabled: false, reverse_enabled: true } }),
    useOffsetGroupDetail: () => ({ data: undefined }),
    useOffsetGroupsForTransaction: () => ({
      data: [
        { group_id: "g1", operation_date: "2026-10-13", status: "applied", supplier_name: "Casino Estoril", movement_amount: 23406, cash_amount: 23406, compensation_amount: 7590 },
      ],
    }),
  };
});

import { TransactionOffsetsBlock } from "../TransactionOffsetsBlock";
import { OffsetGroupDetailDialog } from "../OffsetGroupDetailDialog";
import type { OffsetGroupDetail } from "@/lib/offset-plan/groups";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const detail: OffsetGroupDetail = {
  id: "g1",
  status: "applied",
  operation_date: "2026-10-13",
  movement_amount: 23406,
  supplier_name: "Casino Estoril",
  reversed_at: null,
  reversal_reason: null,
  bank_line: { booking_date: "2026-10-13", description: "TRF", amount: 23406 },
  items: [
    { id: "i1", transaction_id: "b873559f", forecast_id: null, type: "income", cash_order: 1, gross_amount: 30996, prior_paid_amount: 0, open_amount: 30996, cash_amount: 23406, compensation_amount: 7590, description: "Apoio", invoice_ref: "FT 11.1/102" },
    { id: "i2", transaction_id: "0368bca9", forecast_id: null, type: "expense", cash_order: 0, gross_amount: 7590, prior_paid_amount: 0, open_amount: 7590, cash_amount: 0, compensation_amount: 7590, description: "Despesa", invoice_ref: "F1/00000439" },
  ],
};

beforeEach(() => {
  role = "admin";
});

describe("ficha da transação — só leitura", () => {
  it("mostra participação no encontro, mantém 'Compensa com…' e não tem botão de criar encontro", () => {
    wrap(<TransactionOffsetsBlock transaction={{ id: "b873559f", type: "income", supplier_id: "s1", amount: 30996 }} canEdit />);
    expect(screen.getByTestId("offset-group-participation")).toHaveTextContent("Faz parte do encontro de contas de 13/10/2026 · Casino Estoril");
    expect(screen.getByRole("button", { name: "Ver encontro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compensa com…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /encontro de contas/i })).toBeNull();
  });
});

describe("estorno", () => {
  it("só admin vê o estorno", () => {
    role = "manager";
    wrap(<OffsetGroupDetailDialog groupId="g1" onClose={() => {}} detail={detail} control={{ enabled: false, reverse_enabled: true }} />);
    expect(screen.queryByTestId("reverse-section")).toBeNull();
    expect(screen.getAllByTestId("group-item")).toHaveLength(2);
  });

  it("admin com reverse_enabled=false não vê o estorno (N2)", () => {
    wrap(<OffsetGroupDetailDialog groupId="g1" onClose={() => {}} detail={detail} control={{ enabled: false, reverse_enabled: false }} />);
    expect(screen.queryByTestId("reverse-section")).toBeNull();
  });

  it("admin em N1: motivo + confirmação obrigatórios, um só pedido", async () => {
    let resolve!: (v: any) => void;
    const reverse = vi.fn(() => new Promise((r) => (resolve = r)));
    wrap(
      <OffsetGroupDetailDialog groupId="g1" onClose={() => {}} detail={detail} control={{ enabled: false, reverse_enabled: true }} reverse={reverse as any} client={{} as any} />,
    );
    const btn = screen.getByRole("button", { name: "Estornar encontro" });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo do estorno"), { target: { value: "lançado por engano" } });
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo o estorno integral" }));
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(reverse).toHaveBeenCalledTimes(1);
    expect((reverse.mock.calls[0] as any[])[1]).toMatchObject({ groupId: "g1", reason: "lançado por engano" });
    resolve({ ok: true, result: {} });
    await waitFor(() => expect(screen.getByText("Encontro estornado.")).toBeInTheDocument());
  });

  it("erro do estorno mapeado", async () => {
    const reverse = vi.fn(async () => ({ ok: false, code: "already_reversed", message: "Este encontro já foi estornado.", uncertain: false, reload: false }));
    wrap(<OffsetGroupDetailDialog groupId="g1" onClose={() => {}} detail={detail} control={{ enabled: true, reverse_enabled: true }} reverse={reverse as any} client={{} as any} />);
    fireEvent.change(screen.getByLabelText("Motivo do estorno"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo o estorno integral" }));
    fireEvent.click(screen.getByRole("button", { name: "Estornar encontro" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Este encontro já foi estornado.");
  });
});
