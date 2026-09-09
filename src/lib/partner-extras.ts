import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

/**
 * FONTE ÚNICA DOS "EXTRAS DO SÓCIO".
 *
 * Existem DUAS naturezas legítimas, ambas abatem ao acerto do sócio e NENHUMA
 * é custo do evento (não entram no DRE nem no custo operacional):
 *
 *  • `partner_advance_expenses` (origem 'transacao') — a empresa pagou uma despesa
 *    que é custo do sócio; ligada 1:1 a uma transação real (transitória).
 *  • `event_partner_extras` (origem 'manual') — o sócio deve algo sem que a empresa
 *    tenha desembolsado; registo manual, sem transação, sem conta e sem IVA.
 *
 * Esta função lê as DUAS para um conjunto de event_ids (âmbito Master+Subs) e
 * devolve uma lista normalizada. Usar SEMPRE isto no acerto do sócio.
 */
export type PartnerExtraOrigin = "transacao" | "manual";

export interface PartnerExtraItem {
  id: string;
  origem: PartnerExtraOrigin;
  partner_id: string;
  event_id: string;
  description: string;
  amount: number;
  /** origem 'transacao' → data da transação; 'manual' → created_at */
  data: string;
  transaction_id: string | null;
  /** Só existe na origem 'transacao' (para bases c/IVA). Manual é sempre sem IVA. */
  iva_rate: number;
  /** Categoria contabilística (só origem 'transacao'). */
  category: string | null;
  notes: string | null;
}

export const ORIGIN_LABEL: Record<PartnerExtraOrigin, string> = {
  transacao: "Despesa",
  manual: "Manual",
};

export async function fetchPartnerExtras(eventIds: string[]): Promise<PartnerExtraItem[]> {
  const ids = eventIds.filter(Boolean);
  if (ids.length === 0) return [];

  const [advRes, manRes] = await Promise.all([
    supabase
      .from("partner_advance_expenses")
      .select(
        "id, partner_id, event_id, transaction_id, created_at, transactions(description, amount, iva_rate, date, event_id, account_categories(name))",
      )
      .in("event_id", ids)
      .order("created_at"),
    supabase
      .from("event_partner_extras")
      .select("id, partner_id, event_id, description, amount, notes, created_at")
      .in("event_id", ids)
      .order("created_at"),
  ]);

  if (advRes.error) throw advRes.error;
  if (manRes.error) throw manRes.error;

  const fromTx: PartnerExtraItem[] = (advRes.data ?? []).map((row: any) => ({
    id: row.id,
    origem: "transacao" as const,
    partner_id: row.partner_id,
    event_id: row.transactions?.event_id || row.event_id,
    description: row.transactions?.description || "—",
    amount: Number(row.transactions?.amount || 0),
    data: row.transactions?.date || row.created_at || "",
    transaction_id: row.transaction_id ?? null,
    iva_rate: Number(row.transactions?.iva_rate || 0),
    category: row.transactions?.account_categories?.name ?? null,
    notes: null,
  }));

  const fromManual: PartnerExtraItem[] = (manRes.data ?? []).map((row: any) => ({
    id: row.id,
    origem: "manual" as const,
    partner_id: row.partner_id,
    event_id: row.event_id,
    description: row.description || "—",
    amount: Number(row.amount || 0),
    data: row.created_at || "",
    transaction_id: null,
    iva_rate: 0,
    category: null,
    notes: row.notes ?? null,
  }));

  return [...fromTx, ...fromManual].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

/** Chaves de query que dependem dos extras (união). Invalida-as todas após escrever. */
const EXTRA_QUERY_KEY_ROOTS = [
  "partner-extras",
  "partner-extras-union",
  "fecho-partner-extras",
  "partner-advance-expenses",
];

export function invalidatePartnerExtras(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    predicate: (q) => {
      const root = Array.isArray(q.queryKey) ? q.queryKey[0] : q.queryKey;
      return typeof root === "string" && EXTRA_QUERY_KEY_ROOTS.includes(root);
    },
  });
}
