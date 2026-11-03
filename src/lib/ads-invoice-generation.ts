export * from '../../supabase/functions/_shared/ads-invoice-generation';
import type { Allocation, PlanV1 } from './ads-invoice-generation';
import { decimalFromDatabase } from './ads-invoice-generation';
export interface InvoiceLine {
  id: string; line_no: number; raw_description: string; amount: number | string; is_adjustment: boolean;
  campaign_name: string | null; event_id: string | null; match_source: string; match_note: string | null;
  external_campaign_id?: string | null; event_split: {event_id: string; amount: number | string}[] | null;
}
/** Migration suggestions are deliberately incomplete: the human still chooses each BP. */
export function initialAllocations(lines: InvoiceLine[], persisted: PlanV1 | null): Allocation[] {
  if (persisted) return structuredClone(persisted.allocations);
  return lines.filter(l => (l.event_id && l.match_source !== 'none') || l.event_split?.length || ['fora_sistema','carreira'].includes(l.match_source) || (l.is_adjustment && !l.campaign_name && !l.external_campaign_id && !l.event_id && !l.event_split)).flatMap(l => {
    const parts = l.event_split?.length ? l.event_split : [{event_id:l.event_id,amount:l.amount}];
    return parts.map((p,index) => ({key:`line_${l.id.replaceAll('-','')}_${index}`,line_id:l.id,amount:decimalFromDatabase(p.amount),
      observation:l.match_note ?? '',destination:l.match_source === 'fora_sistema' ? 'outside' : l.match_source === 'carreira' ? 'carreira' : p.event_id ? 'event' : l.is_adjustment && !l.campaign_name ? 'prorate' : 'company',
      ...(p.event_id && l.match_source !== 'fora_sistema' && l.match_source !== 'carreira' ? {event_id:p.event_id} : {})
    } as Allocation));
  });
}
/** No default company decision for unresolved media/fees; the UI requires explicit review. */
export const emptyPlan = (): PlanV1 => ({version:1,allocations:[],new_forecasts:[],budget_proposals:[]});
