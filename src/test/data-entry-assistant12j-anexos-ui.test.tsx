import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantConversation from "../components/data-entry/AssistantConversation";
import type { AssistantTurnResult, DataEntryAdapter } from "../lib/data-entry-client";

// Dados sintéticos; sem rede, Gmail ou IA reais.
const context = { user_id: "local-user", company_id: "local-company" };
const atts = [1, 2, 3, 4].map(n => ({ n, part_id: `${n}`, filename: `documento-${n}.pdf`, mime: "application/pdf", size_bytes: 40960 }));
const base = { trace: [], known_message_ids: ["msgAAAA01"], execution: { available: false as const, gaps: [] } };
const select: AssistantTurnResult = { ...base, status: "select_message", text: "Escolhe.", continuation: "signed-1",
  options: [{ id: "msgAAAA01", label: "1. RE: Fecho sintético\nRemetente A\n09/10/26, 12:28 (Lisboa)" }, { id: "msgAAAA02", label: "2. RE: Fecho sintético\nRemetente A\n09/10/26, 11:05 (Lisboa)" }] };
const answer: AssistantTurnResult = { ...base, status: "answer", text: "Anexos reais deste email (4).", continuation: "signed-2", review_message_id: "msgAAAA01", attachments: atts };
beforeEach(() => localStorage.clear());

describe("#333 UI: escolha → anexos reais → revisão existente", () => {
  it("lista os anexos do servidor, abre a revisão com o anexo escolhido e continua com o pedido original", async () => {
    const assistantTurn = vi.fn().mockResolvedValueOnce(select).mockResolvedValueOnce(answer).mockResolvedValueOnce({ ...answer, text: "Usa a revisão." });
    const ticketlineAttachments = vi.fn();
    const ticketlineCandidate = vi.fn(async () => ({ candidate_token: "t", candidate: { message_id: "msgAAAA01", number: null, date: null, total_cents: null, event_id: null, lines: [], sources: [], incomplete: [] } }));
    render(<AssistantConversation context={context} adapter={{ assistantTurn, ticketlineCandidate, ticketlineAttachments } as unknown as DataEntryAdapter} />);
    fireEvent.change(screen.getByLabelText("O que pretende fazer?"), { target: { value: "Mostra os quatro PDFs" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    fireEvent.click(await screen.findByRole("button", { name: /1\. RE: Fecho sintético.*12:28/s }));
    const list = await screen.findByLabelText("Anexos do email");
    expect(within(list).getAllByRole("listitem").map(li => li.textContent)).toEqual(atts.map(a => `${a.n}. ${a.filename} · application/pdf · 40 KB`));
    // A revisão existente mostra logo as opções reais, sem pedir de novo a lista.
    fireEvent.click(await screen.findByRole("radio", { name: /documento-3\.pdf/ }));
    expect(ticketlineAttachments).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Rever fecho deste email" }));
    await waitFor(() => expect(ticketlineCandidate).toHaveBeenCalledWith({ message_id: "msgAAAA01", part_id: "3" }, context));
    fireEvent.change(screen.getByLabelText("O que pretende fazer?"), { target: { value: "E o terceiro?" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(assistantTurn).toHaveBeenCalledTimes(3));
    expect(assistantTurn.mock.calls[1][0]).toMatchObject({ selection: { message_id: "msgAAAA01" }, continuation: "signed-1", continuation_text: "Mostra os quatro PDFs" });
    expect(assistantTurn.mock.calls[2][0]).toMatchObject({ text: "E o terceiro?", continuation: "signed-2", continuation_text: "Mostra os quatro PDFs" });
  });
});
