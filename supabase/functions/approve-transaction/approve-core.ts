// Núcleo da aprovação (incidente 05/10/2026): UPDATE condicional PRIMEIRO,
// auditoria DEPOIS e só para as linhas que mudaram mesmo. Pedidos concorrentes
// para a mesma transação nunca criam auditoria falsa — os que perdem a corrida
// passam a "ignorados". Sem imports para poder ser testado em Vitest.

// deno-lint-ignore no-explicit-any
type Client = any;

export interface ApproveRow { id: string; status?: string | null; company_id?: string | null }

export interface ApproveResult {
  changedIds: string[];
  raceSkippedIds: string[];
  error: string | null;
}

export async function approveAndAudit(
  client: Client,
  rows: ApproveRow[],
  callerName: string,
): Promise<ApproveResult> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { changedIds: [], raceSkippedIds: [], error: null };

  const { data, error } = await client
    .from("transactions")
    .update({ status: "approved" })
    .in("id", ids)
    .in("status", ["pending", "overdue"])
    .select("id");
  if (error) return { changedIds: [], raceSkippedIds: [], error: error.message ?? String(error) };

  const changed = new Set<string>(((data ?? []) as any[]).map((r) => r.id));
  const changedIds = ids.filter((id) => changed.has(id));
  const raceSkippedIds = ids.filter((id) => !changed.has(id));

  if (changedIds.length > 0) {
    const entries = changedIds.map((id) => {
      const r = rows.find((x) => x.id === id);
      return {
        transaction_id: id,
        company_id: r?.company_id,
        changed_by: callerName,
        field_name: "status",
        old_value: r?.status ?? "pending",
        new_value: "approved",
      };
    });
    const { error: auditError } = await client.from("transaction_audit_log").insert(entries);
    if (auditError) console.error("[approve-transaction] audit error:", auditError);
  }

  return { changedIds, raceSkippedIds, error: null };
}
