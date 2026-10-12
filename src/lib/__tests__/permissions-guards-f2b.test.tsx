import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

let auth: any;
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
  ALL_PERMISSIONS: [],
}));
vi.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "dark", toggleTheme: () => {} }) }));
vi.mock("@/contexts/CompanyBrandingContext", () => ({ useCompanyBranding: () => ({ displayName: "MP" }) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ isPlatformAdmin: false }) }));
vi.mock("@/components/BrandedLogo", () => ({ BrandedLogo: () => null }));
vi.mock("@/components/CompanySwitcher", () => ({ CompanySwitcher: () => null }));
vi.mock("@/components/CrmSidebar", () => ({ CrmSidebar: () => null }));
vi.mock("@/components/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/SystemRemindersBanner", () => ({ default: () => null }));
vi.mock("@/components/CompanyBudgetModeCard", () => ({ CompanyBudgetModeCard: () => null }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/hooks/useInactivityTimeout", () => ({ useInactivityTimeout: () => {} }));
vi.mock("@/hooks/useActivityTracker", () => ({ useActivityTracker: () => {} }));
vi.mock("@/pages/PartnerPortal", () => ({ default: () => <div>PORTAL</div> }));
vi.mock("@/pages/PartnerEventDetail", () => ({ default: () => null }));

import { CrmLayout } from "@/components/layout/CrmLayout";
import { PartnerLayout } from "@/components/PartnerLayout";
import ModuleSelector from "@/pages/ModuleSelector";
import AdminPanel from "@/pages/AdminPanel";

const MANAGER_BASE = ["module.erp", "module.operacao", "settings.accounts", "settings.ticket_offices", "settings.audit_accounts", "settings.bp_tools"];
function setAuth(role: string, permissions: string[]) {
  auth = {
    user: { id: "u1", email: "x@y.z", user_metadata: {} }, loading: false, role, permissions,
    isAdmin: role === "admin", hasPermission: (p: string) => permissions.includes(p), signOut: vi.fn(),
  };
}

function at(path: string, el: React.ReactNode, routePath = path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={el}><Route index element={<div>CRM-HOME</div>} /></Route>
        <Route path="/modulos" element={<div>MODULOS</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("#311 F2b — guardas por permissão", () => {
  beforeEach(() => { auth = null; });

  it("manager com excepção module.crm entra em /crm e vê o cartão CRM activo", () => {
    setAuth("manager", [...MANAGER_BASE, "module.crm"]);
    at("/crm", <CrmLayout />, "/crm");
    expect(screen.getByText("CRM-HOME")).toBeTruthy();
    const { container } = render(<MemoryRouter><ModuleSelector /></MemoryRouter>);
    const crmCard = [...container.querySelectorAll("button, div")].find((n) => n.textContent?.startsWith("MP CRM"));
    expect(crmCard?.textContent ?? "").not.toMatch(/Sem acesso/);
  });

  it("manager sem module.crm é mandado para /modulos", () => {
    setAuth("manager", MANAGER_BASE);
    at("/crm", <CrmLayout />, "/crm");
    expect(screen.getByText("MODULOS")).toBeTruthy();
  });

  it("admin com excepção negada settings.backups não vê Backups", () => {
    setAuth("admin", ["settings.admin", "settings.users", "settings.security"]);
    render(<MemoryRouter><AdminPanel /></MemoryRouter>);
    expect(screen.queryByText("Backups")).toBeNull();
    expect(screen.getByText("Utilizadores")).toBeTruthy();
  });

  it("não-sócio é mandado embora de /parceiro", () => {
    setAuth("editor", ["module.erp", "module.operacao"]);
    at("/parceiro", <PartnerLayout />, "/parceiro");
    expect(screen.getByText("MODULOS")).toBeTruthy();
  });

  it("sócio entra em /parceiro", () => {
    setAuth("partner", ["module.partner_portal"]);
    at("/parceiro", <PartnerLayout />, "/parceiro/*");
    expect(screen.getByText("PORTAL")).toBeTruthy();
  });
});
