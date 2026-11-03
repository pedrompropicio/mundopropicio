import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdsInvoiceDestinationSelect, type AdsEventOption } from './AdsInvoiceDestinationSelect';
import { adsMessages as m, adsError } from '@/lib/ads-invoice-messages';
import { forecastSuggestions, type ForecastOption } from '@/lib/ads-invoice-suggestions';
import { splitSumMatches, suggestTourSplit } from '@/lib/ads-tour-split';
import { decimalFromDatabase, emptyPlan, initialAllocations, parseOperation, parsePlan, parsePreview, requireThat, validateApprovals,
  type Allocation, type InvoiceLine, type OperationReply, type PlanV1, type Preview } from '@/lib/ads-invoice-generation';

export type AdsRequest = (action:string,payload:Record<string,unknown>)=>Promise<any>;
export interface GenerationProps {
  open:boolean; onClose:()=>void; invoiceId:string; companyId:string; scope:string; revision:number; status:string;
  lines:InvoiceLine[]; plan:PlanV1|null; events:AdsEventOption[]; forecasts:ForecastOption[]; categoryId:string|null;
  canManage:boolean; canGenerate:boolean; canRaise:boolean; canCreate:boolean;
  request:AdsRequest; onChanged:()=>void|Promise<void>;
}
export function AdsInvoiceGenerationDialog(props:GenerationProps) {
  return <GenerationDialogSession key={`${props.scope}:${props.invoiceId}`} {...props}/>;
}
function GenerationDialogSession(props:GenerationProps) {
  const {invoiceId,companyId,lines,events,forecasts,categoryId}=props;
  const [plan,setPlan]=useState<PlanV1>(()=>({...props.plan ?? emptyPlan(),allocations:initialAllocations(lines,props.plan)}));
  const [rev,setRev]=useState(props.revision); const [status,setStatus]=useState(props.status);
  const [preview,setPreview]=useState<Preview|null>(null); const [operation,setOperation]=useState<OperationReply|null>(null);
  const [accepts,setAccepts]=useState<Record<string,{accepted:boolean;observation:string}>>({});
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null); const [dirty,setDirty]=useState(false);
  const [stale,setStale]=useState(false);
  const [revertNumber,setRevertNumber]=useState('');
  const [split,setSplit]=useState<{line:InvoiceLine;root:string;parts:{event_id:string;label:string;amount:string}[]}|null>(null);
  const alive=useRef(true); const latest=useRef(props.scope); latest.current=props.scope;
  const request=useRef<{signature:string;key:string}|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{ setPreview(null); setAccepts({}); setOperation(null); setError(null); request.current=null; },[props.scope]);
  const fresh=(scope:string)=>alive.current && latest.current===scope;
  async function run(work:(scope:string)=>Promise<void>) {
    if(busy) return; const scope=props.scope; setBusy(true);setError(null);
    try{await work(scope);}catch(e){if(fresh(scope)){setError(adsError(e));if(e instanceof Error&&e.message==='revision_conflict'){setStale(true);void props.onChanged();}}}finally{if(fresh(scope))setBusy(false);}
  }
  function change(next:PlanV1){setPlan(next);setDirty(true);setPreview(null);setAccepts({});request.current=null;}
  function updateAllocation(next:Allocation){
    const allocations=plan.allocations.some(a=>a.key===next.key)?plan.allocations.map(a=>a.key===next.key?next:a):[...plan.allocations,next];
    change({...plan,allocations,new_forecasts:plan.new_forecasts.filter(n=>allocations.some(a=>a.new_forecast_key===n.key)),
      budget_proposals:plan.budget_proposals.filter(b=>allocations.some(a=>a.forecast_id===b.forecast_id))});
  }
  async function loadOperation(scope:string){
    const value=parseOperation(await props.request('operation',{}),invoiceId,companyId);
    if(fresh(scope)){
      setOperation(value);
      // Reading a newer revision never authorizes writing a stale local plan over it.
      if(value.revision!==rev){setStale(true);setError(m.errors.revision_conflict);void props.onChanged();}
    }
    return value;
  }
  useEffect(()=>{if(props.open) void run(async scope=>{await loadOperation(scope);});},[props.open,props.scope]);
  const activeOperation=operation?.operation?.state==='reverted'?null:operation?.operation;
  const locked=busy || stale || !props.canManage || status!=='proposed' || !!operation?.operation && operation.operation.state!=='reverted';
  const setBp=(a:Allocation,value:string)=>{
    const {forecast_id,new_forecast_key,...base}=a;
    if(value==='create'){
      const key=`new_${crypto.randomUUID().replaceAll('-','')}`;requireThat(categoryId);
      const n={key,event_id:a.event_id!,category_id:categoryId,description:'',specification:null,currency:'EUR',amount:a.amount.startsWith('-')?'0.00':a.amount,observation:''};
      const allocations=plan.allocations.map(x=>x.key===a.key?{...base,new_forecast_key:key}:x);
      change({...plan,allocations,new_forecasts:[...plan.new_forecasts.filter(x=>allocations.some(a=>a.new_forecast_key===x.key)),n],budget_proposals:plan.budget_proposals.filter(b=>allocations.some(a=>a.forecast_id===b.forecast_id))});
    }else updateAllocation({...base,...(value.startsWith('new:')?{new_forecast_key:value.slice(4)}:value?{forecast_id:value}:{})});
  };
  const showPreview=(p:unknown)=>{setPreview(parsePreview(p,invoiceId));setAccepts({});request.current=null;};
  return <Dialog open={props.open} onOpenChange={open=>{if(!open)props.onClose();}}>
    <DialogContent className="manual-modal-shell max-w-5xl">
      <DialogHeader className="manual-modal-header"><DialogTitle>{m.title}</DialogTitle><DialogDescription>Escolha o destino de cada parcela e a finalidade no BP. Os cálculos e as permissões são revalidados pelo servidor.</DialogDescription></DialogHeader>
      <div className="min-h-0 space-y-5 overflow-y-auto pr-2">
        {lines.map(line=>{
          const allocations=plan.allocations.filter(a=>a.line_id===line.id);
          return <fieldset key={line.id} className="space-y-3 rounded border p-3"><legend className="px-1">{line.line_no}. {line.raw_description} · {decimalFromDatabase(line.amount)}</legend>
            {(allocations.length?allocations:[undefined]).map((allocation,index)=>{
              const a=allocation;const n=plan.new_forecasts.find(n=>n.key===a?.new_forecast_key);
              return <div key={a?.key ?? index} className="space-y-2 border-b pb-3 last:border-b-0">
                <AdsInvoiceDestinationSelect allocation={a} line={line} events={events} disabled={locked} onChange={next=>updateAllocation({...next,amount:decimalFromDatabase(next.amount)})}/>
                {a && <>
                  <p className="text-sm">Parcela: {a.amount} {a.event_id && events.find(e=>e.id===a.event_id)?.name}</p>
                  <label className="block text-sm">{m.observation}<Input aria-label={`${m.observation} ${a.key}`} value={a.observation} disabled={locked} onChange={e=>updateAllocation({...a,observation:e.target.value})}/></label>
                  {a.destination==='event' && a.event_id && <>
                    {!events.find(e=>e.id===a.event_id)?.parent_event_id && events.some(e=>e.parent_event_id===a.event_id) && <p className="text-xs">{m.master}</p>}
                    <label className="block text-sm">{m.bp} · Digital
                      <select aria-label={`${m.bp} ${a.key}`} disabled={locked} className="w-full rounded border bg-background p-2" value={a.forecast_id ?? (a.new_forecast_key?`new:${a.new_forecast_key}`:'')} onChange={e=>setBp(a,e.target.value)}>
                        <option value="">Escolher linha pela finalidade</option>
                        {forecastSuggestions(forecasts,a.event_id,categoryId ?? '').map(f=><option value={f.id} key={f.id}>{f.description} · {f.specification} · verba {decimalFromDatabase(f.amount)} EUR</option>)}
                        {plan.new_forecasts.filter(f=>f.event_id===a.event_id).map(f=><option key={f.key} value={`new:${f.key}`}>Nova finalidade: {f.description || 'por preencher'}</option>)}
                        {props.canCreate && categoryId && <option value="create">{m.create}</option>}
                      </select>
                    </label>
                    {a.forecast_id&&<label className="block text-sm">Nova verba proposta (EUR, opcional)
                      <Input aria-label={`Verba proposta ${a.key}`} disabled={locked||!props.canRaise} value={plan.budget_proposals.find(b=>b.forecast_id===a.forecast_id)?.new_amount ?? ''}
                        onChange={e=>change({...plan,budget_proposals:[...plan.budget_proposals.filter(b=>b.forecast_id!==a.forecast_id),...(e.target.value?[{forecast_id:a.forecast_id!,new_amount:e.target.value}]:[])]})}/>
                    </label>}
                    {n && <div className="space-y-2 rounded bg-muted p-2">{(['description','specification','amount','observation'] as const).map(field=><label className="block text-sm" key={field}>{({description:m.purpose,specification:'Especificação',amount:'Verba proposta (EUR)',observation:'Observação da criação'})[field]}
                      <Input aria-label={`${field} ${n.key}`} value={n[field] ?? ''} disabled={locked} onChange={e=>change({...plan,new_forecasts:plan.new_forecasts.map(f=>f.key===n.key?{...f,[field]:e.target.value}:f)})}/></label>)}</div>}
                  </>}
                </>}
              </div>;
            })}
            {!line.is_adjustment&&allocations.length===1&&allocations[0].destination==='event'&&events.some(e=>e.parent_event_id===allocations[0].event_id)&&<Button variant="outline" disabled={locked} onClick={()=>{
              const root=events.find(e=>e.id===allocations[0].event_id)!;
              const parts=suggestTourSplit(Number(line.amount),root,events.filter(e=>e.parent_event_id===root.id),[]).map(p=>({event_id:p.event_id,label:p.label,amount:decimalFromDatabase(p.amount)}));
              setSplit({line,root:root.id,parts});
            }}>Repartir pelo Master e cidades</Button>}
            {split?.line.id===line.id&&<div className="space-y-2 rounded border p-2"><p>{m.master}</p>{split.parts.map((p,i)=><label className="block text-sm" key={p.event_id}>{p.label}<Input aria-label={`Parcela ${p.label}`} value={p.amount} disabled={locked} onChange={e=>setSplit({...split,parts:split.parts.map((x,j)=>j===i?{...x,amount:e.target.value}:x)})}/></label>)}
              <Button variant="outline" disabled={locked} onClick={()=>setSplit(null)}>Cancelar repartição</Button>
              <Button disabled={locked} onClick={()=>void run(async scope=>{
                const parts=split.parts.map(p=>({...p,amount:decimalFromDatabase(p.amount)}));requireThat(splitSumMatches(parts.map(p=>({amount:Number(p.amount)})),Number(line.amount)));
                const saved=await props.request('save_plan',{expected_revision:rev,plan:parsePlan(plan)});if(!fresh(scope))return;
                requireThat(saved.contract_version===1&&saved.invoice_id===invoiceId);setRev(saved.revision);setPlan(parsePlan(saved.plan));setDirty(false);setPreview(null);setAccepts({});
                const kept=parts.filter(p=>Number(p.amount)!==0);
                const result=await props.request('set_split',{expected_revision:saved.revision,line_id:line.id,parts:kept.map(p=>({event_id:p.event_id,amount:p.amount,source:'manual'}))});if(!fresh(scope))return;
                requireThat(result.contract_version===1&&result.invoice_id===invoiceId);setRev(result.revision);
                const allocations:Allocation[]=[...plan.allocations.filter(a=>a.line_id!==line.id),...kept.map((p,index)=>({key:`line_${line.id.replaceAll('-','')}_${index}`,line_id:line.id,destination:'event' as const,event_id:p.event_id,amount:p.amount,observation:''}))];
                change({...plan,allocations,new_forecasts:plan.new_forecasts.filter(n=>allocations.some(a=>a.new_forecast_key===n.key)),budget_proposals:plan.budget_proposals.filter(b=>allocations.some(a=>a.forecast_id===b.forecast_id))});
                setSplit(null);props.onChanged();
              })}>Guardar plano e repartição</Button>
            </div>}
          </fieldset>;
        })}
        {preview && <section className="space-y-3" aria-label={m.preview}>
          <h3 className="font-semibold">{m.preview}</h3>
          <p>Fatura {preview.totals.invoice} {preview.currency} · Incluído {preview.totals.children} · Fora do sistema {preview.totals.outside}</p>
          {preview.children.map(c=><div key={c.key} className="rounded border p-2">{m[c.destination]} · {events.find(e=>e.id===c.event_id)?.name} · BP {c.forecast_id ?? c.new_forecast_key ?? 'sem BP'} · {c.amount}
            {c.source_line_allocations.map(a=><p key={a.key} className="text-xs">{lines.find(l=>l.id===a.line_id)?.raw_description} · {a.amount} {a.prorated?'(proporcional)':'(integral)'}</p>)}</div>)}
          {[['Linhas de BP',preview.line_budgets],['Rubricas',preview.category_budgets]].map(([label,budgets])=><div key={String(label)}><h4>{String(label)}</h4>
            {(budgets as Preview['line_budgets']).map((b,i)=><p key={i} className="text-sm">{events.find(e=>e.id===b.event_id)?.name} · {b.forecast_id ?? b.new_forecast_key ?? 'Digital'} · {m.current} {b.current} · {m.committed} {b.committed} · {m.incoming} {b.incoming} · {m.balance} {b.after}</p>)}</div>)}
          {preview.effects.map(e=>{const a=accepts[e.effect_id]??{accepted:false,observation:''};const allowed=e.kind==='raise'?props.canRaise:props.canCreate;return <fieldset key={e.effect_id} className="space-y-2 rounded border p-2"><legend>{e.kind==='raise'?'Aumento':'Criação'}: {e.description}</legend>
            <p>{e.before} → {e.after} EUR (+{e.delta})</p><label><input type="checkbox" checked={a.accepted} disabled={busy||!allowed} onChange={ev=>{request.current=null;setAccepts({...accepts,[e.effect_id]:{...a,accepted:ev.target.checked}});}}/> {m.accept} {e.description}</label>
            <Input aria-label={`Observação do efeito ${e.effect_id}`} disabled={busy||!allowed} value={a.observation} onChange={ev=>{request.current=null;setAccepts({...accepts,[e.effect_id]:{...a,observation:ev.target.value}});}}/>
            {!allowed&&<p>{m.errors.forbidden}</p>}</fieldset>;})}
          {preview.blockers.map((b,i)=><p role="alert" className="text-destructive" key={i}>{m.errors[b.code] ?? b.code}{b.reason?` (${b.reason})`:''}</p>)}
        </section>}
        {operation?.operation && <section><p>Operação {operation.operation.id}: {m.operationStates[operation.operation.state]}</p>{operation.operation.documents.map(d=><p key={d.key}>{d.name}: {m.documentStates[d.status]}{d.error_code?` · ${d.error_code}`:''}</p>)}</section>}
        {operation?.maintenance?.some(t=>t.status!=='complete')&&<p role="status">{m.maintenancePending}</p>}
        {error&&<p role="alert" className="text-destructive">{error}</p>}
        {operation?.operation?.state!=='reverted'&&operation?.operation&&<label>Escreva REVERTER para reverter os lançamentos<Input aria-label="Confirmar reversão" value={revertNumber} onChange={e=>setRevertNumber(e.target.value)}/></label>}
      </div>
      <DialogFooter className="shrink-0 flex-wrap gap-2">
        {status==='proposed'&&<Button disabled={locked} onClick={()=>void run(async scope=>{
          const valid=parsePlan(plan);const saved=await props.request('save_plan',{expected_revision:rev,plan:valid});if(!fresh(scope))return;
          requireThat(saved.contract_version===1&&saved.invoice_id===invoiceId);setPlan(parsePlan(saved.plan));setRev(saved.revision);setDirty(false);
          const p=await props.request('preview',{expected_revision:saved.revision});if(fresh(scope)){showPreview(p);props.onChanged();}
        })}>{m.save}</Button>}
        {!dirty&&!activeOperation&&<Button variant="outline" disabled={busy} onClick={()=>void run(async scope=>{const p=await props.request('preview',{expected_revision:rev});if(fresh(scope))showPreview(p);})}>Atualizar prévia</Button>}
        {preview&&!preview.blockers.length&&!activeOperation&&<Button disabled={busy||stale||dirty||!props.canGenerate} onClick={()=>void run(async scope=>{
          await props.request('confirm',{expected_revision:rev,preview_hash:preview.preview_hash});if(fresh(scope)){setStatus('confirmed');props.onChanged();}
        })}>{m.confirm}</Button>}
        {status==='confirmed'&&preview&&!preview.blockers.length&&!activeOperation&&<Button disabled={busy||stale||!props.canGenerate} onClick={()=>void run(async scope=>{
          const approvals=validateApprovals(preview.effects,preview.effects.map(e=>({effect_id:e.effect_id,...accepts[e.effect_id]})));
          const signature=JSON.stringify({revision:rev,hash:preview.preview_hash,approvals});if(request.current?.signature!==signature)request.current={signature,key:crypto.randomUUID()};
          try {const value=parseOperation(await props.request('generate',{request_key:request.current.key,expected_revision:rev,preview_hash:preview.preview_hash,approvals}),invoiceId,companyId);
            if(fresh(scope)){setOperation(value);props.onChanged();}}
          catch(e){await loadOperation(scope);throw e;}
        })}>{m.generate}</Button>}
        {status==='confirmed'&&!activeOperation&&<Button variant="outline" disabled={busy||stale||!props.canManage} onClick={()=>void run(async scope=>{const value=await props.request('reopen',{expected_revision:rev});if(fresh(scope)){setStatus('proposed');setRev(value.revision);setPreview(null);setAccepts({});props.onChanged();}})}>{m.reopen}</Button>}
        {operation?.operation&&operation.operation.state!=='reverted'&&<>
          <Button disabled={busy||stale||!props.canManage} onClick={()=>void run(async scope=>{await props.request('documents',{retry_errors:true});if(fresh(scope)){await loadOperation(scope);props.onChanged();}})}>{m.resume}</Button>
          <Button variant="destructive" disabled={busy||stale||!props.canManage||revertNumber!=='REVERTER'} onClick={()=>void run(async scope=>{const value=parseOperation(await props.request('revert',{operation_id:operation.operation!.id,expected_revision:rev}),invoiceId,companyId);if(fresh(scope)){setOperation(value);setRev(value.revision);setStatus('proposed');setPreview(null);await props.onChanged();if(fresh(scope))props.onClose();}})}>{m.revert}</Button>
        </>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
