import { createHash } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany } from "@/hooks/useCompany";
import { EventForecast } from "@/components/EventForecast";
import BPGridEditor from "@/components/BPGridEditor";
import { ForecastEditModal } from "@/components/ForecastEditModal";
import BPPlanilha from "@/pages/admin/BPPlanilha";
import { resolveCompanyLocale, type CompanyLocale } from "@/lib/company-locale";
import { MoneyInput } from "@/components/ui/money-input";
import { importPLToEvent, parseXlsxPL } from "@/lib/import-pl-xlsx";
import * as XLSX from "xlsx";

const f = vi.hoisted(() => ({ queries: {} as Record<string, any>, rpc: vi.fn(), insert: vi.fn(), update: vi.fn(), mutations: [] as any[], hotProps: null as any, reads: {} as Record<string, any> }));
vi.mock("handsontable", () => ({ default: { renderers: { getRenderer: () => () => {} } } }));
vi.mock("handsontable/registry", () => ({ registerAllModules: () => {} }));
vi.mock("@handsontable/react-wrapper", async () => {
  const React = await import("react");
  return { HotTable: React.forwardRef((props: any, ref: any) => {
    f.hotProps = props;
    React.useImperativeHandle(ref, () => ({ hotInstance: {
      getDataAtCell: (row: number, col: number) => f.hotProps.data[row]?.[col],
      render: () => {}, clearUndo: () => {},
    } }));
    return <div data-testid="sheet" />;
  }) };
});
vi.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => ({ data: f.queries[queryKey[0]], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (opts: any) => ({ mutate: (args: any) => { const p = opts.mutationFn(args); f.mutations.push(p); p.catch(() => {}); }, isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: f.rpc,
  functions: { invoke: vi.fn(async () => ({ data: { matches: [] }, error: null })) },
  from: (table: string) => {
    const q: any = {
      select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q, range: () => q,
      maybeSingle: async () => ({ data: f.reads[table] ?? null, error: null }),
      then: (resolve: any, reject: any) => Promise.resolve({ data: f.reads[table] ?? [], error: null }).then(resolve, reject),
      insert: (payload: any) => { f.insert(table, payload); return Promise.resolve({ data: null, error: null }); },
      update: (payload: any) => ({ eq: async () => { f.update(table, payload); return { error: null }; } }),
    };
    return q;
  },
} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user", email: "fixture@example.test" }, isAdmin: true, isManager: false, hasPermission: () => true }) }));
vi.mock("@/contexts/EventScenarioContext", () => ({ useEventScenario: () => ({ selectedVersionId: null, isScenarioMode: false, setSelectedVersionId: vi.fn() }) }));
vi.mock("@/hooks/useEventHouseLabel", () => ({ useEventHouseLabel: () => "Empresa" }));
vi.mock("@/hooks/useSyncCacheForecasts", () => ({ useSyncCacheForecasts: () => {} }));
vi.mock("@/hooks/useBPIncomeSynthetic", () => ({ useBPIncomeSynthetic: () => ({ lines: [], excludedForecastIds: [], totals: { realNet: 0, currentNet: 0, baselineNet: 0, currentIva: 0 } }) }));
vi.mock("@/hooks/useEventRevenueBasis", () => ({ useEventRevenueBasis: () => ({ data: undefined }) }));
vi.mock("@/hooks/useForecastAttachmentCounts", () => ({ useForecastAttachmentCounts: () => ({}) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/EventSettlementSelect", () => ({ EventSettlementSelect: () => null, EventAddbackSelect: () => null, useEventSettlementOptions: () => ({ data: [] }) }));
vi.mock("@/lib/forecast-amount", () => ({ writeForecastAmount: vi.fn(), prepareBatchEditsForReductions: async (edits: any) => edits }));
vi.mock("@/components/bp-versions/BPVersionCard", () => ({ BPVersionCard: () => null }));
vi.mock("@/components/bp-versions/BPScenarioSelector", () => ({ BPScenarioSelector: () => null }));
vi.mock("@/components/bp/BPEvolution", () => ({ BPEvolution: () => null }));
vi.mock("@/components/BpFormulaPanel", () => ({ BpFormulaPanel: () => null }));
vi.mock("@/components/bp/MasterRevenueViaMasterPanel", () => ({ MasterRevenueViaMasterPanel: () => null }));
vi.mock("@/components/SponsorshipTargetsPanel", () => ({ SponsorshipTargetsPanel: () => null }));
vi.mock("@/components/CoalaImportWizard", () => ({ CoalaImportWizard: () => null }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/ui/overlay-layer", () => ({ OverlayLayer: ({ children, ...props }: any) => <div {...props}>{children}</div> }));

const category = { id: "cat", code: "2.2.01", name: "Produção", type: "expense", parent_id: null };
const forecast = { id: "line", event_id: "event", type: "expense", description: "Despesa sintética", amount: 1000, iva_rate: 23, category_id: "cat", account_categories: category, status: "draft", formalidade: "estimado" };
function company(country = "PT", currency = "EUR") {
  vi.mocked(useCompany).mockReturnValue({ company: { id: "company", country, currency }, companyId: "company", isLoading: false, isError: false } as ReturnType<typeof useCompany>);
}
function grouped() { return <MemoryRouter><EventForecast eventId="event" eventDate="2026-01-02" /></MemoryRouter>; }
function grid() { return <BPGridEditor eventId="event" forecasts={[forecast]} categories={[category]} canEditBP selectedVersionId={null} />; }
function dom(node: HTMLElement) {
  return createHash("sha256").update(node.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:").replace(/data-pending-temp-id="[^"]+"/g, 'data-pending-temp-id="fixture"')).digest("hex");
}
beforeEach(() => {
  vi.clearAllMocks(); company(); f.mutations = []; f.hotProps = null;
  f.reads = { events: { name: "Evento", company_id: "company" }, account_categories: [category], event_forecasts: [forecast] };
  f.rpc.mockResolvedValue({ data: { ids: ["created"], updated: 0 }, error: null });
  f.queries = { account_categories: [category], event_forecasts: [forecast], "event-iva-country": ["Portugal"] };
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P2b: rede proibida"); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("#498 P2b — DOM PT capturado antes de alterar consumidores", () => {
  it("preserva cards, tabela e formulário da vista agrupada", () => {
    const { container } = render(grouped());
    expect(dom(container)).toMatchInlineSnapshot(`"26512b0294ac82570a2bb48da3fb6de7dda91d9cc40fbb91d4eb89f1ac7c73ad"`);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(dom(container)).toMatchInlineSnapshot(`"f78cb9d6e52c418af44d54c35055f2ea27f417f6d510957e90fced372c798cfc"`);
  });
  it("preserva o modal aprovado PT", () => {
    const { container } = render(<ForecastEditModal forecast={{ ...forecast, status: "approved" }} categories={[category]} onClose={() => {}} />);
    expect(dom(container)).toMatchInlineSnapshot(`"7c8cf35141e6a5666be161bab215871afe277736d4c9d41d92259d60bd693b1e"`);
  });
});

const br = resolveCompanyLocale({ country: "BR", currency: "BRL" }) as CompanyLocale;
function editMoney(input: Element, value: string) {
  fireEvent.focus(input); fireEvent.change(input, { target: { value } }); fireEvent.blur(input);
}
function workbook(rows: unknown[][]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "BP");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("#498 P2b — empresa BR no BP", () => {
  it("mostra cards/colunas em R$ sem IVA e grava 1.000 com taxa zero", async () => {
    company("BR", "BRL");
    f.queries.event_forecasts = [{ ...forecast, iva_rate: 0, status: "approved" }];
    const { container } = render(grouped());
    expect(container.textContent).toContain("R$\u00a01.000,00");
    expect(container.textContent).not.toContain("€");
    expect(screen.getByRole("columnheader", { name: "Valor (R$)" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Total (R$)" })).toBeInTheDocument();
    expect(screen.queryAllByRole("columnheader").some((n) => n.textContent?.includes("IVA"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    fireEvent.change(screen.getByPlaceholderText("Descrição…"), { target: { value: "Linha BR" } });
    const amount = container.querySelector('input[inputmode="decimal"]')!;
    editMoney(amount, "R$ 1.000,00");
    expect(amount).toHaveValue("R$\u00a01.000,00");
    expect(container.querySelector('select option[value="23"]')).toBeNull();
    fireEvent.click(screen.getByTitle("Guardar (Enter)"));
    await Promise.all(f.mutations);
    expect(f.insert).toHaveBeenCalledWith("event_forecasts", expect.objectContaining({ amount: 1000, iva_rate: 0, description: "Linha BR" }));
  });

  it("PT grava 1.000 à taxa 23 e mostra 1.230 no formulário", async () => {
    const { container } = render(grouped());
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    fireEvent.change(screen.getByPlaceholderText("Descrição…"), { target: { value: "Linha PT" } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "1000" } });
    expect(container.textContent).toContain("1.230,00\u00a0€");
    fireEvent.click(screen.getByTitle("Guardar (Enter)"));
    await Promise.all(f.mutations);
    expect(f.insert).toHaveBeenCalledWith("event_forecasts", expect.objectContaining({ amount: 1000, iva_rate: 23 }));
  });

  it.each([["BR", "BRL", 0], ["PT", "EUR", 23]] as const)("grelha %s grava taxa explícita e aceita valor colado", async (country, currency, rate) => {
    company(country, currency);
    const { container } = render(grid());
    fireEvent.click(screen.getByRole("button", { name: /Despesa/ }));
    fireEvent.change(screen.getByPlaceholderText("Despesa — descrição*"), { target: { value: "Nova linha" } });
    const pending = container.querySelector('[data-pending-temp-id]')!;
    const amount = pending.querySelector('input[inputmode="decimal"]')!;
    editMoney(amount, country === "BR" ? "R$ 1.000,00" : "1.000,00");
    expect(amount).toHaveValue(country === "BR" ? "R$\u00a01.000,00" : "1000,00\u00a0€");
    expect(pending.querySelector('select option[value="23"]') !== null).toBe(country === "PT");
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    await Promise.all(f.mutations);
    expect(f.rpc).toHaveBeenCalledWith("batch_save_event_forecasts", expect.objectContaining({ _inserts: [expect.objectContaining({ amount: 1000, iva_rate: rate })] }));
  });

  it("modal BR edita valor nativo, oculta IVA/câmbio e grava sem conversão", async () => {
    company("BR", "BRL");
    const { container } = render(<ForecastEditModal forecast={{ ...forecast, currency: "EUR", iva_rate: 23, status: "approved" }} categories={[category]} onClose={() => {}} />);
    expect(container.textContent).not.toContain("Taxa IVA");
    expect(container.textContent).not.toContain("Câmbio");
    expect(container.textContent).not.toContain("€");
    const amount = container.querySelector('input[inputmode="decimal"]')!;
    expect(amount).toHaveValue("R$\u00a01.000,00");
    editMoney(amount, "R$ 2.000,00");
    fireEvent.change(screen.getByPlaceholderText("Motivo da alteração…"), { target: { value: "Teste sintético" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar Alteração" }));
    await Promise.all(f.mutations);
    expect(f.update).toHaveBeenCalledWith("event_forecasts", expect.objectContaining({ iva_rate: 0, currency: "BRL" }));
    expect(f.update.mock.calls.find(([table]) => table === "event_forecasts")?.[1]).not.toHaveProperty("fx_rate", 1);
    const { writeForecastAmount } = await import("@/lib/forecast-amount");
    expect(writeForecastAmount).toHaveBeenCalledWith(expect.objectContaining({ newAmount: 2000 }));
  });

  it("acompanha troca BR → PT sem conservar símbolo/colunas da empresa anterior", () => {
    company("BR", "BRL");
    const { container, rerender } = render(grouped());
    expect(screen.getByRole("columnheader", { name: "Valor (R$)" })).toBeInTheDocument();
    company(); rerender(grouped());
    expect(screen.getByRole("columnheader", { name: "IVA %" })).toBeInTheDocument();
    expect(container.textContent).not.toContain("R$");
  });
});

describe("#498 P2b — input e import XLSX", () => {
  it.each([["1.000,00", 1000], ["R$ 1.234.567,89", 1234567.89], ["-1.234,56", -1234.56]])("parser BR: %s", (raw, expected) => {
    const onChange = vi.fn(); const { container } = render(<MoneyInput companyLocale={br} value={0} onChange={onChange} />);
    editMoney(container.querySelector("input")!, String(raw)); expect(onChange).toHaveBeenCalledWith(expected);
  });

  it("import PT conserva base, imposto, total e taxa; BR ignora IVA e total = base", async () => {
    const bytes = workbook([["Descrição", "Custo", "IVA", "Total"], ["Produção", 1000, 230, 1230]]);
    const ptRow = parseXlsxPL(bytes)[0].rows[0];
    expect(ptRow).toMatchObject({ baseAmount: 1000, ivaAmount: 230, total: 1230, ivaRate: 23 });
    const brRow = parseXlsxPL(bytes, [0])[0].rows[0];
    expect(brRow).toMatchObject({ baseAmount: 1000, ivaAmount: 0, total: 1000, ivaRate: 0 });
    await importPLToEvent([brRow], "event", "2026-01-02", [category], "fixture@example.test", undefined, undefined, br);
    expect(f.insert).toHaveBeenCalledWith("event_forecasts", expect.objectContaining({ amount: 1000, iva_rate: 0 }));
  });

  it("import BR aceita células pt-BR e ficheiro sem coluna IVA", () => {
    const bytes = workbook([["Descrição", "Valor", "Total"], ["Produção", "R$ 1.000,00", "R$ 1.000,00"]]);
    expect(parseXlsxPL(bytes, [0])[0].rows[0]).toMatchObject({ baseAmount: 1000, ivaAmount: 0, total: 1000, ivaRate: 0 });
  });
});

describe("#498 P2b — planilha mantém índices e fórmulas", () => {
  it.each([["BR", "BRL", 0], ["PT", "EUR", 23]] as const)("planilha %s formata moeda, política e nova linha", async (country, currency, rate) => {
    company(country, currency);
    render(<BPPlanilha eventId="event" />);
    await screen.findByTestId("sheet");
    const props = f.hotProps;
    expect(props.hiddenColumns).toEqual(country === "BR" ? { columns: [4], indicators: false } : undefined);
    expect(props.colHeaders[3]).toBe(country === "BR" ? "Valor (R$)" : "Valor s/IVA");
    const rowIndex = props.data.findIndex((r: any[]) => r[1] === forecast.description);
    expect(props.data[rowIndex][4]).toBe(rate);
    expect(props.data[rowIndex][5]).toBe(`=D${rowIndex + 1}*(1+E${rowIndex + 1}/100)`);
    const td = document.createElement("td");
    props.columns[3].renderer(null, td, rowIndex, 3, null, 1230, {});
    expect(td.textContent).toBe(country === "BR" ? "R$\u00a01.230,00" : "1.230,00\u00a0€");
    act(() => props.afterSelectionEnd(rowIndex));
    fireEvent.click(screen.getByRole("button", { name: "Inserir linha" }));
    await waitFor(() => expect(f.hotProps.data.length).toBeGreaterThan(props.data.length));
    const insertedRow = f.hotProps.data.find((r: any[]) => r[1] === "" && r[3] === 0 && r[4] === rate);
    expect(insertedRow).toBeDefined();
    expect(insertedRow[4]).toBe(rate);
    const newIndex = f.hotProps.data.indexOf(insertedRow);
    const changes = [[newIndex, 1, "", "Linha da planilha"], [newIndex, 3, 0, country === "BR" ? "R$ 1.000,00" : "1.000,00"]];
    f.hotProps.beforeChange(changes, "edit");
    act(() => {
      for (const [r, c, , value] of changes) f.hotProps.data[Number(r)][Number(c)] = value;
      f.hotProps.afterChange(changes, "edit");
    });
    fireEvent.click(screen.getByRole("button", { name: "Gravar" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Gravar" }).at(-1)!);
    await waitFor(() => expect(f.rpc).toHaveBeenCalledWith("batch_insert_event_forecasts", expect.objectContaining({ _inserts: [expect.objectContaining({ amount: 1000, iva_rate: rate })] })));

  });
});

// Captured against the original BPGridEditor before the locale changes.
it("#498 P2b — grelha PT mantém DOM de edição com 1.000", () => {
  const { container } = render(grid());
  fireEvent.click(screen.getByRole("button", { name: /Despesa/ }));
  const amount = container.querySelector('[data-pending-temp-id] input[inputmode="decimal"]')!;
  editMoney(amount, "1.000,00");
  expect(dom(container)).toMatchInlineSnapshot(`"822666210a43c8468e681c1e5e3b37682ac5c0e69cf33bbd82af30da54268b6e"`);
});

it("#498 P2b — modal com empresa indisponível não presume EUR nem grava", async () => {
  company("BR", "");
  const { container } = render(<ForecastEditModal forecast={forecast} categories={[category]} onClose={() => {}} />);
  expect(container.textContent).toContain("configuração da empresa incompleta");
  expect(container.textContent).not.toContain("€");
  expect(container.querySelector('input[inputmode="decimal"]')).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Guardar Alteração" }));
  await expect(f.mutations[0]).rejects.toThrow("configuração da empresa incompleta");
  expect(f.update).not.toHaveBeenCalled();
});

it.each([["1.234,56", 1234.56], ["1234.56", 1234.56], ["-1234,56", -1234.56], ["1.234.567,89", 1234567.89]])("#498 P2b — input PT mantém parsing de %s", (raw, expected) => {
  const onChange = vi.fn();
  const { container } = render(<MoneyInput value={0} onChange={onChange} />);
  editMoney(container.querySelector("input")!, String(raw));
  expect(onChange).toHaveBeenCalledWith(expected);
});

it("#498 P2b — PT conserva o default legado da vista agrupada mesmo com cidade ES", async () => {
  f.queries["event-iva-country"] = ["Espanha"];
  render(grouped());
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  fireEvent.change(screen.getByPlaceholderText("Descrição…"), { target: { value: "Default legado PT" } });
  fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "1000" } });
  fireEvent.click(screen.getByTitle("Guardar (Enter)"));
  await Promise.all(f.mutations);
  expect(f.insert).toHaveBeenCalledWith("event_forecasts", expect.objectContaining({ amount: 1000, iva_rate: 23 }));
});
