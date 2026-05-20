/**
 * Lista detalhada de patrocinadores no Simulador formato Coala.
 *
 * Fonte: event_forecasts (type='income', status='approved') cuja categoria L3
 * tenha como pai a categoria L2 configurada em event_simulator_config.sponsor_category_l2_id
 * (default: code começando por '1.2').
 *
 * Vínculo a transações: event_forecasts.transaction_id (1:1).
 * Nome do patrocinador: vem do supplier da TX se vinculada, senão usa forecast.description.
 */
import { supabase } from "@/integrations/supabase/client";

export type SponsorRow = {
  forecast_id: string;
  sponsor_name: string;
  category_code: string;
  category_name: string;
  planned_amount: number;
  actual_amount: number; // valor da transação vinculada (se existir)
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
    const { data } = await supabase
      .from("account_categories")
      .select("id, code, name")
      .like("code", "1.2.%")
      .eq("is_active", true);
    l3Ids = (data ?? []).map((c: any) => c.id);
  }
  if (!l3Ids.length) return [];

  // 2) Forecasts de receita aprovados nessas categorias
  const { data: forecastsRaw } = await supabase
    .from("event_forecasts")
    .select("id, description, amount, category_id, transaction_id")
    .eq("event_id", eventId)
    .eq("type", "income")
    .eq("status", "approved")
    .in("category_id", l3Ids)
    .is("version_id", null);

  const forecasts = (forecastsRaw ?? []) as Array<{
    id: string; description: string | null; amount: number;
    category_id: string | null; transaction_id: string | null;
  }>;
  if (!forecasts.length) return [];

  const txIds = forecasts.map((f) => f.transaction_id).filter(Boolean) as string[];
  const catIds = Array.from(new Set(forecasts.map((f) => f.category_id).filter(Boolean) as string[]));

  // 3) Lookups paralelos
  const [{ data: txs }, { data: cats }] = await Promise.all([
    txIds.length
      ? supabase.from("transactions").select("id, amount, supplier_id").in("id", txIds)
      : Promise.resolve({ data: [] as any[] }),
    catIds.length
      ? supabase.from("account_categories").select("id, code, name").in("id", catIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const txById = new Map(
    (txs ?? []).map((t: any) => [t.id, { amount: Number(t.amount || 0), supplier_id: t.supplier_id as string | null }]),
  );
  const supplierIds = Array.from(
    new Set(Array.from(txById.values()).map((t) => t.supplier_id).filter(Boolean) as string[]),
  );
  const { data: suppliers } = supplierIds.length
    ? await supabase.from("suppliers").select("id, name").in("id", supplierIds)
    : { data: [] as any[] };
  const supplierById = new Map((suppliers ?? []).map((s: any) => [s.id, s.name as string]));
  const catById = new Map((cats ?? []).map((c: any) => [c.id, { code: c.code as string, name: c.name as string }]));

  return forecasts.map((f): SponsorRow => {
    const planned = Number(f.amount || 0);
    const tx = f.transaction_id ? txById.get(f.transaction_id) : undefined;
    const actual = tx?.amount ?? 0;
    const ratio = planned > 0 ? actual / planned : 0;
    const status_hint =
      ratio >= 0.99 ? "fully_received" : ratio > 0 ? "partial" : "pending";
    const cat = f.category_id ? catById.get(f.category_id) : undefined;
    const sponsorName =
      (tx?.supplier_id && supplierById.get(tx.supplier_id)) ||
      f.description || "Patrocinador";
    return {
      forecast_id: f.id,
      sponsor_name: sponsorName,
      category_code: cat?.code || "",
      category_name: cat?.name || "",
      planned_amount: planned,
      actual_amount: actual,
      status_hint,
    };
  }).sort((a, b) => b.planned_amount - a.planned_amount);
}
