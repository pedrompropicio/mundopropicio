import type { Allocation, InvoiceLine } from '@/lib/ads-invoice-generation';
import { adsMessages as m } from '@/lib/ads-invoice-messages';
import { changeDestination } from '@/lib/ads-invoice-suggestions';
export interface AdsEventOption { id: string; name: string; parent_event_id: string | null }
export function AdsInvoiceDestinationSelect({allocation,line,events,disabled,onChange}:{allocation:Allocation | undefined;line:InvoiceLine;events:AdsEventOption[];disabled:boolean;onChange:(a:Allocation)=>void}) {
  const base = allocation ?? {key:`line_${line.id.replaceAll('-','')}_0`,line_id:line.id,amount:String(line.amount),observation:''} as Allocation;
  const career = line.match_source === 'carreira';
  return <div className="space-y-2">
    <label className="block text-sm">{m.destination}
      <select aria-label={`${m.destination} ${line.line_no} ${allocation?.key ?? ''}`} className="w-full rounded border bg-background p-2" disabled={disabled}
        value={allocation?.destination ?? ''} onChange={e=>onChange(changeDestination(base,e.target.value as Allocation['destination']))}>
        <option value="" disabled>{m.unresolved}</option>
        {!career && <><option value="event">{m.event}</option><option value="company">{m.company}</option></>}
        <option value="outside">{m.outside}</option>
        {career && <option value="carreira">{m.carreira}</option>}
        {line.is_adjustment && !line.campaign_name && !line.external_campaign_id && !line.event_id && !line.event_split && <option value="prorate">{m.prorate}</option>}
      </select>
    </label>
    {allocation?.destination === 'event' && <label className="block text-sm">{m.event}
      <select aria-label={`${m.event} ${allocation.key}`} className="w-full rounded border bg-background p-2" disabled={disabled} value={allocation.event_id ?? ''}
        onChange={e=>onChange(changeDestination(base,'event',e.target.value))}>
        <option value="" disabled>Escolher evento</option>
        {events.map(e=><option value={e.id} key={e.id}>{e.parent_event_id ? '↳ ' : ''}{e.name}</option>)}
      </select>
    </label>}
    {allocation?.destination === 'company' && <p className="text-xs text-muted-foreground">{m.companyHelp}</p>}
    {allocation?.destination === 'outside' && <p className="text-xs text-muted-foreground">{m.outsideHelp}</p>}
  </div>;
}
