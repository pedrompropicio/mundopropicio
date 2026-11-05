import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import snap from "@/test/fixtures/permission-snapshot-311.json";
import { accessByPermission, type AccessArea } from "@/lib/access";
import { resolveEffectivePermissions } from "@/lib/permissions";

type Row = { u: string; c: string; r: string; p: string[] | null };
type OldContext = { role: string; isAdmin: boolean; hasPermission: (key: string) => boolean };
type Gate = {
  id: string;
  file: string;
  key: string;
  areas: AccessArea[];
  old: (context: OldContext) => boolean;
};

// Predicados anteriores copiados das páginas. As guardas de recusa são
// invertidas para comparar acesso concedido; isAdmin vem do AuthContext.
const gates: Gate[] = [
  {
    id: "G1", file: "crm/Campaigns", key: "crm.audience.view", areas: ["audience"],
    old: ({ role, hasPermission }) =>
      role === "admin" ||
      role === ("platform_admin" as any) ||
      role === ("marketing_manager" as any) ||
      hasPermission("crm.campaign.create"),
  },
  {
    id: "G2", file: "crm/Connections", key: "settings.integrations.meta", areas: ["audience", "settings.integrations.meta"],
    old: ({ role, hasPermission }) =>
      role === "admin" ||
      role === ("platform_admin" as any) ||
      role === ("marketing_manager" as any) ||
      hasPermission("crm.campaign.create"),
  },
  {
    id: "G3", file: "crm/Campaigns", key: "settings.diagnostics", areas: ["audience"],
    old: ({ role }) => role === "admin" || role === ("platform_admin" as any),
  },
  {
    id: "G4", file: "crm-admin/google-ads/CustomerMatchEnsure", key: "module.audience", areas: ["crm", "settings.integrations.google"],
    old: ({ role }) => role === "admin" || role === ("platform_admin" as any) || role === "marketing_manager",
  },
  {
    id: "G5", file: "UserManagement", key: "settings.users", areas: ["settings.users"],
    old: ({ isAdmin }) => !(!isAdmin),
  },
  {
    id: "G6", file: "UserManagement", key: "settings.permissions", areas: ["settings.users"],
    old: ({ isAdmin }) => !(!isAdmin),
  },
  {
    id: "G7", file: "SecurityDashboard", key: "settings.security", areas: ["settings.security"],
    old: ({ isAdmin }) => !(!isAdmin),
  },
  {
    id: "G8", file: "DatabaseBackups", key: "settings.backups", areas: ["settings.backups"],
    old: ({ isAdmin }) => !(!isAdmin),
  },
  {
    id: "G9", file: "Trash", key: "settings.trash", areas: ["settings.trash"],
    old: ({ isAdmin }) => isAdmin,
  },
  {
    id: "G10", file: "UserActivityLog", key: "settings.audit_log", areas: ["settings.audit_log"],
    old: ({ isAdmin }) => !(!isAdmin),
  },
  {
    id: "G11", file: "admin/AuditDownloads", key: "settings.audit_log", areas: ["settings.audit_log"],
    old: ({ isAdmin, role }) => !(!isAdmin && role !== ("platform_admin" as any)),
  },
  {
    id: "G12", file: "admin/Reminders", key: "settings.notifications", areas: ["settings.notifications"],
    old: ({ role }) => role === "admin" || role === ("platform_admin" as any),
  },
  {
    id: "G13", file: "admin/Notifications", key: "settings.notifications", areas: ["settings.notifications"],
    old: ({ role }) => role === "admin" || role === ("platform_admin" as any),
  },
  {
    id: "G14", file: "admin/ManualSync", key: "settings.admin", areas: ["erp"],
    old: ({ role }) => role === "admin" || role === ("platform_admin" as any),
  },
  {
    id: "G15", file: "admin/ManualGaps", key: "settings.admin", areas: ["erp"],
    old: ({ role }) => role === "admin" || role === "platform_admin",
  },
  {
    id: "G16", file: "admin/RlsLegacyAudit", key: "settings.diagnostics", areas: ["erp"],
    old: ({ role }) => role === "admin" || role === ("platform_admin" as any),
  },
  {
    id: "G17", file: "admin/InvoiceGroupAudit", key: "settings.diagnostics", areas: ["erp"],
    old: ({ role }) => role === "admin" || role === ("platform_admin" as any),
  },
  {
    id: "G18", file: "admin/IbanDuplicates", key: "settings.audit_accounts", areas: ["erp"],
    old: ({ role }) => role === "admin" || role === ("platform_admin" as any) || role === ("manager" as any),
  },
  {
    id: "G19", file: "admin/SimilarSuppliersReview", key: "settings.audit_accounts", areas: ["erp"],
    old: ({ role }) => role === "admin" || role === "platform_admin" || role === "manager",
  },
];

const rows = (snap as { rows: Row[] }).rows;
const platformPermissions = [...new Set(rows.filter((row) => row.r === "platform_admin").flatMap((row) => row.p ?? []))];

function oldContext(role: string, permissions: string[]): OldContext {
  return {
    role,
    isAdmin: role === "admin" || role === ("platform_admin" as any),
    hasPermission: (key) => permissions.includes(key),
  };
}

describe("#311 F2d — prova sobre o snapshot real, sem diferenças aceites", () => {
  it("cobre 52 utilizador×empresa, 19 portões e 17 ficheiros", () => {
    expect(rows).toHaveLength(52);
    expect(gates).toHaveLength(19);
    expect(new Set(gates.map((gate) => gate.file)).size).toBe(17);
    expect(rows.filter((row) => row.r === "platform_admin")).toHaveLength(3);
  });

  it.each(gates)("$id: predicado antigo = $key em todas as áreas acessíveis", (gate) => {
    const diffs: { u: string; c: string; role: string; old: boolean; next: boolean }[] = [];
    let eligible = 0;
    for (const row of rows) {
      const permissions = row.p ?? [];
      const areas = accessByPermission(row.r, permissions);
      if (!gate.areas.every((area) => areas.has(area))) continue;
      eligible++;
      const old = gate.old(oldContext(row.r, permissions));
      const next = permissions.includes(gate.key);
      if (old !== next) diffs.push({ u: row.u, c: row.c, role: row.r, old, next });
    }
    expect(eligible).toBeGreaterThan(0);
    expect(diffs).toEqual([]);
  });

  it.each(gates)("$id: admin sintético com as chaves de platform_admin tem acesso", (gate) => {
    const areas = accessByPermission("admin", platformPermissions);
    expect(gate.areas.every((area) => areas.has(area))).toBe(true);
    expect(gate.old(oldContext("admin", platformPermissions))).toBe(true);
    expect(platformPermissions.includes(gate.key)).toBe(true);
  });
});

describe("#311 F2d — guardas na fonte", () => {
  it.each([...new Set(gates.map((gate) => gate.file))])("%s usa as chaves previstas sem portões por papel", (file) => {
    const source = readFileSync(resolve(process.cwd(), `src/pages/${file}.tsx`), "utf8");
    for (const gate of gates.filter((candidate) => candidate.file === file)) {
      expect(source.includes(`hasPermission("${gate.key}")`), `${gate.id}: ${gate.key}`).toBe(true);
    }
    // O lookbehind negativo exclui comparações de dados como r.role/row.role.
    expect(source.match(/(?<![.\w])role\s*[!=]==|\bisAdmin\b/g)).toEqual(null);
  });
});

const fixture = vi.hoisted(() => ({
  auth: { role: "admin", isAdmin: true, user: { id: "actor" }, permissions: [] as string[] },
}));
vi.mock("@/contexts/AuthContext", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/contexts/AuthContext")>(),
  useAuth: () => ({ ...fixture.auth, hasPermission: (key: string) => fixture.auth.permissions.includes(key) }),
}));
vi.mock("@/hooks/useCompany", () => ({
  useCompany: () => ({ companyId: "active-company", company: { display_name: "Empresa sintética" } }),
}));
// As páginas são reais; callbacks de consultas/mutações nunca executam.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [{ id: "other-user", role: "editor", full_name: "Outro utilizador", email: "other@example.invalid" }], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy({}, { get: () => { throw new Error("#311 F2d: serviço MP proibido"); } }),
}));
vi.mock("@/components/UserPermissionsModal", () => ({ default: () => <div>MODAL-PERMISSÕES</div> }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), getAuditUser: vi.fn() }));

import UserManagement from "@/pages/UserManagement";
import CustomerMatchEnsure from "@/pages/crm-admin/google-ads/CustomerMatchEnsure";

function setAuth(role: string, permissions: string[]) {
  fixture.auth = { ...fixture.auth, role, isAdmin: role === "admin" || role === "platform_admin", permissions };
}

function renderUsers() {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><UserManagement /></MemoryRouter>);
}

beforeEach(() => {
  setAuth("admin", platformPermissions);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#311 F2d: rede proibida"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#311 F2d: rede proibida"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#311 F2d: rede proibida"); } });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  cleanup();
  vi.unstubAllGlobals();
});

describe("#311 F2d — excepções efectivas nas páginas", () => {
  it("admin com settings.users negada vê Acesso restrito a administradores", () => {
    setAuth("admin", resolveEffectivePermissions({
      roles: ["admin"], rolePermissions: [], allPermissions: platformPermissions,
      overrides: [{ permission: "settings.users", granted: false }],
    }));
    renderUsers();
    expect(screen.getByText("Acesso restrito a administradores.")).toBeInTheDocument();
    expect(screen.queryByText(/Gestão de Utilizadores/)).not.toBeInTheDocument();
  });

  it("settings.permissions negada esconde só o botão de permissões da linha", () => {
    setAuth("admin", platformPermissions.filter((key) => key !== "settings.permissions"));
    renderUsers();
    expect(screen.queryByTitle("Configurar permissões individuais")).not.toBeInTheDocument();
    expect(screen.getByTitle("Reenviar email de definição de senha")).toBeInTheDocument();
    expect(screen.getByTitle("Remover acesso a esta empresa")).toBeInTheDocument();
  });

  it("settings.users e settings.permissions concedidas permitem abrir o modal", () => {
    setAuth("manager", ["settings.users", "settings.permissions"]);
    renderUsers();
    fireEvent.click(screen.getByTitle("Configurar permissões individuais"));
    expect(screen.getByText("MODAL-PERMISSÕES")).toBeInTheDocument();
  });

  it("manager com module.audience entra em Customer Match", () => {
    setAuth("manager", ["module.audience"]);
    render(<CustomerMatchEnsure />);
    expect(screen.queryByText(/Sem permissão/)).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("content_manager sem module.audience vê a recusa autorizada", () => {
    const content = rows.find((row) => row.r === "content_manager")!;
    setAuth(content.r, content.p ?? []);
    render(<CustomerMatchEnsure />);
    expect(screen.getByText("Sem permissão para gerir Customer Match. Requer acesso ao módulo MP Audience.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
