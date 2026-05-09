/**
 * Camada de leitura unificada para Tickets V2 (Fase 2.3).
 *
 * Esta função substitui — quando consumida — a query directa de
 * event_ticket_lots em hooks/components, respeitando a feature flag
 * `companies.feature_tickets_v2`.
 *
 * Quando flag=false (default em todas as empresas hoje), faz EXACTAMENTE a
 * mesma query antiga e devolve os mesmos campos.
 *
 * Quando flag=true, deriva `is_combo` e `consumes_zone_ids` do junction
 * `event_ticket_type_zones` em vez das colunas legacy. O output é idêntico
 * em formato.
 *
 * Esta função é pura (recebe o cliente como argumento) para ser facilmente
 * testável via mocks.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface UnifiedLot {
  id: string;
  zone_id: string;
  name: string;
  quantity: number;
  lot_kind: string | null;
  is_combo: boolean;
  consumes_zone_ids: string[];
  applies_to_days: number;
  ticket_type_id: string | null;
  variant_kind: string | null;
  variant_label: string | null;
  parent_ticket_type_id: string | null;
  sales_channel: string | null;
}

export async function fetchEventLotsUnified(
  eventId: string,
  client: SupabaseClient
): Promise<UnifiedLot[]> {
  const { data: evt, error: errEvt } = await client
    .from("events")
    .select("id, company_id")
    .eq("id", eventId)
    .maybeSingle();
  if (errEvt) throw errEvt;
  if (!evt) return [];

  const { data: company, error: errCo } = await client
    .from("companies")
    .select("feature_tickets_v2")
    .eq("id", (evt as any).company_id)
    .maybeSingle();
  if (errCo) throw errCo;

  const useV2 = !!(company as any)?.feature_tickets_v2;

  const { data: zones, error: errZ } = await client
    .from("event_ticket_zones")
    .select("id")
    .eq("event_id", eventId)
    .is("version_id", null);
  if (errZ) throw errZ;
  const zoneIds = (zones ?? []).map((z: any) => z.id);
  if (zoneIds.length === 0) return [];

  if (!useV2) {
    const { data: lots, error } = await client
      .from("event_ticket_lots")
      .select(
        "id, name, zone_id, quantity, lot_kind, is_combo, consumes_zone_ids, applies_to_days, ticket_type_id"
      )
      .in("zone_id", zoneIds)
      .is("version_id", null);
    if (error) throw error;
    return (lots ?? []).map((l: any) => ({
      id: l.id,
      zone_id: l.zone_id,
      name: l.name,
      quantity: Number(l.quantity || 0),
      lot_kind: l.lot_kind ?? null,
      is_combo: !!l.is_combo,
      consumes_zone_ids: (l.consumes_zone_ids ?? []) as string[],
      applies_to_days: Number(l.applies_to_days || 1),
      ticket_type_id: l.ticket_type_id ?? null,
      variant_kind: null,
      variant_label: null,
      parent_ticket_type_id: null,
      sales_channel: null,
    }));
  }

  const { data: lots, error: errLots } = await client
    .from("event_ticket_lots")
    .select(
      "id, name, zone_id, quantity, lot_kind, applies_to_days, ticket_type_id"
    )
    .in("zone_id", zoneIds)
    .is("version_id", null);
  if (errLots) throw errLots;

  const ttIds = Array.from(
    new Set(
      (lots ?? [])
        .map((l: any) => l.ticket_type_id as string | null)
        .filter((x: string | null): x is string => !!x)
    )
  );
  if (ttIds.length === 0) return [];

  const { data: types, error: errT } = await client
    .from("event_ticket_types")
    .select("id, kind, parent_ticket_type_id, variant_kind, variant_label, sales_channel")
    .in("id", ttIds);
  if (errT) throw errT;
  const typeById = new Map<string, any>();
  for (const t of types ?? []) typeById.set((t as any).id, t);

  const { data: junction, error: errJ } = await client
    .from("event_ticket_type_zones")
    .select("ticket_type_id, zone_id, display_order")
    .in("ticket_type_id", ttIds);
  if (errJ) throw errJ;

  const zonesByType = new Map<string, string[]>();
  for (const j of (junction ?? []) as any[]) {
    const arr = zonesByType.get(j.ticket_type_id) ?? [];
    arr.push(j.zone_id);
    zonesByType.set(j.ticket_type_id, arr);
  }
  for (const [k, v] of zonesByType.entries()) {
    zonesByType.set(k, v.slice().sort());
  }

  return ((lots ?? []) as any[])
    .filter((l) => !!l.ticket_type_id)
    .map((l) => {
      const tt = typeById.get(l.ticket_type_id);
      const zoneList = zonesByType.get(l.ticket_type_id) ?? [l.zone_id];
      const isComboDerived = zoneList.length >= 2;
      return {
        id: l.id,
        zone_id: l.zone_id,
        name: l.name,
        quantity: Number(l.quantity || 0),
        lot_kind: l.lot_kind ?? null,
        is_combo: isComboDerived,
        consumes_zone_ids: zoneList,
        applies_to_days: Number(l.applies_to_days || (isComboDerived ? zoneList.length : 1)),
        ticket_type_id: l.ticket_type_id ?? null,
        variant_kind: tt?.variant_kind ?? null,
        variant_label: tt?.variant_label ?? null,
        parent_ticket_type_id: tt?.parent_ticket_type_id ?? null,
        sales_channel: tt?.sales_channel ?? null,
      };
    });
}
