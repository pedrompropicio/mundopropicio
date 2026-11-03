import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import { CompanyBrandingProvider } from "@/contexts/CompanyBrandingContext";
import { BrandedLogo } from "@/components/BrandedLogo";
import Companies from "@/pages/admin/Companies";
import logoMundoPropicio from "@/assets/logo-horizontal.png";

const f = vi.hoisted(() => ({
  companies: [] as Company[],
  update: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// The query never executes; saves go exclusively to these in-memory spies.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: f.companies, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    if (table !== "companies") throw new Error("#586: tabela não autorizada no teste");
    return { update: f.update };
  },
} }));
vi.mock("@/components/CompanyFeaturesPanel", () => ({ CompanyFeaturesPanel: () => null }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const company: Company = {
  id: "fixture-company", legal_name: "Empresa sintética, Lda", display_name: "Empresa sintética",
  slug: "fixture-company", tax_id: null, country: "PT", currency: "EUR", timezone: "Europe/Lisbon",
  logo_url: null, favicon_url: null, theme_config: null, address: null, contact_email: null, status: "active",
};
const mp = { ...company, display_name: "Mundo Propício", logo_url: "https://assets.example.invalid/mp-logo.png" };

function setCompany(value: Company | null) {
  vi.mocked(useCompany).mockReturnValue({ company: value, companyId: value?.id ?? null,
    isLoading: !value, isError: false, error: null, isPlatformAdmin: true, refetch: vi.fn() });
}
function domHash() {
  return createHash("sha256").update(document.body.innerHTML).digest("hex");
}
function openEditor(overrides: Partial<Company> = {}) {
  f.companies = [{ ...company, ...overrides }];
  render(<Companies />);
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  return within(screen.getByRole("dialog"));
}
async function saveCompany() {
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(f.eq).toHaveBeenCalledWith("id", company.id));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(f.update).toHaveBeenCalledTimes(1);
  return f.update.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  setCompany(company);
  f.companies = [company];
  f.eq.mockResolvedValue({ error: null });
  f.update.mockReturnValue({ eq: f.eq });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#586: rede proibida neste teste"); }));
  const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  return () => {
    if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoView);
    else delete HTMLElement.prototype.scrollIntoView;
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("#586 — fusos no editor real", () => {
  const brazilTimezones = [
    "America/Sao_Paulo", "America/Fortaleza", "America/Recife", "America/Bahia", "America/Belem",
    "America/Manaus", "America/Cuiaba", "America/Porto_Velho", "America/Rio_Branco", "America/Noronha",
  ];
  it.each([...brazilTimezones, "Europe/Lisbon", "Europe/Madrid", "Atlantic/Azores", "Atlantic/Madeira", "Asia/Tokyo", "Custom/Stored_Value"])(
    "mostra o fuso guardado %s e preserva-o ao guardar", async timezone => {
      const editor = openEditor({ timezone });
      expect(editor.getByRole("combobox", { name: "Fuso horário" })).toHaveTextContent(timezone);
      expect((await saveCompany()).timezone).toBe(timezone);
    },
  );

  it("oferece os fusos BR e permite voltar ao valor guardado fora da lista", async () => {
    const editor = openEditor({ timezone: "Asia/Tokyo" });
    const trigger = editor.getByRole("combobox", { name: "Fuso horário" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    for (const zone of [...brazilTimezones, "Asia/Tokyo"]) {
      expect(screen.getByRole("option", { name: zone })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("option", { name: "America/Fortaleza" }));
    expect(trigger).toHaveTextContent("America/Fortaleza");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Asia/Tokyo" }));
    expect(trigger).toHaveTextContent("Asia/Tokyo");
    expect((await saveCompany()).timezone).toBe("Asia/Tokyo");
  });
});

describe("#586 — cor primária sem defaults gravados", () => {
  it.each([null, {}, { accent: "160 60% 45%" }])("sem cor mantém theme_config=%j intacto", async theme_config => {
    const editor = openEditor({ theme_config });
    const field = editor.getByRole("textbox", { name: "Cor primária" });
    expect(field).toHaveValue("");
    expect(field).toHaveAttribute("placeholder", "Sem cor própria");
    const payload = await saveCompany();
    expect(payload.theme_config).toEqual(theme_config);
    expect(payload.theme_config ?? {}).not.toHaveProperty("primary_color");
  });

  it("com cor própria mantém o payload actual e as restantes chaves", async () => {
    const theme_config = { primary_color: "#2A3D81", accent: "160 60% 45%" };
    const editor = openEditor({ theme_config });
    expect(editor.getByRole("textbox", { name: "Cor primária" })).toHaveValue("#2A3D81");
    expect(await saveCompany()).toEqual({
      display_name: company.display_name, legal_name: company.legal_name, tax_id: null,
      country: company.country, currency: company.currency, timezone: company.timezone,
      contact_email: null, status: company.status, logo_url: null, theme_config,
    });
  });

  it("grava uma cor escolhida no picker neutro e preserva o resto do tema", async () => {
    const editor = openEditor({ theme_config: { accent: "160 60% 45%" } });
    fireEvent.change(editor.getByLabelText("Escolher cor primária"), { target: { value: "#123456" } });
    expect(editor.getByRole("textbox", { name: "Cor primária" })).toHaveValue("#123456");
    expect((await saveCompany()).theme_config).toEqual({ accent: "160 60% 45%", primary_color: "#123456" });
  });

  it("grava uma cor introduzida no campo de texto", async () => {
    const editor = openEditor();
    fireEvent.change(editor.getByRole("textbox", { name: "Cor primária" }), { target: { value: "#abcdef" } });
    expect((await saveCompany()).theme_config).toEqual({ primary_color: "#abcdef" });
  });

  it("escolher e depois limpar não introduz uma cor no tema", async () => {
    const editor = openEditor();
    const field = editor.getByRole("textbox", { name: "Cor primária" });
    fireEvent.change(field, { target: { value: "#abcdef" } });
    fireEvent.change(field, { target: { value: "" } });
    expect(field).toHaveValue("");
    expect((await saveCompany()).theme_config).toBeNull();
  });
});

describe("#586 — fallback do logo por empresa", () => {
  it.each(["Empresa sintética", "MP Gestão Eventos"])("empresa carregada sem logo mostra o nome %s", display_name => {
    setCompany({ ...company, display_name });
    render(<CompanyBrandingProvider><BrandedLogo className="h-12 w-auto" /></CompanyBrandingProvider>);
    const name = screen.getByText(display_name);
    expect(name).toHaveClass("h-12", "w-auto");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("logo-horizontal.png");
  });

  it("mantém a altura por defeito no nome sem logo", () => {
    render(<CompanyBrandingProvider><BrandedLogo /></CompanyBrandingProvider>);
    expect(screen.getByText(company.display_name)).toHaveClass("h-9");
  });

  it("com logo mostra a imagem e preserva alt e classe fornecidos", () => {
    setCompany({ ...company, logo_url: "https://assets.example.invalid/tenant.png" });
    render(<CompanyBrandingProvider><BrandedLogo alt="Marca sintética" className="h-12" /></CompanyBrandingProvider>);
    const img = screen.getByRole("img", { name: "Marca sintética" });
    expect(img).toHaveAttribute("src", "https://assets.example.invalid/tenant.png");
    expect(img).toHaveClass("h-12");
  });

  it("acompanha carregamento, empresa sem logo, empresa com logo e regresso", () => {
    setCompany(null);
    const tree = <CompanyBrandingProvider><BrandedLogo /></CompanyBrandingProvider>;
    const view = render(tree);
    expect(screen.getByRole("img")).toHaveAttribute("src", logoMundoPropicio);
    setCompany(company);
    view.rerender(<CompanyBrandingProvider><BrandedLogo /></CompanyBrandingProvider>);
    expect(screen.getByText(company.display_name)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    setCompany(mp);
    view.rerender(<CompanyBrandingProvider><BrandedLogo /></CompanyBrandingProvider>);
    expect(screen.getByRole("img")).toHaveAttribute("src", mp.logo_url);
    setCompany(company);
    view.rerender(<CompanyBrandingProvider><BrandedLogo /></CompanyBrandingProvider>);
    expect(screen.getByText(company.display_name)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("não introduz ramos por país", () => {
    for (const file of ["src/pages/admin/Companies.tsx", "src/components/BrandedLogo.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
    }
  });
});

describe("#586 — DOM fixado antes de alterar BrandedLogo", () => {
  it("preserva o DOM da MP com logo próprio", () => {
    setCompany(mp);
    render(<CompanyBrandingProvider><BrandedLogo /></CompanyBrandingProvider>);
    expect(domHash()).toMatchInlineSnapshot(`"9c480f2116624f46276d78e0846231fecd5cebb0b5b82c1333d3138479c3c20e"`);
    expect(screen.getByRole("img")).toHaveAttribute("src", mp.logo_url);
  });

  it("preserva o DOM do contexto default sem empresa carregada", () => {
    setCompany(null);
    render(<BrandedLogo />);
    expect(domHash()).toMatchInlineSnapshot(`"25e98d26becd832db9a9ac04588932a6c7cab7c7e39a3ae7375929d5a57b595b"`);
    expect(screen.getByRole("img")).toHaveAttribute("src", logoMundoPropicio);
  });
});
