import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PDFDocument } from "pdf-lib";
import { candidateFromBody, mergeScanner, verifyAttachmentSource, candidateToStatement } from "../../supabase/functions/_shared/assistant-ticketline-candidate";
import { buildTicketlineProposal } from "../../supabase/functions/_shared/assistant-ticketline-proposal";
import { normalizeScannerDate } from "../../supabase/functions/_shared/scanner-analysis";
import { attachmentListText, type AttachmentItem } from "../../supabase/functions/_shared/assistant-orchestrator";
import TicketlineReviewPanel from "@/components/data-entry/TicketlineReviewPanel";
import AssistantConversation from "@/components/data-entry/AssistantConversation";
import type { AssistantTurnResult, DataEntryAdapter } from "@/lib/data-entry-client";

// #333 fase12k — fixtures SINTÉTICAS; não reproduzem o PDF real (bytes indisponíveis neste sandbox).
const company = "22222222-2222-4222-8222-222222222222", event = "44444444-4444-4444-8444-444444444444";
const ctx = { user_id: "u", company_id: "c" };
let PDF: Uint8Array = new Uint8Array();
beforeAll(async () => { const d = await PDFDocument.create(); d.addPage(); PDF = await d.save(); });
beforeEach(() => localStorage.clear());
// 18 anexos como na aceitação: 14 imagens pequenas + 4 PDFs (nomes sintéticos).
const atts: AttachmentItem[] = [
  ...Array.from({ length: 14 }, (_, i) => ({ n: i + 1, part_id: `1.${i + 1}`, filename: `image0${String(i + 1).padStart(2, "0")}.png`, mime: "image/png", size_bytes: 2048 + i })),
  ...["A", "B", "C", "D"].map((x, i) => ({ n: 15 + i, part_id: `2.${i + 1}`, filename: `SINTETICO-${x}-AP.pdf`, mime: "application/pdf", size_bytes: 400 * 1024 + i })),
];
const wire = (fields: Record<string, string | null>) => ({ answer: "", warnings: [], fields: Object.entries(fields).map(([field, value]) => ({ field, value, quote: null, page: null, confidence: null, uncertainty: null })) });

describe("#333 fase12k candidato a partir de anexo", () => {
  it("corpo sem linhas + scanner (só número/total): pendências dizem que as linhas não vêm do anexo e que a data ficou vazia", async () => {
    const body = await candidateFromBody({ message_id: "msgSINT01", text: "Boa tarde,\nSegue o fecho em anexo.\nCumprimentos", truncated: false });
    const prov = await verifyAttachmentSource({ message_id: "msgSINT01", part_id: "2.1", bytes: PDF, mime: "application/pdf", listed: [{ part_id: "2.1", size_bytes: PDF.length }] });
    // Data impressa como dd/mm/aaaa com dia e mês ≤ 12: o normalizador existente recusa (ambígua) — não muda.
    expect(normalizeScannerDate("04/10/2026")).toBeNull();
    const c = mergeScanner(body, wire({ invoice_number: "9999/2026", invoice_date: normalizeScannerDate("04/10/2026"), total_amount: "-123.45" }) as never, prov);
    expect(c.lines).toHaveLength(0);
    expect(c.date).toBeNull();
    expect(c.number?.prov.source).toBe("attachment"); expect(c.total_cents?.value).toBe(-12345);
    const text = c.incomplete.join(" ");
    expect(text).toMatch(/scanner.*não extrai as linhas/i);
    expect(text).toMatch(/Data não lida no anexo/);
    expect(text).toMatch(/conferir no documento original/);
    expect(text).not.toMatch(/^Sem linhas reconhecidas: introduzir/m);
  });
  it("duplicado: número já existente bloqueia a preparação de novo apuramento", async () => {
    const body = await candidateFromBody({ message_id: "msgSINT01", text: "Segue em anexo.", truncated: false });
    const prov = await verifyAttachmentSource({ message_id: "msgSINT01", part_id: "2.1", bytes: PDF, mime: "application/pdf", listed: [{ part_id: "2.1", size_bytes: PDF.length }] });
    const c = mergeScanner(body, wire({ invoice_number: "9999/2026", total_amount: "-123.45" }) as never, prov);
    const erp = { company_id: company, events: [{ id: event, name: "Evento Sintético", date: "2026-10-04", sealed: false }], existing_statements: [{ id: "x", number: "9999/2026", status: "draft" }] };
    const p = await buildTicketlineProposal(await candidateToStatement(c), erp, { event_id: event, human_reviewed: true, office_account_id: "o" });
    expect(p.checks.find(x => x.code === "duplicate")?.ok).toBe(false);
    expect(p.actions.find(a => a.id === "a1")?.blocked_reason).toBeTruthy();
  });
});

describe("#333 fase12k uma só apresentação dos anexos", () => {
  it("texto do servidor resume tipos, sem repetir os nomes", () => {
    const t = attachmentListText(atts);
    expect(t).toMatch(/18 anexos/); expect(t).toMatch(/4 PDF/); expect(t).toMatch(/14 imagens/);
    expect(t).not.toMatch(/SINTETICO-A-AP\.pdf/);
  });
  it("conversa: cada anexo aparece uma única vez (na revisão); imagens recolhidas", async () => {
    const base = { trace: [], known_message_ids: ["msgSINT01"], execution: { available: false as const, gaps: [] } };
    const answer: AssistantTurnResult = { ...base, status: "answer", text: attachmentListText(atts), continuation: "s", review_message_id: "msgSINT01", attachments: atts };
    const adapter = { assistantTurn: vi.fn().mockResolvedValue(answer), ticketlineCandidate: vi.fn() } as unknown as DataEntryAdapter;
    render(<AssistantConversation context={ctx} adapter={adapter} />);
    fireEvent.change(screen.getByLabelText("O que pretende fazer?"), { target: { value: "Mostra os PDFs" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByRole("radio", { name: /SINTETICO-A-AP\.pdf/ });
    expect(screen.queryByLabelText("Anexos do email")).toBeNull();
    expect(screen.getAllByText(/SINTETICO-A-AP\.pdf/)).toHaveLength(1);
    const imgs = screen.getByText(/Imagens \(14\)/).closest("details")!;
    expect(imgs.open).toBe(false);
    expect(screen.getAllByRole("radio")).toHaveLength(19); // corpo + 18
  });
});

describe("#333 fase12k painel: troca de origem, data e revisão parcial", () => {
  const aprov = { source: "attachment" as const, origin: "gmail:msgSINT01:2.1", sha256: "4".repeat(64), size_bytes: 1, mime: "application/pdf" };
  const cand = { message_id: "msgSINT01", number: { value: "9999/2026", prov: aprov }, date: null, total_cents: { value: -12345, prov: aprov }, event_id: null, lines: [], sources: [aprov], incomplete: ["x"] };
  const tl = atts.filter(a => a.mime === "application/pdf").map(({ part_id, filename, mime, size_bytes }) => ({ part_id, filename, mime, size_bytes }));
  it("trocar de anexo esconde o candidato antigo até reler com o novo", async () => {
    const ticketlineCandidate = vi.fn(async () => ({ candidate: cand, candidate_token: "t1" }));
    render(<TicketlineReviewPanel adapter={{ ticketlineCandidate } as unknown as DataEntryAdapter} context={ctx} messageId="msgSINT01" initialAttachments={tl} />);
    fireEvent.click(screen.getByRole("radio", { name: /SINTETICO-A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Rever fecho deste email" }));
    expect((await screen.findByLabelText("Número") as HTMLInputElement).value).toBe("9999/2026");
    fireEvent.click(screen.getByRole("radio", { name: /SINTETICO-B/ }));
    expect(screen.queryByLabelText("Número")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Rever fecho deste email" }));
    await waitFor(() => expect(ticketlineCandidate).toHaveBeenLastCalledWith({ message_id: "msgSINT01", part_id: "2.2" }, ctx));
  });
  it("data sem origem fica vazia (nunca a data de hoje) e sem linhas não se pode confirmar a revisão", async () => {
    render(<TicketlineReviewPanel adapter={{ ticketlineCandidate: async () => ({ candidate: cand, candidate_token: "t1" }) } as unknown as DataEntryAdapter} context={ctx} messageId="msgSINT01" />);
    fireEvent.click(screen.getByRole("button", { name: "Rever fecho deste email" }));
    const d = await screen.findByLabelText("Data") as HTMLInputElement;
    expect(d.value).toBe(""); expect(d.type).toBe("text"); expect(d.placeholder).toBe("DD/MM/AAAA"); // componente padrão ERP: vazio inequívoco, nunca a data de hoje
    const c = screen.getByLabelText("Confirmo a revisão") as HTMLInputElement;
    expect(c.disabled).toBe(true);
    expect(screen.getByText(/Revisão parcial/)).toBeTruthy();
  });
});
