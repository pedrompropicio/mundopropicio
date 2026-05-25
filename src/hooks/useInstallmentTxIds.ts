import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Devolve um Set com os transaction_id que têm pelo menos um registo em
 * `transaction_payments` (parcelas planeadas ou pagas). Usado para decidir
 * se a retenção IRS declarada se aplica (só aplica em transações sem parcelas).
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
      return new Set<string>((data ?? []).map((p: any) => p.transaction_id));
    },
    staleTime: 60_000,
  });
}
