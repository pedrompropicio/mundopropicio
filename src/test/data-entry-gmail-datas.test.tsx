import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GmailAttachmentPicker from "@/components/data-entry/GmailAttachmentPicker";
import type { DataEntryAdapter } from "@/lib/data-entry-client";

const context = { user_id: "user-synthetic", company_id: "company-synthetic" };
function setup(disabled = false) {
  const gmailSearch = vi.fn().mockResolvedValue({ messages: [], next_page_token: null });
  const adapter = { gmailSearch, gmailRead: vi.fn() } as unknown as DataEntryAdapter;
  const props = { adapter, context, sessionId: "", enabled: true, disabled, connectionOnly: true, onImported: vi.fn() };
  const view = render(<GmailAttachmentPicker {...props} />);
  fireEvent.change(screen.getByLabelText(/Assunto contém/), { target: { value: "Teste local" } });
  return { ...view, gmailSearch, props };
}
function period() {
  fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "01102026" } });
  fireEvent.change(screen.getByLabelText("Até"), { target: { value: "31102026" } });
}
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-23T12:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("#333 Gmail — datas civis no DatePicker canónico (sem chamadas reais)", () => {
  it("preserva o período inicial obrigatório de 30 dias na API", async () => {
    const { gmailSearch } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Procurar emails" }));
    await waitFor(() => expect(gmailSearch).toHaveBeenCalledWith(expect.objectContaining({ from_date: "2026-09-23", to_date: "2026-10-23", page_size: 10, attachments_only: false, match: "flexible" }), context));
  });
  it("entrada dd/MM/aaaa envia ISO civil e conserva remetente/assunto/exato", async () => {
    const { gmailSearch } = setup();
    period();
    fireEvent.change(screen.getByLabelText(/Remetente/), { target: { value: " example.invalid " } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Procurar emails" }));
    await waitFor(() => expect(gmailSearch).toHaveBeenCalledWith({ from_date: "2026-10-01", to_date: "2026-10-31", sender: "example.invalid", subject: "Teste local", page_size: 10, attachments_only: false, match: "exact" }, context));
  });
  it("escolha no calendário partilhado atualiza Desde em ISO", async () => {
    const { gmailSearch } = setup();
    period();
    fireEvent.click(within(screen.getByLabelText("Desde").parentElement as HTMLElement).getAllByRole("button")[0]);
    fireEvent.click(screen.getByText("15", { selector: "button" }));
    fireEvent.click(screen.getByRole("button", { name: "Procurar emails" }));
    await waitFor(() => expect(gmailSearch).toHaveBeenCalledWith(expect.objectContaining({ from_date: "2026-10-15", to_date: "2026-10-31" }), context));
  });
  it.each(["Desde", "Até"])("limpar %s pelo botão bloqueia pesquisa, inclusive paginação, sem restaurar data antiga", async (label) => {
    const { gmailSearch, rerender, props } = setup();
    gmailSearch.mockResolvedValue({ messages: [], next_page_token: "page2" });
    fireEvent.click(screen.getByRole("button", { name: "Procurar emails" }));
    await screen.findByRole("button", { name: "Mais resultados" });
    gmailSearch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: `Limpar ${label}` }));
    fireEvent.blur(screen.getByLabelText(label));
    rerender(<GmailAttachmentPicker {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Procurar emails" }));
    fireEvent.click(screen.getByRole("button", { name: "Mais resultados" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByLabelText(label)).toHaveValue("");
    expect(gmailSearch).not.toHaveBeenCalled();
  });
  it("apagar texto limpa o canónico; nova data passa a ser o período efetivo", async () => {
    const { gmailSearch } = setup();
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "" } });
    fireEvent.blur(screen.getByLabelText("Desde"));
    fireEvent.click(screen.getByRole("button", { name: "Procurar emails" }));
    expect(gmailSearch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "09102026" } });
    fireEvent.click(screen.getByRole("button", { name: "Procurar emails" }));
    await waitFor(() => expect(gmailSearch).toHaveBeenCalledWith(expect.objectContaining({ from_date: "2026-10-09" }), context));
  });
  it("maxDate de Desde e minDate de Até recusam entrada invertida", async () => {
    const { gmailSearch } = setup();
    period();
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "01112026" } });
    fireEvent.blur(screen.getByLabelText("Desde"));
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "30092026" } });
    fireEvent.blur(screen.getByLabelText("Até"));
    fireEvent.click(screen.getByRole("button", { name: "Procurar emails" }));
    await waitFor(() => expect(gmailSearch).toHaveBeenCalledWith(expect.objectContaining({ from_date: "2026-10-01", to_date: "2026-10-31" }), context));
  });
  it("calendário desativa dias fora dos limites", () => {
    setup(); period();
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "10102026" } });
    fireEvent.click(within(screen.getByLabelText("Desde").parentElement as HTMLElement).getAllByRole("button")[0]);
    expect(screen.getByText("15", { selector: "button" })).toBeDisabled();
  });
  it("off por disabled bloqueia edição, limpeza, calendário e pesquisa", () => {
    const { gmailSearch } = setup(true);
    expect(screen.getByLabelText("Desde")).toBeDisabled();
    expect(screen.getByLabelText("Até")).toBeDisabled();
    for (const label of ["Desde", "Até"]) {
      for (const button of within(screen.getByLabelText(label).parentElement as HTMLElement).getAllByRole("button")) expect(button).toBeDisabled();
    }
    fireEvent.click(screen.getByRole("button", { name: "Procurar emails" }));
    expect(gmailSearch).not.toHaveBeenCalled();
  });
  it("off por busy bloqueia ambas as datas até a pesquisa terminar", async () => {
    const { gmailSearch } = setup();
    let resolve: (value: { messages: []; next_page_token: null }) => void = () => {};
    gmailSearch.mockImplementation(() => new Promise(r => { resolve = r; }));
    fireEvent.click(screen.getByRole("button", { name: "Procurar emails" }));
    expect(screen.getByLabelText("Desde")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Limpar Até" })).toBeDisabled();
    await act(async () => resolve({ messages: [], next_page_token: null }));
    expect(screen.getByLabelText("Desde")).not.toBeDisabled();
  });
});