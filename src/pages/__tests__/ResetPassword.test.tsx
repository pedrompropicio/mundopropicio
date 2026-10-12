import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      verifyOtp: mocks.verifyOtp,
      getSession: mocks.getSession,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import ResetPassword from "@/pages/ResetPassword";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ResetPassword — token_hash flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = "";
    window.history.replaceState({}, "", "/reset-password?token_hash=abc&type=recovery");
  });

  it("(a) não chama verifyOtp ao montar; só ao clicar Continuar", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: { user: {} } }, error: null });

    renderAt("/reset-password?token_hash=abc&type=recovery");

    expect(screen.getByText("Clique para continuar e definir a sua senha")).toBeInTheDocument();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(mocks.verifyOtp).toHaveBeenCalledTimes(1));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "recovery" });
    await waitFor(() => expect(screen.getByLabelText("Nova senha")).toBeInTheDocument());
  });

  it("(b) verifyOtp com erro + sessão existente → formulário visível", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "Email link is invalid or has expired" } });
    mocks.getSession.mockResolvedValue({ data: { session: { user: {} } } });

    renderAt("/reset-password?token_hash=abc&type=recovery");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(mocks.getSession).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText("Nova senha")).toBeInTheDocument());
    expect(screen.queryByText(/expirou|Solicite um novo/i)).not.toBeInTheDocument();
  });

  it("(c) verifyOtp com erro + sem sessão → mensagem de expirado", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "Email link is invalid or has expired" } });
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    renderAt("/reset-password?token_hash=abc&type=recovery");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(screen.getByText(/O link de recuperação expirou/)).toBeInTheDocument()
    );
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
  });
});
