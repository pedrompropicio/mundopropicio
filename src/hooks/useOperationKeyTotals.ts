import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabase-paging";

export interface OperationKeyTotals {
  count: number;
  income: number;
  expense: number;
  balance: number;
}

/**
 * Total do GRUPO COMPLETO de uma (ou mais) chave(s) de operação (D-ERP45).
 *
 * Regra: este número valida o fecho de uma operação, por isso é SEMPRE o grupo
 * inteiro — nunca o subconjunto filtrado no ecrã (estado, tipo, evento, datas,
 * fornecedor, pesquisa livre). Um número de verificação que muda com os filtros
 * não verifica nada.
 *
 * A empresa é garantida pela RLS (policy RESTRICTIVE company_isolation).
 * Paginação obrigatória via fetchAllPaged com desempate por `id`.
 */
export function useOperationKeyTotals(keys: string[]) {
  const sorted = [...keys].sort();
  return useQuery({
    queryKey: ["operation-key-totals", sorted],
    enabled: sorted.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<OperationKeyTotals> => {
      const rows = await fetchAllPaged<{ id: string; type: string; amount: number | null }>(
        (from, to) =>
          supabase
            .from("transactions")
            .select("id, type, amount")
            .in("operation_key", sorted)
            .order("id", { ascending: true })
            .range(from, to),
      );
      let income = 0;
      let expense = 0;
      for (const r of rows) {
        const v = Number(r.amount ?? 0);
        if (r.type === "income") income += v;
        else if (r.type === "expense") expense += v;
      }
      return { count: rows.length, income, expense, balance: income - expense };
    },
  });
}
