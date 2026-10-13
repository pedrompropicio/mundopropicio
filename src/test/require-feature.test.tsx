import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let features = new Set<string>();
vi.mock("@/hooks/useCompanyFeatures", () => ({
  useCompanyFeaturesSet: () => ({ data: features, isLoading: false }),
  useCompanyFeatures: () => features,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "x@y" }, signOut: vi.fn(), hasPermission: () => true }),
}));

import { RequireFeature } from "@/components/RequireFeature";
import { CrmSidebar } from "@/components/CrmSidebar";

const wrap = (n: React.ReactNode) => render(<MemoryRouter>{n}</MemoryRouter>);

describe("visibilidade por company_features", () => {
  it("rota bloqueada sem a chave", () => {
    features = new Set();
    wrap(<RequireFeature feature="crm-clube-newgang"><p>clube</p></RequireFeature>);
    expect(screen.getByText("Não disponível nesta empresa")).toBeTruthy();
    expect(screen.queryByText("clube")).toBeNull();
  });
  it("rota aberta com a chave", () => {
    features = new Set(["crm-clube-newgang"]);
    wrap(<RequireFeature feature="crm-clube-newgang"><p>clube</p></RequireFeature>);
    expect(screen.getByText("clube")).toBeTruthy();
  });
  it("menu esconde itens exclusivos sem chave", () => {
    features = new Set();
    wrap(<CrmSidebar />);
    expect(screen.queryByTitle("Clube Newgang")).toBeNull();
    expect(screen.queryByTitle("Site Newgang")).toBeNull();
    expect(screen.getByTitle("Contactos")).toBeTruthy();
  });
  it("menu mostra itens com chave", () => {
    features = new Set(["crm-clube-newgang", "crm-site-newgang"]);
    wrap(<CrmSidebar />);
    expect(screen.getByTitle("Clube Newgang")).toBeTruthy();
    expect(screen.getByTitle("Site Newgang")).toBeTruthy();
  });
});
