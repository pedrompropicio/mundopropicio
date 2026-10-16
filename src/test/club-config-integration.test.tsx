import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrewsSection } from "@/pages/crm-admin/sites/CrewsSection";
import { SimpleTable, ClubTab } from "@/pages/crm-admin/sites/NewgangSite";
import { MemoryRouter } from "react-router-dom";

const fake = vi.hoisted(() => ({ config: null as any, configError: false, pending: null as null | Promise<any>, writes: [] as any[], profileRule: false, calls: [] as any[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const filters: Record<string, unknown> = {}; let write: any;
    const builder: any = {
      select: () => builder, order: () => builder, limit: () => builder, maybeSingle: () => builder,
      eq: (key: string, v: unknown) => { filters[key] = v; return builder; },
      update: (v: any) => { write = v; return builder; }, insert: (v: any) => { write = v; return builder; }, delete: () => { write = { deleted: true }; return builder; },
      then: (resolve: any) => {
        if (write) { fake.writes.push({ table, write, filters }); return Promise.resolve({ data: null, error: null }).then(resolve); }
        if (table === "club_points_config") {
          if (fake.pending) return fake.pending.then(resolve);
          return Promise.resolve({ data: fake.config?.site_id === filters.site_id ? fake.config : null, error: fake.configError ? new Error("failed") : null }).then(resolve);
        }
        const row = table === "club_levels" ? { id: "level", name: "Goat", min_points: 1500, benefit: "benefit" }
          : { id: "rule", rule_key: fake.profileRule ? "profile_complete" : "crew_complete", label: fake.profileRule ? "Perfil" : "Crew", points: fake.profileRule ? 50 : 200, min_members: 4, max_members: 6, active: true };
        return Promise.resolve({ data: table === "club_point_rules" ? (filters.rule_key ? row : [row]) : table === "club_levels" ? [row] : [], error: null }).then(resolve);
      },
    }; return builder;
  },
  rpc: (fn: string, args: any) => { fake.calls.push({ fn, args }); return Promise.resolve({ data: fn === "club_ranking" ? [{ member_id: "protected", first_name: "Fixture", points: 1500, level_name: "Goat", rank_pos: 1 }] : [], error: null }); },
} }));
vi.mock("@/pages/crm-admin/sites/MissionsSection", () => ({ MissionsSection: () => null }));
vi.mock("@/pages/crm-admin/sites/ClubTermsSection", () => ({ ClubTermsSection: () => null }));
const config = { site_id: "site-a", event_id: "event-a", status: "active", version: "2027-v1", crew_points: 100, referral_points: 75, referral_cap: 750, join_points: 100, purchase_points: 200, purchase_enabled: false, levels: { Gang: 0, Crew: 750, Goat: 3000 } };
beforeEach(() => { vi.stubGlobal("fetch", () => { throw new Error("#327 egress forbidden"); }); });
function mount(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
  return { ...render(node, { wrapper }), client };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); fake.config = null; fake.configError = false; fake.pending = null; fake.writes = []; fake.calls = []; fake.profileRule = false; });
describe("#327 integration without network", () => {
  it("draft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa", async () => {
    const { client } = mount(<CrewsSection siteId="site-a" companyId="company" eventId="event-a" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(fake.writes).toHaveLength(1));
    expect(fake.writes[0].write.points).toBe(200);
    fake.config = config;
    await act(async () => { await client.invalidateQueries({ queryKey: ["club-points-config-active"] }); });
    await waitFor(() => expect(screen.getByLabelText("Pontos por membro")).toHaveValue(100));
    expect(screen.getByLabelText("Pontos por membro")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(fake.writes).toHaveLength(2));
    expect(fake.writes[1].write).toEqual({ min_members: 4, max_members: 6, active: true });
  });
  it("loading e erro bloqueiam gravação, sem fallback editável", async () => {
    let resolve: (v: any) => void = () => {};
    fake.pending = new Promise(r => { resolve = r; });
    mount(<CrewsSection siteId="site-a" companyId="company" eventId="event-a" />);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(screen.getByLabelText("Pontos por membro")).toHaveValue(null);
    await act(async () => { resolve({ data: null, error: new Error("failed") }); });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(fake.writes).toEqual([]);
  });
  it("refetch bloqueia e troca de site não reutiliza configuração", async () => {
    fake.config = config;
    const ui = mount(<CrewsSection siteId="site-a" companyId="company" eventId="event-a" />);
    await waitFor(() => expect(screen.getByLabelText("Pontos por membro")).toHaveValue(100));
    let resolve: (v: any) => void = () => {};
    fake.pending = new Promise(r => { resolve = r; });
    act(() => { void ui.client.invalidateQueries({ queryKey: ["club-points-config-active"] }); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled());
    ui.rerender(<CrewsSection siteId="site-b" companyId="company" eventId="event-b" />);
    expect(screen.getByLabelText("Pontos por membro")).toHaveValue(null);
    await act(async () => { fake.pending = null; resolve({ data: null, error: null }); });
    await waitFor(() => expect(screen.getByLabelText("Pontos por membro")).toHaveValue(200));
  });
  it("editor geral não grava points ativo nem muda nomes/limiares, benefício mantém-se editável", async () => {
    fake.config = config;
    const ui = mount(<SimpleTable table="club_point_rules" siteId="site-a" companyId="company" eventId="event-a" order="rule_key" cols={[{ k: "points", l: "Pontos", num: true }]} />);
    await waitFor(() => expect(screen.getByLabelText("Pontos")).toHaveValue(100));
    expect(screen.getByLabelText("Pontos")).toBeDisabled();
    ui.rerender(<SimpleTable table="club_levels" siteId="site-a" companyId="company" order="min_points" cols={[{ k: "name", l: "Nome" }, { k: "min_points", l: "Mínimo", num: true }, { k: "benefit", l: "Benefício" }]} />);
    await waitFor(() => expect(screen.getByLabelText("Mínimo")).toBeDisabled());
    expect(screen.getByLabelText("Nome")).toBeDisabled();
    fireEvent.blur(screen.getByLabelText("Benefício"), { target: { value: "preserved" } });
    await waitFor(() => expect(fake.writes).toHaveLength(1));
    expect(fake.writes[0].write).toEqual({ benefit: "preserved" });
  });
  it("ranking mostra Goat canónico protegido apesar de apenas 1500 pontos", async () => {
    fake.config = config;
    mount(<ClubTab site={{ id: "site-a", event_id: "event-a", company_id: "company" } as any} />);
    await waitFor(() => expect(screen.getByText(/1500 pts · Goat/)).toBeInTheDocument());
    expect(fake.calls).toContainEqual({ fn: "club_ranking", args: { p_site: "site-a", p_limit: 20 } });
  });
});
describe("#330 real CRM profile rule compatibility", () => {
  it.each([null, config])("50 permanent only label editable before/after active config %s", async (cfg) => {
    fake.profileRule = true; fake.config = cfg;
    mount(<SimpleTable table="club_point_rules" siteId="site-a" companyId="company" eventId="event-a" order="rule_key" cols={[{k:"rule_key",l:"Chave"},{k:"points",l:"Pontos",num:true},{k:"label",l:"Rótulo"}]} />);
    await waitFor(() => expect(screen.getByLabelText("Pontos")).toHaveValue(50));
    expect(screen.getByLabelText("Pontos")).toBeDisabled(); expect(screen.getByLabelText("Chave")).toBeDisabled();
    fireEvent.blur(screen.getByLabelText("Pontos"), {target:{value:"500"}});
    await act(async () => { await Promise.resolve(); }); expect(fake.writes).toEqual([]);
    expect(screen.getByRole("button",{name:"Remover"})).toBeDisabled();
    fireEvent.blur(screen.getByLabelText("Rótulo"), {target:{value:"Meu perfil"}});
    await waitFor(() => expect(fake.writes).toHaveLength(1)); expect(fake.writes[0].write).toEqual({label:"Meu perfil"});
  });
});
