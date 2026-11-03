// @vitest-environment node
import { describe,expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as contract from '../../supabase/functions/_shared/ads-invoice-generation';
import * as sourceModule from '../../supabase/functions/_shared/ads-invoice-source';
import * as documents from '../../supabase/functions/_shared/ads-invoice-documents';
import { fetchAllPagedQuery } from '../../supabase/functions/_shared/paging';
import { AdsContractError,dispatchDecision,emptyPlan,httpStatus } from '@/lib/ads-invoice-generation';
const invoice='48600000-0000-0000-0000-000000000001';const operation='48600000-0000-0000-0000-000000000002';
describe('#486 caller RPC dispatch and former writer drainage',()=>{
  it.each(['confirm','generate','save_plan','reopen','revert','set_split'])('routes %s through the v1 boundary without direct writers',async action=>{
    const port={rpc:vi.fn(async(_name:string,_args:Record<string,unknown>)=>({data:{contract_version:1},error:null}))};
    const payload=action==='confirm'?{expected_revision:1,preview_hash:'a'.repeat(64)}:action==='generate'?{expected_revision:1,preview_hash:'a'.repeat(64),request_key:operation,approvals:[]}:
      action==='save_plan'?{expected_revision:1,plan:emptyPlan()}:action==='revert'?{expected_revision:1,operation_id:operation}:action==='set_split'?{expected_revision:1,line_id:operation,parts:[{event_id:invoice,amount:'20.00'}]}:{expected_revision:1};
    await dispatchDecision(port,invoice,action,payload);expect(port.rpc).toHaveBeenCalledTimes(1);expect(port.rpc.mock.calls[0][0]).toBe(action==='reopen'?'ads_invoice_reopen_v1':action==='revert'?'ads_invoice_revert_v1':'ads_invoice_generation_v1');
  });
  it.each(['feature_disabled','forbidden','preview_stale','revert_blocked'])('propagates %s and never falls back to financial writes',async message=>{
    const port={rpc:vi.fn(async()=>({data:null,error:{message,code:message==='feature_disabled'?'0A000':'P0409'}}))};await expect(dispatchDecision(port,invoice,'confirm',{expected_revision:1,preview_hash:'a'.repeat(64)})).rejects.toThrow(message);expect(port.rpc).toHaveBeenCalledTimes(1);
  });
  it('rejects delegated actors, fractional revision, numeric split money and unknown payload fields',async()=>{
    const port={rpc:vi.fn()};await expect(dispatchDecision(port,invoice,'confirm',{expected_revision:1,preview_hash:'a'.repeat(64),actor:operation})).rejects.toThrow();
    await expect(dispatchDecision(port,invoice,'reopen',{expected_revision:1.1})).rejects.toThrow();
    await expect(dispatchDecision(port,invoice,'set_split',{expected_revision:1,line_id:operation,parts:[{event_id:invoice,amount:20}]})).rejects.toThrow();expect(port.rpc).not.toHaveBeenCalled();
  });
  it('maps SQL refusals without substituting contract_unavailable for a closed feature',()=>{
    expect(httpStatus(new AdsContractError('feature_disabled'))).toBe(503);expect(httpStatus(new AdsContractError('unauthenticated'))).toBe(401);expect(httpStatus(new AdsContractError('forbidden'))).toBe(403);expect(httpStatus(new AdsContractError('revert_blocked',{sqlstate:'P0409'}))).toBe(409);expect(httpStatus(new AdsContractError('approval_required'))).toBe(422);
  });
  it('contains no old direct Ads/financial writers, destructive line reimport or fixed supplier/account inference',()=>{
    for(const path of ['src/pages/AdsInvoices.tsx','supabase/functions/ads-invoice-apply/index.ts','supabase/functions/ads-invoice-ingest/index.ts']){
      const text=readFileSync(path,'utf8');expect(text).not.toMatch(/\.from\(['"](?:transactions|ads_invoice|ads_invoice_line)['"]\)[\s\S]{0,100}\.\s*(?:insert|update|delete|upsert)\s*\(/);
      expect(text).not.toContain('platformAccount');expect(text).not.toContain('findExistingTransactions');expect(text).not.toContain('handleProposeGoogle');
    }
  });
});

/** Runs the actual entrypoint with isolated Auth/RPC/Storage/parser transports; no external I/O. */
function entrypoint(path:string,deps:Record<string,unknown>,caller:any,admin:any){
  let handler:(req:Request)=>Promise<Response>;
  const code=transformSync(readFileSync(path,'utf8').replace(/^import[^\n]+;\s*$/gm,''),{loader:'ts',format:'cjs'}).code;
  const values={...contract,...sourceModule,...documents,fetchAllPagedQuery,...deps,
    createClient:vi.fn((_url:string,key:string,options:any)=>{if(key==='synthetic-service')return admin;expect(options.global.headers.Authorization).toBe('Bearer synthetic-user');return caller;}),
    Deno:{env:{get:(key:string)=>({SUPABASE_URL:'https://backend.invalid',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'}[key])},serve:(fn:typeof handler)=>{handler=fn;}}};
  new Function(...Object.keys(values),code)(...Object.values(values));
  return (body:unknown)=>handler(new Request('https://backend.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic-user','Content-Type':'application/json'},body:JSON.stringify(body)}));
}
const company='48600000-0000-0000-0000-000000000010';
function transports(){
  const objects=new Map<string,Uint8Array>();let stored:any=null;let storedLines:any[]=[];
  function query(table:string){const q:any={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,
    single:async()=>({data:table==='companies'?{tax_id:'ZZ-BUYER'}:stored,error:null}),
    range:async()=>({data:table==='ads_invoice_line'?storedLines:table==='suppliers'?[{id:operation,company_id:company,nif:'ZZ-SELLER',is_active:true}]:table==='ad_platform_connections'?[{id:operation,company_id:company,platform:'meta',status:'active',selected_ad_account_id:'ads-001'}]:[],error:null})};return q;}
  const caller={auth:{getUser:vi.fn(async()=>({data:{user:{id:'synthetic-user'}},error:null}))},from:vi.fn(query),rpc:vi.fn(async(name:string,args:any)=>{
    if(name==='current_company_id')return {data:company,error:null};
    if(name==='ads_invoice_import_v1'){stored={...args.p_invoice,generation_revision:1};storedLines=args.p_lines;return {data:{contract_version:1,invoice_id:invoice,revision:1,identical:false},error:null};}
    return {data:{contract_version:1,invoice_id:invoice,revision:1,status:'confirmed'},error:null};
  })};
  const upload=vi.fn(async(path:string,bytes:Uint8Array)=>{objects.set(path,bytes);return {error:null};});
  const download=vi.fn(async(path:string)=>objects.has(path)?{data:new Blob([new Uint8Array(objects.get(path)!).buffer]),error:null}:{data:null,error:{statusCode:'404'}});
  const admin={rpc:vi.fn(async(name:string,args:any):Promise<any>=>({data:{contract_version:1,invoice_id:invoice,revision:2},error:null})),from:vi.fn(query),schema:()=>({from:vi.fn(query)}),storage:{from:vi.fn(()=>({upload,download}))}};
  return {caller,admin,upload,download,objects};
}
describe('#486 actual entrypoint integration with synthetic transports',()=>{
  async function operationFixture(){
    const bytes=new TextEncoder().encode('%PDF-synthetic');const sha256=await sourceModule.sha256(bytes);
    const preview={contract_version:1,invoice_id:invoice,revision:1,generation_cycle:0,currency:'EUR',preview_hash:'a'.repeat(64),allocations:[],children:[],line_budgets:[],category_budgets:[],effects:[],blockers:[],totals:{invoice:'15.00',children:'15.00',outside:'0.00'}};
    const op={id:operation,invoice_id:invoice,company_id:company,request_key:operation,generation_cycle:0,state:'financial_committed',plan_snapshot:emptyPlan(),result_snapshot:{parent:{id:invoice,amount:'15.00'},children:[],source:{bucket:'ads-invoices',path:`${company}/original.pdf`,sha256},preview},documents:[{key:'original',transaction_id:invoice,bucket:'transaction-documents',path:`${company}/ads-invoices/operations/${operation}/original.pdf`,name:'SYN-000001.pdf',doc_type:'fatura',is_accounting:true,status:'pending',document_id:null,error_code:null}]};
    return {op,bytes,reply:{contract_version:1,invoice_id:invoice,revision:1,generation_cycle:0,operation:op,maintenance:[]}};
  }
  it('confirm carries the user JWT to D1 and never invokes a service financial RPC',async()=>{
    const {caller,admin}=transports();const run=entrypoint('supabase/functions/ads-invoice-apply/index.ts',{},caller,admin);
    const response=await run({action:'confirm',invoice_id:invoice,payload:{expected_revision:1,preview_hash:'a'.repeat(64)}});expect(response.status).toBe(200);
    expect(caller.rpc).toHaveBeenCalledWith('ads_invoice_generation_v1',{p_invoice_id:invoice,p_action:'confirm',p_payload:{expected_revision:1,preview_hash:'a'.repeat(64)}});expect(admin.rpc).not.toHaveBeenCalled();expect(admin.storage.from).not.toHaveBeenCalled();
  });
  it('closed D1 returns 503 from the actual apply handler without financial fallback',async()=>{
    const {caller,admin}=transports();caller.rpc.mockImplementation(async()=>({data:null,error:{message:'feature_disabled',code:'0A000'}}) as any);
    const response=await entrypoint('supabase/functions/ads-invoice-apply/index.ts',{},caller,admin)({action:'confirm',invoice_id:invoice,payload:{expected_revision:1,preview_hash:'a'.repeat(64)}});
    expect(response.status).toBe(503);expect(await response.json()).toMatchObject({error:'feature_disabled'});expect(admin.rpc).not.toHaveBeenCalled();
  });
  it('closed document preflight refuses Storage even with an existing financial operation',async()=>{
    const {caller,admin,upload,download}=transports();const {reply}=await operationFixture();caller.rpc.mockImplementation(async(name:string)=>({data:name==='has_permission_in'?true:reply,error:null}) as any);admin.rpc.mockResolvedValue({data:null,error:{message:'feature_disabled',code:'0A000'}} as any);
    const response=await entrypoint('supabase/functions/ads-invoice-apply/index.ts',{},caller,admin)({action:'documents',invoice_id:invoice,payload:{retry_errors:true}});
    expect(response.status).toBe(503);expect(upload).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();expect(admin.rpc).toHaveBeenCalledWith('ads_invoice_maintenance_v1',expect.objectContaining({p_action:'preflight'}));
  });
  it('actual document retoma archives/readbacks the same original and callbacks without generating costs',async()=>{
    const {caller,admin,objects,upload}=transports();const {op,reply,bytes}=await operationFixture();objects.set(op.result_snapshot.source.path,bytes);caller.rpc.mockImplementation(async(name:string)=>({data:name==='has_permission_in'?true:reply,error:null}) as any);
    admin.rpc.mockImplementation(async(name:string,args:any)=>{
      if(name==='ads_invoice_document_complete_v1'){Object.assign(op.documents[0],{status:'complete',document_id:operation,sha256:args.p_payload.sha256});op.state='complete';return {data:{task:op.documents[0]},error:null};}
      return {data:{contract_version:1,invoice_id:invoice,task:null},error:null};
    });
    const response=await entrypoint('supabase/functions/ads-invoice-apply/index.ts',{},caller,admin)({action:'documents',invoice_id:invoice,payload:{retry_errors:true}});
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({documents:{pending:false},maintenance_pending:false});expect(upload).toHaveBeenCalledTimes(1);expect(caller.rpc.mock.calls.every(c=>c[1].p_action==='operation'||c[0]==='has_permission_in')).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith('ads_invoice_document_complete_v1',expect.objectContaining({p_operation_id:operation,p_task_key:'original',p_payload:expect.objectContaining({transaction_id:invoice,status:'complete',sha256:op.result_snapshot.source.sha256})}));
  });
  it('refuses a document snapshot pointing at another tenant before any Storage read',async()=>{
    const {caller,admin,download}=transports();const {reply,op}=await operationFixture();op.result_snapshot.source.path=`${operation}/foreign.pdf`;caller.rpc.mockResolvedValue({data:reply,error:null} as any);
    const response=await entrypoint('supabase/functions/ads-invoice-apply/index.ts',{},caller,admin)({action:'documents',invoice_id:invoice,payload:{}});expect(response.status).toBe(422);expect(download).not.toHaveBeenCalled();expect(admin.rpc).not.toHaveBeenCalled();
  });
  it('revalidates an explicit permission deny before internal document operations',async()=>{
    const {caller,admin,download}=transports();const {reply}=await operationFixture();caller.rpc.mockImplementation(async(name:string)=>({data:name==='has_permission_in'?false:reply,error:null}) as any);
    const response=await entrypoint('supabase/functions/ads-invoice-apply/index.ts',{},caller,admin)({action:'documents',invoice_id:invoice,payload:{}});expect(response.status).toBe(403);expect(download).not.toHaveBeenCalled();expect(admin.rpc).not.toHaveBeenCalled();
  });
  it('stops document upload when a reversal is observed after source readback',async()=>{
    const {caller,admin,upload,objects}=transports();const {op,reply,bytes}=await operationFixture();objects.set(op.result_snapshot.source.path,bytes);let reads=0;
    caller.rpc.mockImplementation(async(name:string)=>{
      if(name==='has_permission_in')return {data:true,error:null} as any;
      reads++;return {data:reads>=3?{...reply,operation:{...op,state:'reverted'}}:reply,error:null} as any;
    });
    admin.rpc.mockResolvedValue({data:{contract_version:1,invoice_id:invoice,task:null},error:null});
    const response=await entrypoint('supabase/functions/ads-invoice-apply/index.ts',{},caller,admin)({action:'documents',invoice_id:invoice,payload:{}});expect(response.status).toBe(409);expect(upload).not.toHaveBeenCalled();expect(admin.rpc.mock.calls.every(c=>c[0]==='ads_invoice_maintenance_v1')).toBe(true);
  });
  const parsed={header:{invoiceNumber:'SYN-000001',billingPeriod:'2026-10-01',issueDate:'2026-10-31',totalAmount:15},linesSum:15,warnings:[],lines:[{lineNo:1,rawDescription:'Synthetic fee',campaignName:null,amount:20,isAdjustment:true},{lineNo:2,rawDescription:'Synthetic adjustment',campaignName:null,amount:-5,isAdjustment:true}]};
  const tokens=['Supplier VAT: ZZ-SELLER','Customer VAT: ZZ-BUYER','Ad Account ID: ads-001','Currency: EUR','Invoice Number: SYN-000001'].map(text=>({tokens:[{text}]}));
  const parserDeps={extractPdfLines:async()=>tokens,parseMetaInvoiceLines:()=>parsed,parseGoogleInvoiceLines:()=>parsed,parseTiktokInvoiceLines:()=>parsed};
  it.each(['parse_meta','parse_google','parse_tiktok'])('%s dry-run in actual ingest performs no database or Storage writes',async action=>{
    const {caller,admin,upload}=transports();const response=await entrypoint('supabase/functions/ads-invoice-ingest/index.ts',parserDeps,caller,admin)({action,company_id:company,file_base64:btoa('%PDF-synthetic'),dry_run:true});
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({dry_run:true,reconcilia:true,total_amount:15,currency:'EUR'});expect(upload).not.toHaveBeenCalled();expect(admin.rpc).not.toHaveBeenCalled();expect(caller.rpc.mock.calls.map(c=>c[0])).toEqual(['current_company_id']);
  });
  it('actual ingest imports exact line bytes/identity, reads them back and only then attests using service_role',async()=>{
    const {caller,admin,upload,download}=transports();const response=await entrypoint('supabase/functions/ads-invoice-ingest/index.ts',parserDeps,caller,admin)({action:'parse_meta',company_id:company,file_base64:btoa('%PDF-synthetic')});
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({invoice_id:invoice,revision:2,source_verified:true});
    const args=caller.rpc.mock.calls.find(c=>c[0]==='ads_invoice_import_v1')![1];expect(args.p_lines.map((l:any)=>l.amount)).toEqual(['20.00','-5.00']);expect(args.p_lines.every((l:any)=>!('event_id'in l)&&!('match_source'in l))).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);expect(download.mock.calls.length).toBeGreaterThanOrEqual(2);expect(admin.rpc).toHaveBeenCalledWith('ads_invoice_source_attest_v1',expect.objectContaining({p_expected_revision:1,p_source:expect.objectContaining({identity:expect.objectContaining({supplier_nif:'ZZ-SELLER',account_id:'ads-001'})})}));
  });
  it('actual ingest refuses cross-company requests before parser, storage or service access',async()=>{
    const {caller,admin,upload}=transports();const parse=vi.fn();const response=await entrypoint('supabase/functions/ads-invoice-ingest/index.ts',{...parserDeps,extractPdfLines:parse},caller,admin)({action:'parse_meta',company_id:operation,file_base64:btoa('%PDF-synthetic')});
    expect(response.status).toBe(403);expect(parse).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(admin.rpc).not.toHaveBeenCalled();
  });
  it('actual ingest closed import archives nothing and does not attest',async()=>{
    const {caller,admin,upload}=transports();caller.rpc.mockImplementation(async(name:string)=>name==='current_company_id'?{data:company,error:null}:{data:null,error:{message:'feature_disabled',code:'0A000'}} as any);
    const response=await entrypoint('supabase/functions/ads-invoice-ingest/index.ts',parserDeps,caller,admin)({action:'parse_meta',company_id:company,file_base64:btoa('%PDF-synthetic')});expect(response.status).toBe(503);expect(upload).not.toHaveBeenCalled();expect(admin.rpc).not.toHaveBeenCalled();
  });
});
