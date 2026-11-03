import { createHash } from "node:crypto";
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminPanel from "@/pages/AdminPanel";
import InvariantMonitor from "@/pages/admin/InvariantMonitor";
import SystemRemindersBanner from "@/components/SystemRemindersBanner";

const f = vi.hoisted(() => ({
  role: "platform_admin" as string | null,
  companyId: "company-a" as string | null,
  rpc: vi.fn(),
  from: vi.fn(),
  queries: [] as {
    table: string;
    select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>; lte: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  role: f.role, hasPermission: () => true,
}) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  companyId: f.companyId,
  company: f.companyId ? { id: f.companyId, country: "PT", currency: "EUR" } : null,
  isPlatformAdmin: f.role === "platform_admin", isLoading: false, isError: false,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: f.rpc, from: f.from } }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/CompanyBudgetModeCard", () => ({ CompanyBudgetModeCard: () => null }));

const reminders = [
  { id: "drift", key: "invariant_drift", title: "Desvio global", company_id: null },
  { id: "capi", key: "leads_capi", title: "CAPI de leads", company_id: null },
  { id: "backup", key: "backup", title: "Backup global", company_id: null },
  { id: "own", key: "own", title: "Lembrete da empresa A", company_id: "company-a" },
  { id: "other", key: "other", title: "Lembrete da empresa B", company_id: "company-b" },
].map(row => ({ ...row, message: `Mensagem ${row.id}`, due_date: "2020-01-01", link_url: null }));
const checks = [
  { name: "secdef_abertas_a_anon", scope: "global", conforme: false, current_count: 2 },
  { name: "regra_empresa", scope: "empresa", conforme: true, current_count: 0 },
].map(row => ({
  ...row, description: `Descrição ${row.name}`, severity: "warn", reference_count: 0,
  notes: "Nota sintética", sample: [{ company_id: "company-b", id: "sample" }],
}));
const runs = [{ id: "run", ran_at: "2026-11-01T12:00:00Z", drift_count: 1, results: checks }];
const smoke = [
  { code: "rpc_ok", ok: true, error: null, checked_at: "2026-11-01T12:00:00Z" },
  { code: "rpc_failed", ok: false, error: "Falha sintética", checked_at: "2026-11-01T12:00:00Z" },
];
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
  </QueryClientProvider>;
}
function domHash(container: HTMLElement) {
  return createHash("sha256")
    .update(container.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:"))
    .digest("hex");
}
async function settled() {
  await waitFor(() => expect(client.isFetching()).toBe(0));
}
beforeEach(() => {
  vi.clearAllMocks();
  f.role = "platform_admin"; f.companyId = "company-a"; f.queries = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  f.rpc.mockImplementation(async (name: string) => {
    if (name === "run_invariant_checks") return { data: checks, error: null };
    if (name === "check_rpc_smoke") return { data: smoke, error: null };
    if (["run_invariant_checks_and_log", "accept_invariant_reference"].includes(name)) {
      return { data: null, error: null };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  f.from.mockImplementation((table: string) => {
    if (!["system_reminders", "invariant_runs"].includes(table)) throw new Error(`Tabela inesperada: ${table}`);
    // Deliberately return every tenant/global row, even with eq: the UI must also
    // reject an out-of-scope response or cached payload. No service is contacted.
    const query = {
      table, select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: table === "system_reminders" ? reminders : runs, error: null,
      }).then(resolve),
    };
    f.queries.push(query);
    return query;
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#584: rede proibida"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#584: rede proibida"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#584: rede proibida"); } });
});
afterEach(() => {
  cleanup(); client.clear();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("#584 — DOM platform_admin fixado antes de alterar produção; não regenerar", () => {
  it("conserva painel, monitor e banner completos", async () => {
    const hashes: Record<string, string> = {};
    for (const [name, node] of [
      ["panel", <AdminPanel />], ["monitor", <InvariantMonitor />], ["banner", <SystemRemindersBanner />],
    ] as const) {
      const view = render(node, { wrapper });
      await settled();
      await screen.findByText(name === "monitor" ? "secdef_abertas_a_anon" : "CAPI de leads");
      hashes[name] = domHash(view.container);
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "banner": "84be83994eb7d4f43fff79a73c3e151534b5a0d9b888e1e54d1141bc2740b5d2",
        "monitor": "91bce6321ec326706e85103258ca6a25c712015bc7e2bbf8791de37157ba3a96",
        "panel": "1568793606d05c6eaf4c5e96d29c9a9635f2b2ff5bc3bb9fd71d5010f48d68bf",
      }
    `);
  });

  it("conserva amostra, diálogo e RPCs de execução e aceitação", async () => {
    const view = render(<InvariantMonitor />, { wrapper });
    await screen.findByText("secdef_abertas_a_anon");
    await settled();
    fireEvent.click(screen.getAllByRole("button", { name: /Amostra/ })[0]);
    expect(screen.getByText(/"company_id": "company-b"/)).toBeInTheDocument();
    expect(domHash(view.container)).toMatchInlineSnapshot(`"ebd3413638a5452883e177022bed3dc0174b6888c7f6fe969f0152cad91c7de7"`);
    fireEvent.click(screen.getByRole("button", { name: "Aceitar 2 como referência" }));
    expect(domHash(document.body)).toMatchInlineSnapshot(`"042960849996bcdef89b06e7527ae8556686b1ddf78dfa5c2afd987558747557"`);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Referência revista" } });
    fireEvent.click(screen.getByRole("button", { name: "Aceitar referência" }));
    await waitFor(() => expect(f.rpc).toHaveBeenCalledWith("accept_invariant_reference", {
      _name: "secdef_abertas_a_anon", _new_reference: 2, _note: "Referência revista",
    }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Correr agora" }));
    await waitFor(() => expect(f.rpc).toHaveBeenCalledWith("run_invariant_checks_and_log"));
    expect(f.rpc).toHaveBeenCalledWith("run_invariant_checks");
    expect(f.rpc).toHaveBeenCalledWith("check_rpc_smoke");
  });
});

describe("#584 — isolamento do admin de tenant", () => {
  beforeEach(() => { f.role = "admin"; });

  it("retira só os três cartões de plataforma e mantém os cartões do tenant", async () => {
    render(<AdminPanel />, { wrapper });
    await screen.findByText("Lembrete da empresa A");
    for (const title of ["Verificador de Invariantes", "Sincronizar manual", "Lacunas do manual", "Empresas"]) {
      expect(screen.queryByText(title)).toBeNull();
    }
    for (const title of ["Utilizadores", "Backups", "Lembretes", "Auditoria de Downloads"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it.each(["admin", "manager", "editor", null])("%s não lê nem chama RPC na rota directa, mesmo com cache da plataforma", async role => {
    f.role = role;
    client.setQueryData(["invariant-checks"], checks);
    client.setQueryData(["invariant-runs"], runs);
    client.setQueryData(["rpc-smoke"], smoke);
    render(<QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/invariantes"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/admin/invariantes" element={<InvariantMonitor />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>);
    expect(screen.getByText("Sem permissão para ver esta página.")).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByText("secdef_abertas_a_anon")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(client.getQueryCache().getAll().map(query => query.isDisabled())).toEqual([true, true, true]);
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.from).not.toHaveBeenCalled();
  });

  it("filtra a consulta e a resposta à própria empresa, preservando os filtros de actividade e prazo", async () => {
    render(<SystemRemindersBanner />, { wrapper });
    await screen.findByText("Lembrete da empresa A");
    expect(screen.getAllByRole("link", { name: "Gerir" })).toHaveLength(1);
    for (const row of reminders.filter(row => row.company_id !== "company-a")) {
      expect(screen.queryByText(row.title)).toBeNull();
    }
    expect(f.from).toHaveBeenCalledExactlyOnceWith("system_reminders");
    const query = f.queries[0];
    expect(query.select).toHaveBeenCalledWith("id,key,title,message,due_date,link_url,company_id");
    expect(query.eq).toHaveBeenCalledWith("company_id", "company-a");
    expect(query.eq).toHaveBeenCalledWith("is_active", true);
    expect(query.is).toHaveBeenCalledWith("completed_at", null);
    expect(query.lte).toHaveBeenCalledWith("due_date", new Date().toISOString().slice(0, 10));
    expect(query.order).toHaveBeenCalledWith("due_date", { ascending: true });
    expect(client.getQueryCache().getAll().map(query => query.queryKey))
      .toEqual([["system-reminders-active", "company-a", "admin"]]);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("não reutiliza lembretes globais ao passar de platform_admin para admin", async () => {
    f.role = "platform_admin";
    const view = render(<SystemRemindersBanner />, { wrapper });
    await screen.findByText("CAPI de leads");
    f.role = "admin";
    view.rerender(<SystemRemindersBanner />);
    expect(screen.queryByText("CAPI de leads")).toBeNull();
    await screen.findByText("Lembrete da empresa A");
    expect(screen.queryByText("Lembrete da empresa B")).toBeNull();
    expect(f.queries[1].eq).toHaveBeenCalledWith("company_id", "company-a");
    expect(client.getQueryCache().getAll().map(query => query.queryKey)).toEqual([
      ["system-reminders-active", "company-a", "platform_admin"],
      ["system-reminders-active", "company-a", "admin"],
    ]);
  });

  it("não reutiliza lembretes de outra empresa ao trocar ou perder o contexto activo", async () => {
    const view = render(<SystemRemindersBanner />, { wrapper });
    await screen.findByText("Lembrete da empresa A");
    f.companyId = "company-b";
    view.rerender(<SystemRemindersBanner />);
    expect(screen.queryByText("Lembrete da empresa A")).toBeNull();
    await screen.findByText("Lembrete da empresa B");
    expect(f.queries[1].eq).toHaveBeenCalledWith("company_id", "company-b");
    f.companyId = null;
    view.rerender(<SystemRemindersBanner />);
    expect(view.container).toBeEmptyDOMElement();
    await act(async () => {});
    expect(f.from).toHaveBeenCalledTimes(2);
    expect(client.getQueryCache().getAll().map(query => query.queryKey)).toEqual([
      ["system-reminders-active", "company-a", "admin"],
      ["system-reminders-active", "company-b", "admin"],
      ["system-reminders-active", null, "admin"],
    ]);
  });

  it.each(["admin", "manager", "editor", null])("%s sem empresa activa não consulta lembretes", async role => {
    f.role = role; f.companyId = null;
    const view = render(<SystemRemindersBanner />, { wrapper });
    await act(async () => {});
    expect(view.container).toBeEmptyDOMElement();
    expect(f.from).not.toHaveBeenCalled();
  });

  it.each(["manager", "editor", null])("%s com empresa não consulta nem mostra lembretes em cache", async role => {
    f.role = role;
    client.setQueryData(["system-reminders-active", "company-a", role], reminders);
    const view = render(<SystemRemindersBanner />, { wrapper });
    await act(async () => {});
    expect(view.container).toBeEmptyDOMElement();
    expect(f.from).not.toHaveBeenCalled();
  });

  it("retira os dados do monitor ao perder o papel platform_admin", async () => {
    f.role = "platform_admin";
    const view = render(<InvariantMonitor />, { wrapper });
    await screen.findByText("secdef_abertas_a_anon");
    await settled();
    f.rpc.mockClear(); f.from.mockClear();
    f.role = "admin";
    view.rerender(<InvariantMonitor />);
    expect(screen.getByText("Sem permissão para ver esta página.")).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByText("secdef_abertas_a_anon")).toBeNull();
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.from).not.toHaveBeenCalled();
  });
});

it("#584 — platform_admin sem empresa activa mantém todos os lembretes", async () => {
  f.companyId = null;
  render(<SystemRemindersBanner />, { wrapper });
  await screen.findByText("CAPI de leads");
  for (const row of reminders) expect(screen.getByText(row.title)).toBeInTheDocument();
  expect(f.queries[0].eq).not.toHaveBeenCalledWith("company_id", expect.anything());
});
