import { createOpenAI } from "npm:@ai-sdk/openai@3";
import { streamText, Output, type ModelMessage } from "npm:ai@6";
import { analysisWireSchema, ANALYSIS_LIMITS } from "../data-entry-analysis.ts";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
} from "./run-id.ts";

export function createResponsesCall(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string },
  messages: ModelMessage[],
  instructions?: string,
) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: `${config.baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`,
    apiKey: config.apiKey,
    headers: { "Lovable-API-Key": config.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
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
