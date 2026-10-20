import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import AssistantConversation, { historyKey } from "../components/data-entry/AssistantConversation";
import type { AssistantTurnResult, DataEntryAdapter } from "../lib/data-entry-client";

const ctx = { user_id: "user-a", company_id: "company-a" };
const gaps = ["Executor tipado ainda não ligado."];
const select: AssistantTurnResult = { status: "select_message", text: "Encontrei vários emails possíveis.", trace: [{ tool: "gmail_search", ok: true, summary: "2 email(s) encontrado(s)" }],
  options: [{ id: "msgA00001", label: "Fecho A" }, { id: "msgB00002", label: "Fecho B" }], execution: { available: false, gaps }, known_message_ids: ["msgA00001", "msgB00002"] };
const proposal: AssistantTurnResult = { status: "proposal", text: "Preparei uma proposta.", trace: [], execution: { available: false, gaps }, known_message_ids: [],
  proposal: { version: 1, statement_number: "AP-1", event: null, sum_cents: 100, document_total_cents: 100, difference_cents: 0, totals_cents: {}, checks: [{ code: "sum", ok: true, message: "Σ linhas = total do documento." }],
    actions: [{ id: "a5", kind: "register_liquidation", label: "Liquidar", existing_flow: "transaction_payments", depends_on: ["a4"], blocked_reason: "Sem evidência de recebimento" }], needs: ["Indicar o evento"], effects_hash: "h" } };

beforeEach(() => localStorage.clear());
describe("Assistente conversacional (UI)", () => {
  it("texto livre → seletor humano → proposta com execução bloqueada; guarda só textos por user+empresa", async () => {
    const assistantTurn = vi.fn().mockResolvedValueOnce(select).mockResolvedValueOnce(proposal);
    render(<AssistantConversation adapter={{ assistantTurn } as unknown as DataEntryAdapter} context={ctx} />);
    fireEvent.change(screen.getByLabelText("O que pretende fazer?"), { target: { value: "Lê o fecho da Ticketline" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Fecho B" })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Fecho B" }));
    await waitFor(() => expect(screen.queryByText("Execução ainda não disponível")).not.toBeNull());
    expect(assistantTurn.mock.calls[1][0]).toMatchObject({ selection: { message_id: "msgB00002" }, known_message_ids: ["msgA00001", "msgB00002"] });
    expect(screen.getByText(/Bloqueado: Sem evidência/)).not.toBeNull();
    const stored = JSON.parse(localStorage.getItem(historyKey(ctx)) ?? "[]");
    expect(stored.every((t: { role: string; text: string }) => Object.keys(t).sort().join() === "role,text")).toBe(true);
    expect(JSON.stringify(stored)).not.toMatch(/effects_hash|transaction_payments/);
  });
  it("histórico não passa entre empresas", () => {
    localStorage.setItem(historyKey(ctx), JSON.stringify([{ role: "user", text: "segredo da empresa A" }]));
    render(<AssistantConversation adapter={{ assistantTurn: vi.fn() } as unknown as DataEntryAdapter} context={{ user_id: "user-a", company_id: "company-b" }} />);
    expect(screen.queryByText("segredo da empresa A")).toBeNull();
  });
  it("Parar aborta o pedido e desmontar aborta após troca de contexto", async () => {
    const signals: AbortSignal[] = [];
    const assistantTurn = vi.fn((_input, _ctx, signal: AbortSignal) => { signals.push(signal); return new Promise(() => {}); });
    const view = render(<AssistantConversation adapter={{ assistantTurn } as unknown as DataEntryAdapter} context={ctx} />);
    fireEvent.change(screen.getByLabelText("O que pretende fazer?"), { target: { value: "Pedido" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(signals.length).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    expect(signals[0].aborted).toBe(true);
    fireEvent.change(screen.getByLabelText("O que pretende fazer?"), { target: { value: "Outro pedido" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(signals.length).toBe(2));
    view.unmount(); expect(signals[1].aborted).toBe(true);
  });
});
