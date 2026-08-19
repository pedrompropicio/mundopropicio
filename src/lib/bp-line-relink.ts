import { supabase } from "@/integrations/supabase/client";

/**
 * Realocação de uma transação entre linhas do BP (event_forecasts.transaction_id).
 *
 * Mesma mecânica/validações da ferramenta "Alocar realizado" (EventRealizedAllocation):
 * - 1:1 estrito — linha alvo só aceita vínculo se `transaction_id IS NULL`.
 * - Troca de linha limpa primeiro o FK da linha antiga.
 * - `targetForecastId = null` → só desvincula ("sem linha específica / via rubrica").
 */
export interface BpLine {
  id: string;
  category_id: string | null;
  description: string | null;
  amount: number;
  transaction_id: string | null;
}

export async function fetchBpLinesForCategory(params: {
  eventId: string;
  categoryId: string;
  type: "expense" | "income";
}): Promise<BpLine[]> {
  const { data, error } = await supabase
    .from("event_forecasts")
    .select("id, category_id, description, amount, transaction_id")
    .eq("event_id", params.eventId)
    .eq("category_id", params.categoryId)
    .eq("type", params.type)
    .is("version_id", null)
    .in("status", ["approved", "draft"]);
  if (error) throw error;
  return (data ?? []) as BpLine[];
}

export async function relinkTransactionToForecast(params: {
  transactionId: string;
  currentForecastId: string | null;
  targetForecastId: string | null;
}): Promise<void> {
  const { transactionId, currentForecastId, targetForecastId } = params;
  if (currentForecastId === targetForecastId) return;

  if (currentForecastId) {
    const { error } = await supabase
      .from("event_forecasts")
      .update({ transaction_id: null } as any)
      .eq("id", currentForecastId);
    if (error) throw error;
  }

  if (!targetForecastId) return;

  const { data, error } = await supabase
    .from("event_forecasts")
    .update({ transaction_id: transactionId } as any)
    .eq("id", targetForecastId)
    .is("transaction_id", null)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("A linha do BP ficou vinculada a outra transação entretanto. Atualiza e tenta de novo.");
  }
}
