import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Devolve um Set com os transaction_id que têm um CRONOGRAMA de parcelas real
 * (Modelo B): pelo menos uma linha em `transaction_payments` com
 * `scheduled_date` preenchida ou `status` em ('planned','cancelled'), OU 2+
 * linhas de pagamento para a mesma transação.
 *
 * Uma simples liquidação (1 pagamento `paid` sem `scheduled_date`) NÃO conta —
 * era isso que gerava o falso positivo do badge "Parcelada" em cargas de cartão.
 */
export function useInstallmentTxIds() {
  return useQuery({
    queryKey: ["transactions-with-installments"],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase as any)
        .from("transaction_payments")
        .select("transaction_id, scheduled_date, status")
        .limit(50000);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const counts = new Map<string, number>();
      const scheduled = new Set<string>();
      for (const p of rows) {
        counts.set(p.transaction_id, (counts.get(p.transaction_id) ?? 0) + 1);
        if (p.scheduled_date || p.status === "planned" || p.status === "cancelled") {
          scheduled.add(p.transaction_id);
        }
      }
      const result = new Set<string>(scheduled);
      for (const [id, n] of counts) if (n >= 2) result.add(id);
      return result;
    },
    staleTime: 60_000,
  });
}
