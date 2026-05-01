/**
 * Lista detalhada de patrocinadores no Simulador formato Coala.
 *
 * Fonte: event_forecasts (type='revenue', status='approved') cuja categoria L3
 * tenha como pai a categoria L2 configurada em event_simulator_config.sponsor_category_l2_id
 * (default: code começando por '1.2').
 *
 * Cada linha mostra: nome do patrocinador (supplier.name ou forecast.description),
 * categoria L3, valor previsto e valor já realizado (transações vinculadas).
 */
import { supabase } from "@/integrations/supabase/client";

export type SponsorRow = {
  forecast_id: string;
  sponsor_name: string;
  category_code: string;
  category_name: string;
  planned_amount: number;
  actual_amount: number; // soma das transações vinculadas (paid + approved + pending)
  status_hint: "fully_received" | "partial" | "pending";
};

export async function loadSponsors(
  eventId: string,
  sponsorL2Id: string | null,
): Promise<SponsorRow[]> {
  // 1) Resolver IDs de categorias L3 cujo pai é a L2 de patrocínios
  let l3Ids: string[] = [];
  if (sponsorL2Id) {
    const { data } = await supabase
      .from("account_categories")
      .select("id, code, name")
      .eq("parent_id", sponsorL2Id)
      .eq("is_active", true);
    l3Ids = (data ?? []).map((c: any) => c.id);
  } else {
    // Fallback: procura por code LIKE '1.2.%'
    const { data } = await supabase
      .from("account_categories")
      .select("id, code, name")
      .like("code", "1.2.%")
      .eq("is_active", true);
    l3Ids = (data ?? []).map((c: any) => c.id);
  }
  if (!l3Ids.length) return [];

  // 2) Carregar forecasts de receita aprovados nessas categorias para o evento
  const { data: forecasts } = await supabase
    .from("event_forecasts")
    .select("id, description, amount, category_id, supplier_id, account_categories(code, name), suppliers(name)")
    .eq("event_id", eventId)
    .eq("type", "revenue")
    .eq("status", "approved")
    .in("category_id", l3Ids);

  if (!forecasts?.length) return [];

  const forecastIds = forecasts.map((f: any) => f.id);

  // 3) Carregar transações vinculadas para calcular o realizado
  const { data: txs } = await supabase
    .from("transactions")
    .select("amount, status, forecast_id")
    .in("forecast_id", forecastIds);

  const actualByForecast = new Map<string, number>();
  for (const t of txs ?? []) {
    const k = (t as any).forecast_id;
    if (!k) continue;
    actualByForecast.set(k, (actualByForecast.get(k) ?? 0) + Number((t as any).amount || 0));
  }

  return forecasts.map((f: any): SponsorRow => {
    const planned = Number(f.amount || 0);
    const actual = actualByForecast.get(f.id) ?? 0;
    const ratio = planned > 0 ? actual / planned : 0;
    const status_hint =
      ratio >= 0.99 ? "fully_received" : ratio > 0 ? "partial" : "pending";
    return {
      forecast_id: f.id,
      sponsor_name: f.suppliers?.name || f.description || "Patrocinador",
      category_code: f.account_categories?.code || "",
      category_name: f.account_categories?.name || "",
      planned_amount: planned,
      actual_amount: actual,
      status_hint,
    };
  }).sort((a, b) => b.planned_amount - a.planned_amount);
}
