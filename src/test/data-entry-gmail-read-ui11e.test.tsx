import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GmailAttachmentPicker from "../components/data-entry/GmailAttachmentPicker";
import type { DataEntryAdapter, GmailMessageBody } from "../lib/data-entry-client";

const context = { user_id: "user-a", company_id: "company-a" };
const message = { message_id: "msgREAD001", from: "Fornecedor <faturas@exemplo.invalid>", subject: "Fatura de outubro", date: "2026-10-09T10:00:00.000Z", attachments: [] };
const body: GmailMessageBody = { message_id: "msgREAD001", from: message.from, subject: message.subject, date: message.date, kind: "plain", body_text: "Corpo do email em texto simples.", truncated: false };

function adapter(over: Partial<DataEntryAdapter> = {}): DataEntryAdapter {
  return {
    status: vi.fn(), session: vi.fn(), upload: vi.fn(), preview: vi.fn(), execute: vi.fn(), check: vi.fn(),
    gmailConnection: vi.fn(async () => ({ linked: true, reconnect_required: false, mailbox_email: "proprio@exemplo.invalid" })),
    gmailSearch: vi.fn(async () => ({ messages: [message], next_page_token: null })),
    gmailRead: vi.fn(async () => body),
    ...over,
  } as unknown as DataEntryAdapter;
}
const props = { context, sessionId: "", enabled: true, disabled: false, onImported: vi.fn(), connectionOnly: true as const };

describe("Gmail leitura no modo só-ligação (envio fechado)", () => {
  it("mostra pesquisa e leitura; nunca mostra importação de anexos", async () => {
    const a = adapter();
    render(<GmailAttachmentPicker {...props} adapter={a} />);
    await waitFor(() => expect(screen.queryByText(/proprio@exemplo.invalid/)).not.toBeNull());
    fireEvent.change(screen.getByLabelText(/Remetente/), { target: { value: "faturas@exemplo.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Procurar emails" }));
    await waitFor(() => expect(screen.queryByText("Fatura de outubro")).not.toBeNull());
    expect(a.gmailSearch).toHaveBeenCalledWith(expect.objectContaining({ attachments_only: false }), context);
    expect(screen.queryByRole("button", { name: "Usar o anexo escolhido" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ler email" }));
    await waitFor(() => expect(screen.queryByText("Corpo do email em texto simples.")).not.toBeNull());
    expect(a.gmailRead).toHaveBeenCalledWith("msgREAD001", context);
  });
  it("resposta com identificador diferente da mensagem escolhida é descartada", async () => {
    const a = adapter({ gmailRead: vi.fn(async () => ({ ...body, message_id: "msgOUTRA99" })) });
    render(<GmailAttachmentPicker {...props} adapter={a} />);
    await waitFor(() => expect(screen.queryByText(/proprio@exemplo.invalid/)).not.toBeNull());
    fireEvent.change(screen.getByLabelText(/Assunto/), { target: { value: "fatura" } });
    fireEvent.click(screen.getByRole("button", { name: "Procurar emails" }));
    await waitFor(() => expect(screen.queryByText("Fatura de outubro")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Ler email" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeNull());
    expect(screen.queryByText("Corpo do email em texto simples.")).toBeNull();
  });
});
