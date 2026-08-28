import { supabase } from "@/integrations/supabase/client";

/**
 * Realocação de uma transação entre linhas do BP.
 *
 * Fase 2 (2026-08-28) — chave canónica: `transactions.forecast_id` (N TXs por
 * linha de BP). ESCRITA DUPLA: `event_forecasts.transaction_id` continua a ser
 * mantida como "âncora" (a primeira TX vinculada), porque três triggers
 * dependem dela (sync de rubrica BP→TX, mesmo-evento, protecção Master/Split).
 *
 * - Vincular: grava `transactions.forecast_id` e, se a linha não tiver âncora,
 *   passa a ser esta TX.
 * - Desvincular: limpa `transactions.forecast_id` e, se a âncora era esta TX,
 *   repõe-na na TX mais antiga ainda vinculada (ou NULL se não houver).
 * - A âncora deixou de significar exclusividade: uma linha nunca está "ocupada".
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

/** Escolhe determinísticamente a nova âncora de uma linha (mais antiga por date/created_at). */
async function pickAnchorForForecast(forecastId: string, excludeTxId?: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, date, created_at")
    .eq("forecast_id", forecastId as any)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []).filter((r: any) => r.id !== excludeTxId);
  return rows.length > 0 ? (rows[0] as any).id : null;
}

/** Vincula uma TX a uma linha do BP (escrita dupla: coluna nova + âncora se livre). */
export async function linkTransactionToForecast(params: {
  transactionId: string;
  forecastId: string;
}): Promise<void> {
  const { transactionId, forecastId } = params;

  const { error: txErr } = await supabase
    .from("transactions")
    .update({ forecast_id: forecastId } as any)
    .eq("id", transactionId);
  if (txErr) throw txErr;

  // Âncora legada: só se a linha ainda não tiver nenhuma.
  const { error: anchorErr } = await supabase
    .from("event_forecasts")
    .update({ transaction_id: transactionId } as any)
    .eq("id", forecastId)
    .is("transaction_id", null);
  if (anchorErr) throw anchorErr;
}

/** Desvincula uma TX de uma linha do BP, repondo a âncora noutra TX se necessário. */
export async function unlinkTransactionFromForecast(params: {
  transactionId: string;
  forecastId: string;
}): Promise<void> {
  const { transactionId, forecastId } = params;

  const { error: txErr } = await supabase
    .from("transactions")
    .update({ forecast_id: null } as any)
    .eq("id", transactionId);
  if (txErr) throw txErr;

  const { data: fc, error: fcErr } = await supabase
    .from("event_forecasts")
    .select("id, transaction_id")
    .eq("id", forecastId)
    .maybeSingle();
  if (fcErr) throw fcErr;
  if (!fc || (fc as any).transaction_id !== transactionId) return;

  const nextAnchor = await pickAnchorForForecast(forecastId, transactionId);
  const { error: anchorErr } = await supabase
    .from("event_forecasts")
    .update({ transaction_id: nextAnchor } as any)
    .eq("id", forecastId);
  if (anchorErr) throw anchorErr;
}

export async function relinkTransactionToForecast(params: {
  transactionId: string;
  currentForecastId: string | null;
  targetForecastId: string | null;
}): Promise<void> {
  const { transactionId, currentForecastId, targetForecastId } = params;
  if (currentForecastId === targetForecastId) return;

  if (currentForecastId) {
    await unlinkTransactionFromForecast({ transactionId, forecastId: currentForecastId });
  }

  if (!targetForecastId) return;

  await linkTransactionToForecast({ transactionId, forecastId: targetForecastId });
}
