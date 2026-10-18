import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "npm:ai@6";
import { AnalysisError, type AnalysisReport } from "../_shared/data-entry-analysis.ts";
/** Emit only validated final data; SDK SSE keepalives protect the long browser request. */
export function analysisStream(request: Request, cors: Record<string, string>, execute: () => Promise<AnalysisReport>): Response {
  const stream = createUIMessageStream<UIMessage>({
    originalMessages: [],
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      try {
        const report = await execute();
        if (request.signal.aborted) throw new AnalysisError("Análise cancelada.", 499);
        writer.write({ type: "data-analysis", data: report });
        writer.write({ type: "text-start", id: "analysis-answer" });
        writer.write({ type: "text-delta", id: "analysis-answer", delta: report.answer });
        writer.write({ type: "text-end", id: "analysis-answer" });
        writer.write({ type: "finish" });
      } catch (error) {
        const safe = error instanceof AnalysisError ? error : new AnalysisError("Análise interrompida. Nenhum dado foi confirmado.", 503);
        writer.write({ type: "data-analysis-error", data: { status: safe.status, message: safe.message } });
        writer.write({ type: "error", errorText: safe.message });
      }
    },
    onFinish: () => { /* Session-only conversation: no DB writes by analysis. */ },
    onError: () => "Análise interrompida. Nenhum dado foi confirmado.",
  });
  return createUIMessageStreamResponse({ stream, headers: { ...cors, "Cache-Control": "no-store" } });
}