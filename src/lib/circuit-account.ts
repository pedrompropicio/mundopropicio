/**
 * Custo partilhado com terceiros (D-ERP69) — apoio de UI.
 *
 * A base de dados já faz o trabalho: `transactions.shared_cost_account_id`
 * marca a linha como adiantamento por conta de terceiros, o trigger
 * `force_exclude_from_result_for_shared_cost()` força `exclude_from_result` e o
 * `sync_shared_cost_mirror()` cria a contrapartida na conta de circuito.
 * Aqui só se lê — nunca se replica a regra em JavaScript.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CircuitAccount {
  id: string;
  name: string;
  skip_balance_check: boolean | null;
}

/**
 * Contas de circuito elegíveis para marcar uma linha: activas, não ocultas de
 * seletores (mesma regra de `is_hidden` dos restantes seletores de criação).
 */
export function useCircuitAccounts(enabled = true) {
  return useQuery({
    queryKey: ["circuit-accounts"],
    enabled,
    queryFn: async (): Promise<CircuitAccount[]> => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name, skip_balance_check")
        .eq("is_circuit_account", true)
        .eq("is_active", true)
        .eq("is_hidden", false)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as CircuitAccount[];
    },
  });
}

/** Ponte `shared_cost_mirror`: quais das transações dadas já geraram espelho. */
export function useSharedCostMirrored(transactionIds: string[]) {
  const ids = [...transactionIds].sort();
  return useQuery({
    queryKey: ["shared-cost-mirrored", ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("shared_cost_mirror" as any)
        .select("source_transaction_id")
        .in("source_transaction_id", ids);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.source_transaction_id));
    },
  });
}

export interface CounterpartyPosition {
  key: string;
  name: string;
  /** Entradas pagas na conta — o que foi adiantado por conta do terceiro. */
  advanced: number;
  /** Saídas pagas da conta — o que o terceiro já devolveu (ou já se aplicou). */
  returned: number;
  /** advanced − returned. */
  position: number;
  transactions: any[];
}

/**
 * Decomposição da posição por contraparte a partir das linhas do extrato.
 * Não filtra por rubrica de propósito (decisão de 16/09/2026): o painel é uma
 * decomposição do saldo, não um filtro — uma devolução lançada noutra rubrica
 * não pode desaparecer daqui.
 */
export function buildCounterpartyPositions(lines: any[]): CounterpartyPosition[] {
  const map = new Map<string, CounterpartyPosition>();
  for (const line of lines) {
    const key = line.supplier_id ?? "__none__";
    const name =
      line.supplier_id
        ? line.suppliers?.name ?? "Fornecedor sem nome"
        : "Sem contraparte atribuída";
    let entry = map.get(key);
    if (!entry) {
      entry = { key, name, advanced: 0, returned: 0, position: 0, transactions: [] };
      map.set(key, entry);
    }
    const signed = Number(line.signedAmount ?? 0);
    if (signed >= 0) entry.advanced += signed;
    else entry.returned += Math.abs(signed);
    entry.position += signed;
    entry.transactions.push(line);
  }
  const rows = [...map.values()];
  rows.sort((a, b) => {
    if (a.key === "__none__") return 1;
    if (b.key === "__none__") return -1;
    return Math.abs(b.position) - Math.abs(a.position);
  });
  return rows;
}
