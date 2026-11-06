import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "manager" }) }));
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({ options, value, onValueChange, placeholder }: {
    options: { value: string; label: string }[];
    value: string;
    onValueChange: (value: string) => void;
    placeholder: string;
  }) => <select aria-label={placeholder} value={value} onChange={(e) => onValueChange(e.target.value)}>
    <option value="">{placeholder}</option>
    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>,
}));

import { BankLineOffsetModal, type OffsetModalServices } from "../BankLineOffsetModal";
import { checkOffsetEligibility } from "@/lib/offset-plan/eligibility";
import type { OffsetCandidate } from "@/lib/offset-plan/load";

const candidate = (id: string, sign: "income" | "expense", euros: number): OffsetCandidate => ({
  id, kind: "transaction", sign, label: id, invoice_ref: null, event_name: null,
  gross_cents: euros * 100, paid_cents: 0, open_cents: euros * 100,
  eligibility: checkOffsetEligibility({ id, kind: "transaction", open_amount: euros, currency: "EUR" }),
});

async function openMoneyStep() {
  const services: OffsetModalServices = {
    client: { rpc: vi.fn(), from: vi.fn() } as OffsetModalServices["client"],
    readControl: async () => ({ enabled: true, reverse_enabled: true }),
    loadSuppliers: async () => [{ id: "s1", name: "Casino Estoril" }],
    loadDocuments: async () => [candidate("rec", "income", 30996), candidate("desp", "expense", 7590)],
    loadEvents: async () => [], loadForecasts: async () => [],
    loadAccounts: async () => [{ id: "acc1", name: "Banco sintético" }],
    today: () => "2026-10-22", newRequestId: () => "req-estoril",
    apply: vi.fn(),
    applyLaunch: vi.fn(async () => ({ ok: true as const, group: {
      id: "g-estoril", status: "applied", movement_amount: 23406,
      operation_date: "2026-10-22", supplier_id: "s1", bank_line_id: null,
    } })),
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}>
    <BankLineOffsetModal launch={{ transactionId: "rec", supplierId: "s1", originSign: "income" }}
      onClose={() => {}} services={services} />
  </QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Seguinte" }));
  expect(await screen.findByRole("checkbox", { name: "rec" })).toHaveAttribute("data-state", "checked");
  fireEvent.click(screen.getByRole("checkbox", { name: "desp" }));
  fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
  await screen.findByTestId("money-step");
  fireEvent.change(screen.getByLabelText("Valor do movimento"), { target: { value: "23.406,00" } });
  return services;
}

afterEach(cleanup);

describe("#337 E2b critério 5 — lançamento Estoril com dinheiro", () => {
  it("bloqueia Seguinte sem conta mesmo com valor e data válidos", async () => {
    const services = await openMoneyStep();
    expect(screen.getByLabelText("Data do movimento")).toHaveValue("2026-10-22");
    expect(screen.getByTestId("money-error")).toHaveTextContent("Escolha a conta do movimento de dinheiro.");
    expect(screen.getByRole("button", { name: "Seguinte" })).toBeDisabled();
    expect(services.applyLaunch).not.toHaveBeenCalled();
  });

  it("entrega conta, data, valor assinado e os dois itens imutáveis a applyLaunch", async () => {
    const services = await openMoneyStep();
    fireEvent.change(await screen.findByRole("combobox", { name: "Escolha a conta" }), { target: { value: "acc1" } });
    expect(screen.getByRole("button", { name: "Seguinte" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver prévia" }));
    expect(await screen.findAllByTestId("preview-row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar encontro" }));
    await screen.findByText("Encontro aplicado.");
    expect(services.applyLaunch).toHaveBeenCalledExactlyOnceWith(services.client, {
      requestId: "req-estoril", supplierId: "s1", date: "2026-10-22", note: null,
      movement: { account_id: "acc1", date: "2026-10-22", amount: 23406 },
      items: [
        { transaction_id: "rec", mode: "settle", cash_order: 1, expected_open_cents: 3099600 },
        { transaction_id: "desp", mode: "offset", cash_order: null, expected_open_cents: 759000 },
      ],
    });
    const args = vi.mocked(services.applyLaunch).mock.calls[0][1];
    for (const item of args.items) {
      for (const forbidden of ["amount", "paid_amount", "iva_rate"]) expect(item).not.toHaveProperty(forbidden);
    }
    expect(services.apply).not.toHaveBeenCalled();
    expect(services.client.rpc).not.toHaveBeenCalled();
    expect(services.client.from).not.toHaveBeenCalled();
  });
});
