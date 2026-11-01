import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Devolve um Set com os transaction_id que têm 2+ linhas em
 * `transaction_payments` (pagamento dividido em várias liquidações).
 *
 * Uma simples liquidação (1 pagamento) NÃO conta — era isso que gerava o falso
 * positivo do badge "Parcelada" em cargas de cartão.
 *
 * O parcelamento por grupo de transações (`installment_group_id`) não passa
 * por aqui: lê-se em `useInstallmentGroup`.
 */
export function useInstallmentTxIds() {
  return useQuery({
    queryKey: ["transactions-with-installments"],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase as any)
        .from("transaction_payments")
        .select("transaction_id")
        .limit(50000);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const counts = new Map<string, number>();
      for (const p of rows) {
        counts.set(p.transaction_id, (counts.get(p.transaction_id) ?? 0) + 1);
      }
      const result = new Set<string>();
      for (const [id, n] of counts) if (n >= 2) result.add(id);
      return result;
    },
    staleTime: 60_000,
  });
}
