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
  const { data: forecastsRaw } = await supabase
    .from("event_forecasts")
    .select("id, description, amount, category_id, supplier_id")
    .eq("event_id", eventId)
    .eq("type", "revenue")
    .eq("status", "approved")
    .in("category_id", l3Ids);

  const forecasts = (forecastsRaw ?? []) as Array<{
    id: string; description: string | null; amount: number;
    category_id: string | null; supplier_id: string | null;
  }>;
  if (!forecasts.length) return [];

  const forecastIds = forecasts.map((f) => f.id);
  const supplierIds = Array.from(new Set(forecasts.map((f) => f.supplier_id).filter(Boolean) as string[]));
  const catIds = Array.from(new Set(forecasts.map((f) => f.category_id).filter(Boolean) as string[]));

  // 3) Lookups paralelos
  const [{ data: txs }, { data: suppliers }, { data: cats }] = await Promise.all([
    supabase.from("transactions").select("amount, forecast_id").in("forecast_id", forecastIds),
    supplierIds.length
      ? supabase.from("suppliers").select("id, name").in("id", supplierIds)
      : Promise.resolve({ data: [] as any[] }),
    catIds.length
      ? supabase.from("account_categories").select("id, code, name").in("id", catIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const actualByForecast = new Map<string, number>();
  for (const t of (txs ?? []) as Array<{ forecast_id: string | null; amount: number }>) {
    if (!t.forecast_id) continue;
    actualByForecast.set(t.forecast_id, (actualByForecast.get(t.forecast_id) ?? 0) + Number(t.amount || 0));
  }
  const supplierById = new Map((suppliers ?? []).map((s: any) => [s.id, s.name as string]));
  const catById = new Map((cats ?? []).map((c: any) => [c.id, { code: c.code as string, name: c.name as string }]));

  return forecasts.map((f): SponsorRow => {
    const planned = Number(f.amount || 0);
    const actual = actualByForecast.get(f.id) ?? 0;
    const ratio = planned > 0 ? actual / planned : 0;
    const status_hint =
      ratio >= 0.99 ? "fully_received" : ratio > 0 ? "partial" : "pending";
    const cat = f.category_id ? catById.get(f.category_id) : undefined;
    return {
      forecast_id: f.id,
      sponsor_name: (f.supplier_id && supplierById.get(f.supplier_id)) || f.description || "Patrocinador",
      category_code: cat?.code || "",
      category_name: cat?.name || "",
      planned_amount: planned,
      actual_amount: actual,
      status_hint,
    };
  }).sort((a, b) => b.planned_amount - a.planned_amount);
}
