// Aprovação ATÓMICA (D-ERP173): a edge só autoriza; elevação de verba (D2),
// UPDATE de status e auditoria correm numa só transação na RPC
// public.approve_transactions_atomic (FOR UPDATE SKIP LOCKED). Sem imports para
// poder ser testado em Vitest.

// deno-lint-ignore no-explicit-any
type Client = any;

export type AtomicResult =
  | { kind: "ok"; approved_ids: string[]; skipped_ids: string[]; applied_raises: any[] }
  | { kind: "excess"; budget_excess: any[] }
  | { kind: "error"; message: string };

export async function approveAtomic(
  client: Client,
  ids: string[],
  raises: unknown,
  callerName: string,
): Promise<AtomicResult> {
  if (ids.length === 0) return { kind: "ok", approved_ids: [], skipped_ids: [], applied_raises: [] };
  const { data, error } = await client.rpc("approve_transactions_atomic", {
    p_ids: ids,
    p_raises: Array.isArray(raises) ? raises : [],
    p_caller_name: callerName,
  });
  if (error) {
    if (error.code === "P0409") {
      let excess: any[] = [];
      try { excess = JSON.parse(error.details ?? "[]"); } catch { /* fica vazio */ }
      // company_id é só para a RPC; o frontend não o usa.
      return { kind: "excess", budget_excess: excess.map(({ company_id: _c, ...e }) => e) };
    }
    return { kind: "error", message: error.message ?? String(error) };
  }
  return {
    kind: "ok",
    approved_ids: (data?.approved_ids ?? []) as string[],
    skipped_ids: (data?.skipped_ids ?? []) as string[],
    applied_raises: (data?.applied_raises ?? []) as any[],
  };
}
