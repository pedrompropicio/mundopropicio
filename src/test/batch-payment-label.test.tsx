/**
 * #281 — o rótulo do botão só conta linhas liquidáveis, separadas por origem.
 * Teste temporário: corre e é apagado a seguir.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabaseMock } from "./supabase-chain-mock";

vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, isAdmin: true, isManager: false, hasPermission: () => true, role: "admin" }),
}));

import { BatchPaymentModal } from "@/components/BatchPaymentModal";

const sup = { iban: "PT50001800002080898700139", name: "Fornecedor X" };
const mk = (id: string, over: any = {}) => ({
  id,
  description: id,
  amount: 100,
  iva_rate: 0,
  paid_amount: 0,
  payment_method: "transfer",
  currency: "EUR",
  suppliers: sup,
  ...over,
});

const txs = [
  mk("A"), // lote, por liquidar (100)
  mk("B", { amount: 50 }), // lote, por liquidar (50)
  mk("C", { amount: 30, paid_amount: 30 }), // lote, já liquidada → não conta
  mk("D", { payment_method: "service_payment" }), // outro canal, por liquidar (100)
];

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BatchPaymentModal transactions={txs} onClose={() => {}} />
    </QueryClientProvider>
  );
}

const label = () => {
  const btn = screen.getByRole("button", { name: /Liquidar/ });
  return btn.textContent?.replace(/\s+/g, " ").trim() ?? "";
};

describe("BatchPaymentModal #281 — rótulo do botão", () => {
  it("conta só as linhas liquidáveis do lote (2), não as 3 do ficheiro", () => {
    renderModal();
    const txt = label();
    expect(txt).toContain("Liquidar 2 do lote");
    expect(txt).not.toContain("3 do lote");
    expect(txt).not.toContain("outro canal");
    expect(txt).toContain("150");
  });

  it("o bloco âmbar continua a listar a linha de outro canal", () => {
    renderModal();
    expect(screen.getByText(/Pagas por outro canal \(1\)/)).toBeTruthy();
  });

  it("ao marcar a linha de outro canal, soma as duas origens", () => {
    renderModal();
    const box = screen.getByRole("checkbox", { name: /D/ });
    fireEvent.click(box);
    const txt = label();
    expect(txt).toContain("Liquidar 2 do lote");
    expect(txt).toContain("+ 1 de outro canal");
    expect(txt).toContain("250");
  });
});
