/**
 * Pagador da despesa (quem desembolsa).
 *
 * Irmão de `src/lib/ordering-partner.ts` (ordenador = quem especifica/define a
 * despesa). Os dois conceitos coexistem e são independentes:
 *
 *  • `paying_partner_id` — quem PAGA;
 *  • `ordering_partner_id` — quem ORDENA (gera a especificação do custo).
 *
 * Regras fechadas:
 * 1. Escolhe-se entre os sócios do evento (`event_partners.id`).
 * 2. `NULL` = a empresa configurada no evento (`events.company_id` →
 *    `companies.display_name`). A empresa NUNCA existe em `event_partners`.
 * 3. Regra de omissão: um preenchido e o outro vazio ⇒ são o mesmo.
 *    Ambos vazios ⇒ empresa configurada.
 * 4. Só se aplica a despesas (`type='expense'`).
 *
 * Snapshots congelados (`bp_versions.snapshot_payload`) guardam a chave antiga
 * `ordering_partner_id`, que NESSES snapshots significa pagador — usar sempre
 * `payerIdFromRow()` para ler o pagador de uma linha.
 */

import { findMatchingTransactionsForForecast } from "./bp-tx-matching";

/** "all" = todos, "house" = sem pagador (empresa configurada), ou event_partners.id. */
export type PayingPartnerFilter = string;

export const PAYING_FILTER_ALL = "all";
export const PAYING_FILTER_HOUSE = "house";
/** Fallback quando o nome da empresa do evento não está disponível. */
export const PAYING_HOUSE_LABEL_FALLBACK = "Empresa";

export interface PayingPartnerOption {
  id: string;
  name: string;
  percentage?: number | string | null;
}

/** Iniciais compactas para o badge da linha. */
export function payingPartnerInitials(name: string | null | undefined): string {
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

/** Aplica o filtro a um valor de pagador (null = empresa configurada). */
export function matchesPayingPartnerFilter(
  payerId: string | null | undefined,
  filter: PayingPartnerFilter,
): boolean {
  if (!filter || filter === PAYING_FILTER_ALL) return true;
  if (filter === PAYING_FILTER_HOUSE) return !payerId;
  return payerId === filter;
}

/**
 * Pagador de uma linha (BP ou snapshot). Snapshots antigos só têm
 * `ordering_partner_id` — nesses, essa chave significa pagador.
 */
export function payerIdFromRow(row: any): string | null {
  return row?.paying_partner_id ?? row?.ordering_partner_id ?? null;
}

/**
 * Mapa transactionId → pagador herdado da linha BP que a reclama.
 * Não inclui o pagador próprio da transação (ver `effectiveTransactionPayer`).
 */
export function buildInheritedPayerMap(
  forecasts: any[],
  transactions: any[],
): Map<string, string> {
  const map = new Map<string, string>();
  const withPayer = (forecasts ?? []).filter(
    (f: any) => f?.type === "expense" && f?.paying_partner_id,
  );
  if (withPayer.length === 0) return map;
  for (const f of withPayer) {
    for (const t of findMatchingTransactionsForForecast(f, transactions ?? [], forecasts ?? [])) {
      if (!map.has(t.id)) map.set(t.id, f.paying_partner_id);
    }
  }
  return map;
}

/** Pagador efectivo de uma transação: próprio > herdado da linha BP > null (empresa). */
export function effectiveTransactionPayer(
  tx: any,
  inheritedMap?: Map<string, string>,
): string | null {
  if (tx?.paying_partner_id) return tx.paying_partner_id;
  return inheritedMap?.get(tx?.id) ?? null;
}
