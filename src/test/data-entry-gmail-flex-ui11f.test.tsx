import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GmailAttachmentPicker from "../components/data-entry/GmailAttachmentPicker";
import type { DataEntryAdapter } from "../lib/data-entry-client";

const context = { user_id: "user-a", company_id: "company-a" };
const m = (id: string, subject: string, kind?: "exact" | "spelling") => ({ message_id: id, from: "A <a@exemplo.invalid>", subject, date: "2026-10-09T10:00:00.000Z", attachments: [],
  ...(kind ? { match: { kind, label: kind === "exact" ? "Expressão exata" : "Variação do nome (pequena diferença de grafia)" } } : {}) });

function adapter() {
  const gmailSearch = vi.fn()
    .mockResolvedValueOnce({ messages: [m("msgA00001", "Henrique & Carlos", "exact"), m("msgB00002", "Henrqiue e Carlos", "spelling")], next_page_token: "f2",
      search_info: { mode: "flexible", searched: ['assunto parecido com "Henrique & Carlos"'], candidates: 3, coverage_complete: false, note: "Pesquisa limitada: podem existir mais emails." } })
    .mockResolvedValueOnce({ messages: [m("msgB00002", "Henrqiue e Carlos", "spelling"), m("msgC00003", "Carlos and Henrique")], next_page_token: null,
      search_info: { mode: "flexible", searched: ["x"], candidates: 3, coverage_complete: true } });
  return { gmailSearch, a: { status: vi.fn(), session: vi.fn(), upload: vi.fn(), preview: vi.fn(), execute: vi.fn(), check: vi.fn(),
    gmailConnection: vi.fn(async () => ({ linked: true, reconnect_required: false, mailbox_email: "proprio@exemplo.invalid" })), gmailSearch, gmailRead: vi.fn() } as unknown as DataEntryAdapter };
}

describe("Gmail pesquisa flexível na UI", () => {
  it("flexível por omissão, explica o que buscou, assinala variações, cobertura e deduplica páginas", async () => {
    const { a, gmailSearch } = adapter();
    render(<GmailAttachmentPicker adapter={a} context={context} sessionId="" enabled disabled={false} onImported={vi.fn()} connectionOnly />);
    await waitFor(() => expect(screen.queryByText(/proprio@exemplo.invalid/)).not.toBeNull());
    fireEvent.change(screen.getByLabelText(/Assunto/), { target: { value: "Henrique & Carlos" } });
    fireEvent.click(screen.getByRole("button", { name: "Procurar emails" }));
    await waitFor(() => expect(screen.queryByText("Henrqiue e Carlos")).not.toBeNull());
    expect(gmailSearch).toHaveBeenLastCalledWith(expect.objectContaining({ match: "flexible" }), context);
    expect(screen.getByText(/Variação do nome/)).not.toBeNull();
    expect(screen.getByText(/Procurei:/)).not.toBeNull();
    expect(screen.getByText(/podem existir mais/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mais resultados" }));
    await waitFor(() => expect(screen.queryByText("Carlos and Henrique")).not.toBeNull());
    expect(screen.getAllByText("Henrqiue e Carlos")).toHaveLength(1);
  });
  it("opção de expressão exata envia match exact", async () => {
    const { a, gmailSearch } = adapter();
    render(<GmailAttachmentPicker adapter={a} context={context} sessionId="" enabled disabled={false} onImported={vi.fn()} connectionOnly />);
    await waitFor(() => expect(screen.queryByText(/proprio@exemplo.invalid/)).not.toBeNull());
    fireEvent.click(screen.getByRole("checkbox", { name: /expressão exata/ }));
    fireEvent.change(screen.getByLabelText(/Assunto/), { target: { value: "Henrique" } });
    fireEvent.click(screen.getByRole("button", { name: "Procurar emails" }));
    await waitFor(() => expect(gmailSearch).toHaveBeenCalledWith(expect.objectContaining({ match: "exact" }), context));
  });
});
