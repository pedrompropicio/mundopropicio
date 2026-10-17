import React from 'react';
import { pdfFixture } from '../../../../src/test/fixtures/documents333';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import Scanner from '../../../../src/pages/StandaloneInvoiceScanner';
import {AccountantStandaloneInvoicesTab as Editor} from '../../../../src/pages/contabilidade/AccountantStandaloneInvoicesTab';
import {lookupStandalone} from '../../../../src/lib/standalone-identity-lookup';
import {createAttemptHandler} from '../../../../supabase/functions/standalone-attempt-333/handler';
import {File as NodeFile,Blob as NodeBlob} from 'node:buffer';
import {webcrypto,randomUUID} from 'node:crypto';
const f=vi.hoisted(()=>({rows:[] as any[],mode:'',inserts:0,updates:0,uploads:0,role:'admin',filters:[] as any[],toast:vi.fn(),attempts:new Map<string,any>(),objects:new Map<string,Uint8Array>(),context:'C',user:'U'}));
const ID='11111111-1111-4111-8111-111111111111';
const H='a'.repeat(64);
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:f.user},isAdmin:f.role==='admin',isAccountant:f.role==='accountant'})}));
vi.mock('@/hooks/useCompany',()=>({useCompany:()=>({companyId:f.context})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:f.toast})}));
vi.mock('@/lib/invoice-ocr-prepare',()=>({prepareFileForInvoiceOcr:async()=>({ok:false})}));
vi.mock('@/lib/currency',()=>({fetchSuggestedFxRateDetails:()=>{throw Error('BCE forbidden')}}));
vi.mock('@/lib/storage',()=>({uploadToCompanyBucket:async()=>{f.uploads++;return {path:'C/private/f.pdf',error:null}},removeFromCompanyBucket:()=>{throw Error('removal forbidden')},signedCompanyUrl:vi.fn(),downloadFromCompanyBucket:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'fixture',user:{id:f.user}}}})},rpc:async()=>({data:{company_id:f.context},error:null}),storage:{from:()=>({download:async()=>({data:new NodeBlob([pdfFixture()],{type:'application/pdf'}),error:null})})},from:(table:string)=>{
 let filter:any[]=[];let after='',limit=200,op='read';
 const q:any={select:()=>q,eq:(k:string,v:any)=>{filter.push([k,v]);return q},gt:(_:string,v:string)=>{after=v;return q},gte:()=>q,lt:()=>q,in:()=>q,order:()=>q,limit:(n:number)=>{limit=n;return q},insert:()=>{f.inserts++;op='insert';return q},update:()=>{f.updates++;op='update';return q},then:(ok:any,bad:any)=>{
 f.filters.push({table,filter,after,op});let data=table==='standalone_invoices'?f.rows.filter(r=>filter.every(([k,v])=>r[k]===v)&&r.id>after).slice(0,limit):[];
 if(op==='insert'||op==='update')return Promise.resolve({data:null,error:f.mode==='lost'?{code:'NETWORK'}:f.mode==='23505'?{code:'23505'}:null}).then(ok,bad);
 return Promise.resolve({data,error:null}).then(ok,bad);
 }};return q;},functions:{invoke:async(name:string,args:any)=>{if(name!=='standalone-attempt-333')throw Error('OCR forbidden');const response=await handler(new Request('http://fixture/',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json',...args.headers},body:JSON.stringify(args.body)}));return {data:await response.json(),error:response.ok?null:{message:'pending'}}}}}}));
const handler=createAttemptHandler({user:async()=>({id:f.user}),context:async()=>({company_id:f.context}),cors:{},list:async(_,operation,after)=>({items:Array.from(f.attempts.values()).filter(a=>a.owner===f.user&&a.company===f.context&&a.operation===operation&&(!after||a.id>after)).map(a=>({id:a.id,hash:a.hash,state:a.state,name:'f.pdf',reference:null,created_at:'2026-10-17T19:20:00Z'})),next:null}),transport:(_,operation)=>({
 rpc:async(action,id,envelope,hash)=>{
  if(action==='prepare'){
   const existing=Array.from(f.attempts.values()).find(a=>JSON.stringify(a.envelope)===JSON.stringify(envelope)&&a.owner===f.user&&a.company===f.context&&a.operation===operation);
   if(existing)return existing;
   const value={id:id??randomUUID(),hash:H,state:'prepare',path:f.context+'/attempt/'+randomUUID(),result:null,current:null,record_ok:false,document:envelope?.document,envelope,owner:f.user,company:f.context,operation};f.attempts.set(value.id,value);return value;
  }
  const a=f.attempts.get(id??'');if(!a||a.hash!==hash||a.owner!==f.user||a.company!==f.context)throw Error('context denied');
  if(action==='authorize'&&a.state==='prepare')a.state='authorized';
  if(action==='begin'&&a.state==='authorized')a.state='inprogress';
  if(action==='commit'&&a.state!=='completed'){
   if(f.mode==='23505')throw Error('23505');
   if(operation==='scanner_create')f.inserts++;else f.updates++;
   a.result={...a.envelope.payload,id:randomUUID(),storage_path:a.path,status:'new'};a.current=a.result;a.record_ok=true;a.state='completed';
   if(f.mode==='lost'){a.state='inprogress';a.record_ok=false;throw Error('lost response')}
  }
  return {...a};
 },upload:async(p,b)=>{f.uploads++;f.objects.set(p,b)},read:async p=>f.objects.get(p)??null,verifyReceipt:async(p,b)=>{if(!f.objects.has(p))throw Error('missing')}
})});
function mount(el:React.ReactNode){const qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});return render(<MemoryRouter><QueryClientProvider client={qc}>{el}</QueryClientProvider></MemoryRouter>)}
beforeEach(()=>{cleanup();sessionStorage.clear();f.rows=[];f.mode='';f.inserts=0;f.updates=0;f.uploads=0;f.role='admin';f.filters=[];f.attempts.clear();f.objects.clear();f.context='C';f.user='U';f.toast.mockClear();vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('File',NodeFile);vi.stubGlobal('fetch',()=>{throw Error('egress forbidden')})});
async function capture(){const r=mount(<Scanner/>);const input=r.container.querySelector('input[type=file]');if(!input)throw Error('missing file input');fireEvent.change(input,{target:{files:[new File([pdfFixture('UI fictitious invoice')],'f.pdf',{type:'application/pdf'})]}});await screen.findByLabelText('Total (EUR)');fireEvent.change(screen.getByLabelText('Total (EUR)'),{target:{value:'123'}});return r;}
const row=()=>({id:'0001',company_id:'C',storage_path:'C/f.pdf',file_name:'f.pdf',supplier_name:'Fixture',supplier_nif:'PT001',invoice_number:'FT1/23',invoice_date:'2026-10-17',currency:'EUR',original_amount:null,fx_rate:null,fx_rate_source:null,paid_by_partner_id:null,total_amount:123,iva_amount:23,notes:null,status:'new',created_by:'U',created_at:'2026-10-17T00:00:00Z'});
describe('real patched scanner/editor + fake client; not RLS acceptance',()=>{
 it('scanner incomplete key lost response locks save; persistent query still works after local storage cleared',async()=>{f.mode='lost';await capture();fireEvent.click(screen.getByRole('button',{name:'Guardar fatura'}));await waitFor(()=>expect(f.inserts).toBe(1));await waitFor(()=>expect(screen.getByRole('button',{name:'Guardar fatura'})).toBeDisabled());sessionStorage.clear();fireEvent.click(screen.getByRole('button',{name:'Consultar tentativa'}));await waitFor(()=>expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({title:'Conferência pendente'})));expect(f.inserts).toBe(1);expect(f.uploads).toBe(1);expect(f.attempts.size).toBe(1)});
 it('scanner 23505 never false success and preserves object',async()=>{f.mode='23505';await capture();fireEvent.click(screen.getByRole('button',{name:'Guardar fatura'}));await waitFor(()=>expect(f.uploads).toBe(1));await waitFor(()=>expect(screen.getByRole('button',{name:'Guardar fatura'})).toBeDisabled());expect(f.toast).not.toHaveBeenCalledWith(expect.objectContaining({title:'Fatura guardada'}));expect(f.inserts).toBe(0)});
 it('scanner strong duplicate blocks before upload',async()=>{f.rows=[row()];await capture();fireEvent.change(screen.getByLabelText('NIF'),{target:{value:'pt001'}});fireEvent.change(screen.getByLabelText('Nº fatura'),{target:{value:' ft1/23 '}});fireEvent.click(screen.getByRole('button',{name:'Guardar fatura'}));await waitFor(()=>expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({title:'Fatura duplicada'})));expect(f.inserts).toBe(0);expect(f.uploads).toBe(0)});
 it('scanner distinct punctuation inserts with company and user unchanged',async()=>{f.rows=[row()];await capture();fireEvent.change(screen.getByLabelText('NIF'),{target:{value:'PT001'}});fireEvent.change(screen.getByLabelText('Nº fatura'),{target:{value:'FT12/3'}});fireEvent.click(screen.getByRole('button',{name:'Guardar fatura'}));await waitFor(()=>expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({title:'Fatura guardada'})));expect(f.inserts).toBe(1);expect(f.filters.some(q=>q.filter.some(([k,v]:any)=>k==='company_id'&&v==='C'))).toBe(true)});
 it('readonly lookup paginates and excludes own ID; never writes',async()=>{f.rows=Array.from({length:201},(_,i)=>({...row(),id:String(i).padStart(4,'0'),invoice_number:i===200?' FT1/23 ':'X'+i}));const {supabase}=await import('@/integrations/supabase/client');expect(await lookupStandalone(supabase,{company_id:'C',supplier_nif:'pt001',invoice_number:'ft1/23'},'0200')).toBe(false);expect(await lookupStandalone(supabase,{company_id:'C',supplier_nif:'pt001',invoice_number:'ft1/23'})).toBe(true);expect(f.filters.some(q=>q.after==='0199')).toBe(true);expect(f.inserts+f.updates).toBe(0)});
 it('editor own-ID exclusion allows update; lost response blocks repeat and keeps candidate',async()=>{f.rows=[row()];f.mode='lost';mount(<Editor/>);fireEvent.click(await screen.findByRole('button',{name:'Editar'}));fireEvent.click(screen.getByRole('button',{name:'Guardar',exact:true}));await waitFor(()=>expect(f.updates).toBe(1));await waitFor(()=>expect(screen.getByRole('button',{name:'Guardar',exact:true})).toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'Guardar',exact:true}));expect(f.updates).toBe(1);expect(f.objects.size).toBe(1)});
 it('viewer cannot edit another authors invoice; existing UI permission preserved',async()=>{f.role='viewer';f.rows=[{...row(),created_by:'other'}];mount(<Editor/>);await screen.findByText('Fixture');expect(screen.queryByRole('button',{name:'Editar'})).toBeNull();expect(f.updates).toBe(0)});
 it('editor 23505 is not a success and cannot repeat UPDATE',async()=>{f.rows=[row()];f.mode='23505';mount(<Editor/>);fireEvent.click(await screen.findByRole('button',{name:'Editar'}));fireEvent.click(screen.getByRole('button',{name:'Guardar',exact:true}));await waitFor(()=>expect(f.uploads).toBe(1));await waitFor(()=>expect(screen.getByRole('button',{name:'Guardar',exact:true})).toBeDisabled());expect(f.toast).not.toHaveBeenCalledWith(expect.objectContaining({title:'Fatura atualizada'}));expect(f.updates).toBe(0)});
 it('readonly lookup does not match another company',async()=>{f.rows=[{...row(),company_id:'OTHER'}];const {supabase}=await import('@/integrations/supabase/client');expect(await lookupStandalone(supabase,{company_id:'C',supplier_nif:'PT001',invoice_number:'FT1/23'})).toBe(false);expect(f.inserts+f.updates).toBe(0)});
 it('new tab can resume completed attempt by owner discovery without any sessionStorage',async()=>{const a={id:ID,hash:H,state:'completed',path:'C/saved',result:{id:'invoice'},current:{id:'invoice'},record_ok:true,document:{sha256:await import('../../../../supabase/functions/_shared/standalone-attempt').then(m=>m.documentHash(pdfFixture())),size_bytes:pdfFixture().length,mime:'application/pdf'},owner:'U',company:'C',operation:'scanner_create'};f.attempts.set(ID,a);f.objects.set(a.path,pdfFixture());mount(<Scanner/>);fireEvent.click(screen.getByRole('button',{name:'Procurar tentativas'}));await screen.findByRole('option',{name:/f.pdf/});fireEvent.change(screen.getByLabelText('Tentativa a consultar'),{target:{value:ID}});fireEvent.click(screen.getByRole('button',{name:'Consultar tentativa'}));await screen.findByText('Fatura guardada.');expect(f.inserts+f.updates+f.uploads).toBe(0)});
});
