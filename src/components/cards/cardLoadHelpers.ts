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
 * Fluxo aprovado (Pedro) — a carga é um PAR de duas pernas que se anulam no caixa:
 *   1. Cria APENAS a transação de saída da conta origem com status='pending'
 *      (Aguardando Aprovação), rubrica de transferência (10.3), transitória
 *      (`transitory_reason='carga_cartao'`) e excluída do resultado. Fornecedor
 *      não se aplica: o beneficiário é o próprio cartão, uma conta financeira.
 *   2. Regista o load em card_session_loads com in_transaction_id=NULL.
 *   3. Só quando a saída fica LIQUIDADA (status='paid') é que o trigger
 *      `card_load_on_out_paid` cria a perna de entrada no cartão e preenche
 *      in_transaction_id. Até lá o cartão NÃO vê o dinheiro — por isso numa
 *      carga LIQUIDA-SE, nunca se marca como pago (issue #201).
 *   4. Se a transação for eliminada (rejeição/cancelamento), um trigger apaga
 *      também a entrada (se existir) e a linha de card_session_loads.
 *
 * As duas escritas passaram a ser ATÓMICAS: a RPC `create_card_session_load`
 * resolve a rubrica, cria a saída e insere a linha da carga na mesma transação
 * de base de dados. Falha em qualquer passo ⇒ nada fica escrito (issue #201).
 */
export async function performCardLoad(p: CardLoadParams) {
  if (!(p.amount > 0)) throw new Error("Valor inválido.");
  if (!p.sourceAccountId) throw new Error("Conta de origem obrigatória.");

  const { data, error } = await supabase.rpc("create_card_session_load", {
    p_session_id: p.sessionId,
    p_amount: p.amount,
    p_load_date: p.loadDate,
    p_source_account_id: p.sourceAccountId,
    p_notes: p.notes ?? null,
  });
  if (error) throw error;

  return { outTxId: (data as string) ?? null, inTxId: null };
}
