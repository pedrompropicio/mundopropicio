import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PropsWithChildren } from "react";
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Outlet } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import { useEventIvaCountry } from "@/hooks/useEventIvaCountry";
import { netOfIva, useEventIvaRates } from "@/hooks/useEventIvaRates";
import IvaRateSelect from "@/components/IvaRateSelect";
import { AppSidebar } from "@/components/AppSidebar";
import { calcTotalWithIva } from "@/lib/iva";
import { quotationSchema, transactionSchema } from "@/lib/validations";
import App from "@/App";

const fixture = vi.hoisted(() => ({
  permissions: ["module.erp", "manage_iva", "view_reports"],
  from: vi.fn(() => { throw new Error("#498: acesso a serviços MP proibido"); }),
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: fixture.from } }));
vi.mock("@/contexts/AuthContext", () => ({
  AuthProvider: ({ children }: PropsWithChildren) => children,
  useAuth: () => ({
    user: { id: "fixture-user", email: "fixture@example.invalid" },
    role: "editor", isAdmin: false, isManager: false,
    hasPermission: (p: string) => fixture.permissions.includes(p), signOut: vi.fn(),
    permissions: fixture.permissions, loading: false,
  }),
}));
vi.mock("@/contexts/ThemeContext", () => ({
  ThemeProvider: ({ children }: PropsWithChildren) => children,
  useTheme: () => ({ theme: "dark", toggleTheme: vi.fn() }),
}));
vi.mock("@/hooks/useCoalaSyncBadge", () => ({ useCoalaSyncBadge: () => 0 }));
vi.mock("@/hooks/useAccountantPendenciesCount", () => ({ useAccountantPendenciesCount: () => 0 }));
vi.mock("@/hooks/useCompanyFeatures", () => ({ useHasFeature: () => false }));
vi.mock("@/hooks/useIsFieldStaffOnly", () => ({ useIsFieldStaffOnly: () => false }));
vi.mock("@/components/ChangePasswordModal", () => ({ ChangePasswordModal: () => null }));
vi.mock("@/components/PushNotificationToggle", () => ({ PushNotificationToggle: () => null }));
vi.mock("@/components/operacao/reports/OperationalReportDialog", () => ({ OperationalReportDialog: () => null }));

// Keep the real router, policy hooks and sidebar. Unrelated chrome/services and
// fiscal page contents are inert so direct-URL tests never contact MP services.
vi.mock("@/hooks/useInactivityTimeout", () => ({ useInactivityTimeout: () => {} }));
vi.mock("@/hooks/useActivityTracker", () => ({ useActivityTracker: () => {} }));
vi.mock("@/hooks/useGlobalModalScrollLock", () => ({ useGlobalModalScrollLock: () => {} }));
vi.mock("@/contexts/CompanyBrandingContext", () => ({ CompanyBrandingProvider: ({ children }: PropsWithChildren) => children }));
vi.mock("@/contexts/HelpPanelContext", () => ({ HelpPanelProvider: ({ children }: PropsWithChildren) => children }));
vi.mock("@/components/crm/ConfirmMetaActionDialog", () => ({ ConfirmMetaActionProvider: ({ children }: PropsWithChildren) => children }));
vi.mock("@/components/bp/ReductionObservationHost", () => ({ ReductionObservationHost: () => null }));
vi.mock("@/components/GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("@/components/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/ApprovedPaymentListReminder", () => ({ ApprovedPaymentListReminder: () => null }));
vi.mock("@/components/PWAUpdateManager", () => ({ PWAUpdateManager: () => null }));
vi.mock("@/components/ScrollToTop", () => ({ default: () => null }));
vi.mock("@/components/BrandedLogo", () => ({ BrandedLogo: () => null }));
vi.mock("@/components/CompanySwitcher", () => ({ CompanySwitcher: () => null }));
vi.mock("@/components/ModuleSwitcherButton", () => ({ ModuleSwitcherButton: () => null }));
vi.mock("@/components/help/HelpSidePanel", () => ({ default: () => null }));
vi.mock("@/components/help/HelpFloatingButton", () => ({ default: () => null }));
vi.mock("@/pages/Index", () => ({ default: () => null }));
vi.mock("@/pages/Auth", () => ({ default: () => null }));
vi.mock("@/pages/ResetPassword", () => ({ default: () => null }));
vi.mock("@/pages/Unsubscribe", () => ({ default: () => null }));
vi.mock("@/pages/AcceptInvitation", () => ({ default: () => null }));
vi.mock("@/pages/ModuleSelector", () => ({ default: () => null }));
vi.mock("@/pages/NotFound", () => ({ default: () => <p>404</p> }));
vi.mock("@/pages/Reports", () => ({ default: () => <Outlet /> }));
vi.mock("@/components/PostLoginRedirect", () => ({ default: () => null }));
vi.mock("@/pages/operacao/OperacaoLayout", () => ({ default: () => null }));
vi.mock("@/components/layout/AudienceLayout", () => ({ AudienceLayout: () => null }));
vi.mock("@/components/layout/AudiencePrintGuard", () => ({ AudiencePrintGuard: () => null }));
vi.mock("@/components/layout/CrmLayout", () => ({ CrmLayout: () => null }));
vi.mock("@/components/PartnerLayout", () => ({ PartnerLayout: () => null }));
vi.mock("@/pages/IvaManagement", () => ({ default: () => <p data-testid="fiscal-content">Gestão IVA PT</p> }));
vi.mock("@/pages/ReportIvaAuditPage", () => ({ default: () => <p data-testid="fiscal-content">Auditoria IVA PT</p> }));

let client: QueryClient;
function Wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}><MemoryRouter initialEntries={["/erp"]}>{children}</MemoryRouter></QueryClientProvider>;
}
function setCompany(country = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  vi.mocked(useCompany).mockReturnValue({
    company: { id: "fixture-company", country, currency } as Company,
    companyId: "fixture-company", isLoading: false, isError: false, error: null,
    isPlatformAdmin: false, refetch: vi.fn(), ...overrides,
  } as ReturnType<typeof useCompany>);
}
function seedCountries(countries: string[]) {
  client.setQueryData(["event-iva-country", "fixture-event"], countries);
}
function snapshot(element: Element) {
  return { text: element.textContent, domSha256: createHash("sha256").update(element.innerHTML).digest("hex") };
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fixture.permissions = ["module.erp", "manage_iva", "view_reports"];
  fixture.from.mockClear();
  setCompany();
  seedCountries(["Portugal"]);
  client.setQueryData(["event-iva-rates"], [
    { iva_rate: 6, event_ticket_zones: { event_id: "pt" } },
    { iva_rate: 10, event_ticket_zones: { event_id: "es" } },
    { iva_rate: null, event_ticket_zones: { event_id: "no-rate" } },
    { iva_rate: 23, event_ticket_zones: null },
  ]);
  client.setQueryData(["event-iva-parents"], [
    { id: "pt", parent_event_id: "mixed" }, { id: "es", parent_event_id: "mixed" },
    { id: "no-lots", parent_event_id: null },
  ]);
});
afterEach(() => {
  cleanup();
  client.clear();
  expect(fixture.from).not.toHaveBeenCalled();
});

describe("#498 P2a — baseline capturada antes da política", () => {
  it("preserva DOM/texto dos seletores PT/ES/misto/desconhecido", () => {
    const outputs: Record<string, ReturnType<typeof snapshot>> = {};
    for (const [label, countries, value] of [
      ["Portugal", ["Portugal"], 23],
      ["Espanha", ["Espanha"], 21],
      ["mista", ["Portugal", "Espanha"], 23],
      ["desconhecida", ["Brasil"], 23],
    ] as const) {
      seedCountries([...countries]);
      const { container, unmount } = render(<IvaRateSelect eventId="fixture-event" value={value} onChange={vi.fn()} />, { wrapper: Wrapper });
      outputs[label] = snapshot(container);
      unmount();
    }
    expect(outputs).toMatchInlineSnapshot(`
      {
        "Espanha": {
          "domSha256": "0c5bae9fdd1b96ce194efdb247d260868054e96d9b152a2c6f26b5385bf935e3",
          "text": "0% - Isento4% - Super-reduzida (ES)10% - Reduzida (ES)21% - Normal (ES)Taxas de Espanha (evento fora de Portugal)",
        },
        "Portugal": {
          "domSha256": "b4cb8b011b82721220f53eedb7d4252eb33516e8c3227ab2232be3d3223ed19a",
          "text": "0% - Isento6% - Reduzida13% - Intermédia23% - Normal",
        },
        "desconhecida": {
          "domSha256": "b589c42b70a25d8a4401262595b45053d1a2564ecd322bb29422daec34a7db1c",
          "text": "0% - Isento6% - Reduzida13% - Intermédia23% - NormalTaxas de Brasil (evento fora de Portugal)",
        },
        "mista": {
          "domSha256": "381a018d9c7e46267aa22e4feacc73e07519345bd05c0632ef0d433992424a88",
          "text": "0% - Isento4% - Super-reduzida (ES)6% - Reduzida10% - Reduzida (ES)13% - Intermédia21% - Normal (ES)23% - NormalTaxas de Portugal (evento fora de Portugal)",
        },
      }
    `);
  });

  it("preserva os bytes da sidebar PT rail/panel", () => {
    const outputs: Record<string, ReturnType<typeof snapshot>> = {};
    for (const variant of ["rail", "panel"] as const) {
      const { container, unmount } = render(<AppSidebar variant={variant} />, { wrapper: Wrapper });
      expect(screen.getByRole("link", { name: "Gestão IVA" })).toHaveAttribute("href", "/iva");
      outputs[variant] = snapshot(container);
      unmount();
    }
    expect(outputs).toMatchInlineSnapshot(`
      {
        "panel": {
          "domSha256": "248d700315397fa20643f795099a82f6fae0a875c71b75c184648f38a392c865",
          "text": "DashboardVendasGestão IVAScanner FaturasFaturas AdsRelatóriosManualfixture@example.invalidPreferênciasModo claroAlterar SenhaSair",
        },
        "rail": {
          "domSha256": "06c2f4b113033ed2a6d63f0a66903c74893750020432b0e4da80277bd194ebd0",
          "text": "DashboardVendasGestão IVAScanner FaturasFaturas AdsRelatóriosManualfixture@example.invalidPreferênciasAlterar SenhaSair",
        },
      }
    `);
  });

  it("preserva bilheteira, grupo misto e fallback 6 sem lotes", () => {
    const { result } = renderHook(() => useEventIvaRates(), { wrapper: Wrapper });
    expect([...result.current.rates]).toEqual([["pt", 6], ["es", 10]]);
    expect([...result.current.groupRates]).toEqual([["mixed", null]]);
    expect([result.current.rateOf("pt"), result.current.rateOf("es"), result.current.rateOf("no-lots"), result.current.rateOf()]).toEqual([6, 10, 6, 6]);
    expect([result.current.groupRateOf("mixed"), result.current.groupRateOf("pt"), result.current.groupRateOf()]).toEqual([null, 6, 6]);
    expect(netOfIva(1230, 23)).toBe(1000);
    expect(netOfIva(1230, null)).toBe(1230);
  });
});

describe("#498 P2a — política da empresa prevalece", () => {
  it.each([
    ["Portugal"], ["Espanha"], ["Portugal", "Espanha"], ["Brasil"], [],
  ].map(countries => ({ countries })))("BR propõe só 0 com cidades $countries", ({ countries }) => {
    setCompany("BR", "BRL");
    seedCountries(countries);
    const { result } = renderHook(() => useEventIvaCountry("fixture-event"), { wrapper: Wrapper });
    expect(result.current.ivaPolicy).toBe("none");
    expect(result.current.rates).toEqual([0]);
    expect(result.current.defaultRate).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(calcTotalWithIva(1000, result.current.defaultRate)).toBe(1000);
  });

  it("BR anula taxas da bilheteira e do grupo misto, incluindo IDs sem lotes", () => {
    setCompany("BR", "BRL");
    const { result } = renderHook(() => useEventIvaRates(), { wrapper: Wrapper });
    expect(new Set(result.current.rates.values())).toEqual(new Set([0]));
    expect(new Set(result.current.groupRates.values())).toEqual(new Set([0]));
    for (const id of ["pt", "es", "mixed", "no-rate", "no-lots", "unknown", "", null, undefined]) {
      expect(result.current.rateOf(id)).toBe(0);
      expect(result.current.groupRateOf(id)).toBe(0);
      expect(netOfIva(1000, result.current.rateOf(id))).toBe(1000);
    }
    expect(result.current.isLoading).toBe(false);
  });

  it("BR resolve 0 imediatamente sem cache, evento ou leituras fiscais", () => {
    setCompany("BR", "BRL");
    client.clear();
    const { result } = renderHook(() => ({
      event: useEventIvaCountry("uncached-event"),
      overhead: useEventIvaCountry(null),
      tickets: useEventIvaRates(),
    }), { wrapper: Wrapper });
    expect(result.current.event.rates).toEqual([0]);
    expect(result.current.event.defaultRate).toBe(0);
    expect(result.current.overhead.defaultRate).toBe(0);
    expect(result.current.tickets.rateOf("uncached-event")).toBe(0);
    expect(result.current.tickets.groupRateOf("uncached-group")).toBe(0);
    expect([result.current.event.isLoading, result.current.overhead.isLoading, result.current.tickets.isLoading]).toEqual([false, false, false]);
  });

  it("PT preserva a taxa uniforme do grupo e o fallback sem evento", () => {
    client.setQueryData(["event-iva-parents"], [{ id: "es", parent_event_id: "uniform" }]);
    const { result } = renderHook(() => ({
      city: useEventIvaCountry(null), tickets: useEventIvaRates(),
    }), { wrapper: Wrapper });
    expect(result.current.city.rates).toEqual([0, 6, 13, 23]);
    expect(result.current.city.defaultRate).toBe(23);
    expect(result.current.tickets.groupRateOf("uniform")).toBe(10);
    expect(result.current.tickets.groupRateOf("unknown")).toBe(6);
    expect(calcTotalWithIva(1000, result.current.city.defaultRate)).toBe(1230);
  });

  it("oculta o seletor BR sem regravar valores históricos nem chamar onChange", () => {
    setCompany("BR", "BRL");
    const onChange = vi.fn();
    const { container, rerender } = render(<IvaRateSelect value={23} onChange={onChange} />, { wrapper: Wrapper });
    expect(container).toBeEmptyDOMElement();
    rerender(<IvaRateSelect value={0} onChange={onChange} />);
    expect(container).toBeEmptyDOMElement();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("mantém a opção histórica PT/ES, change, disabled e hint", () => {
    seedCountries(["Espanha"]);
    const onChange = vi.fn();
    const { rerender } = render(<IvaRateSelect eventId="fixture-event" value={23} onChange={onChange} />, { wrapper: Wrapper });
    expect(screen.getAllByRole("option").map(o => o.getAttribute("value"))).toEqual(["23", "21", "10", "4", "0"]);
    expect(screen.getByText("Taxas de Espanha (evento fora de Portugal)")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "21" } });
    expect(onChange).toHaveBeenCalledWith(21);
    rerender(<IvaRateSelect eventId="fixture-event" value={23} onChange={onChange} disabled showCountryHint={false} className="fixture-select" />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("combobox")).toHaveClass("fixture-select");
    expect(screen.queryByText(/Taxas de/)).not.toBeInTheDocument();
  });

  it("PT → BR → PT repõe taxas geográficas e de bilheteira sem alterar cache", () => {
    seedCountries(["Espanha"]);
    const { result, rerender } = renderHook(() => ({
      city: useEventIvaCountry("fixture-event"), tickets: useEventIvaRates(),
    }), { wrapper: Wrapper });
    const ptCity = result.current.city;
    const ptRates = [...result.current.tickets.rates];
    const ptGroups = [...result.current.tickets.groupRates];
    setCompany("BR", "BRL");
    rerender();
    expect(result.current.city.defaultRate).toBe(0);
    expect(result.current.tickets.groupRateOf("mixed")).toBe(0);
    setCompany();
    rerender();
    expect(result.current.city).toEqual(ptCity);
    expect([...result.current.tickets.rates]).toEqual(ptRates);
    expect([...result.current.tickets.groupRates]).toEqual(ptGroups);
  });

  it.each([
    ["PT", "BRL", 23], ["BR", "EUR", 0], ["ES", "EUR", 23],
  ])("consome política da empresa, independente da moeda (%s/%s)", (country, currency, expected) => {
    setCompany(country, currency);
    const { result } = renderHook(() => useEventIvaCountry("fixture-event"), { wrapper: Wrapper });
    expect(result.current.defaultRate).toBe(expected);
  });

  it("schemas existentes aceitam o 0 explícito proposto, sem dispensar validações PT", () => {
    setCompany("BR", "BRL");
    const { result } = renderHook(() => useEventIvaCountry(null), { wrapper: Wrapper });
    const input = { description: "Fixture", type: "expense", amount: "1000", date: "2099-01-01", iva_rate: result.current.defaultRate };
    const transaction = transactionSchema.parse(input);
    expect(transaction.iva_rate).toBe(0);
    expect(calcTotalWithIva(Number(transaction.amount), transaction.iva_rate)).toBe(1000);
    const quotation = quotationSchema.parse({ ...input, amount: 1000,
      event_id: "550e8400-e29b-41d4-a716-446655440000", supplier_id: "550e8400-e29b-41d4-a716-446655440001" });
    expect(quotation.iva_rate).toBe(0);
    expect(transactionSchema.safeParse({ ...input, iva_rate: undefined }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...input, iva_rate: 23 }).success).toBe(true);
    expect(transactionSchema.safeParse({ ...input, iva_rate: -1 }).success).toBe(false);
  });
});

describe("#498 P2a — capacidade fiscal e contexto indisponível", () => {
  it.each(["rail", "panel"] as const)("remove Gestão IVA em BR (%s) e repõe os bytes PT na troca", (variant) => {
    const { container, rerender } = render(<AppSidebar variant={variant} />, { wrapper: Wrapper });
    const pt = snapshot(container);
    setCompany("BR", "BRL");
    rerender(<AppSidebar variant={variant} />);
    expect(screen.queryByRole("link", { name: "Gestão IVA" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    setCompany();
    rerender(<AppSidebar variant={variant} />);
    expect(snapshot(container)).toEqual(pt);
  });

  it.each([
    { isLoading: true }, { isError: true, error: new Error("fixture") }, { company: null },
    { company: { country: "BR", currency: "" } as Company },
  ])("contexto unavailable conserva menu e taxas legadas (%j)", (overrides) => {
    // Even stale BR data during loading/error must retain legacy behavior.
    setCompany("BR", "BRL", overrides);
    seedCountries(["Espanha"]);
    const { result } = renderHook(() => ({ city: useEventIvaCountry("fixture-event"), tickets: useEventIvaRates() }), { wrapper: Wrapper });
    expect(result.current.city.ivaPolicy).toBe("pt");
    expect(result.current.city.rates).toEqual([0, 4, 10, 21]);
    expect(result.current.city.defaultRate).toBe(21);
    expect(result.current.tickets.rateOf("pt")).toBe(6);
    expect(result.current.tickets.groupRateOf("mixed")).toBeNull();
    render(<AppSidebar />, { wrapper: Wrapper });
    expect(screen.getByRole("link", { name: "Gestão IVA" })).toBeInTheDocument();
    render(<IvaRateSelect eventId="fixture-event" value={21} onChange={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByRole("combobox")).toHaveValue("21");
  });

  it.each([["PT", "EUR"], ["BR", "BRL"]])("capability não concede a permissão manage_iva (%s/%s)", (country, currency) => {
    fixture.permissions = ["module.erp"];
    setCompany(country, currency);
    render(<AppSidebar />, { wrapper: Wrapper });
    expect(screen.queryByRole("link", { name: "Gestão IVA" })).not.toBeInTheDocument();
  });

  it.each(["/iva", "/relatorios/auditoria-iva"])("URL direto %s mostra indisponível em BR e preserva PT/unavailable", async (path) => {
    window.history.replaceState({}, "", path);
    setCompany("BR", "BRL");
    const { rerender } = render(<App />);
    expect(await screen.findByRole("heading", { name: "Indisponível para esta empresa" })).toBeInTheDocument();
    expect(screen.queryByTestId("fiscal-content")).not.toBeInTheDocument();
    expect(screen.queryByText("404")).not.toBeInTheDocument();
    setCompany();
    rerender(<App />);
    const pt = (await screen.findByTestId("fiscal-content")).outerHTML;
    expect(screen.queryByRole("heading", { name: "Indisponível para esta empresa" })).not.toBeInTheDocument();
    for (const overrides of [{ isLoading: true }, { isError: true }, { company: null }]) {
      setCompany("PT", "EUR", overrides);
      rerender(<App />);
      expect(screen.getByTestId("fiscal-content").outerHTML).toBe(pt);
    }
    setCompany("BR", "BRL");
    rerender(<App />);
    expect(screen.getByRole("heading", { name: "Indisponível para esta empresa" })).toBeInTheDocument();
    expect(screen.queryByTestId("fiscal-content")).not.toBeInTheDocument();
  });

  it("os consumidores autorizados não introduzem decisões por country", () => {
    for (const path of ["hooks/useEventIvaCountry.ts", "hooks/useEventIvaRates.ts", "components/IvaRateSelect.tsx", "components/AppSidebar.tsx", "App.tsx", "lib/validations.ts"]) {
      expect(readFileSync(`src/${path}`, "utf8")).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
    }
  });
});
