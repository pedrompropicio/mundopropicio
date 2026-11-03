// @vitest-environment node
// #458: fronteiras reais do handler/orquestrador; serviços inteiramente sintéticos.
// O modelo é um guião, não prova compreensão de linguagem nem aceitação Live.
import { describe, expect, it } from "vitest";
import { command, event, createRetomaFixture } from "./data-entry-retoma458-fixture";

describe("#458 comando até prévia sintética pelo handler existente", () => {
  it.each([false, true])("ambiguidade=%s: seleção só se necessária, PDF com proveniência e duplicado bloqueado, zero writers", async ambiguous => {
    const { post, next, searchMock, readMock, attachment, scan, genericScanner, upload, receipt, rpc, attachmentMeta } = await createRetomaFixture(ambiguous);
    const first = await post({ action: "assistant_turn", text: command, history: [] });
    expect(first.status).toBe(200);
    let result = await first.json();
    if (ambiguous) {
      expect(result.status).toBe("select_message"); expect(result.options).toHaveLength(2);
      expect(readMock).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledTimes(1);
      result = await (await post({ action: "assistant_turn", text: command, history: [], continuation: result.continuation, continuation_text: command, selection: { message_id: "msgFICT01" } })).json();
    }
    expect(result.status).toBe("answer"); expect(result.review_message_id).toBe("msgFICT01");
    expect(result.attachments).toEqual([{ n: 1, ...attachmentMeta }]);
    expect(result.trace).toContainEqual(expect.objectContaining({ tool: "register_payment", ok: false }));
    expect(result.execution.available).toBe(false);
    // Passagem explícita à revisão existente: não simula um clique automático do modelo.
    const candidateResponse = await post({ action: "ticketline_candidate", message_id: result.review_message_id, part_id: result.attachments[0].part_id });
    expect(candidateResponse.status).toBe(200);
    const candidate = await candidateResponse.json();
    expect(candidate.duplicates).toEqual([{ id: "44444444-4444-4444-8444-444444444444", number: "ap-fict-458", status: "confirmed" }]);
    expect(candidate.candidate.lines.map((l: { amount_cents: number }) => l.amount_cents)).toEqual([10000, -1000]);
    expect(candidate.candidate.lines.every((l: { prov: { source: string } }) => l.prov.source === "attachment")).toBe(true);
    const previewResponse = await post({ action: "ticketline_preview", candidate_token: candidate.candidate_token, edits: {} });
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    expect(preview.persisted).toBe(false); expect(preview.proposal.event.id).toBe(event);
    expect(preview.proposal.checks).toContainEqual(expect.objectContaining({ code: "duplicate", ok: false }));
    expect(preview.proposal.actions.every((a: { blocked_reason: string }) => a.blocked_reason)).toBe(true);
    expect({ model: next.mock.calls.length, search: searchMock.mock.calls.length, read: readMock.mock.calls.length, attachment: attachment.mock.calls.length, scanner: scan.mock.calls.length }).toEqual({ model: 4, search: ambiguous ? 2 : 1, read: 2, attachment: 1, scanner: 1 });
    // Duas leituras: conversa e pedido separado de candidato. Uma por turno não significa uma no percurso.
    expect(genericScanner).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled(); expect(receipt).not.toHaveBeenCalled();
    expect(rpc.mock.calls.every(([, name]) => ["my_effective_permissions", "data_entry_pilot8_capabilities"].includes(name))).toBe(true);
  });
});
