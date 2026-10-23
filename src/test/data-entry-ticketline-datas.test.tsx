// #333 — datas do painel no padrão DatePicker com limpeza explícita (sintético).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { useState } from "react";
import TicketlineReviewPanel from "@/components/data-entry/TicketlineReviewPanel";
import { DatePicker } from "@/components/ui/date-picker";
import type { DataEntryAdapter } from "@/lib/data-entry-client";

const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const company = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ctx = { user_id: user, company_id: company };
  const CAND = { message_id: "m", number: { value: "AP-1", prov: { source: "email_body" as const, message_id: "m", body_sha256: "x", line: 1, truncated: false } }, date: { value: "2026-10-09", prov: { source: "email_body" as const, message_id: "m", body_sha256: "x", line: 2, truncated: false } }, total_cents: { value: 100, prov: { source: "email_body" as const, message_id: "m", body_sha256: "x", line: 3, truncated: false } },
    lines: [{ line_type: "event_right" as const, description: "Direito A", amount_cents: 100, event_hint: null, prov: { source: "email_body" as const, message_id: "m", body_sha256: "x", line: 4, truncated: false } }], event_id: null, sources: [], incomplete: [], blocking: [] };
  const PREVIEW = { candidate: CAND, persisted: true, review: { review_id: "11111111-1111-4111-8111-111111111111", version: 1, effects_hash: "h".repeat(64) },
    proposal: { version: 1 as const, statement_number: "AP-1", event: null, sum_cents: 100, document_total_cents: 100, difference_cents: 0, totals_cents: {}, checks: [], needs: [], effects_hash: "h".repeat(64),
      actions: [{ id: "a1", kind: "create_statement", label: "Registar apuramento", existing_flow: "x", depends_on: [], blocked_reason: null, stage: "prepare" as const }] } };

const initial = { candidate: CAND, candidate_token: "tok" };
const ACC = { accounts: [{ id: "acc-1", name: "Banco Sintético", account_type: "bank" }] };

function Harness({ clearable, start }: { clearable?: boolean; start: string }) {
  const [v, setV] = useState(start);
  return <><DatePicker aria-label="D" clearable={clearable} value={v || undefined} onChange={setV} /><output data-testid="v">{v}</output></>;
}

describe("#333 datas do painel — DatePicker com limpeza opt-in", () => {
  it("clearable: apagar o texto limpa o valor canónico após blur e re-render", () => {
    const view = render(<Harness clearable start="2026-10-09" />);
    const box = screen.getByLabelText("D");
    expect(box).toHaveValue("09/10/2026");
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.blur(box);
    expect(screen.getByTestId("v").textContent).toBe("");
    view.rerender(<Harness clearable start="2026-10-09" />);
    expect(screen.getByLabelText("D")).toHaveValue("");
  });
  it("clearable: botão Limpar limpa", () => {
    render(<Harness clearable start="2026-10-09" />);
    fireEvent.click(screen.getByRole("button", { name: "Limpar D" }));
    expect(screen.getByTestId("v").textContent).toBe("");
    expect(screen.getByLabelText("D")).toHaveValue("");
  });
  it("sem opt-in: comportamento antigo preservado (não limpa, sem botão)", () => {
    render(<Harness start="2026-10-09" />);
    const box = screen.getByLabelText("D");
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.blur(box);
    expect(screen.getByTestId("v").textContent).toBe("2026-10-09");
    expect(screen.queryByRole("button", { name: /Limpar/ })).toBeNull();
  });
});

describe("#333 datas do painel — TicketlineReviewPanel", () => {
  const ready = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Recalcular prévia" }));
    await waitFor(() => expect(screen.getByLabelText("Registar apuramento")).toBeTruthy());
  };
  it("nenhum campo de data nativo; data ausente não vira hoje", () => {
    const { container } = render(<TicketlineReviewPanel adapter={{} as DataEntryAdapter} context={ctx} messageId="m" initial={{ candidate: { ...CAND, date: null }, candidate_token: "tok" } as never} />);
    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(screen.getByLabelText("Data")).toHaveValue("");
    expect(screen.getByLabelText("Data do recebimento")).toHaveValue("");
  });
  it("limpar a Data do documento envia date null", async () => {
    const preview = vi.fn(async (_r: any) => PREVIEW);
    render(<TicketlineReviewPanel adapter={{ ticketlinePreview: preview } as unknown as DataEntryAdapter} context={ctx} messageId="m" initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Limpar Data" }));
    fireEvent.click(screen.getByRole("button", { name: "Recalcular prévia" }));
    await waitFor(() => expect(preview).toHaveBeenCalled());
    expect(preview.mock.calls[0][0].edits.date).toBeNull();
  });
  it("Limpar recebimento: limpa conta/data/valor/confirmação e recalc sem settlement; invalida prévia", async () => {
    const preview = vi.fn(async (_r: any) => PREVIEW);
    const adapter = { ticketlinePreview: preview, ticketlineAccounts: vi.fn(async () => ACC) } as unknown as DataEntryAdapter;
    render(<TicketlineReviewPanel adapter={adapter} context={ctx} messageId="m" initial={initial} />);
    await waitFor(() => expect(screen.getByRole("option", { name: "Banco Sintético" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Conta"), { target: { value: "acc-1" } });
    fireEvent.change(screen.getByLabelText("Data do recebimento"), { target: { value: "10102026" } });
    fireEvent.change(screen.getByLabelText("Valor recebido"), { target: { value: "1,00" } });
    fireEvent.click(screen.getByLabelText(/Confirmo que verifiquei/));
    await ready();
    expect(preview.mock.calls[0][0].settlement).toMatchObject({ financial_account_id: "acc-1", date: "2026-10-10", amount_cents: 100 });
    fireEvent.click(screen.getByRole("button", { name: "Limpar recebimento" }));
    expect(screen.queryByLabelText("Registar apuramento")).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar revisão" })).toBeDisabled();
    expect(screen.getByLabelText("Conta")).toHaveValue("");
    expect(screen.getByLabelText("Data do recebimento")).toHaveValue("");
    expect(screen.getByLabelText("Valor recebido")).toHaveValue("");
    expect(screen.getByLabelText(/Confirmo que verifiquei/)).not.toBeChecked();
    await ready();
    expect(preview.mock.calls[1][0].settlement).toBeUndefined();
  });
  it("recebimento parcial (só data) continua a exigir conta — não é ignorado", async () => {
    const preview = vi.fn(async (_r: any) => PREVIEW);
    render(<TicketlineReviewPanel adapter={{ ticketlinePreview: preview } as unknown as DataEntryAdapter} context={ctx} messageId="m" initial={initial} />);
    fireEvent.change(screen.getByLabelText("Data do recebimento"), { target: { value: "10102026" } });
    fireEvent.click(screen.getByRole("button", { name: "Recalcular prévia" }));
    await waitFor(() => expect(screen.getByText(/Escolhe a conta e a data do recebimento/)).toBeTruthy());
    expect(preview).not.toHaveBeenCalled();
  });
  it("limpar data com recalc em voo descarta a resposta antiga", async () => {
    let resolve: (v: unknown) => void = () => {};
    const preview = vi.fn().mockResolvedValueOnce(PREVIEW).mockReturnValueOnce(new Promise(r => { resolve = r; }));
    render(<TicketlineReviewPanel adapter={{ ticketlinePreview: preview } as unknown as DataEntryAdapter} context={ctx} messageId="m" initial={initial} />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Recalcular prévia" }));
    fireEvent.click(screen.getByRole("button", { name: "Limpar Data" }));
    await act(async () => resolve(PREVIEW));
    expect(screen.queryByLabelText("Registar apuramento")).toBeNull();
    expect(screen.getByLabelText("Data")).toHaveValue("");
  });
});
