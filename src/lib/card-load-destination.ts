import { supabase } from "@/integrations/supabase/client";

/**
 * Cargas de cartão pré-pago (transferências internas, categoria 10.3) não têm
 * fornecedor: o beneficiário é a própria CONTA DE DESTINO (o cartão).
 *
 * Modelo: transactions.id → card_session_loads.out_transaction_id →
 * card_sessions.card_account_id → financial_accounts (name, iban).
 *
 * Este enriquecimento anexa `card_load_destination` às transações para que a
 * resolução única em `payment-iban.ts` (elegibilidade dos pickers + geração do
 * ficheiro SEPA) consiga resolver IBAN e nome do beneficiário.
 */
export type CardLoadDestination = {
  accountId: string;
  name: string | null;
  iban: string | null;
};

export async function enrichCardLoadDestinations<T extends { id?: string | null }>(rows: T[]): Promise<T[]> {
  const ids = [...new Set(rows.map((r) => r?.id).filter(Boolean))] as string[];
  if (ids.length === 0) return rows;

  const { data: loads, error } = await supabase
    .from("card_session_loads")
    .select("out_transaction_id, card_sessions:session_id(card_account_id)")
    .in("out_transaction_id", ids);
  if (error || !loads || loads.length === 0) return rows;

  const accountIds = [
    ...new Set(
      (loads as any[]).map((l) => l.card_sessions?.card_account_id).filter(Boolean),
    ),
  ] as string[];
  if (accountIds.length === 0) return rows;

  const { data: accounts } = await supabase
    .from("financial_accounts")
    .select("id, name, iban")
    .in("id", accountIds);

  const accById = new Map<string, any>((accounts ?? []).map((a: any) => [a.id, a]));
  const destByTx = new Map<string, CardLoadDestination>();
  for (const l of loads as any[]) {
    const accId = l.card_sessions?.card_account_id;
    const acc = accId ? accById.get(accId) : null;
    if (!l.out_transaction_id || !accId) continue;
    destByTx.set(l.out_transaction_id, {
      accountId: accId,
      name: acc?.name ?? null,
      iban: acc?.iban ?? null,
    });
  }

  for (const row of rows) {
    const dest = row?.id ? destByTx.get(row.id) : undefined;
    if (dest) (row as any).card_load_destination = dest;
  }
  return rows;
}
