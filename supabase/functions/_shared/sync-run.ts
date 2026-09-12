// sync-run — registo técnico das execuções de sincronização em public.sync_runs.
//
// Regra dura: o registo NUNCA pode fazer a sincronização falhar. Qualquer erro
// no insert/update é apenas escrito no log e a execução segue em frente.
//
// details NUNCA pode conter tokens, chaves ou credenciais.

// deno-lint-ignore no-explicit-any
type Admin = any;

export type SyncStatus = "running" | "success" | "partial" | "no_data" | "error";
export type TriggerSource = "cron" | "manual" | "api";

/**
 * Deduz a origem: chamada com JWT de service_role (pg_cron / interno, sem
 * utilizador) → 'cron'; qualquer outra sessão autenticada → 'manual'.
 */
export function deduceTriggerSource(req: Request): TriggerSource {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return "manual";
  try {
    const payload = JSON.parse(atob(bearer.split(".")[1] ?? ""));
    if (payload?.role === "service_role" && !payload?.sub) return "cron";
  } catch (_e) {
    // token não-JWT: trata como manual
  }
  return "manual";
}

export interface StartArgs {
  function_name: string;
  trigger_source: TriggerSource;
  dry_run: boolean;
  company_id?: string | null;
  artist_id?: string | null;
}

/** Cria a linha 'running'. Devolve o id ou null se o registo falhar. */
export async function startSyncRun(
  admin: Admin,
  args: StartArgs,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("sync_runs")
      .insert({
        function_name: args.function_name,
        trigger_source: args.trigger_source,
        dry_run: args.dry_run,
        company_id: args.company_id ?? null,
        artist_id: args.artist_id ?? null,
        status: "running",
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data?.id as string) ?? null;
  } catch (e) {
    console.error("[sync_runs] insert falhou:", (e as Error)?.message ?? e);
    return null;
  }
}

/**
 * Estado final segundo as regras acordadas:
 *  success  → gravou >=1 linha e sem erros
 *  partial  → gravou algo mas houve erros
 *  no_data  → sem erro mas nada gravado (não é sucesso)
 *  error    → falhou antes de gravar
 */
export function resolveStatus(rowsWritten: number, errorCount: number): SyncStatus {
  if (rowsWritten > 0) return errorCount > 0 ? "partial" : "success";
  return errorCount > 0 ? "error" : "no_data";
}

export interface FinishArgs {
  status: SyncStatus;
  api_calls?: number;
  rows_written?: number;
  details?: unknown;
  error_text?: string | null;
}

/** Fecha a linha. Nunca lança. */
export async function finishSyncRun(
  admin: Admin,
  runId: string | null,
  startedMs: number,
  args: FinishArgs,
): Promise<void> {
  if (!runId) return;
  try {
    const finished = new Date();
    const { error } = await admin
      .from("sync_runs")
      .update({
        finished_at: finished.toISOString(),
        duration_ms: Math.max(0, Math.round(Date.now() - startedMs)),
        status: args.status,
        api_calls: args.api_calls ?? 0,
        rows_written: args.rows_written ?? 0,
        details: args.details ?? null,
        error_text: args.error_text ?? null,
      })
      .eq("id", runId);
    if (error) throw error;
  } catch (e) {
    console.error("[sync_runs] update falhou:", (e as Error)?.message ?? e);
  }
}
