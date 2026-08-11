import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Progresso de liquidação por grupo de fatura (`invoice_group_id`).
 *
 * Contexto: uma fatura única gera N transações (uma por rubrica do BP). Parte
 * delas pode já estar paga (noutra lista) enquanto o resto fica pendente — os
 * pickers só mostram pendentes, logo o estado consolidado da fatura tem de vir
 * da BD, não do que está no ecrã.
 *
 * UMA única query agregada com `.in("invoice_group_id", ids)` — nunca query por grupo.
 *
 * Regra de "liquidado" (a mesma do módulo de listas de pagamento):
 * `status = 'paid'` ou `paid_amount >= total c/IVA − 0,05`.
 * (`manually_marked_paid` vive em `payment_list_items`; quando marcado, a transação
 * passa a `paid` — ver memória payment-lists — pelo que a regra acima cobre-o.)
 */
export interface InvoiceGroupProgress {
  total: number;
  paidCount: number;
  openWithIva: number;
}

export function isTxSettledByAmount(tx: { status?: string | null; paid_amount?: number | null; amount?: number | null; iva_rate?: number | null }): boolean {
  const withIva = Number(tx.amount ?? 0) * (1 + Number(tx.iva_rate ?? 23) / 100);
  const paid = Number(tx.paid_amount ?? 0);
  return tx.status === "paid" || paid >= withIva - 0.05;
}

export function useInvoiceGroupProgress(groupIds: string[]) {
  const ids = useMemo(() => [...new Set(groupIds.filter(Boolean))].sort(), [groupIds]);
  return useQuery({
    queryKey: ["invoice-group-progress", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, InvoiceGroupProgress>> => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, invoice_group_id, status, paid_amount, amount, iva_rate")
        .in("invoice_group_id", ids);
      if (error) throw error;
      const out: Record<string, InvoiceGroupProgress> = {};
      for (const row of (data ?? []) as any[]) {
        const gid = row.invoice_group_id as string;
        if (!gid) continue;
        const entry = (out[gid] ??= { total: 0, paidCount: 0, openWithIva: 0 });
        entry.total += 1;
        const withIva = Number(row.amount ?? 0) * (1 + Number(row.iva_rate ?? 23) / 100);
        if (isTxSettledByAmount(row)) entry.paidCount += 1;
        else entry.openWithIva += withIva;
      }
      return out;
    },
  });
}
