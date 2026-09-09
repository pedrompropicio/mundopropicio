/**
 * Lotação real das bilheteiras — leitura de public.event_zone_capacities.
 *
 * REGRA QUE NÃO SE PODE ESQUECER: a tabela guarda uma linha por zona POR
 * observed_on. Usa-se SEMPRE a última observação por (event_id, zone_label).
 * Somar a tabela toda dá valores inflacionados (o SM - Lisboa daria 42.546 de
 * carga quando a carga real na última observação é 6.078).
 *
 * CONCEITO: `occupied` é o que a BILHETEIRA diz que está tomado — inclui
 * cortesias, protocolo, reservas e canais que não registamos. NÃO é o mesmo que
 * os bilhetes que nós vendemos (ticket_sales). Nunca se dividem os nossos
 * bilhetes por esta carga.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ZoneCapacityRow {
  event_id: string;
  zone_label: string;
  capacity: number | null;
  available: number | null;
  occupied: number | null;
  blocked: number | null;
  observed_on: string;
}

export interface ZoneCapacityTotals {
  capacity: number;
  available: number;
  occupied: number;
  blocked: number;
  zones: number;
  lastObserved: string | null;
}

/** Histórico completo (capacity_kind = 'released') dos eventos pedidos. */
export async function fetchZoneCapacities(eventIds: string[]): Promise<ZoneCapacityRow[]> {
  const ids = eventIds.filter(Boolean);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("event_zone_capacities")
    .select("event_id, zone_label, capacity, available, occupied, blocked, observed_on")
    .in("event_id", ids)
    .eq("capacity_kind", "released")
    .order("observed_on", { ascending: false })
    .limit(20000);
  if (error) throw error;
  return (data ?? []) as unknown as ZoneCapacityRow[];
}

/** Última observação por (event_id, zone_label). */
export function latestByZone(rows: ZoneCapacityRow[]): ZoneCapacityRow[] {
  const best = new Map<string, ZoneCapacityRow>();
  for (const r of rows) {
    const k = `${r.event_id}|${r.zone_label}`;
    const cur = best.get(k);
    if (!cur || String(r.observed_on) > String(cur.observed_on)) best.set(k, r);
  }
  return Array.from(best.values());
}

/** Totais por evento, já sobre a última observação de cada zona. */
export function totalsByEvent(rows: ZoneCapacityRow[]): Map<string, ZoneCapacityTotals> {
  const out = new Map<string, ZoneCapacityTotals>();
  for (const r of latestByZone(rows)) {
    const t =
      out.get(r.event_id) ??
      { capacity: 0, available: 0, occupied: 0, blocked: 0, zones: 0, lastObserved: null as string | null };
    t.capacity += Number(r.capacity ?? 0);
    t.available += Number(r.available ?? 0);
    t.occupied += Number(r.occupied ?? 0);
    t.blocked += Number(r.blocked ?? 0);
    t.zones += 1;
    if (!t.lastObserved || String(r.observed_on) > t.lastObserved) t.lastObserved = String(r.observed_on).slice(0, 10);
    out.set(r.event_id, t);
  }
  return out;
}
