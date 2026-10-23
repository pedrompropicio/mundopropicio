import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantConversation, { historyKey } from "../components/data-entry/AssistantConversation";
import { DataEntryError, type AssistantTurnResult, type DataEntryAdapter } from "../lib/data-entry-client";

// #333 — dados sintéticos; sem rede, Gmail ou IA reais.
const context = { user_id: "local-user", company_id: "local-company" };
const base = { trace: [], known_message_ids: [], execution: { available: false as const, gaps: [] } };
const opts = [
  { id: "msgSINTA1", label: "1. Fecho sintético Alfa\nR\n09/10/26, 11:05 (Lisboa)\nAnexos: 14 imagens", attachments: { total: 14, pdf: 0, images: 14, other: 0 } },
  { id: "msgSINTB2", label: "2. Fecho sintético Beta\nR\n09/10/26, 14:28 (Lisboa)\nAnexos: 4 PDF", attachments: { total: 4, pdf: 4, images: 0, other: 0 } },
  { id: "msgSINTC3", label: "3. Outro assunto\nO\n08/10/26, 10:00 (Lisboa)\nSem anexos", attachments: { total: 0, pdf: 0, images: 0, other: 0 } },
];
const select = (c: string): AssistantTurnResult => ({ ...base, status: "select_message", text: "Escolhe.", continuation: c, options: opts });
const answer = (id: string, c: string, files: string[]): AssistantTurnResult => ({ ...base, status: "answer", text: `Revisão de ${id}.`, continuation: c, review_message_id: id, attachments: files.map((f, i) => ({ n: i + 1, part_id: `${i + 1}`, filename: f, mime: f.endsWith(".pdf") ? "application/pdf" : "image/jpeg", size_bytes: 2048 })) });
const deferred = <T,>() => { let resolve!: (v: T) => void; const p = new Promise<T>(r => { resolve = r; }); return { p, resolve }; };
beforeEach(() => localStorage.clear());
const start = (assistantTurn: ReturnType<typeof vi.fn>) => {
  render(<AssistantConversation context={context} adapter={{ assistantTurn } as unknown as DataEntryAdapter} />);
  fireEvent.change(screen.getByLabelText("O que pretende fazer?"), { target: { value: "Pedido original sintético" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
};

describe("#333 UI: escolher outro email", () => {
  it("A (imagens) → Escolher outro email → B (PDF), com a assinatura e o pedido original; nada sensível no armazenamento", async () => {
    const assistantTurn = vi.fn()
      .mockResolvedValueOnce(select("s1"))
      .mockResolvedValueOnce(answer("msgSINTA1", "s2", ["foto-1.jpg", "foto-2.jpg"]))
      .mockResolvedValueOnce(select("s3"))
      .mockResolvedValueOnce(answer("msgSINTB2", "s4", ["fecho-1.pdf"]));
    start(assistantTurn);
    expect(await screen.findByRole("button", { name: /Anexos: 14 imagens/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /1\. Fecho sintético Alfa/ }));
    await screen.findByText("foto-1.jpg", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Escolher outro email" }));
    await waitFor(() => expect(assistantTurn).toHaveBeenCalledTimes(3));
    expect(assistantTurn.mock.calls[2][0]).toMatchObject({ intent: "list", continuation: "s2", continuation_text: "Pedido original sintético" });
    expect(assistantTurn.mock.calls[2][0].selection).toBeUndefined();
    fireEvent.click(await screen.findByRole("button", { name: /2\. Fecho sintético Beta.*4 PDF/s }));
    await screen.findByText("fecho-1.pdf", { exact: false });
    expect(screen.queryByText("foto-1.jpg", { exact: false })).toBeNull();
    expect(assistantTurn.mock.calls[3][0]).toMatchObject({ selection: { message_id: "msgSINTB2" }, continuation: "s3", continuation_text: "Pedido original sintético" });
    const stored = localStorage.getItem(historyKey(context)) ?? "";
    expect(stored).not.toMatch(/s[1-4]"|msgSINT|fecho-1\.pdf|foto-1/);
  });
  it("resposta tardia de A não reaplica A depois de Parar e escolher B", async () => {
    const lateA = deferred<AssistantTurnResult>();
    const assistantTurn = vi.fn()
      .mockResolvedValueOnce(select("s1"))
      .mockReturnValueOnce(lateA.p)
      .mockResolvedValueOnce(answer("msgSINTB2", "s4", ["fecho-1.pdf"]));
    start(assistantTurn);
    fireEvent.click(await screen.findByRole("button", { name: /1\. Fecho sintético Alfa/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Parar" }));
    fireEvent.click(await screen.findByRole("button", { name: /2\. Fecho sintético Beta/ }));
    await screen.findByText("fecho-1.pdf", { exact: false });
    await act(async () => { lateA.resolve(answer("msgSINTA1", "sA", ["foto-1.jpg"])); await lateA.p; });
    expect(screen.queryByText("foto-1.jpg", { exact: false })).toBeNull();
    expect(screen.getByText("fecho-1.pdf", { exact: false })).toBeTruthy();
  });
  it("ao pedir a lista a revisão anterior desaparece logo; resposta tardia de A não volta", async () => {
    const lateList = deferred<AssistantTurnResult>();
    const assistantTurn = vi.fn()
      .mockResolvedValueOnce(select("s1"))
      .mockResolvedValueOnce(answer("msgSINTA1", "s2", ["foto-1.jpg"]))
      .mockReturnValueOnce(lateList.p);
    start(assistantTurn);
    fireEvent.click(await screen.findByRole("button", { name: /1\. Fecho sintético Alfa/ }));
    await screen.findByText("foto-1.jpg", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Escolher outro email" }));
    expect(screen.queryByText("foto-1.jpg", { exact: false })).toBeNull();
    await act(async () => { lateList.resolve(select("s3")); await lateList.p; });
    expect(await screen.findByRole("button", { name: /3\. Outro assunto/ })).toBeTruthy();
  });
  it("assinatura expirada (409) esconde o botão em vez de falhar de novo", async () => {
    const assistantTurn = vi.fn()
      .mockResolvedValueOnce(select("s1"))
      .mockResolvedValueOnce(answer("msgSINTA1", "s2", ["foto-1.jpg"]))
      .mockRejectedValueOnce(new DataEntryError("Seleção expirada ou contexto alterado; repete a pesquisa.", 409));
    start(assistantTurn);
    fireEvent.click(await screen.findByRole("button", { name: /1\. Fecho sintético Alfa/ }));
    await screen.findByText("foto-1.jpg", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Escolher outro email" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Escolher outro email" })).toBeNull();
  });
});
