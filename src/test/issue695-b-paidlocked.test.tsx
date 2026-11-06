import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionEditModal } from "@/components/TransactionEditModal";

const f = vi.hoisted(() => ({
  externalCall: vi.fn(() => { throw new Error("#695-b: acesso externo proibido"); }),
}));

vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: { id: "company", country: "PT", currency: "EUR" }, companyId: "company", isLoading: false, isError: false,
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user" }, isAdmin: false, isManager: false, hasPermission: () => false,
}) }));
// As queries não executam os transportes; o modal e os DatePickers são reais.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ isPending: false, mutate: f.externalCall }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: f.externalCall, rpc: f.externalCall, functions: { invoke: f.externalCall },
} }));
vi.mock("@/hooks/useEventHouseLabel", () => ({ useEventHouseLabel: () => "Empresa" }));
vi.mock("@/components/TransactionDuplicateWarning", () => ({
  useTransactionDuplicateCheck: () => ({ needsConfirmation: false }), TransactionDuplicateWarning: () => null,
}));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/AccountantReviewBadge", () => ({ AccountantReviewBlock: () => null }));

const warning = "A competência e o vencimento estão separados por mais de 2 meses. Confirme a data de competência; pode gravar sem alterar.";
const transaction = {
  id: "transaction", description: "Fixture #695-b", amount: 100,
  date: "2026-11-05", due_date: "2027-02-05", payment_date: "2026-11-05",
  type: "expense", status: "paid", currency: "EUR", event_id: null, category_id: null,
  supplier_id: null, account_id: null, iva_rate: 0, payment_method: "transfer",
};

function open(canApprove: boolean, overrides: Partial<typeof transaction> = {}) {
  return render(
    <MemoryRouter>
      <TransactionEditModal transaction={{ ...transaction, ...overrides }} canApprove={canApprove} onClose={vi.fn()} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", f.externalCall);
  vi.stubGlobal("XMLHttpRequest", class { constructor() { f.externalCall(); } });
  vi.stubGlobal("WebSocket", class { constructor() { f.externalCall(); } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(f.externalCall).not.toHaveBeenCalled();
});

describe("#695-b — aviso de competência na edição", () => {
  it("paidLocked esconde o aviso e as datas separadas por 3 meses", () => {
    open(false);

    expect(screen.getByRole("dialog", { name: "Editar (Liquidada)" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Data de competência")).not.toBeInTheDocument();
    expect(screen.queryByText("Data Vencimento")).not.toBeInTheDocument();
    expect(screen.queryByText(warning)).not.toBeInTheDocument();
  });

  it.each([
    { status: "paid", canApprove: true },
    { status: "pending", canApprove: false },
  ])("$status, canApprove=$canApprove mantém o texto do aviso para as mesmas datas", ({ status, canApprove }) => {
    open(canApprove, { status });

    expect(screen.getByLabelText("Data de competência")).toHaveValue("05/11/2026");
    expect(screen.getByText("Data Vencimento")).toBeInTheDocument();
    expect(screen.getByText(warning)).toHaveAttribute("role", "status");
    expect(document.body.querySelector('button[type="submit"]')).not.toBeDisabled();
  });

  it.each([
    { status: "paid", canApprove: false },
    { status: "paid", canApprove: true },
    { status: "pending", canApprove: false },
  ])("$status, canApprove=$canApprove não avisa com due_date vazio", ({ status, canApprove }) => {
    open(canApprove, { status, due_date: "" });

    expect(screen.queryByText(warning)).not.toBeInTheDocument();
  });
});
