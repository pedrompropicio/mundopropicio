import { supabase } from "@/integrations/supabase/client";
import { getAuditUser } from "@/lib/audit";

interface DeleteCascadeParams {
  transactionId: string;
  user: any;
  /** Motivo registado na auditoria (ex.: "Eliminada via BP") */
  auditReason?: string;
  /** true (default): elimina também as irmãs do mesmo invoice_group_id. */
  cascadeInvoiceGroup?: boolean;
  /** Em ciclos: a transação pode já ter saído com uma irmã do mesmo grupo de fatura. */
  ignoreMissing?: boolean;
}

export interface DeleteCascadeResult {
  root_ids: string[];
  child_ids: string[];
  counts: Record<string, number>;
}

/**
 * Fonte única da eliminação de transações (#295, D-ERP219).
 * Tudo corre numa só transação na RPC `delete_transaction_cascade`
 * (lixo, desvincular BP/cachês/fecho/reembolsos, apagar dependentes, auditoria,
 * filhas e raízes). Autorização igual à RLS de DELETE: admin ou manager.
 * Se algo falhar, nada fica apagado — o erro sobe para quem chama.
 */
export async function deleteTransactionCascade({
  transactionId,
  user,
  auditReason,
  cascadeInvoiceGroup = true,
  ignoreMissing = false,
}: DeleteCascadeParams): Promise<DeleteCascadeResult | null> {
  const { data, error } = await (supabase as any).rpc("delete_transaction_cascade", {
    p_transaction_id: transactionId,
    p_reason: auditReason ?? null,
    p_cascade_invoice_group: cascadeInvoiceGroup,
    p_caller_name: getAuditUser(user),
  });
  if (error && ignoreMissing && error.code === "P0002") return null;
  if (error) throw new Error(`Eliminar transação: ${error.message}`);
  return data as DeleteCascadeResult;
}
