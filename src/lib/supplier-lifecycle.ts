/**
 * Ciclo de vida de fornecedores — desativar / reativar / eliminar em segurança.
 *
 * Regra: DESATIVAR é a ação normal (mantém o histórico e retira o fornecedor
 * dos seletores). ELIMINAR só é possível quando o fornecedor não tem movimento
 * e passa sempre pelo Lixo (moveToTrash), nunca por um delete cru.
 */
import { supabase } from "@/integrations/supabase/client";

/** Tabelas que impedem a eliminação (movimento real do fornecedor). */
const BLOCKING = [
  { table: "transactions", column: "supplier_id", label: "transações" },
  { table: "quotations", column: "supplier_id", label: "cotações" },
  { table: "recurring_transactions", column: "supplier_id", label: "transações recorrentes" },
  { table: "operacao_etapa_suppliers", column: "supplier_id", label: "etapas de operação" },
  { table: "event_settlement_participants", column: "supplier_id", label: "participantes de acerto" },
  { table: "event_third_party_operations", column: "held_by_supplier_id", label: "operações de terceiros" },
] as const;

/** Tabelas que são apagadas em cascata quando o fornecedor é eliminado. */
const CASCADE = [
  { table: "supplier_documents", column: "supplier_id", label: "documentos do fornecedor" },
  { table: "event_partners", column: "supplier_id", label: "linhas de sócio de evento" },
  { table: "supplier_credits", column: "supplier_id", label: "créditos de fornecedor" },
  { table: "coala_supplier_category_map", column: "supplier_id", label: "mapeamentos Coala" },
] as const;

export type UsageEntry = { label: string; count: number };

export type SupplierUsage = {
  /** Impedem a eliminação. */
  blocking: UsageEntry[];
  /** Serão apagados em cascata. */
  cascade: UsageEntry[];
  transactionCount: number;
  blockingTotal: number;
  otherBlockingTotal: number;
  canDelete: boolean;
};

async function countRows(table: string, column: string, supplierId: string): Promise<number> {
  const { count, error } = await (supabase as any)
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, supplierId);
  if (error) throw error;
  return count ?? 0;
}

/** Lê na hora as contagens reais de utilização de um fornecedor. */
export async function fetchSupplierUsage(supplierId: string): Promise<SupplierUsage> {
  const [blockingCounts, cascadeCounts] = await Promise.all([
    Promise.all(BLOCKING.map((b) => countRows(b.table, b.column, supplierId))),
    Promise.all(CASCADE.map((c) => countRows(c.table, c.column, supplierId))),
  ]);

  const blocking = BLOCKING.map((b, i) => ({ label: b.label, count: blockingCounts[i] })).filter((e) => e.count > 0);
  const cascade = CASCADE.map((c, i) => ({ label: c.label, count: cascadeCounts[i] })).filter((e) => e.count > 0);
  const transactionCount = blockingCounts[0];
  const blockingTotal = blockingCounts.reduce((a, b) => a + b, 0);

  return {
    blocking,
    cascade,
    transactionCount,
    blockingTotal,
    otherBlockingTotal: blockingTotal - transactionCount,
    canDelete: blockingTotal === 0,
  };
}

/** Ex.: "3 documentos do fornecedor, 1 crédito de fornecedor" */
export function describeUsage(entries: UsageEntry[]): string {
  return entries.map((e) => `${e.count} ${e.label}`).join(", ");
}

/** Linha datada acrescentada às notas, para deixar rasto de quem desativou. */
export function buildDeactivationNote(existing: string | null | undefined, who: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const line = `[${stamp}] Desativado por ${who}.`;
  const base = (existing ?? "").trim();
  return base ? `${base}\n${line}` : line;
}

export async function deactivateSupplier(args: {
  id: string;
  notes: string | null | undefined;
  who: string;
}): Promise<void> {
  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: false, notes: buildDeactivationNote(args.notes, args.who) } as any)
    .eq("id", args.id);
  if (error) throw error;
}

export async function reactivateSupplier(id: string): Promise<void> {
  const { error } = await supabase.from("suppliers").update({ is_active: true } as any).eq("id", id);
  if (error) throw error;
}

/**
 * Linhas que serão apagadas em cascata, para guardar no Lixo (related_data) e
 * permitir o restauro completo.
 */
export async function fetchSupplierCascadeRows(supplierId: string): Promise<Record<string, any[]>> {
  const out: Record<string, any[]> = {};
  for (const c of CASCADE) {
    const { data, error } = await (supabase as any).from(c.table).select("*").eq(c.column, supplierId);
    if (error) throw error;
    if ((data ?? []).length > 0) out[c.table] = data as any[];
  }
  return out;
}
