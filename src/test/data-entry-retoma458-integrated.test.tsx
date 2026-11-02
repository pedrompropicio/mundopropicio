import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AssistantConversation from "../components/data-entry/AssistantConversation";
import { DataEntryError, type DataEntryAdapter } from "../lib/data-entry-client";
import { command, createRetomaFixture } from "./data-entry-retoma458-fixture";

// Transporte exclusivamente em processo. Componentes, handler, assinatura e orquestrador reais.
const context = { user_id: "11111111-1111-4111-8111-111111111111", company_id: "22222222-2222-4222-8222-222222222222" };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Egress proibido neste teste"); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function setup(ambiguous = false, multiple = false) {
  const f = await createRetomaFixture(ambiguous, multiple);
  const requests: Record<string, unknown>[] = [];
  let hold: ReturnType<typeof deferred> | undefined;
  let fail = false;
  let turnHold: ReturnType<typeof deferred> | undefined;
  const call = async (action: string, input: object = {}) => {
    requests.push({ action, ...input });
    const response = await f.post({ action, ...input });
    const payload = await response.json();
    if (action === "ticketline_candidate" && hold) { const gate = hold; hold = undefined; await gate.promise; }
    if (action === "assistant_turn" && turnHold) { const gate = turnHold; turnHold = undefined; await gate.promise; }
    if (action === "assistant_turn" && fail) throw new DataEntryError("Falha sintética de transporte", 503);
    if (!response.ok) throw new DataEntryError(payload.error, response.status);
    return payload;
  };
  const adapter: DataEntryAdapter = {
    status: () => call("status"), session: () => call("session"), upload: () => call("upload"),
    preview: () => call("preview"), execute: () => call("execute"), check: () => call("check"),
    assistantTurn: (input) => call("assistant_turn", input),
    ticketlineCandidate: input => call("ticketline_candidate", input),
    ticketlinePreview: input => call("ticketline_preview", input),
    ticketlineAccounts: () => call("ticketline_accounts"),
    ticketlineAttachments: input => call("ticketline_attachments", input),
    ticketlineAuthorize: input => call("ticketline_authorize", input),
    ticketlineExecute: input => call("ticketline_execute", input),
  };
  render(<AssistantConversation context={context} adapter={adapter} />);
  const send = () => { fireEvent.change(screen.getByLabelText("O que pretende fazer?"), { target: { value: command } }); fireEvent.click(screen.getByRole("button", { name: "Enviar" })); };
  const noWrites = () => {
    expect(requests.filter(r => r.save || ["ticketline_authorize", "ticketline_execute", "upload", "execute"].includes(String(r.action)))).toEqual([]);
    expect(f.upload).not.toHaveBeenCalled(); expect(f.receipt).not.toHaveBeenCalled();
    expect(f.genericScanner).not.toHaveBeenCalled();
    expect(f.rpc.mock.calls.every(([, name]) => ["my_effective_permissions", "data_entry_pilot8_capabilities"].includes(name))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  };
  return { ...f, requests, send, noWrites, delayCandidate: () => { const gate = deferred(); hold = gate; return gate; }, delayTurn: () => { const gate = deferred(); turnHold = gate; return gate; }, failTurn: () => { fail = true; } };
}
const choosePdf = async () => { fireEvent.click(await screen.findByRole("radio", { name: /apuramento-ficticio.pdf/ })); fireEvent.click(screen.getByRole("button", { name: "Rever fecho deste email" })); };

describe("#458 conversa e revisão reais → handler/orquestrador em processo", () => {
  it.each([false, true])("ambiguidade=%s: controles reais levam PDF, proveniência e duplicado à revisão sem efeitos", async ambiguous => {
    const f = await setup(ambiguous, true); f.send();
    if (ambiguous) {
      const choices = await screen.findByRole("group", { name: "Escolher email" });
      expect(within(choices).getAllByRole("button")).toHaveLength(2);
      expect(f.readMock).not.toHaveBeenCalled();
      fireEvent.click(within(choices).getByRole("button", { name: /1\./ }));
    }
    await screen.findByRole("radio", { name: /apuramento-ficticio.pdf/ });
    expect(screen.queryByRole("group", { name: "Escolher email" })).toBeNull();
    expect(f.scan).not.toHaveBeenCalled(); expect(f.attachment).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: /apuramento-ficticio.pdf/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /outro-ficticio.pdf/ })).not.toBeChecked();
    await choosePdf();
    expect(await screen.findByLabelText("Número")).toHaveValue("AP-FICT-458");
    expect(screen.getByLabelText("Total")).toHaveValue("90,00");
    expect(screen.getByLabelText("Data")).toHaveValue("20/10/2026");
    expect(screen.getByLabelText("Descrição da linha 1")).toHaveValue("Concerto Fictício");
    expect(screen.getByLabelText("Valor da linha 1")).toHaveValue("100,00");
    expect(screen.getByLabelText("Descrição da linha 2")).toHaveValue("Comissão fictícia");
    expect(screen.getByLabelText("Valor da linha 2")).toHaveValue("-10,00");
    expect(screen.queryByLabelText("Valor da linha 3")).toBeNull();
    const panel = screen.getByRole("region", { name: "Revisão do fecho Ticketline" });
    expect(within(panel).getAllByText(/anexo · [a-f0-9]{8}/).length).toBeGreaterThan(0);
    expect(within(panel).getByRole("alert")).toHaveTextContent(/ap-fict-458.*confirmed/);
    fireEvent.click(screen.getByRole("button", { name: "Recalcular prévia" }));
    expect(await screen.findByRole("button", { name: "Autorizar" })).toBeDisabled();
    expect(within(screen.getByLabelText("Evento")).getByRole("option", { name: "Concerto Fictício · 2026-10-19" })).toBeInTheDocument();
    expect(within(panel).getAllByText(/Bloqueada:/).length).toBeGreaterThan(0);
    expect(within(panel).getByRole("group", { name: /Ações a autorizar/ }).querySelectorAll('input:not(:disabled)')).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^Executar/ })).toBeNull();
    expect({ model: f.next.mock.calls.length, search: f.searchMock.mock.calls.length, read: f.readMock.mock.calls.length, download: f.attachment.mock.calls.length, scanner: f.scan.mock.calls.length }).toEqual({ model: 4, search: ambiguous ? 2 : 1, read: 2, download: 1, scanner: 1 });
    expect(f.requests.filter(r => r.action === "assistant_turn").map(r => r.text)).toEqual(ambiguous ? [command, command] : [command]);
    expect(f.requests.find(r => r.action === "ticketline_candidate")).toMatchObject({ part_id: "2.1" });
    f.noWrites();
  });

  it("troca de origem descarta resposta tardia do candidato real; trocar email desmonta revisão", async () => {
    const f = await setup(false, true); f.send(); await choosePdf();
    await screen.findByLabelText("Número");
    const gate = f.delayCandidate();
    fireEvent.click(screen.getByRole("button", { name: "Reler com a origem escolhida" }));
    await waitFor(() => expect(f.scan).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("radio", { name: /outro-ficticio.pdf/ }));
    expect(screen.queryByLabelText("Número")).toBeNull();
    await act(async () => { gate.resolve(); });
    expect(screen.queryByLabelText("Número")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Escolher outro email" }));
    expect(screen.queryByRole("radio")).toBeNull();
    await screen.findByRole("group", { name: "Escolher email" });
    expect(screen.queryByLabelText("Número")).toBeNull();
    f.noWrites();
  });

  it("candidato tardio de A não reaparece depois de escolher email B pelos cartões reais", async () => {
    const f = await setup(true, true); f.send();
    const choices = await screen.findByRole("group", { name: "Escolher email" });
    fireEvent.click(within(choices).getByRole("button", { name: /1\./ }));
    const gate = f.delayCandidate(); await choosePdf();
    await waitFor(() => expect(f.scan).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Escolher outro email" }));
    const list = await screen.findByRole("group", { name: "Escolher email" });
    f.next.mockResolvedValue({ step: { type: "final", text: "Email escolhido; usa a revisão." }, tokens: 1 });
    fireEvent.click(within(list).getByRole("button", { name: /2\./ }));
    await screen.findByRole("radio", { name: /apuramento-ficticio.pdf/ });
    await act(async () => { gate.resolve(); });
    expect(screen.queryByLabelText("Número")).toBeNull();
    expect(screen.queryByRole("region", { name: "Revisão do fecho Ticketline" })).toBeNull();
    expect(f.requests.filter(r => r.action === "assistant_turn").at(-1)).toMatchObject({ selection: { message_id: "msgFICT02" } });
    expect(f.readMock).toHaveBeenCalledTimes(2); // conversa A + candidato A; selecionar B não implica reler A.
    f.noWrites();
  });

  it("Parar descarta a resposta tardia do handler sem fabricar revisão", async () => {
    const f = await setup(); const gate = f.delayTurn(); f.send();
    await waitFor(() => expect(f.next).toHaveBeenCalledTimes(4));
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Cancelamento pedido");
    await act(async () => { gate.resolve(); });
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByLabelText("Número")).toBeNull();
    expect(f.scan).not.toHaveBeenCalled(); f.noWrites();
  });

  it("erro de transporte não fabrica revisão nem sucesso", async () => {
    const f = await setup(); f.failTurn(); f.send();
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha sintética");
    expect(screen.queryByLabelText("Número")).toBeNull();
    expect(screen.queryByRole("button", { name: "Autorizar" })).toBeNull();
    f.noWrites();
  });
});
