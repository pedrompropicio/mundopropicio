import { createOpenAI } from "npm:@ai-sdk/openai@3";
import { streamText, Output, type ModelMessage } from "npm:ai@6";
import { analysisWireSchema, ANALYSIS_LIMITS } from "../data-entry-analysis.ts";
import type { TransportLifecycle } from "./control.ts";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
} from "./run-id.ts";

export function createResponsesCall(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string },
  messages: ModelMessage[],
  instructions?: string,
  transport?: TransportLifecycle,
) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: `${config.baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`,
    apiKey: config.apiKey,
    headers: { "Lovable-API-Key": config.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      // Await durable fencing before any external POST. No retry/fallback path.
      if (transport) await transport.beforePost();
      const response = await runIdFetch.fetch(input, init);
      transport?.received(response.status);
      if (!transport) return response;
      if (!response.body) { transport.completed(); return response; }
      // HTTP200 headers are not evidence that a streaming provider request completed.
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const chunk = await reader.read();
            if (chunk.done) { transport.completed(); controller.close(); }
            else controller.enqueue(chunk.value);
          } catch (error) { controller.error(error); }
        },
        cancel: (reason) => reader.cancel(reason),
      });
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    },
  });
  const reasoning = config.model !== "openai/chat-latest";
  let upstreamError: unknown;
  const result = streamText({
    model: provider.responses(config.model),
    // AI SDK 6 lacks `instructions`: rename this key to `system` there.
    ...(instructions ? { system: instructions } : {}),
    messages,
    abortSignal: request.signal,
    maxRetries: 0,
    // SDK defaults to console.error(raw error) and output may reject with NoOutputGeneratedError.
    // Retain original status privately; never log request bodies or provider errors.
    onError: ({ error }) => { upstreamError = error; },
    maxOutputTokens: ANALYSIS_LIMITS.outputTokens,
    output: Output.object({ schema: analysisWireSchema }),
    providerOptions: {
      openai: {
        store: false,
        ...(reasoning
          ? {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            }
          : {}),
      },
    },
  });
  // Server-only result. No UI response factory: reasoning/metadata cannot be forwarded accidentally.
  return { result, getUpstreamError: () => upstreamError };
}
