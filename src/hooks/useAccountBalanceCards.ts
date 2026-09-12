/**
 * Composição dos três dinheiros da página de Contas (D-ERP27), com os saldos
 * calculados NO SERVIDOR e a permissão resolvida lá (D-ERP36).
 *
 * - caixa: contas `bank`, `cash`, `prepaid_card` com controlo de saldo
 *   → `account_true_balances_asof(ids, null)`
 * - retido em bilheteiras: contas `ticket_office`
 *   → `ticket_office_balances(ids)` — fórmula própria (D-ERP15), NÃO converge
 *     com a bancária
 * - acertos em curso: contas `other`
 *
 * Regra de apresentação: onde não há permissão nunca se mostra zero. O saldo
 * vem `null` em dois casos DIFERENTES, que este hook separa e não colapsa:
 *   reason = "uncontrolled"   → conta com `skip_balance_check` ("Não controlado")
 *   reason = "no_permission"  → o servidor recusou o valor ("Sem permissão")
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const CASH_ACCOUNT_TYPES = ["bank", "cash", "prepaid_card"] as const;

export type BalanceUnavailableReason = "uncontrolled" | "no_permission";

export interface AccountBalanceEntry {
  /** Saldo, ou `null` quando não há valor a mostrar. */
  value: number | null;
  /** Só preenchido quando `value` é `null`. */
  reason: BalanceUnavailableReason | null;
}

export interface BalanceCard {
  /** Soma das contas activas com valor visível. */
  total: number;
  /** Contas activas do grupo fora do total por `skip_balance_check`. */
  uncontrolledNames: string[];
  /** Contas activas do grupo fora do total por falta de permissão. */
  hiddenNames: string[];
  /** Nº de contas activas do grupo. */
  count: number;
}

interface AccountLike {
  id: string;
  name: string;
  type: string;
  is_active?: boolean | null;
  skip_balance_check?: boolean | null;
}

function emptyCard(): BalanceCard {
  return { total: 0, uncontrolledNames: [], hiddenNames: [], count: 0 };
}

async function fetchBalancesMap(
  rpc: "account_true_balances_asof" | "ticket_office_balances",
  ids: string[]
): Promise<Record<string, number | null>> {
  if (ids.length === 0) return {};
  const args =
    rpc === "account_true_balances_asof"
      ? { _account_ids: ids, _as_of: null }
      : { _account_ids: ids };
  const { data, error } = await (supabase as any).rpc(rpc, args);
  if (error) throw error;
  const map: Record<string, number | null> = {};
  for (const row of (data ?? []) as any[]) {
    map[row.account_id] =
      row.balance === null || row.balance === undefined ? null : Number(row.balance);
  }
  return map;
}

export function useAccountBalanceCards(accounts: AccountLike[]) {
  const nonOfficeIds = useMemo(
    () => accounts.filter((a) => a.type !== "ticket_office").map((a) => a.id).sort(),
    [accounts]
  );
  const officeIds = useMemo(
    () => accounts.filter((a) => a.type === "ticket_office").map((a) => a.id).sort(),
    [accounts]
  );

  const nonOfficeQuery = useQuery({
    queryKey: ["account-true-balances-asof", nonOfficeIds],
    enabled: nonOfficeIds.length > 0,
    queryFn: () => fetchBalancesMap("account_true_balances_asof", nonOfficeIds),
  });

  const officeQuery = useQuery({
    queryKey: ["ticket-office-balances", officeIds],
    enabled: officeIds.length > 0,
    queryFn: () => fetchBalancesMap("ticket_office_balances", officeIds),
  });

  const isLoading =
    (nonOfficeIds.length > 0 && nonOfficeQuery.isLoading) ||
    (officeIds.length > 0 && officeQuery.isLoading);

  const balances = useMemo(() => {
    const raw = { ...(nonOfficeQuery.data ?? {}), ...(officeQuery.data ?? {}) };
    const map: Record<string, AccountBalanceEntry> = {};
    accounts.forEach((a) => {
      const value = raw[a.id];
      if (value === null || value === undefined) {
        map[a.id] = {
          value: null,
          reason: a.skip_balance_check ? "uncontrolled" : "no_permission",
        };
      } else {
        map[a.id] = { value, reason: null };
      }
    });
    return map;
  }, [accounts, nonOfficeQuery.data, officeQuery.data]);

  const cards = useMemo(() => {
    const build = (predicate: (a: AccountLike) => boolean): BalanceCard => {
      const card = emptyCard();
      accounts
        .filter((a) => a.is_active !== false && predicate(a))
        .forEach((a) => {
          card.count += 1;
          const entry = balances[a.id];
          if (!entry || entry.value === null) {
            if (entry?.reason === "uncontrolled") card.uncontrolledNames.push(a.name);
            else card.hiddenNames.push(a.name);
            return;
          }
          card.total += entry.value;
        });
      return card;
    };

    return {
      cash: build((a) => (CASH_ACCOUNT_TYPES as readonly string[]).includes(a.type)),
      ticketOffice: build((a) => a.type === "ticket_office"),
      settlements: build((a) => a.type === "other"),
    };
  }, [accounts, balances]);

  return {
    isLoading,
    /** Saldo por conta, já com a razão da ausência quando não há valor. */
    balances,
    /** Caixa: banco, caixa e cartões pré-pagos com controlo de saldo. */
    cash: cards.cash,
    /** Retido em bilheteiras (D-ERP15) — nunca soma ao caixa. */
    ticketOffice: cards.ticketOffice,
    /** Acertos em curso (contas `other`) — não é caixa. */
    settlements: cards.settlements,
  };
}
