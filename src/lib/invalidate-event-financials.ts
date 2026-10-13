import type { QueryClient } from "@tanstack/react-query";
import { invalidateTransactionQueries } from "@/lib/invalidate-transactions";

/**
 * Regra central (D-ERP266): cartões e totais calculados do evento.
 * Prefixo do 1.º elemento da queryKey. Invalida-se por prefixo para cobrir o
 * evento, o Master e os subeventos sem depender da forma exata de cada chave.
 * Ficam DE FORA, de propósito, chaves cujo refetch volta a gravar
 * (bp-formula-sync, cache-sync-*): incluí-las criaria ciclo gravar→Realtime→refetch→gravar.
 */
export const EVENT_FINANCIAL_KEY_PREFIXES = [
  "efc-",
  "event-revenue-basis",
  "event-cost-basis",
  "event-root-settlements",
  "event_cache_",
  "real-",
  "ab_realized_from_tx",
  "event_transactions",
  "event-transactions",
  "event_ticket_revenue",
  "event_ticket_qty",
  "event_master_sibling_count",
  "event_forecasts",
  "event_detail",
  "cache-advances-paid",
  "scenario-forecasts",
] as const;

const EXCLUDED_PREFIXES = ["bp-formula-sync", "cache-sync-"];

export function isEventFinancialKey(queryKey: readonly unknown[]): boolean {
  const head = queryKey?.[0];
  if (typeof head !== "string") return false;
  if (EXCLUDED_PREFIXES.some((p) => head.startsWith(p))) return false;
  return EVENT_FINANCIAL_KEY_PREFIXES.some((p) => head.startsWith(p));
}

/** Invalida tudo o que alimenta os números do evento (+ transações/BP via helper existente). */
export function invalidateEventFinancials(qc: QueryClient, _eventIds?: (string | null | undefined)[]) {
  invalidateTransactionQueries(qc);
  qc.invalidateQueries({ predicate: (q) => isEventFinancialKey(q.queryKey) });
}

/** Versão com debounce partilhado (~1 s): várias gravações seguidas → um só refetch. */
const timers = new WeakMap<QueryClient, ReturnType<typeof setTimeout>>();
export function scheduleEventFinancialsInvalidation(qc: QueryClient, delayMs = 1000) {
  const prev = timers.get(qc);
  if (prev) clearTimeout(prev);
  timers.set(qc, setTimeout(() => { timers.delete(qc); invalidateEventFinancials(qc); }, delayMs));
}
