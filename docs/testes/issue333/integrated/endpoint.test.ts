import { pdfFixture } from "../../../../src/test/fixtures/documents333";
import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
const f=vi.hoisted(()=>({client:null as any,ecb:vi.fn()}));
vi.mock("npm:@supabase/supabase-js@2",()=>({createClient:()=>f.client}));
vi.mock("../../../../supabase/functions/_shared/fx-rate.ts",()=>({getEcbRate:f.ecb}));
// The real service-role verifier executes; Auth HTTP responses are fake, not middleware proof.
import { Blob as NodeBlob } from "node:buffer";
import { webcrypto, randomUUID } from "node:crypto";
let handler:(r:Request)=>Promise<Response>;
const C="11111111-1111-4111-8111-111111111111",U="22222222-2222-4222-8222-222222222222";
let rows:any[], objects:Map<string,Uint8Array>, uploads:number, inserts:number, mode:string, downloads:number;
let attempts:Map<string,any>;
async function attemptRpc(name:string,args:any){
 if(name==='data_entry_record_receipt')return {data:null,error:null};
 if(name!=='standalone_ingest_attempt_333')throw Error('unlisted RPC');
 if(args.p_action==='prepare'){
  const e=JSON.stringify(args.p_envelope);const found=Array.from(attempts.values()).find(a=>a.envelope===e&&a.company===args.p_company);
  const prior=attempts.get(args.p_id);if(prior&&(prior.envelope!==e||prior.company!==args.p_company))return {data:null,error:{code:'42501'}};
  if(found)return {data:{...found},error:null};
  const a={id:args.p_id,hash:'a'.repeat(64),envelope:e,company:args.p_company,state:'prepare',path:args.p_company+'/attempt333/'+args.p_id+'/f.pdf',document:args.p_envelope.document,result:null,current:null,record_ok:false};attempts.set(a.id,a);return {data:{...a},error:null};
 }
 const a=attempts.get(args.p_id);if(!a||a.company!==args.p_company||a.hash!==args.p_hash)return {data:null,error:{code:'42501'}};
 if(args.p_action==='authorize'&&a.state==='prepare')a.state='authorized';if(args.p_action==='begin'&&a.state==='authorized')a.state='inprogress';
 if(args.p_action==='commit'&&a.state!=='completed'){
  if(mode==='23505')return {data:null,error:{code:'23505'}};
  inserts++;const payload=JSON.parse(a.envelope).payload;const row={...payload,id:randomUUID(),company_id:a.company,storage_path:a.path,status:'new'};rows.push(row);a.result=row;a.current=row;a.state='completed';a.record_ok=true;
  if(mode==='lost')return {data:null,error:{code:'08006'}};
 }
 return {data:{...a},error:null};
}
const bytes=pdfFixture("integrated fictitious invoice");
const base=()=>({company_id:C,nome:"f.pdf",conteudo_base64:btoa(String.fromCharCode(...bytes)),supplier_name:"Ficticio",supplier_nif:"PT001",invoice_number:"FT1/23",invoice_date:"2026-10-17",currency:"EUR",total_amount:123,iva_amount:23,notes:"nota",paid_by_partner_id:U,created_by:U});
function query(table:string){let filters:any[]=[];let after="",limit=200,write:any=null;
 const q:any={select:()=>q,eq:(k:string,v:any)=>{filters.push([k,v]);return q},gt:(_:string,v:string)=>{after=v;return q},order:()=>q,limit:(n:number)=>{limit=n;return q},insert:(r:any)=>{write=r;return q},single:async()=>{
 inserts++;const row={...write,id:randomUUID()};
 if(mode==='23505'){rows.push({...row,storage_path:C+'/existing'});objects.set(C+'/existing',bytes);return {data:null,error:{code:'23505'}}}
 rows.push(row);if(mode==='lost')return {data:null,error:{code:'NETWORK'}};return {data:row,error:null};},maybeSingle:async()=>{if(table==='companies')return {data:mode==='tenant'?null:{id:C},error:null};return {data:rows.find(r=>filters.every(([k,v])=>r[k]===v))??null,error:null}},then:(ok:any,bad:any)=>Promise.resolve({data:rows.filter(r=>filters.every(([k,v])=>r[k]===v)&&r.id>after).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,limit),error:null}).then(ok,bad)};return q;}
beforeAll(async()=>{vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('Deno',{env:{get:(k:string)=>k==='SUPABASE_URL'?'https://fixture.invalid':k==='SUPABASE_SERVICE_ROLE_KEY'?'fixture-only':undefined},serve:(h:any)=>{handler=h}});await import('../../../../supabase/functions/ingest-standalone-invoice/index');});
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('Blob',NodeBlob);rows=[];objects=new Map();attempts=new Map();uploads=0;inserts=0;mode='';downloads=0;f.ecb.mockReset().mockResolvedValue({rate:.5,date_used:'2026-10-17'});f.client={from:query,rpc:attemptRpc,storage:{from:()=>({upload:async(p:string,b:Uint8Array)=>{uploads++;if(mode!=='missing')objects.set(p,mode==='corrupt'?new Uint8Array([1]):b);return {error:null}},download:async(p:string)=>({data:objects.has(p)?new Blob([objects.get(p) as Uint8Array]):null,error:null}),remove:()=>{throw Error('removal forbidden')}})}};vi.stubGlobal('fetch',vi.fn(async(input:any)=>{const url=String(input);if(url==='https://fixture.invalid/auth/v1/admin/users?per_page=1')return new Response('',{status:mode==='auth403'?403:200});if(url.startsWith('https://drive.google.com/')){downloads++;return new Response(bytes,{headers:{'Content-Type':'application/pdf'}})}throw Error('egress forbidden');}));});
async function call(body:any=base(),auth='fixture-only'){return handler(new Request('https://local.invalid',{method:'POST',headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:JSON.stringify(body)}));}
describe('real patched ingest entrypoint, fake DB/Auth/FX/storage; no external egress',()=>{
 it.each(['','user-token'])('401 for nonservice identity %s',async(auth)=>{expect((await call(base(),auth)).status).toBe(401);expect(inserts).toBe(0)});
 it('forged service role gets Auth403 and endpoint401',async()=>{mode='auth403';expect((await call(base(),'x.'+btoa(JSON.stringify({role:'service_role'}))+'.x')).status).toBe(401);expect(inserts).toBe(0)});
 it('missing company fails before upload',async()=>{mode='tenant';expect((await call()).status).toBe(404);expect(uploads).toBe(0)});
 it.each(['EUR','USD','BRL','GBP'])('preserves %s contract',async(currency)=>{const body={...base(),currency,...(currency==='EUR'?{}:{original_amount:246,fx_rate:.5,total_amount:123})};expect((await call(body)).status).toBe(200);expect(rows[0].currency).toBe(currency);expect(rows[0].total_amount).toBe(123);expect(f.ecb).not.toHaveBeenCalled()});
 it('server FX and Drive download are fakes',async()=>{const body:any={...base(),currency:'USD',original_amount:246,origem:'https://drive.google.com/file/d/fake/view'};delete body.conteudo_base64;delete body.total_amount;expect((await call(body)).status).toBe(200);expect(f.ecb).toHaveBeenCalledTimes(1);expect(downloads).toBe(1)});
 it('optional nulls may create but never prove reused',async()=>{const b={...base(),supplier_name:null,created_by:null};expect((await call(b)).status).toBe(200);expect((await call(b)).status).toBe(409);expect(inserts).toBe(1)});
 it('equivalence reads real bytes, preserving legitimate current processed status',async()=>{expect((await call()).status).toBe(200);rows[0].status='processed';const r=await call({...base(),supplier_nif:'pt001',invoice_number:'ft1/23'});expect(await r.json()).toMatchObject({reused:true,verified:true});expect(inserts).toBe(1);expect(rows[0].status).toBe('processed')});
 it.each(['FT12/3','AB-12','AB1-2','FT01/23'])('distinct reference %s can insert',async(n)=>{await call();expect((await call({...base(),invoice_number:n})).status).toBe(200);expect(inserts).toBe(2)});
 it('prefixes and zeros remain distinct',async()=>{await call();for(const nif of ['001','PT01','PT 001'])expect((await call({...base(),supplier_nif:nif})).status).toBe(200);expect(inserts).toBe(4)});
 it('23505 proves document instead of generic success or cleanup',async()=>{mode='23505';const r=await call();expect(r.status).toBe(200);expect(await r.json()).toMatchObject({reused:true});expect(objects.size).toBe(2);expect(inserts).toBe(1)});
 it.each(['missing','corrupt'])('upload200 with %s bytes blocks insert',async(m)=>{mode=m;expect((await call()).status).toBe(409);expect(inserts).toBe(0)});
 it('lost committed response returns unknown without retry/removal',async()=>{mode='lost';const r=await call({...base(),supplier_nif:null,invoice_number:null});expect(r.status).toBe(503);expect(await r.json()).toMatchObject({code:'result_unknown'});expect(rows).toHaveLength(1);expect(inserts).toBe(1);expect(objects.size).toBe(1)});
 it('divergent stored bytes conflict without removal',async()=>{await call();objects.set(rows[0].storage_path,new Uint8Array([2]));expect((await call()).status).toBe(409);expect(inserts).toBe(1);expect(objects.size).toBe(1)});
 it('invalid body rejects before writes',async()=>{expect((await call({...base(),currency:'JPY'})).status).toBe(400);expect((await call({...base(),origem:'https://example.invalid'})).status).toBe(400);expect(inserts).toBe(0)});
 it('optional persistent ID incomplete identity lost commit reconciles; new UUID same envelope does not insert again',async()=>{mode='lost';const b={...base(),attempt_id:randomUUID(),supplier_nif:null,invoice_number:null};const r=await call(b);expect(r.status).toBe(200);expect(await r.json()).toMatchObject({status:'conferido',verified:true});mode='';expect((await call({...b,attempt_id:randomUUID()})).status).toBe(200);expect(inserts).toBe(1);expect(uploads).toBe(1);expect(attempts.size).toBe(1)});
 it('persistent same ID divergent payload conflicts and preserves candidate',async()=>{const b={...base(),attempt_id:randomUUID()};await call(b);expect((await call({...b,total_amount:124})).status).toBe(409);expect(inserts).toBe(1);expect(objects.size).toBe(1)});
 it('untracked incomplete callers remain explicitly outside global guarantee',async()=>{const b={...base(),supplier_nif:null,invoice_number:null};await call(b);const r=await call(b);expect(await r.json()).toMatchObject({attempt_coverage:'legacy_untracked'});expect(inserts).toBe(2)});
 it.each(['missing','corrupt'])('persistent readback %s prevents mutation',async m=>{mode=m;expect((await call({...base(),attempt_id:randomUUID()})).status).toBe(409);expect(inserts).toBe(0);expect(attempts.size).toBe(1)});
});
