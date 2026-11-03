import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import CircuitPositionPanel from "@/components/CircuitPositionPanel";
import BankLineDocumentsDialog from "@/components/bank/BankLineDocumentsDialog";

const fixtures = vi.hoisted(() => ({ docs: [] as unknown[] }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Queries never execute their callbacks; all service boundaries fail closed.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: fixtures.docs, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, {
  get: () => { throw new Error("#498 P1h-b: serviço MP proibido"); },
}) }));
vi.mock("@/lib/storage", () => {
  const forbidden = () => { throw new Error("#498 P1h-b: storage proibido"); };
  return { uploadToCompanyBucket: forbidden, signedCompanyUrl: forbidden, removeFromCompanyBucket: forbidden };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isAdmin: true }) }));

const lines = [
  { id: "income", supplier_id: "supplier", suppliers: { name: "Terceiro sintético" },
    signedAmount: 1234.56, date: "2026-11-01", description: "Adiantamento sintético" },
  { id: "return", supplier_id: "supplier", suppliers: { name: "Terceiro sintético" },
    signedAmount: -100, date: "2026-11-02", description: "Devolução sintética" },
  { id: "unassigned", supplier_id: null, signedAmount: -10.01,
    date: "2026-11-03", description: "Movimento sem contraparte" },
];
const panelProps = { lines, openingBalance: 100, position: 1224.55 };
const bankLine = { id: "bank-line", description: "Movimento sintético", booking_date: "2026-11-01", amount: "1234.56" };
const close = vi.fn();
type ComponentName = "Circuit" | "Documents";

function setCompany(country: string | null = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  const company = country === null ? null : { id: "fixture-company", country, currency } as Company;
  vi.mocked(useCompany).mockReturnValue({ company, companyId: company?.id ?? null, isLoading: false,
    isError: false, error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function dom(node: HTMLElement) {
  // Normalize only generated Radix IDs; retain monetary bytes, NBSP and styles.
  return node.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:");
}
function expandPanel() { fireEvent.click(screen.getByText("Terceiro sintético")); }
function mount(name: ComponentName) {
  const element = () => name === "Circuit"
    ? <CircuitPositionPanel {...panelProps} />
    : <BankLineDocumentsDialog line={bankLine} onClose={close} />;
  const result = render(element());
  // DialogContent is portalled outside the testing-library container.
  const node = () => name === "Circuit" ? result.container : screen.getByRole("dialog");
  return { ...result, node, refresh: element };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P1h-b: rede proibida"); }));
  fixtures.docs = [];
  setCompany();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("#498 P1h-b — PT capturado ANTES de alterar os dois componentes; não regenerar", () => {
  it("preserva os hashes SHA-256 do DOM PT, incluindo detalhes, aviso e portal real", () => {
    const hashes: Record<string, string> = {};
    const panel = mount("Circuit");
    expect(screen.queryByText(/não coincide/)).not.toBeInTheDocument();
    hashes["Circuit:initial"] = digest(dom(panel.node()));
    expandPanel();
    hashes["Circuit:expanded"] = digest(dom(panel.node()));
    panel.rerender(<CircuitPositionPanel {...panelProps} position={-1234.56} />);
    expect(screen.getByText(/não coincide/)).toBeInTheDocument();
    hashes["Circuit:mismatch"] = digest(dom(panel.node()));
    panel.rerender(<CircuitPositionPanel lines={[]} openingBalance={0} position={0} />);
    hashes["Circuit:empty"] = digest(dom(panel.node()));
    cleanup();

    const dialog = mount("Documents");
    expect(dialog.node().textContent).toContain("1.234,56\u00a0€");
    hashes["Documents:empty"] = digest(dom(dialog.node()));
    fixtures.docs = [{ id: "document", name: "Documento sintético.pdf",
      uploaded_at: "2026-11-02T12:00:00Z", uploaded_by: "fixture.invalid" }];
    dialog.rerender(dialog.refresh());
    hashes["Documents:attached"] = digest(dom(dialog.node()));
    expect(hashes).toMatchInlineSnapshot(`
      {
        "Circuit:empty": "409c60d85f3d1245d59da59e878a38278ee7aef79150557c0cfac909218b16bc",
        "Circuit:expanded": "b91cbe6aff548d10d3440c4e51697a651798d81b882d400ce340f1f32d683756",
        "Circuit:initial": "1c6f484978d66bd29551a4c4ab709228503083fe9b4e4fc54add9cb6611a8116",
        "Circuit:mismatch": "acd2fa5a32a1ea1277b2af63508087059d74e428ed87be7230bb7fce837feace",
        "Documents:attached": "c7a11c3f95fa5af11abc9239050e5b4f9b439663dafbd94070ddd74d8da01b08",
        "Documents:empty": "e1cdc202b78320b9f986de3e63045f7bcf727d51083d0894d5ffbb5a368ca5ae",
      }
    `);
  });
});

describe("#498 P1h-b — apresentação monetária da empresa", () => {
  it.each(["Circuit", "Documents"] as const)("%s: PT → BR → indisponível → PT preserva o DOM", (name) => {
    const { node, rerender, refresh } = mount(name);
    if (name === "Circuit") expandPanel();
    const pt = dom(node());
    setCompany("BR", "BRL");
    rerender(refresh());
    expect(node().textContent).toContain("R$\u00a01.234,56");
    expect(document.body.textContent).not.toContain("€");
    // Reverse only monetary presentation to protect every other DOM byte.
    const normalized = dom(node()).replace(/(-?)R\$(\u00a0|&nbsp;)([\d.]+),(\d{2})/g, "$1$3,$4$2€");
    expect(normalized).toBe(pt);
    if (name === "Circuit") {
      expect(node().textContent).toContain("R$\u00a0100,00");
      expect(node().textContent).toContain("-R$\u00a010,01");
      expect(screen.getByText("Devolução sintética", { exact: false })).toBeInTheDocument();
    }
    setCompany(null);
    rerender(refresh());
    expect(node().textContent).toContain("—");
    expect(document.body.textContent).not.toMatch(/€|R\$/);
    setCompany();
    rerender(refresh());
    expect(dom(node())).toBe(pt);
  });

  it.each([
    ["BR", "", {}],
    ["BR", "BRL", { isLoading: true }],
    ["PT", "EUR", { isError: true, error: new Error("fixture") }],
  ] as const)("configuração indisponível %s/%s/%j nunca assume euros", (country, currency, overrides) => {
    setCompany(country, currency, overrides);
    for (const name of ["Circuit", "Documents"] as const) {
      const { node } = mount(name);
      if (name === "Circuit") expandPanel();
      expect(node().textContent).toContain("—");
      expect(document.body.textContent).not.toMatch(/€|R\$/);
      cleanup();
    }
  });

  it("BR: aviso, saldo inicial e posição negativa usam a moeda da empresa", () => {
    setCompany("BR", "BRL");
    const { container, rerender } = render(<CircuitPositionPanel {...panelProps} position={-1234.56} />);
    expect(screen.getByText(/não coincide/).textContent).toContain("R$\u00a01.224,55");
    expect(screen.getByText(/não coincide/).textContent).toContain("-R$\u00a01.234,56");
    expect(container.textContent).not.toContain("€");
    rerender(<CircuitPositionPanel lines={[]} openingBalance={0} position={0} />);
    expect(screen.getByText("Sem movimentos no período.")).toBeInTheDocument();
    expect(container.textContent).toContain("R$\u00a00,00");
    expect(container.textContent).not.toContain("Saldo inicial do período");
  });

  it.each([
    [-1234.56, "-R$\u00a01.234,56"], [0, "R$\u00a00,00"],
    [null, null], [undefined, null],
  ])("BR: diálogo preserva a presença do montante %s", (amount, expected) => {
    setCompany("BR", "BRL");
    render(<BankLineDocumentsDialog line={{ ...bankLine, amount }} onClose={close} />);
    const text = screen.getByRole("dialog").textContent;
    expect(text).not.toContain("€");
    if (expected) expect(text).toContain(expected);
    else expect(text).not.toContain("R$");
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("o diálogo fechado não mostra conteúdo nem chama onClose", () => {
    render(<BankLineDocumentsDialog line={null} onClose={close} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
  });
});
