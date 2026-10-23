import { useQuery } from "@tanstack/react-query";
import { fetchMasterRevenueSplit, emptyMasterRevenueSplit, type MasterRevenueSplit } from "@/lib/master-revenue-split-context";

/** #339 B — receita repartida dos Masters pedidos (fatias virtuais por cidade). */
export function useMasterRevenueSplit(masterIds: string[]): MasterRevenueSplit {
  const ids = Array.from(new Set(masterIds.filter(Boolean))).sort();
  const { data } = useQuery({
    queryKey: ["master-revenue-split", ids],
    queryFn: () => fetchMasterRevenueSplit(ids),
    enabled: ids.length > 0,
  });
  return data ?? emptyMasterRevenueSplit();
}

/**
 * Valor que a cidade vê de uma transação do Master: a fatia da regra quando a
 * transação está repartida; senão `fallback` (comportamento anterior).
 */
export function masterTxAmountForCity(
  split: MasterRevenueSplit,
  tx: { id: string },
  cityId: string,
  fallback: number,
): number {
  if (!split.sourceTransactionIds.has(tx.id)) return fallback;
  const s = split.transactionSlices.find((x: any) => x.id === `${tx.id}::rev::${cityId}`);
  return s ? Number(s.amount) : 0;
}
