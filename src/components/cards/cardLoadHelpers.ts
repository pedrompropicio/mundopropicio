import { supabase } from "@/integrations/supabase/client";

interface CardLoadParams {
  sessionId: string;
  cardAccountId: string;
  cardName: string;
  sourceAccountId: string;
  sourceAccountName: string;
  amount: number;
  loadDate: string;
  userId: string | null;
  notes?: string;
}

/**
 * Cria par transitório de transações (saída da conta origem + entrada no cartão)
 * e regista o load em card_session_loads. Segue o padrão de transferências
 * (is_transitory=true, status=paid, sem event_id, sem BP/DRE impact).
 */
export async function performCardLoad(p: CardLoadParams) {
  if (!(p.amount > 0)) throw new Error("Valor inválido.");

  const baseDesc = `Recarga cartão — ${p.cardName}`;
  const inDesc = `Carga de ${p.sourceAccountName}`;

  // Categoria transferência (10.3)
  const { data: cat } = await supabase
    .from("account_categories")
    .select("id")
    .eq("code", "10.3")
    .maybeSingle();

  const commonBase = {
    amount: p.amount,
    iva_rate: 0,
    date: p.loadDate,
    status: "paid" as const,
    paid_amount: p.amount,
    payment_date: p.loadDate,
    is_transitory: true,
    exclude_from_result: true,
    category_id: cat?.id ?? null,
  };

  const { data: outTx, error: outErr } = await supabase
    .from("transactions")
    .insert({
      ...commonBase,
      description: `${baseDesc} (${p.sourceAccountName} → ${p.cardName})`,
      type: "expense",
      account_id: p.sourceAccountId,
    })
    .select("id")
    .single();
  if (outErr) throw outErr;

  const { data: inTx, error: inErr } = await supabase
    .from("transactions")
    .insert({
      ...commonBase,
      description: `${inDesc} (${p.sourceAccountName} → ${p.cardName})`,
      type: "income",
      account_id: p.cardAccountId,
    })
    .select("id")
    .single();
  if (inErr) throw inErr;

  const { error: loadErr } = await supabase.from("card_session_loads").insert({
    session_id: p.sessionId,
    amount: p.amount,
    load_date: p.loadDate,
    source_account_id: p.sourceAccountId,
    out_transaction_id: outTx.id,
    in_transaction_id: inTx.id,
    notes: p.notes ?? null,
    created_by: p.userId,
  });
  if (loadErr) throw loadErr;

  return { outTxId: outTx.id, inTxId: inTx.id };
}
