import { useQuery } from "@tanstack/react-query";
import { fetchMasterRevenueSplit, fetchMasterRevenueSlicesFor, emptyMasterRevenueSplit, type MasterRevenueSplit } from "@/lib/master-revenue-split-context";

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

/**
 * #339 B2b — fatias que um perímetro SEM o seu Master recebe (cidade vista
 * sozinha). Perímetro com o Master → vazio. Mesmo leitor da edge partner-statement.
 */
export function useMasterRevenueSlicesFor(perimeter: Array<{ id: string; parent_event_id?: string | null }>) {
  const key = perimeter.map((e) => `${e.id}:${e.parent_event_id ?? ""}`).sort().join(",");
  const { data, isPending } = useQuery({
    queryKey: ["master-revenue-slices", key],
    queryFn: () => fetchMasterRevenueSlicesFor(perimeter),
    enabled: perimeter.length > 0,
  });
  return { slices: data ?? { forecastSlices: [], transactionSlices: [], warnings: [] }, isPending: perimeter.length > 0 && isPending };
}
