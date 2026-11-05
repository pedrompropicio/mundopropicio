import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useCompany, type Company } from "@/hooks/useCompany";
import { CompanyBrandingProvider, useCompanyBranding } from "@/contexts/CompanyBrandingContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { BrandedLogo } from "@/components/BrandedLogo";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import Companies from "@/pages/admin/Companies";
import logoMundoPropicio from "@/assets/logo-horizontal.png";

const f = vi.hoisted(() => ({
  companies: [] as Company[],
  loadingCompanies: false,
  update: vi.fn(), eq: vi.fn(), upload: vi.fn(), publicUrl: vi.fn(), toast: vi.fn(),
  setActive: vi.fn(), scroll: vi.fn(),
}));
vi.mock("@/hooks/useCompany", () => ({
  useCompany: vi.fn(),
  useCompaniesList: () => ({ data: f.companies, isLoading: f.loadingCompanies }),
  useUserMemberships: () => ({ data: [], isLoading: false }),
  useSetActiveCompany: () => ({ mutateAsync: f.setActive, isPending: false }),
  useProfileActiveCompanyId: () => ({ data: null }),
}));
// No query runs and no real client is imported: all writes/uploads are synthetic.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: f.companies, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    if (table !== "companies") throw new Error("#586b: tabela não autorizada no teste");
    return { update: f.update };
  },
  storage: { from: (bucket: string) => {
    if (bucket !== "company-logos") throw new Error("#586b: bucket não autorizado no teste");
    return { upload: f.upload, getPublicUrl: f.publicUrl };
  } },
} }));
vi.mock("@/components/CompanyFeaturesPanel", () => ({ CompanyFeaturesPanel: () => null }));
vi.mock("@/hooks/use-toast", () => ({ toast: f.toast, useToast: () => ({ toast: f.toast }) }));

const company: Company = {
  id: "fixture-company", legal_name: "Empresa sintética, Lda", display_name: "Empresa sintética",
  slug: "fixture-company", tax_id: null, country: "PT", currency: "EUR", timezone: "Europe/Lisbon",
  logo_url: null, favicon_url: null, theme_config: null, address: null, contact_email: null, status: "active",
};
const urls = {
  light: "https://assets.example.invalid/light.png",
  dark: "https://assets.example.invalid/dark.png",
  horizontal: "https://assets.example.invalid/horizontal.png",
  horizontalDark: "https://assets.example.invalid/horizontal-dark.png",
};
const logoFields = [
  ["logo_dark_url", "Logo (modo escuro)", "logo-dark"],
  ["logo_horizontal_url", "Logo horizontal (modo claro)", "logo-horizontal"],
  ["logo_horizontal_dark_url", "Logo horizontal (modo escuro)", "logo-horizontal-dark"],
] as const;

function setCompany(value: Company | null) {
  vi.mocked(useCompany).mockReturnValue({ company: value, companyId: value?.id ?? null,
    isLoading: !value, isError: false, error: null, isPlatformAdmin: true, refetch: vi.fn() });
}
function logoTree(variant?: "square" | "horizontal") {
  return <ThemeProvider><CompanyBrandingProvider><BrandedLogo variant={variant} /></CompanyBrandingProvider></ThemeProvider>;
}
function openEditor(theme_config: Company["theme_config"] = null) {
  f.companies = [{ ...company, theme_config }];
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
function expandHorizontal() {
  fireEvent.click(screen.getByText("Logo horizontal (opcional)"));
  // jsdom does not implement the summary element's native toggle.
  screen.getByText("Logo horizontal (opcional)").closest("details")!.open = true;
}
function uploadLogo(label: string, file = new File(["synthetic image"], "fixture.png", { type: "image/png" })) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  vi.resetAllMocks();
  setCompany(company);
  f.companies = [company];
  f.loadingCompanies = false;
  f.eq.mockResolvedValue({ error: null });
  f.update.mockReturnValue({ eq: f.eq });
  f.upload.mockResolvedValue({ error: null });
  f.publicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://assets.example.invalid/${path}` } }));
  localStorage.setItem("mp-theme", "light");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#586b: rede proibida neste teste"); }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: f.scroll });
  return () => {
    if (previous) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previous);
    else delete HTMLElement.prototype.scrollIntoView;
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.removeItem("mp-theme"); });

describe("#586b — contexto e seleção de logo", () => {
  it.each([undefined, "square", "horizontal"] as const)("sem logos mantém o nome em ambos os temas (variante %s)", variant => {
    for (const theme of ["light", "dark"]) {
      localStorage.setItem("mp-theme", theme);
      const view = render(logoTree(variant));
      expect(screen.getByText(company.display_name)).toBeInTheDocument();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(document.body.innerHTML).not.toContain("logo-horizontal.png");
      view.unmount();
    }
  });

  const cases = [
    ["light", undefined, {}, urls.light],
    ["dark", undefined, {}, urls.light],
    ["light", undefined, { logo_dark_url: urls.dark }, urls.light],
    ["dark", undefined, { logo_dark_url: urls.dark }, urls.dark],
    ["light", "horizontal", {}, urls.light],
    ["dark", "horizontal", {}, urls.light],
    ["dark", "horizontal", { logo_dark_url: urls.dark }, urls.dark],
    ["light", "horizontal", { logo_horizontal_url: urls.horizontal }, urls.horizontal],
    ["dark", "horizontal", { logo_horizontal_url: urls.horizontal }, urls.horizontal],
    ["dark", "horizontal", { logo_horizontal_url: urls.horizontal, logo_dark_url: urls.dark }, urls.horizontal],
    ["light", "horizontal", { logo_horizontal_dark_url: urls.horizontalDark }, urls.light],
    ["dark", "horizontal", { logo_horizontal_dark_url: urls.horizontalDark }, urls.horizontalDark],
    ["dark", "horizontal", { logo_horizontal_url: urls.horizontal, logo_horizontal_dark_url: urls.horizontalDark }, urls.horizontalDark],
    ["dark", "square", { logo_horizontal_url: urls.horizontal, logo_horizontal_dark_url: urls.horizontalDark }, urls.light],
  ] as const;
  it.each(cases)("tema %s, variante %s, configuração %j resolve %s", (theme, variant, theme_config, expected) => {
    localStorage.setItem("mp-theme", theme);
    setCompany({ ...company, logo_url: urls.light, theme_config });
    render(logoTree(variant));
    expect(screen.getByRole("img")).toHaveAttribute("src", expected);
  });

  it("usa logo escuro/horizontal mesmo sem logo claro e não o mostra no tema claro", () => {
    setCompany({ ...company, theme_config: { logo_dark_url: urls.dark } });
    const view = render(logoTree());
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    view.unmount();
    localStorage.setItem("mp-theme", "dark");
    render(logoTree());
    expect(screen.getByRole("img")).toHaveAttribute("src", urls.dark);
  });

  it.each([null, "", "  ", 42, false, {}, []])("normaliza URLs inválidos %j para null", value => {
    function Probe() { return <output>{JSON.stringify(useCompanyBranding())}</output>; }
    setCompany({ ...company, theme_config: { logo_dark_url: value, logo_horizontal_url: value, logo_horizontal_dark_url: value } });
    render(<CompanyBrandingProvider><Probe /></CompanyBrandingProvider>);
    expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual({
      logoUrl: null, logoDarkUrl: null, logoHorizontalUrl: null, logoHorizontalDarkUrl: null,
      displayName: company.display_name,
    });
  });

  it("acompanha a mudança de tema e empresa e remove espaços dos URLs", () => {
    function Toggle() { const { toggleTheme } = useTheme(); return <button onClick={toggleTheme}>Tema</button>; }
    const tree = () => <ThemeProvider><CompanyBrandingProvider><BrandedLogo /><Toggle /></CompanyBrandingProvider></ThemeProvider>;
    setCompany({ ...company, logo_url: urls.light, theme_config: { logo_dark_url: `  ${urls.dark}  ` } });
    const view = render(tree());
    expect(screen.getByRole("img")).toHaveAttribute("src", urls.light);
    fireEvent.click(screen.getByRole("button", { name: "Tema" }));
    expect(screen.getByRole("img")).toHaveAttribute("src", urls.dark);
    setCompany(company);
    view.rerender(tree());
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(company.display_name)).toBeInTheDocument();
  });

  it.each(["light", "dark"])("preserva o hash anterior da MP com logo no tema %s", theme => {
    localStorage.setItem("mp-theme", theme);
    setCompany({ ...company, display_name: "Mundo Propício", logo_url: "https://assets.example.invalid/mp-logo.png" });
    render(logoTree());
    expect(createHash("sha256").update(document.body.innerHTML).digest("hex"))
      .toBe("9c480f2116624f46276d78e0846231fecd5cebb0b5b82c1333d3138479c3c20e");
  });

  it("antes de carregar conserva o logo MP", () => {
    setCompany(null);
    render(logoTree());
    expect(screen.getByRole("img")).toHaveAttribute("src", logoMundoPropicio);
  });
});

describe("#586b — uploads no editor real", () => {
  it("mantém a secção horizontal recolhida por omissão", () => {
    openEditor();
    expect(screen.getByText("Logo horizontal (opcional)").closest("details")).not.toHaveAttribute("open");
  });

  it.each(logoFields)("carrega %s e preserva as restantes chaves", async (key, label, prefix) => {
    const theme_config = { primary_color: "#2A3D81", accent: "160 60% 45%", custom: { retained: true }, logo_dark_url: urls.dark };
    openEditor(theme_config);
    if (key !== "logo_dark_url") expandHorizontal();
    const file = uploadLogo(label);
    await waitFor(() => expect(f.upload).toHaveBeenCalledTimes(1));
    const path = f.upload.mock.calls[0][0];
    expect(path).toMatch(new RegExp(`^${company.id}/${prefix}-\\d+\\.png$`));
    expect(f.upload).toHaveBeenCalledWith(path, file, { cacheControl: "3600", upsert: true });
    await waitFor(() => expect(screen.getByRole("img", { name: label })).toHaveAttribute("src", `https://assets.example.invalid/${path}`));
    expect((await saveCompany()).theme_config).toEqual({ ...theme_config, [key]: `https://assets.example.invalid/${path}` });
  });

  it.each(logoFields)("remover %s grava null e preserva o resto", async (key, label) => {
    const theme_config = { logo_dark_url: urls.dark, logo_horizontal_url: urls.horizontal, logo_horizontal_dark_url: urls.horizontalDark, other: { retained: true } };
    openEditor(theme_config);
    if (key !== "logo_dark_url") expandHorizontal();
    fireEvent.click(screen.getByRole("button", { name: `Remover ${label}` }));
    expect(screen.queryByRole("img", { name: label })).not.toBeInTheDocument();
    expect((await saveCompany()).theme_config).toEqual({ ...theme_config, [key]: null });
    expect(f.upload).not.toHaveBeenCalled();
  });

  it("combina os três uploads, permite removê-los e não inventa primary_color", async () => {
    openEditor();
    expandHorizontal();
    for (const [, label] of logoFields) {
      uploadLogo(label);
      await waitFor(() => expect(screen.getByRole("button", { name: `Remover ${label}` })).toBeEnabled());
    }
    expect(new Set(f.upload.mock.calls.map(([path]) => path)).size).toBe(3);
    for (const [, label] of logoFields) fireEvent.click(screen.getByRole("button", { name: `Remover ${label}` }));
    expect((await saveCompany()).theme_config).toEqual({ logo_dark_url: null, logo_horizontal_url: null, logo_horizontal_dark_url: null });
  });

  it("não deixa guardar enquanto o upload está pendente", async () => {
    let finish!: (value: { error: null }) => void;
    f.upload.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    openEditor();
    uploadLogo("Logo (modo escuro)");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(f.update).not.toHaveBeenCalled();
    finish({ error: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled());
    expect((await saveCompany()).theme_config.logo_dark_url).toMatch(/\/logo-dark-\d+\.png$/);
  });

  it.each([
    ["tipo inválido", new File(["text"], "fixture.txt", { type: "text/plain" }), "Ficheiro inválido"],
    ["mais de 2 MB", new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }), "Ficheiro grande"],
  ] as const)("recusa %s sem upload nem alteração do tema", async (_, file, title) => {
    openEditor({ accent: "retained" });
    uploadLogo("Logo (modo escuro)", file);
    await waitFor(() => expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({ title, variant: "destructive" })));
    expect(f.upload).not.toHaveBeenCalled();
    expect((await saveCompany()).theme_config).toEqual({ accent: "retained" });
  });

  it("falha de upload conserva o URL guardado", async () => {
    f.upload.mockResolvedValueOnce({ error: new Error("synthetic upload failure") });
    openEditor({ logo_dark_url: urls.dark });
    uploadLogo("Logo (modo escuro)");
    await waitFor(() => expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Erro no upload" })));
    expect(screen.getByRole("img", { name: "Logo (modo escuro)" })).toHaveAttribute("src", urls.dark);
    expect(f.publicUrl).not.toHaveBeenCalled();
    expect((await saveCompany()).theme_config).toEqual({ logo_dark_url: urls.dark });
  });
});

describe("#586b — lista real do seletor de empresas", () => {
  function setupSwitcher() {
    f.companies = Array.from({ length: 7 }, (_, index) => ({ ...company,
      id: `company-${index}`, slug: `company-${index}`, display_name: `Empresa ${index}`, legal_name: `Legal ${index}`,
    }));
    setCompany(f.companies[6]);
    return render(<MemoryRouter><CompanySwitcher /></MemoryRouter>);
  }

  it("mostra sete empresas com scroll e revela a ativa a cada abertura", async () => {
    setupSwitcher();
    const trigger = screen.getByRole("combobox");
    for (let opening = 0; opening < 2; opening++) {
      fireEvent.click(trigger);
      const list = screen.getByRole("listbox");
      expect(list).toHaveClass("max-h-[320px]", "overflow-y-auto");
      expect(within(list).getAllByRole("option")).toHaveLength(7);
      for (const c of f.companies) expect(within(list).getByText(c.display_name)).toBeInTheDocument();
      const active = within(list).getByRole("option", { name: /Empresa 6/ });
      await waitFor(() => expect(f.scroll.mock.contexts.at(-1)).toBe(active));
      expect(f.scroll).toHaveBeenLastCalledWith({ block: "nearest" });
      fireEvent.click(trigger);
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      f.scroll.mockClear();
    }
    expect(f.setActive).not.toHaveBeenCalled();
  });

  it("espera pela lista carregada para revelar a ativa", async () => {
    const view = setupSwitcher();
    f.loadingCompanies = true;
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByText("A carregar empresas…")).toBeInTheDocument();
    expect(f.scroll).not.toHaveBeenCalled();
    f.loadingCompanies = false;
    view.rerender(<MemoryRouter><CompanySwitcher /></MemoryRouter>);
    const active = screen.getByRole("option", { name: /Empresa 6/ });
    await waitFor(() => expect(f.scroll.mock.contexts.at(-1)).toBe(active));
  });

  it("preserva pesquisa e navegação por teclado depois de revelar a ativa", async () => {
    setupSwitcher();
    fireEvent.click(screen.getByRole("combobox"));
    const active = screen.getByRole("option", { name: /Empresa 6/ });
    await waitFor(() => expect(f.scroll.mock.contexts.at(-1)).toBe(active));
    f.scroll.mockClear();
    const input = screen.getByPlaceholderText("Procurar empresa...");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => expect(f.scroll.mock.contexts.at(-1)).toBe(screen.getByRole("option", { name: /Empresa 1/ })));
    fireEvent.change(input, { target: { value: "Empresa 4" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Empresa 4/ })).toBeInTheDocument();
  });
});

it("#586b — não introduz ramos por país nos componentes autorizados", () => {
  for (const file of ["src/contexts/CompanyBrandingContext.tsx", "src/components/BrandedLogo.tsx", "src/pages/admin/Companies.tsx", "src/components/CompanySwitcher.tsx"]) {
    expect(readFileSync(file, "utf8")).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
  }
});
