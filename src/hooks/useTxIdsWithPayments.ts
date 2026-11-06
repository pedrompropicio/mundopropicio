import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabase-paging";

/** Qualquer linha conta, independentemente do estado do pagamento. */
export function useTxIdsWithPayments() {
  return useQuery({
    queryKey: ["transactions-with-payments"],
    queryFn: async (): Promise<Set<string>> => {
      const rows = await fetchAllPaged<{ id: string; transaction_id: string }>((from, to) =>
        supabase.from("transaction_payments")
          .select("id, transaction_id")
          .order("id", { ascending: true })
          .range(from, to),
        { maxRows: Infinity },
      );
      return new Set(rows.map((p) => p.transaction_id));
    },
    staleTime: 60_000,
  });
}
