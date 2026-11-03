import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { fetchAllPagedQuery } from '@/lib/supabase-paging';
import { invalidateEventFinancials } from '@/lib/invalidate-event-financials';

import { AdsInvoiceImportDialog } from '@/components/ads/AdsInvoiceImportDialog';
import { AdsInvoiceGenerationDialog } from '@/components/ads/AdsInvoiceGenerationDialog';
import { AdsTourSplitDialog } from '@/components/ads/AdsTourSplitDialog';
import { adsError, adsMessages as m, formatAdsMoney } from '@/lib/ads-invoice-messages';
import { AdsContractError, parsePlan, type InvoiceLine } from '@/lib/ads-invoice-generation';
import type { ForecastOption } from '@/lib/ads-invoice-suggestions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const platforms:Record<string,string>={meta:'Meta',google:'Google',tiktok:'TikTok'};
const statuses:Record<string,string>={proposed:'Proposta',confirmed:'Confirmada',applied:'Aplicada',cancelled:'Cancelada'};
const periodLabel=(date:string)=>`${date.slice(5,7)}/${date.slice(0,4)}`;
export default function AdsInvoices() {
  const {user,role,loading,permissions,hasPermission}=useAuth(); const {companyId}=useCompany(); const qc=useQueryClient();
  const allowed=!!user&&!loading&&['admin','manager','editor','accountant','platform_admin'].includes(role ?? '');
  const scope=JSON.stringify([companyId,user?.id,role,loading,[...permissions].sort()]); const scopeRef=useRef(scope);scopeRef.current=scope;
  const [openId,setOpenId]=useState<string|null>(null);const [generation,setGeneration]=useState(false);const [splitLine,setSplitLine]=useState<InvoiceLine|null>(null);
  useEffect(()=>{setOpenId(null);setGeneration(false);setSplitLine(null);},[scope]);
  const invalidate=async()=>{await qc.invalidateQueries({predicate:q=>typeof q.queryKey[0]==='string'&&q.queryKey[0].startsWith('ads-invoice')});invalidateEventFinancials(qc);};
  const {data:invoices=[],isLoading,error}=useQuery({queryKey:['ads-invoices',scope],enabled:allowed&&!!companyId,queryFn:async()=>{
    const {data,error}=await fetchAllPagedQuery(supabase.from('ads_invoice').select('*').eq('company_id',companyId!).order('billing_period',{ascending:false}).order('id'));
    if(error)throw error;return data ?? [];
  }});
  const invoice=invoices.find(i=>i.id===openId&&i.company_id===companyId);
  const {data:counts=[]}=useQuery({queryKey:['ads-invoice-pending-counts',scope,invoices.map(i=>i.id)],enabled:allowed&&invoices.length>0,queryFn:async()=>{
    // This set-returning RPC also has PostgREST's row limit: keep each batch bounded.
    const rows:{invoice_id:string;total_lines:number;pending_lines:number}[]=[];
    for(let start=0;start<invoices.length;start+=200){const {data,error}=await supabase.rpc('ads_invoice_pending_counts',{p_invoice_ids:invoices.slice(start,start+200).map(i=>i.id)});if(error)throw error;rows.push(...data ?? []);}
    return rows;
  }});
  const {data:lines=[],error:lineError,isLoading:linesLoading}=useQuery({queryKey:['ads-invoice-detail',scope,openId],enabled:allowed&&!!invoice,queryFn:async()=>{
    const {data,error}=await fetchAllPagedQuery(supabase.from('ads_invoice_line').select('*').eq('invoice_id',invoice!.id).eq('company_id',companyId!).order('line_no').order('id'));
    if(error)throw error;return (data ?? []) as unknown as InvoiceLine[];
  }});
  const {data:events=[],error:eventError}=useQuery({queryKey:['ads-invoice-events',scope],enabled:allowed&&!!invoice,queryFn:async()=>{
    const {data,error}=await fetchAllPagedQuery(supabase.from('events').select('id,name,parent_event_id').eq('company_id',companyId!).order('name').order('id'));if(error)throw error;return data ?? [];
  }});
  const {data:category,error:categoryError}=useQuery({queryKey:['ads-invoice-category',scope],enabled:allowed&&!!invoice,queryFn:async()=>{
    const {data,error}=await supabase.from('account_categories').select('id').eq('company_id',companyId!).eq('code','3.2.01').eq('type','expense').maybeSingle();if(error)throw error;return data;
  }});
  const {data:forecasts=[],error:forecastError}=useQuery({queryKey:['ads-invoice-forecasts',scope,category?.id],enabled:allowed&&!!invoice&&!!category,queryFn:async()=>{
    const {data,error}=await fetchAllPagedQuery(supabase.from('event_forecasts').select('id,event_id,category_id,description,specification,amount,currency,status').eq('company_id',companyId!).eq('category_id',category!.id)
      .eq('type','expense').eq('status','approved').is('version_id',null).eq('is_transitory',false).eq('exclude_from_result',false).eq('is_overhead',false).order('id'));if(error)throw error;return (data ?? []) as ForecastOption[];
  }});
  const {data:transactions=[],error:transactionError}=useQuery({queryKey:['ads-invoice-transactions',scope,invoice?.parent_transaction_id],enabled:allowed&&!!invoice?.parent_transaction_id,queryFn:async()=>{
    const parent=invoice!.parent_transaction_id!; const {data,error}=await fetchAllPagedQuery(supabase.from('transactions').select('id,event_id,amount,currency,parent_transaction_id').eq('company_id',companyId!).or(`id.eq.${parent},parent_transaction_id.eq.${parent}`).order('id'));if(error)throw error;return data ?? [];
  }});
  async function callApply(action:string,payload:Record<string,unknown>) {
    const selectedScope=scope;const {data,error}=await supabase.functions.invoke('ads-invoice-apply',{body:{action,invoice_id:invoice!.id,payload}});
    if(scopeRef.current!==selectedScope)throw new AdsContractError('forbidden');
    if(error){let body:any;try{body=await error.context?.json();}catch{/* network error retains uncertainty */}throw new AdsContractError(body?.error ?? error.message,body?.details);}
    if(data?.error)throw new AdsContractError(data.error,data.details);return data;
  }
  if(!allowed)return <p className="p-6">{loading?'A carregar…':m.errors.forbidden}</p>;
  if(invoice){
    const queryError=lineError??eventError??categoryError??forecastError??transactionError;
    return <div className="space-y-5 p-6">
      <Button variant="outline" onClick={()=>{setOpenId(null);setGeneration(false);}}>Voltar</Button>
      <h1 className="text-2xl font-semibold">{platforms[invoice.platform]} · {invoice.invoice_number}</h1>
      <p>{statuses[invoice.status]} · {formatAdsMoney(invoice.total_amount,invoice.currency)} · {periodLabel(invoice.billing_period)}</p>
      {queryError&&<p role="alert">{adsError(queryError)}</p>}
      {!invoice.generation_contract_version&&!invoice.source_attestation&&<p>{m.historical}</p>}
      <Button disabled={linesLoading||!!queryError||!category} onClick={()=>setGeneration(true)}>{m.title}</Button>
      <Table><TableHeader><TableRow><TableHead>Linha</TableHead><TableHead>Descrição</TableHead><TableHead>Associação histórica</TableHead><TableHead>Valor</TableHead><TableHead/></TableRow></TableHeader>
        <TableBody>{lines.map(l=><TableRow key={l.id}><TableCell>{l.line_no}</TableCell><TableCell>{l.raw_description}</TableCell><TableCell>{events.find(e=>e.id===l.event_id)?.name ?? l.match_source}{l.event_split?.map(p=><p key={p.event_id}>{events.find(e=>e.id===p.event_id)?.name} · {p.amount}</p>)}</TableCell><TableCell>{l.amount}</TableCell>
          <TableCell>{invoice.status==='proposed'&&invoice.generation_contract_version===1&&!l.is_adjustment&&l.event_id&&events.some(e=>e.parent_event_id===l.event_id)&&<Button variant="outline" onClick={()=>setSplitLine(l)}>Repartir pela turnê</Button>}</TableCell></TableRow>)}</TableBody></Table>
      {!!transactions.length&&<Card><CardContent className="space-y-2 pt-4"><h2>Lançamentos gerados</h2>{transactions.map(t=><p key={t.id}>{t.id} · {t.parent_transaction_id?'Parcela':'Fatura original'} · {events.find(e=>e.id===t.event_id)?.name} · {t.amount} {t.currency}</p>)}</CardContent></Card>}
      {generation&&<AdsInvoiceGenerationDialog key={`${scope}:${invoice.id}`} open onClose={()=>setGeneration(false)} invoiceId={invoice.id} companyId={companyId!} scope={scope} revision={invoice.generation_revision} status={invoice.status}
        lines={lines} plan={invoice.generation_plan?parsePlan(invoice.generation_plan):null} events={events} forecasts={forecasts} categoryId={category?.id ?? null}
        canManage={hasPermission('manage_transactions')} canGenerate={hasPermission('manage_transactions')&&hasPermission('approve_transactions')} canRaise={hasPermission('raise_budget')}
        canCreate={hasPermission('manage_bp')&&['admin','manager','platform_admin'].includes(role ?? '')} request={callApply} onChanged={invalidate}/>}
      <AdsTourSplitDialog lineId={splitLine?.id ?? null} amount={Number(splitLine?.amount ?? 0)} hasSplit={!!splitLine?.event_split?.length} invoiceId={invoice.id} expectedRevision={invoice.generation_revision}
        scope={scope} onClose={()=>setSplitLine(null)} onSaved={invalidate}/>
    </div>;
  }
  return <div className="space-y-5 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Faturas Ads</h1><AdsInvoiceImportDialog companyId={companyId}/></div>
    {error&&<p role="alert">{adsError(error)}</p>}
    <Table><TableHeader><TableRow><TableHead>Plataforma</TableHead><TableHead>Número</TableHead><TableHead>Período</TableHead><TableHead>Total</TableHead><TableHead>Por resolver</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
      <TableBody>{invoices.map(i=><TableRow key={i.id}><TableCell>{platforms[i.platform]}</TableCell><TableCell><Button variant="link" onClick={()=>setOpenId(i.id)}>{i.invoice_number}</Button></TableCell><TableCell>{periodLabel(i.billing_period)}</TableCell><TableCell>{formatAdsMoney(i.total_amount,i.currency)}</TableCell><TableCell>{counts.find(c=>c.invoice_id===i.id)?.pending_lines ?? '—'}</TableCell><TableCell>{statuses[i.status]}</TableCell></TableRow>)}</TableBody></Table>
    {isLoading&&<p>A carregar…</p>}
  </div>;
}
