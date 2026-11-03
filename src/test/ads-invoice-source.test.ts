import { beforeAll,describe,expect,it,vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { archiveSource,assertPersistedSource,extractSourceCurrency,extractSourceIdentity,importAndAttest,resolveSourceIdentity,sha256 } from '../../supabase/functions/_shared/ads-invoice-source';
const id=(n:number)=>`48600000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const rows=(lines:string[])=>lines.map(text=>({tokens:[{text}]}));
const labels=['Supplier VAT: ZZ-TEST-123','Customer VAT: ZZ-TEST-999','Ad Account ID: ads-001','Currency: EUR','Invoice Number: SYN-000001'];
const h={company_id:id(1),platform:'meta' as const,invoice_number:'SYN-000001',currency:'EUR',billing_period:'2026-10-01',issue_date:'2026-10-31',total_amount:'20.00',lines_sum:'20.00',source:'pdf' as const,source_ref:null,file_path:null};
const line={line_no:1,raw_description:'Synthetic',placement:null,campaign_name:null,external_campaign_id:null,amount:'20.00',is_adjustment:true};
beforeAll(()=>vi.stubGlobal('crypto',webcrypto));
describe('#486 synthetic PDF identity and readback',()=>{
  it('separates supplier, customer and advertising identity and does not use bank account',()=>{
    const x=extractSourceIdentity(rows([...labels,'Bank Account: bank-xyz','IBAN: ZZ00-0000']));expect(x.supplier_nif).toBe('ZZ-TEST-123');expect(x.customer_nif).toBe('ZZ-TEST-999');expect(x.account_id).toBe('ads-001');
    expect(()=>extractSourceIdentity(rows(labels.filter(l=>!l.startsWith('Ad Account'))))).toThrow('financial_source_required');
    expect(()=>extractSourceIdentity(rows([...labels,'Supplier VAT: ZZ-OTHER']))).toThrow('financial_source_required');
    expect(()=>extractSourceCurrency(rows(['Total: 20.00']))).toThrow('currency_mismatch');
    expect(()=>extractSourceCurrency(rows(['Currency: EUR','Currency: USD']))).toThrow('currency_mismatch');
  });
  it('resolves only exact current supplier NIF and active company/platform/account linkage',()=>{
    const extracted=extractSourceIdentity(rows(labels));const s={id:id(2),company_id:id(1),nif:'ZZ-TEST-123',is_active:true};const c={id:id(3),company_id:id(1),platform:'meta',status:'active',selected_ad_account_id:'ads-001'};
    expect(resolveSourceIdentity(extracted,h,'a'.repeat(64),[s],[c],'ZZ-TEST-999').supplier_id).toBe(id(2));
    expect(()=>resolveSourceIdentity(extracted,h,'a'.repeat(64),[s,{...s,id:id(4)}],[c],'ZZ-TEST-999')).toThrow();
    expect(()=>resolveSourceIdentity(extracted,h,'a'.repeat(64),[s],[{...c,company_id:id(9)}],'ZZ-TEST-999')).toThrow();
    expect(()=>resolveSourceIdentity(extracted,h,'a'.repeat(64),[s],[c],'ZZ-OTHER')).toThrow();
    expect(()=>resolveSourceIdentity(extracted,{...h,currency:'USD'},'a'.repeat(64),[s],[c],'ZZ-TEST-999')).toThrow();
  });
  it('compares every persisted header/line identity, retaining null vs empty and separators',()=>{
    expect(()=>assertPersistedSource(h,[line],h,[{...line,line_no:99,amount:20}])).not.toThrow();
    expect(()=>assertPersistedSource(h,[line],h,[{...line,campaign_name:''}])).toThrow();
    expect(()=>assertPersistedSource(h,[line],{...h,invoice_number:'SYN000001'},[line])).toThrow();
    expect(()=>assertPersistedSource(h,[line],h,[])).toThrow();
  });
  it('uses content-addressed archive/readback and recovers upload success before lost response',async()=>{
    const bytes=new TextEncoder().encode('%PDF-synthetic');let stored:Uint8Array|null=null;
    const port={download:vi.fn(async()=>stored),upload:vi.fn(async(_p:string,b:Uint8Array)=>{stored=b;throw new Error('response lost');})};
    const archive=await archiveSource(port,id(1),bytes);expect(archive.path).toContain(await sha256(bytes));await archiveSource(port,id(1),bytes);expect(port.upload).toHaveBeenCalledTimes(1);
    await expect(archiveSource({...port,download:async()=>new Uint8Array([9])},id(1),bytes)).rejects.toThrow('document_digest_mismatch');
  });
  it('does not archive or attest if the user RPC refuses a closed feature or tenant',async()=>{
    const archive={download:vi.fn(),upload:vi.fn()};const admin={rpc:vi.fn()};
    await expect(importAndAttest({caller:{rpc:vi.fn(async()=>({data:null,error:{message:'feature_disabled',code:'0A000'}}))},admin,archive,read:vi.fn(),identity:vi.fn()},h,[line],new TextEncoder().encode('%PDF-test'))).rejects.toThrow('feature_disabled');
    expect(archive.upload).not.toHaveBeenCalled();expect(admin.rpc).not.toHaveBeenCalled();
  });
  it('binds attestation to the read-back revision and exact bytes; identical import keeps the same ID',async()=>{
    const bytes=new TextEncoder().encode('%PDF-source');const digest=await sha256(bytes);let stored:Uint8Array|null=null;let saved:any;
    const caller={rpc:vi.fn(async(_n:string,args:any)=>{saved=args.p_invoice;return {data:{contract_version:1,invoice_id:id(5),revision:3,identical:true,preserved_line_ids:[id(6)]},error:null};})};
    const admin={rpc:vi.fn(async()=>({data:{contract_version:1,invoice_id:id(5),revision:4},error:null}))};
    const port={caller,admin,archive:{download:async()=>stored,upload:async(_p:string,b:Uint8Array)=>{stored=b;}},read:async()=>({invoice:{...saved,generation_revision:3},lines:[line]}),identity:vi.fn(async()=>({supplier_id:id(2),supplier_nif:'ZZ-TEST-123',connection_id:id(3),account_id:'ads-001',platform:'meta' as const,invoice_number:h.invoice_number,sha256:digest}))};
    const result=await importAndAttest(port,h,[line],bytes);expect(result.invoice_id).toBe(id(5));expect(result.revision).toBe(4);
    expect(admin.rpc).toHaveBeenCalledWith('ads_invoice_source_attest_v1',expect.objectContaining({p_expected_revision:3,p_source:expect.objectContaining({sha256:digest})}));
    admin.rpc.mockClear();await expect(importAndAttest({...port,read:async()=>({invoice:{...saved,generation_revision:4},lines:[line]})},h,[line],bytes)).rejects.toThrow('revision_conflict');expect(admin.rpc).not.toHaveBeenCalled();
  });
});
