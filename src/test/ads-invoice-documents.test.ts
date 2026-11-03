import { beforeAll,describe,expect,it,vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { buildInvoiceProof,consumeMaintenance,resumeDocuments,type DocumentPort,type MaintenancePort } from '../../supabase/functions/_shared/ads-invoice-documents';
import { sha256 } from '../../supabase/functions/_shared/ads-invoice-source';
import type { MaintenanceTask,Operation } from '../../supabase/functions/_shared/ads-invoice-generation';
const id=(n:number)=>`48600000-0000-0000-0000-${String(n).padStart(12,'0')}`;
beforeAll(()=>vi.stubGlobal('crypto',webcrypto));
async function fixture(){
  const bytes=new TextEncoder().encode('%PDF-synthetic-original');const digest=await sha256(bytes);
  const task=(key:string,tx:string,accounting:boolean)=>({key,transaction_id:tx,bucket:'transaction-documents',path:`${id(1)}/ads-invoices/operations/${id(2)}/${key.replace(':','-')}.pdf`,name:key,doc_type:accounting?'fatura':'comprovativo_veiculacao',is_accounting:accounting,status:'pending' as const,document_id:null,error_code:null});
  const operation={id:id(2),invoice_id:id(3),company_id:id(1),state:'financial_committed',documents:[task('original',id(4),true),task('proof:child',id(5),false)],
    result_snapshot:{parent:{id:id(4),amount:'15.00'},source:{bucket:'ads-invoices',path:`${id(1)}/source.pdf`,sha256:digest},children:[{key:'child',transaction_id:id(5),destination:'company',event_id:null,forecast_id:null,new_forecast_key:null,amount:'15.00',source_line_allocations:[{key:'fee',line_id:id(6),amount:'20.00',prorated:false},{key:'adjustment',line_id:id(7),amount:'-5.00',prorated:false}]}]}} as unknown as Operation;
  const objects=new Map<string,Uint8Array>([[`ads-invoices:${id(1)}/source.pdf`,bytes]]);
  const upload=vi.fn(async(bucket:string,path:string,b:Uint8Array)=>{if(objects.has(`${bucket}:${path}`))throw new Error('already exists');objects.set(`${bucket}:${path}`,b);});
  const complete=vi.fn(async(_op:string,key:string,p:any)=>{const t=operation.documents.find(d=>d.key===key)!;if(t.status==='complete'&&p.status==='complete')return {task:t};Object.assign(t,{status:p.status,sha256:p.sha256,error_code:p.error_code??null,document_id:p.status==='complete'?id(key==='original'?8:9):null});return {task:t};});
  const port:DocumentPort={current:async()=>operation,descriptions:async()=>({[id(6)]:'Synthetic positive fee',[id(7)]:'Synthetic negative adjustment'}),storage:bucket=>({download:async path=>objects.get(`${bucket}:${path}`)??null,upload:(p,b)=>upload(bucket,p,b)}),complete};
  return {operation,objects,port,upload,complete,bytes};
}
describe('#486 byte-safe document adapter',()=>{
  it('copies only original to mother and renders all signed child parcels deterministically',async()=>{
    const {operation,port,objects,upload,bytes}=await fixture();expect(await resumeDocuments(port,operation)).toEqual({pending:false});expect(upload).toHaveBeenCalledTimes(2);
    expect(objects.get(`transaction-documents:${operation.documents[0].path}`)).toEqual(bytes);
    const proof=objects.get(`transaction-documents:${operation.documents[1].path}`)!;const text=new TextDecoder().decode(proof);expect(text).toContain('Synthetic positive fee');expect(text).toContain('Synthetic negative adjustment');expect(text).toContain('-5.00 EUR');
    expect(buildInvoiceProof(operation,operation.documents[1],{[id(6)]:'Synthetic positive fee',[id(7)]:'Synthetic negative adjustment'})).toEqual(proof);
    expect(operation.documents.map(d=>[d.transaction_id,d.is_accounting])).toEqual([[id(4),true],[id(5),false]]);
    await resumeDocuments(port,operation);expect(upload).toHaveBeenCalledTimes(2);expect(operation.documents.map(d=>d.document_id)).toEqual([id(8),id(9)]);
  });
  it('rejects divergent archived bytes before original callback',async()=>{
    const {operation,port,objects,complete}=await fixture();objects.set(`ads-invoices:${id(1)}/source.pdf`,new Uint8Array([1,2,3]));
    expect(await resumeDocuments(port,operation)).toEqual({pending:true,error_code:'document_digest_mismatch'});expect(complete).toHaveBeenCalledWith(id(2),'original',expect.objectContaining({status:'error',error_code:'document_digest_mismatch'}));expect(operation.documents[1].status).toBe('pending');
  });
  it('verifies upload by digest readback, not successful upload or local size',async()=>{
    const {operation,port,objects}=await fixture();const wrapped={...port,storage:(bucket:string)=>({...port.storage(bucket),upload:async(path:string,b:Uint8Array)=>{objects.set(`${bucket}:${path}`,new Uint8Array(b.length));}})};
    expect(await resumeDocuments(wrapped,operation)).toEqual({pending:true,error_code:'document_digest_mismatch'});
  });
  it('recovers a callback committed before its response was lost, retaining the document IDs',async()=>{
    const {operation,port,complete,upload}=await fixture();let once=true;
    const wrapped={...port,complete:async(...args:Parameters<DocumentPort['complete']>)=>{const result=await complete(...args);if(once){once=false;throw new Error('lost callback response');}return result;}};
    expect(await resumeDocuments(wrapped,operation)).toEqual({pending:false});await resumeDocuments(port,operation);expect(upload).toHaveBeenCalledTimes(2);expect(operation.documents[0].document_id).toBe(id(8));
  });
  it('requires explicit retry after a recorded IO failure',async()=>{
    const {operation,port,upload}=await fixture();const wrapped={...port,storage:(bucket:string)=>({...port.storage(bucket),upload:async()=>{throw new Error('Storage down');}})};
    expect(await resumeDocuments(wrapped,operation)).toEqual({pending:true,error_code:'document_io_failed'});await resumeDocuments(port,operation);expect(upload).not.toHaveBeenCalled();await resumeDocuments(port,operation,true);expect(upload).toHaveBeenCalledTimes(2);
  });
  it('concurrent document consumers keep stable paths and IDs without overwrites or financial calls',async()=>{
    const {operation,port,objects}=await fixture();await Promise.all([resumeDocuments(port,operation),resumeDocuments(port,operation)]);expect(objects.size).toBe(3);expect(operation.documents.map(d=>d.document_id)).toEqual([id(8),id(9)]);expect(operation.result_snapshot.parent.id).toBe(id(4));
  });
  it('stops on reverted operations and missing original descriptions',async()=>{
    const {operation,port,complete}=await fixture();await expect(resumeDocuments(port,{...operation,state:'reverted'})).rejects.toThrow('revert_blocked');expect(complete).not.toHaveBeenCalled();expect(()=>buildInvoiceProof(operation,operation.documents[1],{})).toThrow('source_attestation_invalid');
  });
});
describe('#486 serial maintenance contract, synthetic durable claim only',()=>{
  function harness(){
    let head:MaintenanceTask|null={task_id:id(10),company_id:id(1),invoice_id:id(3),action:'lock_campaigns',revision:1,generation_cycle:0,operation_id:null,resources:{},status:'pending',attempt:1,error_code:null};let claimed=false;const effects=new Set<string>();
    const port:MaintenancePort={head:async()=>head,claim:vi.fn(async()=>{if(claimed)return false;claimed=true;return true;}),verify:vi.fn(async(_t,key)=>effects.has(key)),effect:vi.fn(async(_t,key)=>{effects.add(key);}),ack:vi.fn(async(_t,status,error)=>{if(status==='complete')head=null;else head={...head!,status:'error',error_code:error};})};
    return {port,effects,setHead:(t:MaintenanceTask)=>{head=t;}};
  }
  it('only one of two consumers gets the same synthetic durable claim',async()=>{
    const {port}=harness();const outcomes=await Promise.all([consumeMaintenance(port),consumeMaintenance(port)]);expect(port.effect).toHaveBeenCalledTimes(1);expect(outcomes).toContainEqual({pending:true,error_code:'maintenance_busy'});expect(port.ack).toHaveBeenCalledTimes(1);
  });
  it('ack failure preserves the receipt and never automatically releases a durable claim',async()=>{
    const {port,effects}=harness();port.ack=vi.fn(async()=>{throw new Error('ack lost');});await expect(consumeMaintenance(port)).rejects.toThrow('ack lost');expect(effects.size).toBe(1);expect(await consumeMaintenance(port)).toEqual({pending:true,error_code:'maintenance_busy'});expect(port.effect).toHaveBeenCalledTimes(1);
  });
  it('does not execute error heads until an explicit server retry',async()=>{
    const {port,setHead}=harness();setHead({task_id:id(10),company_id:id(1),invoice_id:id(3),action:'revert_cleanup',revision:1,generation_cycle:0,operation_id:id(2),resources:{},status:'error',attempt:1,error_code:'storage_failed'});
    expect(await consumeMaintenance(port)).toEqual({pending:true,error_code:'storage_failed'});expect(port.claim).not.toHaveBeenCalled();expect(port.effect).not.toHaveBeenCalled();
  });
});
