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
 * Fluxo aprovado (Pedro):
 *   1. Cria APENAS a transação de saída da conta origem com status='pending'
 *      (Aguardando Aprovação), categoria transferência (10.3), transitória e
 *      excluída do resultado. Fornecedor não se aplica (o "credor" é o cartão,
 *      que é uma conta financeira, não um supplier).
 *   2. Regista o load em card_session_loads com in_transaction_id=NULL.
 *   3. Só quando a transação for LIQUIDADA (via lista de pagamento) é que um
 *      trigger em BD cria a transação de entrada no cartão (income transitório
 *      já pago) e preenche in_transaction_id. Até lá o cartão NÃO vê o dinheiro.
 *   4. Se a transação for eliminada (rejeição/cancelamento), um trigger apaga
 *      também a entrada (se existir) e a linha de card_session_loads.
 */
export async function performCardLoad(p: CardLoadParams) {
  if (!(p.amount > 0)) throw new Error("Valor inválido.");

  const { data: cat } = await supabase
    .from("account_categories")
    .select("id")
    .eq("code", "10.3")
    .maybeSingle();

  const { data: outTx, error: outErr } = await supabase
    .from("transactions")
    .insert({
      amount: p.amount,
      iva_rate: 0,
      date: p.loadDate,
      status: "pending",
      is_transitory: true,
      exclude_from_result: true,
      category_id: cat?.id ?? null,
      description: `Carga cartão — ${p.cardName} (${p.sourceAccountName} → ${p.cardName})`,
      type: "expense",
      account_id: p.sourceAccountId,
    })
    .select("id")
    .single();
  if (outErr) throw outErr;

  const { error: loadErr } = await supabase.from("card_session_loads").insert({
    session_id: p.sessionId,
    amount: p.amount,
    load_date: p.loadDate,
    source_account_id: p.sourceAccountId,
    out_transaction_id: outTx.id,
    in_transaction_id: null,
    notes: p.notes ?? null,
    created_by: p.userId,
  });
  if (loadErr) {
    // rollback da OUT tx se o load falhar
    await supabase.from("transactions").delete().eq("id", outTx.id);
    throw loadErr;
  }

  return { outTxId: outTx.id, inTxId: null };
}
