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
import { fetchAllPaged } from "@/lib/supabase-paging";

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
  // Paginado: o PostgREST corta aos 1.000 e a tabela tem uma linha por zona por dia.
  return fetchAllPaged<ZoneCapacityRow>((from, to) =>
    supabase
      .from("event_zone_capacities")
      .select("event_id, zone_label, capacity, available, occupied, blocked, observed_on")
      .in("event_id", ids)
      .eq("capacity_kind", "released")
      .order("observed_on", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to) as any);
}

/**
 * OBSERVAÇÃO CORRENTE do evento (#198, reincidência 30/09/2026).
 *
 * Carga, ocupado, bloqueado, por vender e ocupação vêm TODOS da mesma
 * observação: a mais recente do evento. Uma zona que não aparece nessa
 * observação deixou de existir (a bilheteira mudou-lhe o nome) e não conta para
 * nada. Nunca se mistura a leitura de hoje com a de outro dia — era isso que
 * inflacionava o SM - Porto (8.482 em vez de 6.368) e duplicava o RG - Albufeira.
 *
 * Se a mesma zona tiver mais do que uma linha nesse dia, fica a última lida.
 */
export function latestByZone(rows: ZoneCapacityRow[]): ZoneCapacityRow[] {
  const lastObserved = new Map<string, string>();
  for (const r of rows) {
    const d = String(r.observed_on).slice(0, 10);
    const cur = lastObserved.get(r.event_id);
    if (!cur || d > cur) lastObserved.set(r.event_id, d);
  }
  const best = new Map<string, ZoneCapacityRow>();
  for (const r of rows) {
    if (String(r.observed_on).slice(0, 10) !== lastObserved.get(r.event_id)) continue;
    const k = `${r.event_id}|${r.zone_label}`;
    const cur = best.get(k);
    if (!cur || String(r.observed_on) >= String(cur.observed_on)) best.set(k, r);
  }
  return Array.from(best.values());
}

/** Data da observação corrente de cada evento (null quando não há linhas). */
export function currentObservationDate(rows: ZoneCapacityRow[], eventId: string): string | null {
  let out: string | null = null;
  for (const r of rows) {
    if (r.event_id !== eventId) continue;
    const d = String(r.observed_on).slice(0, 10);
    if (!out || d > out) out = d;
  }
  return out;
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
