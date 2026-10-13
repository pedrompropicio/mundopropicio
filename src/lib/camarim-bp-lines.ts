import { supabase } from "@/integrations/supabase/client";
import type { CamarimLineOption } from "@/lib/camarim-bp-rules";
import { round2 } from "@/lib/camarim-integrate";

/**
 * Linhas 2.6.04 vivas (por ids ou por evento) com o realizado — mesma conta da
 * close-camarim-session: transações approved/paid da linha, sem transitórias,
 * excluídas, estornadas nem ocultas.
 */
export async function fetchCamarimLines(q: { ids?: string[]; eventId?: string }): Promise<CamarimLineOption[]> {
  let sel = supabase
    .from("event_forecasts")
    .select("id,event_id,description,specification,amount,account_categories!inner(code)")
    .is("version_id", null)
    .eq("account_categories.code", "2.6.04");
  if (q.ids) sel = sel.in("id", q.ids);
  if (q.eventId) sel = sel.eq("event_id", q.eventId);
  const { data, error } = await sel.order("id").limit(500);
  if (error) throw error;
  const lines = (data ?? []) as any[];
  if (lines.length === 0) return [];

  const realized = new Map<string, number>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: tx, error: tErr } = await supabase
      .from("transactions")
      .select("forecast_id,amount,is_transitory,exclude_from_result,reversed_at,is_hidden")
      .in("forecast_id", lines.map((l) => l.id))
      .in("status", ["approved", "paid"])
      .range(from, from + PAGE - 1);
    if (tErr) throw tErr;
    for (const t of (tx ?? []) as any[]) {
      if (t.is_transitory || t.exclude_from_result || t.reversed_at || t.is_hidden) continue;
      realized.set(t.forecast_id, (realized.get(t.forecast_id) ?? 0) + Number(t.amount ?? 0));
    }
    if (!tx || tx.length < PAGE) break;
  }
  return lines.map((l) => ({
    id: l.id,
    event_id: l.event_id,
    description: l.description,
    specification: l.specification,
    amount: Number(l.amount ?? 0),
    realized: round2(realized.get(l.id) ?? 0),
  }));
}
