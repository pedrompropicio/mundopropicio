import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
let role: string | null = "manager";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role }) }));

import { BankLineOffsetModal, OffsetLineButton, OFFSET_DISABLED_MESSAGE, type OffsetModalServices } from "../BankLineOffsetModal";
import { checkOffsetEligibility } from "@/lib/offset-plan/eligibility";
import { formatEurCents } from "@/lib/offset-plan";
import type { OffsetCandidate } from "@/lib/offset-plan/load";

const N0 = { enabled: true, reverse_enabled: true };
const N1 = { enabled: false, reverse_enabled: true };
const N2 = { enabled: false, reverse_enabled: false };

const cand = (id: string, sign: "income" | "expense", euros: number, extra: Partial<OffsetCandidate> = {}): OffsetCandidate => ({
  id,
  kind: "transaction",
  sign,
  label: id,
  invoice_ref: null,
  event_name: null,
  gross_cents: euros * 100,
  paid_cents: 0,
  open_cents: euros * 100,
  eligibility: checkOffsetEligibility({ id, kind: "transaction", open_amount: euros, currency: "EUR" }),
  ...extra,
});

const line = { id: "L1", amount: 23406, booking_date: "2026-10-13", description: "TRF Casino" };

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function services(over: Partial<OffsetModalServices> = {}): Partial<OffsetModalServices> {
  return {
    client: { rpc: vi.fn(), from: vi.fn() } as any,
    readControl: async () => N0,
    loadSuppliers: async () => [{ id: "s1", name: "Casino Estoril" }],
    loadDocuments: async () => [cand("rec", "income", 30996), cand("desp", "expense", 7590)],
    loadEvents: async () => [],
    loadForecasts: async () => [],
    newRequestId: vi.fn(() => "req-1") as any,
    today: () => "2026-10-22",
    apply: vi.fn(async () => ({ ok: true as const, group: { id: "g-123456789", status: "applied", movement_amount: 23406, operation_date: "2026-10-13", supplier_id: "s1", bank_line_id: "L1" } })) as any,
    ...over,
  };
}

async function goToPreview() {
  fireEvent.click(await screen.findByRole("button", { name: "Seguinte" }));
  fireEvent.click(await screen.findByRole("checkbox", { name: "rec" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "desp" }));
  fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
  fireEvent.click(await screen.findByRole("button", { name: "Ver prévia" }));
  await screen.findAllByTestId("preview-row");
}

beforeEach(() => {
  role = "manager";
});

describe("botão Encontro de contas", () => {
  it.each([
    ["N1", N1],
    ["N2", N2],
  ])("desactivado em %s com a mensagem", async (_n, ctl) => {
    wrap(<OffsetLineButton onOpen={() => {}} services={{ readControl: async () => ctl }} />);
    const b = await screen.findByRole("button", { name: "Encontro de contas" });
    await waitFor(() => expect(b).toHaveAttribute("title", OFFSET_DISABLED_MESSAGE));
    expect(b).toBeDisabled();
  });
  it("controlo ilegível = desactivado", async () => {
    wrap(<OffsetLineButton onOpen={() => {}} services={{ readControl: async () => { throw new Error("denied"); } }} />);
    const b = await screen.findByRole("button", { name: "Encontro de contas" });
    await waitFor(() => expect(b).toHaveAttribute("title", OFFSET_DISABLED_MESSAGE));
    expect(b).toBeDisabled();
  });
  it("activo em N0 para manager; desactivado para viewer", async () => {
    const { unmount } = wrap(<OffsetLineButton onOpen={() => {}} services={{ readControl: async () => N0 }} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Encontro de contas" })).toBeEnabled());
    unmount();
    role = "viewer";
    wrap(<OffsetLineButton onOpen={() => {}} services={{ readControl: async () => N0 }} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Encontro de contas" })).toHaveAttribute("title", "Não tem permissão para esta operação."));
    expect(screen.getByRole("button", { name: "Encontro de contas" })).toBeDisabled();
  });
});

describe("wizard", () => {
  it("passa pelos passos e mostra a prévia do caso Estoril", async () => {
    wrap(<BankLineOffsetModal line={line} onClose={() => {}} services={services()} initialSupplierId="s1" />);
    expect(screen.getByTestId("offset-step")).toHaveAttribute("data-step", "supplier");
    await goToPreview();
    expect(screen.getByTestId("offset-step")).toHaveAttribute("data-step", "preview");
    const rows = screen.getAllByTestId("preview-row");
    expect(rows[0].textContent).toContain("23.406,00");
    expect(rows[0].textContent).toContain("7.590,00");
    expect(screen.queryByRole("textbox")).toBeNull(); // valores não editáveis
  });

  it("documento não elegível fica marcado e não selecciona", async () => {
    const s = services({
      loadDocuments: async () => [
        cand("rec", "income", 100),
        cand("bad", "expense", 10, {
          eligibility: checkOffsetEligibility({ id: "bad", kind: "transaction", open_amount: 10, cash_account_inconsistent: true }),
        }),
      ],
    });
    wrap(<BankLineOffsetModal line={line} onClose={() => {}} services={s} initialSupplierId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Seguinte" }));
    const cb = await screen.findByRole("checkbox", { name: "bad" });
    expect(cb).toBeDisabled();
    expect(screen.getByText(/conta das pernas/)).toBeInTheDocument();
    expect(screen.getByText(/Confirme a conta da transação/)).toBeInTheDocument();
  });

  it("duplo clique envia um só pedido e mostra o resultado", async () => {
    let resolve!: (v: any) => void;
    const apply = vi.fn(() => new Promise((r) => (resolve = r)));
    wrap(<BankLineOffsetModal line={line} onClose={() => {}} services={services({ apply: apply as any })} initialSupplierId="s1" />);
    await goToPreview();
    const btn = screen.getByRole("button", { name: "Confirmar encontro" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(apply).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true, group: { id: "g-abcdefgh", status: "applied" } }));
    expect(await screen.findByText("Encontro aplicado.")).toBeInTheDocument();
    const call = (apply.mock.calls[0] as any[])[1];
    expect(call).toMatchObject({ lineId: "L1", requestId: "req-1", supplierId: "s1" });
  });

  it("erro mapeado em pt-PT", async () => {
    const apply = vi.fn(async () => ({ ok: false, code: "permission_denied", message: "Não tem permissão para esta operação.", uncertain: false, reload: false }));
    wrap(<BankLineOffsetModal line={line} onClose={() => {}} services={services({ apply: apply as any })} initialSupplierId="s1" />);
    await goToPreview();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar encontro" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não tem permissão para esta operação.");
  });

  it("preview_changed obriga a recarregar, sem repetir automaticamente", async () => {
    const apply = vi.fn(async () => ({ ok: false, code: "preview_changed", message: "A dívida de um documento mudou desde a prévia. Recarregue.", uncertain: false, reload: true }));
    const loadDocuments = vi.fn(async () => [cand("rec", "income", 30996), cand("desp", "expense", 7590)]);
    wrap(<BankLineOffsetModal line={line} onClose={() => {}} services={services({ apply: apply as any, loadDocuments })} initialSupplierId="s1" />);
    await goToPreview();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar encontro" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("mudou desde a prévia");
    expect(screen.queryByRole("button", { name: "Confirmar encontro" })).toBeNull();
    expect(apply).toHaveBeenCalledTimes(1);
    const before = loadDocuments.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Recarregar prévia" }));
    await waitFor(() => expect(loadDocuments.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.getByTestId("offset-step")).toHaveAttribute("data-step", "documents"));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("resposta incerta: repetir usa o mesmo request_id", async () => {
    const apply = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: "uncertain", message: "Sem resposta do servidor.", uncertain: true, reload: false })
      .mockResolvedValueOnce({ ok: true, group: null });
    const newRequestId = vi.fn().mockReturnValueOnce("req-A").mockReturnValueOnce("req-B");
    wrap(<BankLineOffsetModal line={line} onClose={() => {}} services={services({ apply, newRequestId })} initialSupplierId="s1" />);
    await goToPreview();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar encontro" }));
    fireEvent.click(await screen.findByRole("button", { name: "Repetir o mesmo pedido" }));
    await screen.findByText("Encontro aplicado.");
    expect(apply.mock.calls[0][1].requestId).toBe("req-A");
    expect(apply.mock.calls[1][1].requestId).toBe("req-A");
    expect(apply.mock.calls[1][1].items).toEqual(apply.mock.calls[0][1].items);
  });

  it("em N1 o modal não deixa confirmar", async () => {
    wrap(<BankLineOffsetModal line={line} onClose={() => {}} services={services({ readControl: async () => N1 })} initialSupplierId="s1" />);
    await goToPreview();
    expect(screen.getByRole("button", { name: "Confirmar encontro" })).toBeDisabled();
    expect(screen.getByText(OFFSET_DISABLED_MESSAGE)).toBeInTheDocument();
  });

  it("data futura bloqueia", async () => {
    wrap(<BankLineOffsetModal line={{ ...line, booking_date: "2026-12-01" }} onClose={() => {}} services={services()} initialSupplierId="s1" />);
    await goToPreview();
    expect(screen.getByRole("button", { name: "Confirmar encontro" })).toBeDisabled();
  });

  it("Faltam X € quando não fecha", async () => {
    wrap(<BankLineOffsetModal line={{ ...line, amount: 23406.01 }} onClose={() => {}} services={services()} initialSupplierId="s1" />);
    await goToPreview().catch(() => {});
    expect(await screen.findByTestId("plan-errors")).toHaveTextContent("Faltam 0,01");
  });
});

describe("layout da prévia", () => {
  it("descrição longa: tabela de largura fixa com as quatro colunas e números sem quebra", async () => {
    const longo = "Casino Estoril — refeições no refeitório, 660 × 11,50, 24/08 a 08/09 (FT F1/00000439) · a compensar no apoio";
    const s = services({
      loadDocuments: async () => [cand("rec", "income", 30996), cand("desp", "expense", 7590, { label: longo })],
    });
    wrap(<BankLineOffsetModal line={line} onClose={() => {}} services={s} initialSupplierId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Seguinte" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "rec" }));
    fireEvent.click(screen.getByRole("checkbox", { name: longo }));
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver prévia" }));
    const rows = await screen.findAllByTestId("preview-row");
    const table = screen.getByTestId("preview-table");
    expect(table.className).toContain("table-fixed");
    expect(table.querySelectorAll("colgroup col")).toHaveLength(4);
    const heads = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent);
    expect(heads).toEqual(["Documento", "Em aberto", "Dinheiro", "Compensação"]);
    const desp = rows.find((r) => r.textContent?.includes(longo))!;
    const cells = desp.querySelectorAll("td");
    expect(cells).toHaveLength(4);
    expect(cells[0].className).toContain("break-words");
    expect(cells[0].className).not.toContain("truncate");
    expect(cells[0].textContent).toBe(`Despesa · ${longo}`);
    for (const c of Array.from(cells).slice(1)) {
      expect(c.className).toContain("whitespace-nowrap");
      expect(c.className).toContain("text-right");
    }
    expect(cells[1].textContent).toBe(formatEurCents(759000));
    expect(cells[3].textContent).toBe(formatEurCents(759000));
  });
});
