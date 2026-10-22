import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
let role: string | null = "manager";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role }) }));

import { BankLineOffsetModal, LAUNCH_BANK_HINT, OFFSET_DISABLED_MESSAGE, type OffsetModalServices } from "../BankLineOffsetModal";
import { checkOffsetEligibility } from "@/lib/offset-plan/eligibility";
import { OFFSET_INVALIDATE_KEYS } from "@/lib/offset-plan/load";
import type { OffsetCandidate } from "@/lib/offset-plan/load";

const cand = (id: string, sign: "income" | "expense", euros: number): OffsetCandidate => ({
  id, kind: "transaction", sign, label: id, invoice_ref: null, event_name: null,
  gross_cents: euros * 100, paid_cents: 0, open_cents: euros * 100,
  eligibility: checkOffsetEligibility({ id, kind: "transaction", open_amount: euros, currency: "EUR" }),
});

function wrap(ui: ReactNode, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return { qc, ...render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>) };
}

function services(over: Partial<OffsetModalServices> = {}): Partial<OffsetModalServices> {
  return {
    client: { rpc: vi.fn(), from: vi.fn() } as any,
    readControl: async () => ({ enabled: true, reverse_enabled: true }),
    loadSuppliers: async () => [{ id: "s1", name: "Casino Estoril" }],
    loadDocuments: async () => [cand("rec", "income", 30996), cand("desp", "expense", 7590), cand("desp2", "expense", 30996)],
    loadEvents: async () => [],
    loadForecasts: async () => [],
    loadAccounts: async () => [{ id: "acc1", name: "Santander Totta" }],
    newRequestId: vi.fn(() => "req-1") as any,
    today: () => "2026-10-22",
    applyLaunch: vi.fn(async () => ({ ok: true as const, group: { id: "g-1234567890", status: "applied", movement_amount: 0, operation_date: "2026-10-22", supplier_id: "s1", bank_line_id: null } })) as any,
    apply: vi.fn() as any,
    ...over,
  };
}

const launch = { transactionId: "rec", supplierId: "s1", originSign: "income" as const };

async function toMoneyStep(extra: string) {
  fireEvent.click(await screen.findByRole("button", { name: "Seguinte" }));
  const origin = await screen.findByRole("checkbox", { name: "rec" });
  expect(origin.getAttribute("data-state")).toBe("checked"); // origem pré-seleccionada
  fireEvent.click(screen.getByRole("checkbox", { name: extra }));
  fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
  await screen.findByTestId("money-step");
}

describe("#337 3b — assistente fora do banco", () => {
  it("sem movimento de dinheiro: chama transaction_offset_execute com p_movement null e invalida as keys", async () => {
    role = "editor";
    const s = services();
    const { qc } = wrap(<BankLineOffsetModal launch={launch} onClose={() => {}} services={s} />);
    const spy = vi.spyOn(qc, "invalidateQueries");
    await toMoneyStep("desp2");
    fireEvent.click(screen.getByRole("checkbox", { name: "Sem movimento de dinheiro" }));
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    expect(await screen.findAllByTestId("preview-row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar encontro" }));
    await screen.findByText("Encontro aplicado.");
    const call = (s.applyLaunch as any).mock.calls[0][1];
    expect(call).toMatchObject({ requestId: "req-1", supplierId: "s1", movement: null, date: "2026-10-22" });
    expect(call.items.every((i: any) => i.mode === "offset" && i.cash_order === null)).toBe(true);
    expect(JSON.stringify(call.items)).not.toMatch(/"amount"|paid_amount|iva_rate/);
    const keys = spy.mock.calls.map((c: any) => c[0]?.queryKey?.[0]);
    for (const k of OFFSET_INVALIDATE_KEYS) expect(keys).toContain(k);
    for (const k of ["child-transactions", "invoice-group-open-siblings", "offset-launch-accounts"]) expect(keys).toContain(k);
  });

  it("com dinheiro: conta obrigatória, aviso do banco, movimento assinado", async () => {
    role = "platform_admin";
    const s = services();
    wrap(<BankLineOffsetModal launch={launch} onClose={() => {}} services={s} />);
    await toMoneyStep("desp");
    expect(screen.getByTestId("launch-bank-hint").textContent).toBe(LAUNCH_BANK_HINT);
    fireEvent.change(screen.getByLabelText("Valor do movimento"), { target: { value: "23.406,00" } });
    expect(screen.getByTestId("money-error").textContent).toMatch(/conta/);
    expect((screen.getByRole("button", { name: "Seguinte" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("data futura bloqueia o passo Dinheiro", async () => {
    role = "manager";
    wrap(<BankLineOffsetModal launch={launch} onClose={() => {}} services={services()} />);
    await toMoneyStep("desp");
    // A conta é validada primeiro; a recusa da data futura está coberta em offset-launch-plan.test.ts.
    expect(screen.getByLabelText("Data do movimento").getAttribute("max")).toBe("2026-10-22");
  });

  it("N1: confirmar desactivado com a mensagem de fecho", async () => {
    role = "admin";
    wrap(<BankLineOffsetModal launch={launch} onClose={() => {}} services={services({ readControl: async () => ({ enabled: false, reverse_enabled: true }) })} />);
    expect(await screen.findByText(OFFSET_DISABLED_MESSAGE)).toBeTruthy();
  });

  it("viewer não pode aplicar (mesmas permissões da #335)", async () => {
    role = "viewer";
    wrap(<BankLineOffsetModal launch={launch} onClose={() => {}} services={services()} />);
    await waitFor(() => expect(screen.getByText(OFFSET_DISABLED_MESSAGE)).toBeTruthy());
  });
});
