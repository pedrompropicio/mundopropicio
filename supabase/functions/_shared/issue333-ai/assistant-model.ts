/** Real server-only Responses adapter. Availability is deliberately unverified until controlled activation. */
import { createOpenAI } from "npm:@ai-sdk/openai@3";
import { streamText, Output, APICallError, NoObjectGeneratedError } from "npm:ai@6";
import { z } from "npm:zod@3";
import { ModelDenied, ModelInvalid, ModelLimit, ASSISTANT_LIMITS, TOOL_SCHEMAS, type AssistantModel, type ModelStep } from "../assistant-orchestrator.ts";
import { createLovableAiGatewayRunIdFetch } from "./run-id.ts";
import type { ProviderControl } from "./control.ts";
const wire = z.object({ type: z.enum(["tool", "clarify", "final"]), name: z.string().nullable(), args_json: z.string().nullable(), text: z.string().nullable() }).strict();
const INVALID_FORMAT = "O assistente devolveu uma resposta em formato inválido. Nada foi gravado.";
/**
 * Validates only the closed envelope. Known-tool arguments are returned as parsed JSON and validated by the
 * orchestrator with the same TOOL_SCHEMAS before any tool runs (invalid args go back to the model, bounded by
 * ASSISTANT_LIMITS). Unknown tools, extra keys and non-JSON arguments stay terminal.
 */
export function parseModelStep(value: unknown): ModelStep {
  const p = wire.safeParse(value);
  if (!p.success) throw new ModelInvalid(INVALID_FORMAT);
  const v = p.data;
  if (v.type !== "tool") {
    if (!v.text?.trim() || v.text.length > 4000 || v.name !== null || v.args_json !== null) throw new ModelInvalid(INVALID_FORMAT);
    return v.type === "final" ? { type: "final", text: v.text } : { type: "clarify", question: v.text };
  }
  if (!v.name || !(v.name in TOOL_SCHEMAS) || !v.args_json || v.args_json.length > 16000 || v.text !== null) throw new ModelInvalid("Ferramenta inválida pedida pelo assistente. Nada foi gravado.");
  let args: unknown;
  try { args = JSON.parse(v.args_json); } catch { throw new ModelInvalid(INVALID_FORMAT); }
  return { type: "tool", name: v.name, args };
}
/** Server civil date for relative periods ("últimos 30 dias"); company calendar is Europe/Lisbon. */
export function lisbonCivilDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function createAssistantModel(config: { apiKey: string; control: ProviderControl; validateContext(): Promise<void>; fetch?: typeof fetch; now?: () => Date }): AssistantModel {
  // Created per incoming request; reused only for the closed orchestrator's follow-up steps.
  const run = createLovableAiGatewayRunIdFetch(undefined, config.fetch ?? fetch);
  let reserved = 0;
  return { async next(input) {
    const transcript = input.messages.map(m => ({ role: "user" as const, content: JSON.stringify({ untrusted_context: m.role, tool: m.tool ?? null, content: m.content }) }));
    const today = lisbonCivilDate((config.now ?? (() => new Date()))());
    const instructions = `${input.contract}\nData de hoje (Europe/Lisbon): ${today}. Datas de ferramentas sempre em AAAA-MM-DD; períodos relativos (ex.: últimos 30 dias) calculam-se a partir desta data.\nDevolve um objeto com type, name, args_json, text, todas as chaves obrigatórias. Para tool: name permitido, args_json com argumentos JSON válidos, text=null. Para clarify/final: name=null,args_json=null,text preenchido.\nFerramentas: gmail_search {from_date,to_date,sender ou subject,page_size<=20}; gmail_read {message_id}; erp_find_events {text}; prepare_ticketline_proposal {message_id,statement:{number,statement_date,document_total_cents,lines:[{line_type:event_right|ticketline_invoice|venue_settlement|advance|carry_over,description,amount_cents,event_hint}]}}. Nunca confirmed_by_user ou evidência bancária.`;
    // UTF-8 bytes conservatively bound input tokens, including JSON and protocol overhead.
    const inputBudget = new TextEncoder().encode(JSON.stringify(transcript) + instructions).length + 2048;
    const outputBudget = Math.min(6000, ASSISTANT_LIMITS.maxTokens - reserved - inputBudget);
    if (outputBudget < 512) throw new ModelLimit("Limite de processamento atingido. Nada foi gravado.");
    reserved += inputBudget + outputBudget;
    if (!config.apiKey || input.signal.aborted) throw new Error("Assistente indisponível ou cancelado.");
    return config.control.run(input.signal, config.validateContext, async transport => {
      let upstream: unknown;
      const provider = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey: config.apiKey,
        headers: { "Lovable-API-Key": config.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        fetch: async (url, init) => {
          await transport.beforePost();
          const requestInit = init as RequestInit | undefined;
          const headers = new Headers(requestInit?.headers);
          const id = run.getRunId(); if (id) headers.set("X-Lovable-AIG-Run-ID", id);
          const response = await run.fetch(url, { ...requestInit, headers, signal: input.signal });
          transport.received(response.status);
          if (!response.body) return response;
          const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = "", terminal = response.status >= 400;
          return new Response(new ReadableStream<Uint8Array>({ async pull(c) {
            const chunk = await reader.read();
            if (chunk.done) { if (terminal) transport.completed(); c.close(); return; }
            pending += decoder.decode(chunk.value, { stream: true });
            const frames = pending.split(/\r?\n\r?\n/); pending = frames.pop() ?? "";
            if (pending.length > 65536) throw new Error("Resposta do serviço demasiado grande.");
            for (const frame of frames) for (const line of frame.split(/\r?\n/)) {
              if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
              const event = JSON.parse(line.slice(6));
              if (event.type === "response.completed") terminal = true;
              if (event.type === "response.refusal.delta" || event.type === "response.refusal.done") upstream = new ModelDenied(403, "O serviço recusou este pedido.");
            }
            c.enqueue(chunk.value);
          }, cancel: reason => reader.cancel(reason) }), { status: response.status, headers: response.headers });
        } });
      const result = streamText({ model: provider.responses("openai/gpt-6-astra"), system: instructions, messages: transcript,
        abortSignal: input.signal, maxRetries: 0, maxOutputTokens: outputBudget, output: Output.object({ schema: wire }),
        onError: ({ error }) => { upstream ??= error; },
        providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } } });
      try {
        const value = await result.output;
        if (upstream) throw upstream;
        const usage = await result.totalUsage;
        if (!Number.isSafeInteger(usage.totalTokens) || Number(usage.totalTokens) < 0 || Number(usage.totalTokens) > inputBudget + outputBudget) throw new ModelInvalid("Utilização reportada pelo serviço inválida. Nada foi gravado.");
        const step = parseModelStep(value);
        // Release unused headroom ONLY after a complete, validated response and usage. Each subsequent
        // input is still charged (including replayed context); errors/uncertainty retain the reservation.
        reserved -= inputBudget + outputBudget - Number(usage.totalTokens);
        return { step, tokens: Number(usage.totalTokens) };
      } catch (error) {
        const e = upstream ?? error;
        if (e instanceof ModelDenied || e instanceof ModelInvalid) throw e;
        if (NoObjectGeneratedError.isInstance(e)) throw new ModelInvalid(INVALID_FORMAT);
        if (APICallError.isInstance(e)) throw new ModelDenied(e.statusCode ?? 503, ({ 402: "Créditos de IA insuficientes. Verifica Planos e créditos.", 403: "Acesso ao serviço bloqueado; o responsável deve rever a configuração.", 404: "Modelo ou serviço indisponível; aguarda revisão da configuração." } as Record<number, string>)[e.statusCode ?? 503] ?? "Serviço de IA indisponível. Nenhum reenvio automático.");
        throw e;
      }
    });
  } };
}