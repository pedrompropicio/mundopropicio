/** Task87: durable authority is PostgreSQL, never a process-local lock or lease. */
import { AnalysisError } from "../data-entry-analysis.ts";

export type ControlRecord = { revision: string; state: "closed" | "ready" | "paused_credit" | "denied_provider" | "unavailable"; enabled: boolean; reviewed: boolean; claim: string | null; stage: "idle" | "claimed" | "post_started" | "uncertain"; reason: string; status: number | null };
export type ControlOperation = "read" | "claim" | "post" | "finish";
export type ControlOutcome = "success" | "request_refused" | "invalid_response" | "before_post_failure" | "cancelled_before_post" | "cancelled_after_post" | "transport_uncertain" | "credit_denied" | "provider_denied" | "provider_unavailable" | "http_failure";
export interface ControlStore { transition(operation: ControlOperation, claim?: string, revision?: string, outcome?: ControlOutcome, status?: number): Promise<ControlRecord>; }
export interface TransportLifecycle { beforePost(): Promise<void>; received(status: number): void; completed(): void; }
export interface ProviderControl { run<T>(signal: AbortSignal, validateContext: () => Promise<void>, execute: (transport: TransportLifecycle) => Promise<T>): Promise<T>; }
const unavailable = () => new AnalysisError("Análise indisponível: controlo do serviço pendente de conferência pelo responsável.", 503);

export function parseControl(value: unknown): ControlRecord {
  if (!value || typeof value !== "object") throw unavailable();
  const v = value as Record<string, unknown>;
  if (typeof v.revision !== "string" || !/^[1-9]\d*$/.test(v.revision) || !["closed", "ready", "paused_credit", "denied_provider", "unavailable"].includes(String(v.state)) || typeof v.enabled !== "boolean" || typeof v.reviewed !== "boolean" || !(v.claim === null || typeof v.claim === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.claim)) || !["idle", "claimed", "post_started", "uncertain"].includes(String(v.stage)) || typeof v.reason !== "string" || !["closed", "none", "success", "request_refused", "invalid_response", "before_post_failure", "cancelled_before_post", "cancelled_after_post", "transport_uncertain", "credit_denied", "provider_denied", "provider_unavailable", "http_failure"].includes(v.reason) || !(v.status === null || Number.isInteger(v.status) && Number(v.status) >= 100 && Number(v.status) <= 599)) throw unavailable();
  if ((v.claim === null) !== (v.stage === "idle")) throw unavailable();
  return v as ControlRecord;
}
export function rpcControlStore(rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>): ControlStore {
  return { async transition(operation, claim, revision, outcome, status) {
    try {
      const r = await rpc("data_entry_analysis_transition_333", { p_operation: operation, p_claim: claim ?? null, p_revision: revision ?? null, p_outcome: outcome ?? null, p_status: status ?? null });
      if (r.error) throw unavailable();
      return parseControl(r.data);
    } catch { throw unavailable(); }
  } };
}
const ready = (r: ControlRecord) => r.state === "ready" && r.enabled && r.reviewed;
export async function assertProviderControlAvailable(store: ControlStore): Promise<void> {
  const current = await store.transition("read");
  if (!ready(current) || current.claim !== null) throw unavailable();
}

export function durableProviderControl(store: ControlStore): ProviderControl {
  return { async run(signal, validateContext, execute) {
    // Read and atomically claim before SDK construction, key lookup, or headers.
    const initial = await store.transition("read");
    if (!ready(initial) || initial.claim !== null) throw unavailable();
    if (signal.aborted) throw new AnalysisError("Análise cancelada.", 499);
    const id = crypto.randomUUID();
    let held = await store.transition("claim", id, initial.revision);
    if (!ready(held) || held.claim !== id || held.stage !== "claimed") throw unavailable();
    let post = false, status: number | undefined, completed = false;
    let finalizing = false;
    const check = async () => {
      const current = await store.transition("read");
      if (!ready(current) || current.claim !== id || current.revision !== held.revision) throw unavailable();
      if (signal.aborted) throw new AnalysisError("Análise cancelada.", 499);
      await validateContext();
    };
    try {
      const result = await execute({
        async beforePost() {
          if (post) throw unavailable(); // one POST, no SDK retry or fallback
          await check();
          held = await store.transition("post", id, held.revision);
          post = true; // conservative: crash here may have reached transport; never lease-release
          if (!ready(held) || held.claim !== id || held.stage !== "post_started") throw unavailable();
          await check();
        },
        received(code) { if (Number.isInteger(code) && code >= 100 && code <= 599) status = code; },
        completed() { completed = true; },
      });
      if (!post || !completed || status === undefined || status < 200 || status > 299) throw unavailable();
      await check();
      finalizing = true;
      const finished = await store.transition("finish", id, held.revision, "success", status);
      if (!ready(finished) || finished.claim !== null) throw unavailable();
      const current = await store.transition("read");
      if (!ready(current) || current.claim !== null || current.revision !== finished.revision || signal.aborted) throw unavailable();
      await validateContext();
      return result;
    } catch (error) {
      // A failed finalization is not retried; its commit may be unknown.
      if (!finalizing) {
        const outcome: ControlOutcome = status === 402 ? "credit_denied" : status === 403 ? "provider_denied" : status === 404 ? "provider_unavailable" : !post ? (signal.aborted ? "cancelled_before_post" : "before_post_failure") : signal.aborted ? "cancelled_after_post" : status !== undefined && status >= 400 ? "http_failure" : !completed ? "transport_uncertain" : "invalid_response";
        try { await store.transition("finish", id, held.revision, outcome, status); }
        catch { throw unavailable(); } // durable failure outranks a false clean cancellation
      }
      throw error;
    }
  } };
}