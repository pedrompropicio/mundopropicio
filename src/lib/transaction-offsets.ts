/**
 * Compensação ligada (28/09/2026) — ver .lovable/memory/features/compensacao-ligada.md.
 * A ligação vive em `transaction_offsets`; o efeito (pagamento `compensation` sem conta
 * na outra transação) vive no trigger `trg_apply_transaction_offsets` da base.
 * O cliente só lê, cria (RPC `transaction_offset_create`) e remove
 * (RPC `transaction_offset_remove`). Nunca escreve pagamentos de compensação.
 */
import { onlySettlingPayments } from "@/lib/payment-settlement";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";

export interface TransactionOffsetView {
  id: string;
  amount: number;
  note: string | null;
  receivable_transaction_id: string;
  payable_transaction_id: string;
  /** A outra transação da ligação, do ponto de vista pedido. */
  other: { id: string; description: string | null; invoice_ref: string | null; status: string | null; type: string };
  /** Há pagamento `compensation` ativo gerado por esta ligação (só por offset_id; inalterado). */
  applied: boolean;
  /** #335: encontro que adoptou o par (transaction_offsets.offset_group_id) e o seu estado. */
  offset_group_id: string | null;
  group_status: string | null;
}

/**
 * Etiqueta da ficha. Par adoptado por um encontro aplicado → "Aplicada no encontro"
 * (os pagamentos ficam com offset_group_id e offset_id NULL, por isso `applied` é falso).
 * Encontro estornado ou sem encontro → regra antiga.
 */
export function offsetBadgeLabel(o: Pick<TransactionOffsetView, "applied" | "offset_group_id" | "group_status">): string {
  if (o.applied) return "Aplicada";
  if (o.offset_group_id && o.group_status === "applied") return "Aplicada no encontro";
  return "Por aplicar";
}

const db = supabase as any;

export const OFFSETS_KEY = ["transaction-offsets"] as const;

/** Todas as ligações da empresa (tabela pequena), com as duas transações e o estado. */
export function useAllTransactionOffsets() {
  return useQuery({
    queryKey: OFFSETS_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("transaction_offsets")
        .select(
          "id, amount, note, receivable_transaction_id, payable_transaction_id, offset_group_id," +
            " rec:transactions!transaction_offsets_receivable_transaction_id_fkey(id, description, invoice_ref, status, type)," +
            " pay:transactions!transaction_offsets_payable_transaction_id_fkey(id, description, invoice_ref, status, type)",
        );
      if (error) throw error;
      const ids = (data ?? []).map((o: any) => o.id);
      let appliedIds = new Set<string>();
      if (ids.length) {
        const { data: pays, error: e2 } = await fetchAllPagedQuery(onlySettlingPayments(db
          .from("transaction_payments")
          .select("offset_id"))
          .in("offset_id", ids));
        if (e2) throw e2;
        appliedIds = new Set((pays ?? []).map((p: any) => p.offset_id));
      }
      const groupIds = [...new Set((data ?? []).map((o: any) => o.offset_group_id).filter(Boolean))] as string[];
      const groupStatus = new Map<string, string>();
      if (groupIds.length) {
        const { data: gs, error: e3 } = await db.from("transaction_offset_groups").select("id, status").in("id", groupIds);
        if (e3) throw e3;
        (gs ?? []).forEach((g: any) => groupStatus.set(g.id, g.status));
      }
      return (data ?? []).map((o: any) => ({
        ...o,
        applied: appliedIds.has(o.id),
        group_status: o.offset_group_id ? groupStatus.get(o.offset_group_id) ?? null : null,
      }));
    },
  });
}

/** Ligações de uma transação, com a "outra" já resolvida. */
export function offsetsFor(all: any[] | undefined, txId: string): TransactionOffsetView[] {
  return (all ?? [])
    .filter((o) => o.receivable_transaction_id === txId || o.payable_transaction_id === txId)
    .map((o) => ({
      id: o.id,
      amount: Number(o.amount),
      note: o.note,
      receivable_transaction_id: o.receivable_transaction_id,
      payable_transaction_id: o.payable_transaction_id,
      other: o.receivable_transaction_id === txId ? o.pay : o.rec,
      applied: o.applied,
      offset_group_id: o.offset_group_id ?? null,
      group_status: o.group_status ?? null,
    }));
}

export function useOffsetsInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: OFFSETS_KEY });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };
}

export async function createOffset(receivable: string, payable: string, amount: number, note?: string) {
  const { data, error } = await db.rpc("transaction_offset_create", {
    p_receivable: receivable,
    p_payable: payable,
    p_amount: amount,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function removeOffset(offsetId: string) {
  const { error } = await db.rpc("transaction_offset_remove", { p_offset_id: offsetId });
  if (error) throw error;
}

export function offsetOtherLabel(o: TransactionOffsetView) {
  return o.other?.invoice_ref || o.other?.description || "transação";
}
