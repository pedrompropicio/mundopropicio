import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TicketlineReviewPanel from "@/components/data-entry/TicketlineReviewPanel";
import type { DataEntryAdapter } from "@/lib/data-entry-client";

const prov = { source: "email_body" as const, message_id: "msg000001", body_sha256: "a".repeat(64), line: 3, truncated: false };
const candidate = { message_id: "msg000001", number: { value: "AP-77", prov }, date: null, total_cents: { value: 1000, prov }, event_id: null,
  lines: [{ line_type: "event_right" as const, description: "Direito", amount_cents: 1000, event_hint: null, prov }], sources: [prov], incomplete: ["Data em falta"] };
const proposal = { version: 1 as const, statement_number: "AP-77", event: null, sum_cents: 1000, document_total_cents: 1000, difference_cents: 0, totals_cents: {}, checks: [{ code: "sum", ok: true, message: "ok" }],
  actions: [{ id: "a1", kind: "create_statement", label: "x", existing_flow: "y", depends_on: [], blocked_reason: "bloqueada" }], needs: [], effects_hash: "f".repeat(64) };

describe("#333 fase12c painel de revisão", () => {
  it("edição invalida a prévia; guardar mostra indisponível; autorizar desativado", async () => {
    const preview = vi.fn(async (_input: unknown) => ({ candidate, proposal, persisted: false, notice: "Prévia calculada no servidor, não guardada." }));
    const adapter: DataEntryAdapter = { ticketlineCandidate: async () => ({ candidate, candidate_token: "tok" }), ticketlinePreview: preview } as unknown as DataEntryAdapter;
    render(<TicketlineReviewPanel adapter={adapter} context={{ user_id: "u", company_id: "c" }} messageId="msg000001" />);
    fireEvent.click(screen.getByRole("button", { name: "Rever fecho deste email" }));
    await screen.findByLabelText("Número");
    expect(screen.getByText("Data em falta")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Recalcular prévia" }));
    await screen.findByText(/calculada no servidor/);
    expect(preview.mock.calls[0][0]).toMatchObject({ candidate_token: "tok", edits: { number: "AP-77", lines: [{ amount_cents: 1000 }] } });
    expect((screen.getByRole("button", { name: "Autorizar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Número"), { target: { value: "AP-78" } });
    expect(screen.getByRole("status").textContent).toMatch(/deixaram de valer/);
    expect((screen.getByRole("button", { name: "Guardar revisão" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Valor recebido"), { target: { value: "10,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Recalcular prévia" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/verificaste o recebimento/));
    expect(preview).toHaveBeenCalledTimes(1);
  });
});
