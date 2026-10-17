// @vitest-environment node
import {beforeAll,it,expect,vi} from 'vitest';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pdfFixture,pngFixture,jpegFixture} from '../../../../src/test/fixtures/documents333';
const f=vi.hoisted(()=>({handler:null as any,mode:'',writes:0,receipts:0,bytes:new Uint8Array(),mime:'application/pdf',calls:[] as string[]}));
vi.mock('npm:@supabase/supabase-js@2/cors',async()=>import('@supabase/supabase-js/cors'));
vi.mock('npm:@supabase/supabase-js@2',()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:{id:U}},error:null})},rpc:async(name:string,args:any)=>{f.calls.push(name);if(name==='my_effective_permissions')return {data:f.mode==='403'?null:{company_id:C},error:null};if(name==='standalone_attempt_list_333')return {data:{items:[],next:null},error:null};if(name==='data_entry_record_receipt'){f.receipts++;return {data:null,error:null}};if(args.p_action==='check')return {data:{id:ID,hash:H,state:'prepare',path:C+'/attempt/f',document:{sha256:H,size_bytes:f.bytes.length,mime:f.mime},record_ok:false},error:null};f.writes++;return {data:null,error:null}},storage:{from:()=>({upload:async()=>{f.writes++;return {error:null}},download:async()=>({data:null,error:null})})}})}));
const U='22222222-2222-4222-8222-222222222222',C='11111111-1111-4111-8111-111111111111',ID='33333333-3333-4333-8333-333333333333',H='a'.repeat(64);
beforeAll(async()=>{vi.stubGlobal('Deno',{env:{get:()=> 'fixture'},serve:(h:any)=>{f.handler=h}});await import('../../../../supabase/functions/standalone-attempt-333/index');});
const headers={'Authorization':'Bearer fixture','Content-Type':'application/json','X-Attempt-User':U,'X-Attempt-Company':C};
const request=(body:any,extra={})=>f.handler(new Request('http://fixture',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)}));
it('real candidate entry OPTIONS declares all client headers; tenant/user mismatches and rejected session context',async()=>{
 const r=await f.handler(new Request('http://fixture',{method:'OPTIONS',headers:{Origin:'http://localhost:19000','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type,x-attempt-user,x-attempt-company'}}));expect(r.status).toBe(200);
 for(const header of ['authorization','content-type','x-attempt-user','x-attempt-company'])expect(r.headers.get('Access-Control-Allow-Headers')?.toLowerCase().split(',').map(x=>x.trim())).toContain(header);
 const b={action:'list',operation:'scanner_create',after:null};for(const extra of [{'X-Attempt-User':ID},{'X-Attempt-Company':ID}])expect((await request(b,extra)).status).toBe(409);
 f.mode='403';expect((await request(b)).status).toBe(403);f.mode='';expect(f.writes).toBe(0);
});
it.each([pdfFixture().slice(0,5),pngFixture().slice(0,12),jpegFixture().slice(0,4),pngFixture()])('real entry rejects truncated or MIME-incompatible bytes with no upload/receipt/commit',async bytes=>{
 f.bytes=bytes;f.mime='application/pdf';f.writes=0;f.receipts=0;
 const r=await request({action:'execute',operation:'scanner_create',id:ID,hash:H,conteudo_base64:Buffer.from(bytes).toString('base64')});expect(r.status).toBe(422);expect(f.writes+f.receipts).toBe(0);
});
it('real entry cuts oversized body stream before buffering/DB writes',async()=>{
 f.writes=0;let cancelled=false;const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(28100001))},cancel(){cancelled=true}});
 const r=await f.handler(new Request('http://fixture',{method:'POST',headers,body,duplex:'half'} as RequestInit));expect(r.status).toBe(413);expect(cancelled).toBe(true);expect(f.writes).toBe(0);
});
it('Chromium cross-origin fetch performs actual OPTIONS then POST using candidate entry headers',async()=>{
 const methods:string[]=[];
 const target=createServer(async(req,res)=>{methods.push(req.method??'');let body='';for await(const part of req)body+=part;const r=await f.handler(new Request('http://fixture',{method:req.method,headers:req.headers as Record<string,string>,...(req.method==='POST'?{body}: {})}));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());});
 const origin=createServer((_,res)=>res.end('<html><body>fixture</body></html>'));
 await new Promise<void>(r=>target.listen(0,'127.0.0.1',r));await new Promise<void>(r=>origin.listen(0,'127.0.0.1',r));
 const address=target.address(),source=origin.address();if(!address||typeof address==='string'||!source||typeof source==='string')throw Error('test listener absent');
 try{
 const script=`import asyncio,json\nfrom playwright.async_api import async_playwright\nasync def main():\n async with async_playwright() as p:\n  b=await p.chromium.launch(headless=True)\n  page=await b.new_page(viewport={"width":1280,"height":1800})\n  await page.goto("http://127.0.0.1:${source.port}")\n  result=await page.evaluate("""async()=>{const r=await fetch('http://127.0.0.1:${address.port}',{method:'POST',headers:${JSON.stringify(headers)},body:JSON.stringify({action:'list',operation:'scanner_create',after:null})});return {status:r.status,body:await r.json()}}""")\n  print(json.dumps(result))\n  await b.close()\nasyncio.run(main())`;
 const out=await promisify(execFile)('/bin/python3',['-c',script],{env:{PATH:'/bin:/usr/bin',HOME:'/tmp',PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH}});expect(JSON.parse(out.stdout)).toEqual({status:200,body:{items:[],next:null}});expect(methods).toEqual(['OPTIONS','POST']);
 }finally{await Promise.all([new Promise<void>(r=>target.close(()=>r())),new Promise<void>(r=>origin.close(()=>r()))]);}
});
