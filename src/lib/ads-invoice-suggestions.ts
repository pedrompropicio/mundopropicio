import type { Allocation } from './ads-invoice-generation';
export interface ForecastOption { id: string; event_id: string; category_id: string; description: string; specification: string | null; amount: number; currency: string; status: string }
/** Display order is identity based, never by available budget; no automatic selection. */
export function forecastSuggestions(options: ForecastOption[], eventId: string, categoryId: string) {
  return options.filter(f => f.event_id === eventId && f.category_id === categoryId && f.status === 'approved' && f.currency === 'EUR')
    .sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export function changeDestination(a: Allocation, destination: Allocation['destination'], eventId?: string): Allocation {
  const {event_id,forecast_id,new_forecast_key,...base} = a;
  return {...base,destination,...(destination === 'event' && eventId ? {event_id:eventId} : {})};
}
