/**
 * #333 12j corretiva — teste real do Pedro (22/10/2026 23:38 UTC): HTTP 200, controller reason_code=invalid_response.
 * Fixture fiel e sanitizada: texto final exato devolvido pelo serviço (log do gateway 01a165fa…, sem conteúdo cifrado,
 * sem dados de caixa). O modelo não tinha a data de hoje e pediu gmail_search com datas relativas; o adaptador validava
 * os argumentos da ferramenta e lançava erro depois do HTTP 200, matando a conversa com "O assistente não respondeu".
 * Só HTTP sintético local; nenhuma chamada real à IA/Gmail.
 */
import { describe, it, expect, vi } from "vitest";
import { createAssistantModel } from "../../supabase/functions/_shared/issue333-ai/assistant-model";
import { durableProviderControl, type ControlStore, type ControlRecord } from "../../supabase/functions/_shared/issue333-ai/control";
import { runAssistantTurn } from "../../supabase/functions/_shared/assistant-orchestrator";

const PEDIDO = "Procura na minha caixa os emails da Ticketline com fechos de eventos dos últimos 30 dias e mostra os encontrados.";
/** Texto exato de response.output_text.done do pedido 23:38 UTC. */
const REAL_2338 = "{\"type\":\"tool\",\"name\":\"gmail_search\",\"args_json\":\"{\\\"from_date\\\":\\\"30 days ago\\\",\\\"to_date\\\":\\\"today\\\",\\\"sender\\\":\\\"Ticketline\\\",\\\"page_size\\\":20}\",\"text\":null}";
const NOW = () => new Date("2026-10-22T23:38:16Z"); // 00:38 de 23/10 em Lisboa (UTC+1 até 25/10)

function control() {
  let row: ControlRecord = { revision: "1", state: "ready", enabled: true, reviewed: true, claim: null, stage: "idle", reason: "none", status: null };
  const outcomes: string[] = [];
  const store: ControlStore = { async transition(op, claim, _rev, outcome, status) {
    if (op === "claim") row = { ...row, claim: claim ?? null, stage: "claimed" };
    if (op === "post") row = { ...row, stage: "post_started" };
    if (op === "finish") { outcomes.push(outcome ?? ""); row = { ...row, claim: null, stage: "idle", reason: outcome ?? "none", status: status ?? null }; }
    return { ...row };
  } };
  return { control: durableProviderControl(store), outcomes };
}
function response(text: string) {
  const output = [{ type: "message", id: "msg_mock", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }];
  const frames = [
    { type: "response.created", response: { id: "resp_mock", model: "openai/gpt-6-astra", created_at: 0 } },
    { type: "response.output_item.added", output_index: 0, item: output[0] },
    { type: "response.content_part.added", item_id: "msg_mock", output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } },
    { type: "response.output_text.delta", item_id: "msg_mock", output_index: 0, content_index: 0, delta: text },
    { type: "response.output_item.done", output_index: 0, item: output[0] },
    { type: "response.completed", response: { id: "resp_mock", model: "openai/gpt-6-astra", output, usage: { input_tokens: 398, output_tokens: 198, total_tokens: 596, output_tokens_details: { reasoning_tokens: 0 } } } },
  ];
  return new Response(frames.map(f => `data: ${JSON.stringify(f)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
}
const tool = (args: unknown) => JSON.stringify({ type: "tool", name: "gmail_search", args_json: JSON.stringify(args), text: null });
const noRead = { gmailRead: vi.fn(), erpContext: vi.fn() };

describe("#333 12j corretiva — pedido real 23:38 UTC", () => {
  it("instruções levam a data civil do servidor (Europe/Lisbon) em AAAA-MM-DD", async () => {
    const bodies: Record<string, any>[] = [];
    const m = createAssistantModel({ apiKey: "local-not-a-key", control: control().control, validateContext: async () => {}, now: NOW,
      fetch: async (_u, init) => { bodies.push(JSON.parse(String(init?.body))); return response(JSON.stringify({ type: "final", name: null, args_json: null, text: "ok" })); } });
    await m.next({ contract: "c", tools: [], messages: [{ role: "user", content: PEDIDO }], signal: new AbortController().signal });
    const dev = String(bodies[0].input[0].content);
    expect(dev).toContain("Data de hoje (Europe/Lisbon): 2026-10-23");
    expect(dev).toMatch(/AAAA-MM-DD/);
  });

  it("resposta real com datas relativas já não mata a conversa: argumentos voltam ao modelo e a pesquisa corre só com datas válidas", async () => {
    const c = control(); const bodies: Record<string, any>[] = [];
    const replies = [REAL_2338, tool({ from_date: "2026-09-23", to_date: "2026-10-23", sender: "ticketline.pt", page_size: 20 })];
    const m = createAssistantModel({ apiKey: "local-not-a-key", control: c.control, validateContext: async () => {}, now: NOW,
      fetch: async (_u, init) => { bodies.push(JSON.parse(String(init?.body))); return response(replies[bodies.length - 1]); } });
    const gmailSearch = vi.fn(async () => ({ messages: [
      { message_id: "msg000001", from: "fechos@ticketline.pt", subject: "Fecho A", date: "2026-10-10", attachments: [] },
      { message_id: "msg000002", from: "fechos@ticketline.pt", subject: "Fecho B", date: "2026-10-15", attachments: [] },
    ], next_page_token: null }));
    const r = await runAssistantTurn(m, { gmailSearch, ...noRead }, { text: PEDIDO, history: [] }, new AbortController().signal);
    expect(r.status).toBe("select_message");
    expect(r.options?.map(o => o.id)).toEqual(["msg000001", "msg000002"]);
    expect(c.outcomes).toEqual(["success", "success"]);
    expect(gmailSearch).toHaveBeenCalledTimes(1);
    expect(gmailSearch).toHaveBeenCalledWith({ from_date: "2026-09-23", to_date: "2026-10-23", sender: "ticketline.pt", page_size: 20, attachments_only: false });
    expect(JSON.stringify(bodies[1].input)).toContain("Argumentos inválidos");
    expect(r.trace[0]).toMatchObject({ tool: "gmail_search", ok: false });
  });

  it("args_json que não é JSON continua terminal, sem reenvio, com mensagem útil (não 'não respondeu')", async () => {
    const c = control(); const f = vi.fn(async () => response(JSON.stringify({ type: "tool", name: "gmail_search", args_json: "{from_date:", text: null })));
    const m = createAssistantModel({ apiKey: "local-not-a-key", control: c.control, validateContext: async () => {}, now: NOW, fetch: f });
    const gmailSearch = vi.fn();
    const r = await runAssistantTurn(m, { gmailSearch, ...noRead }, { text: PEDIDO, history: [] }, new AbortController().signal);
    expect(r.status).toBe("error");
    expect(r.text).toMatch(/formato inválido/);
    expect(r.text).toMatch(/Nada foi gravado/);
    expect(f).toHaveBeenCalledTimes(1); expect(gmailSearch).not.toHaveBeenCalled();
    expect(c.outcomes).toEqual(["invalid_response"]);
  });

  it("ferramenta inexistente continua terminal (sem afrouxar)", async () => {
    const c = control(); const f = vi.fn(async () => response(JSON.stringify({ type: "tool", name: "register_payment", args_json: "{}", text: null })));
    const m = createAssistantModel({ apiKey: "local-not-a-key", control: c.control, validateContext: async () => {}, now: NOW, fetch: f });
    const r = await runAssistantTurn(m, { gmailSearch: vi.fn(), ...noRead }, { text: PEDIDO, history: [] }, new AbortController().signal);
    expect(r.status).toBe("error"); expect(r.text).toMatch(/Ferramenta/);
    expect(f).toHaveBeenCalledTimes(1); expect(c.outcomes).toEqual(["invalid_response"]);
  });
});
