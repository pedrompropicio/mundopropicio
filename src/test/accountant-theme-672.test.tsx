import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import AccountantHome from "@/pages/contabilidade/AccountantHome";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock("@/components/CompanySwitcher", () => ({ CompanySwitcher: () => <span>Empresa sintética</span> }));
vi.mock("@/components/BrandedLogo", () => ({ BrandedLogo: () => <span>Logo</span> }));
vi.mock("@/pages/contabilidade/PeriodSelector", () => ({
  PRESETS: [{ range: () => ({ from: "2026-01-01", to: "2026-12-31" }) }],
  PeriodSelector: () => null,
}));
vi.mock("@/pages/contabilidade/AccountantDocumentsTab", () => ({ AccountantDocumentsTab: () => null }));
vi.mock("@/pages/contabilidade/AccountantReportsTab", () => ({ AccountantReportsTab: () => null }));
vi.mock("@/pages/contabilidade/AccountantSuppliersTab", () => ({ AccountantSuppliersTab: () => null }));
vi.mock("@/pages/contabilidade/AccountantStandaloneInvoicesTab", () => ({ AccountantStandaloneInvoicesTab: () => null }));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#672: rede proibida"); }));
});
afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.classList.remove("dark"); vi.unstubAllGlobals(); });

describe("#672 — tema partilhado do portal", () => {
  it("alterna dark e grava mp-theme nos dois sentidos", () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    expect(document.documentElement).toHaveClass("dark");
    fireEvent.click(screen.getByRole("button", { name: "Modo claro" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("mp-theme")).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: "Modo escuro" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("mp-theme")).toBe("dark");
  });

  it("AccountantHome apresenta o botão junto da empresa sem o esconder no telemóvel e mantém a escolha ao voltar ao shell", () => {
    localStorage.setItem("mp-theme", "dark");
    const portal = render(<ThemeProvider><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AccountantHome /></MemoryRouter></ThemeProvider>);
    const header = screen.getByRole("banner");
    const toggle = within(header).getByRole("button", { name: "Modo claro" });
    expect(toggle).toBeVisible();
    expect(toggle.parentElement).toContainElement(within(header).getByText("Empresa sintética"));
    expect(header).toHaveClass("flex-wrap");
    for (let element: HTMLElement | null = toggle; element; element = element.parentElement) {
      expect(element.className.split(/\s+/)).not.toContain("hidden");
    }
    fireEvent.click(toggle);
    portal.unmount();
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    expect(screen.getByRole("button", { name: "Modo escuro" })).toBeVisible();
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("mp-theme")).toBe("light");
  });
});
