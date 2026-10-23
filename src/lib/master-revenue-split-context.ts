/**
 * #339 B — leitura da receita repartida do Master no ERP. Delega no leitor
 * PARTILHADO (`_shared/settlement/master-revenue-load.ts`, o mesmo da edge
 * `partner-statement`) e injecta o previsto corrente da bilheteira.
 */
import { supabase } from "@/integrations/supabase/client";
import { computeLiveTicketForecast } from "@/lib/event-simulator-forecast-live";
import {
  loadMasterRevenueSplit,
  loadMasterRevenueSlicesFor,
  emptyMasterRevenueSplit,
  type MasterRevenueSplit,
} from "@shared/settlement/master-revenue-load.ts";

export { emptyMasterRevenueSplit, type MasterRevenueSplit };

const ticketForecastNet = async (id: string) => (await computeLiveTicketForecast(id))?.net ?? null;

export function fetchMasterRevenueSplit(masterIds: string[]): Promise<MasterRevenueSplit> {
  return loadMasterRevenueSplit(supabase, masterIds, { ticketForecastNet });
}

export function fetchMasterRevenueSlicesFor(perimeter: Array<{ id: string; parent_event_id?: string | null }>) {
  return loadMasterRevenueSlicesFor(supabase, perimeter, { ticketForecastNet });
}
