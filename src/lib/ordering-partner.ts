/**
 * Ordenador de despesas por sócio.
 *
 * Regras de negócio (decisões fechadas):
 * 1. O ordenador é escolhido ENTRE OS SÓCIOS DO EVENTO (`event_partners.id`).
 * 2. É OPCIONAL. Sem ordenador = "MP / comum" (a maioria dos eventos).
 * 3. Aplica-se SÓ A DESPESAS (linhas BP `type='expense'` e transações de despesa).
 *
 * Herança: uma transação de despesa sem ordenador próprio herda o ordenador da
 * linha BP a que está vinculada (vínculo directo `event_forecasts.transaction_id`
 * ou o match já existente em `bp-tx-matching`). A edição manual na transação
 * prevalece sempre sobre o valor herdado.
 */

import { findMatchingTransactionsForForecast } from "./bp-tx-matching";

/** Valor do filtro: "all" = todos, "house" = sem ordenador (MP/comum), ou o event_partners.id. */
export type OrderingPartnerFilter = string;

export const ORDERING_FILTER_ALL = "all";
export const ORDERING_FILTER_HOUSE = "house";
export const ORDERING_HOUSE_LABEL = "MP / comum";

export interface OrderingPartnerOption {
  id: string;
  name: string;
  percentage?: number | string | null;
}

/** Iniciais compactas para o badge da linha (ex.: "Anitta Prod." -> "AP"). */
export function orderingPartnerInitials(name: string | null | undefined): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "—";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Aplica o filtro a um valor de ordenador (null = MP/comum). */
export function matchesOrderingPartnerFilter(
  ordererId: string | null | undefined,
  filter: OrderingPartnerFilter,
): boolean {
  if (!filter || filter === ORDERING_FILTER_ALL) return true;
  if (filter === ORDERING_FILTER_HOUSE) return !ordererId;
  return ordererId === filter;
}

/**
 * Mapa transactionId → ordenador herdado da linha BP que a reclama.
 * Não inclui o ordenador próprio da transação (ver `effectiveTransactionOrderer`).
 */
export function buildInheritedOrdererMap(
  forecasts: any[],
  transactions: any[],
): Map<string, string> {
  const map = new Map<string, string>();
  const withOrderer = (forecasts ?? []).filter(
    (f: any) => f?.type === "expense" && f?.ordering_partner_id,
  );
  if (withOrderer.length === 0) return map;
  for (const f of withOrderer) {
    for (const t of findMatchingTransactionsForForecast(f, transactions ?? [], forecasts ?? [])) {
      if (!map.has(t.id)) map.set(t.id, f.ordering_partner_id);
    }
  }
  return map;
}

/** Ordenador efectivo de uma transação: próprio > herdado da linha BP > null (MP/comum). */
export function effectiveTransactionOrderer(
  tx: any,
  inheritedMap?: Map<string, string>,
): string | null {
  if (tx?.ordering_partner_id) return tx.ordering_partner_id;
  return inheritedMap?.get(tx?.id) ?? null;
}
