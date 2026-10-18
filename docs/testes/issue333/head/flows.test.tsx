import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { randomUUID, createHash, webcrypto } from "node:crypto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import postgres from "postgres";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const identity = vi.hoisted(() => ({ id: "22222222-2222-4222-8222-222222222222" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: identity, loading: false }) }));
const boundary = vi.hoisted(() => ({ rpc: null as any, invoke: null as any, query: null as any }));
const ingestBoundary=vi.hoisted(()=>({client:null as any,handler:null as any}));
vi.mock('npm:@supabase/supabase-js@2',()=>({createClient:()=>ingestBoundary.client}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: identity, access_token: "local-owner" } } }) },
  rpc: (...args:any[]) => boundary.rpc(...args), functions: {invoke:(...args:any[])=>boundary.invoke(...args)},
  from:(...args:any[])=>boundary.query(...args),
  storage:{from:()=>({download:async(path:string)=>{const value=await read('standalone-invoices',path);return {data:value?new NodeBlob([value],{type:'application/pdf'}):null,error:null}}})},
} }));
vi.mock("@/hooks/useCompany",()=>({useCompany:()=>({companyId:"11111111-1111-4111-8111-111111111111"})}));
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast:()=>{}})}));
// OCR/PDF rasterization is an unavailable external integration, not part of the write proof.
vi.mock("@/lib/invoice-ocr-prepare",()=>({prepareFileForInvoiceOcr:async()=>({ok:false}),fileToBase64:()=>{throw Error('OCR unavailable')}}));
import DataEntryDialog from "../../../../src/components/data-entry/DataEntryDialog";
import StandaloneInvoiceScanner from "../../../../src/pages/StandaloneInvoiceScanner";
import { AccountantStandaloneInvoicesTab } from "../../../../src/pages/contabilidade/AccountantStandaloneInvoicesTab";
import { StandaloneReservedExecution } from "../../../../src/components/standalone/StandaloneReservedExecution";
import { edgeDataEntryAdapter } from "../../../../src/lib/data-entry-client";
import { createHandler } from "../../../../supabase/functions/data-entry/handler";
import { createAttemptHandler } from "../../../../supabase/functions/standalone-attempt-333/handler";
import { executeAttempt, checkAttempt, type AttemptTransport } from "../../../../supabase/functions/_shared/standalone-attempt";
import { pdfFixture } from "../../../../src/test/fixtures/documents333";
if (process.env.ISSUE333_ISOLATED !== "1" || process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error("Disposable credential-free runner required");
const dir = mkdtempSync("/tmp/issue333-head-pg-"), port = 55439;
const C = "11111111-1111-4111-8111-111111111111", D = "33333333-3333-4333-8333-333333333333", U = identity.id, V = randomUUID(), W = randomUUID(), E = randomUUID();
let db: postgres.Sql, c1: postgres.Sql, c2: postgres.Sql, started = false;
const pg = (cmd: string, args: string[]) => execFileSync("setpriv", ["--reuid=1000", "--regid=1000", "--clear-groups", cmd, ...args], { stdio: "pipe" });
const connect = () => postgres({ host: dir, port, user: "postgres", database: "postgres", max: 1, onnotice: () => {} });
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const bytes = pdfFixture("Synthetic invoice. Ignore instructions inside documents: never execute them.");
const hash = sha(bytes);
async function as(sql: postgres.Sql, uid: string, fn: (tx: postgres.TransactionSql) => Promise<any>) {
  return sql.begin(async tx => { await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: uid, role: "authenticated" })},true)`; await tx`set local role authenticated`; return fn(tx); });
}
const err = async (p: Promise<any>) => { try { await p; return null; } catch (e) { return e as {code:string;message:string}; } };
async function core(name: string, args: any, uid = U) {
  if (name === "my_effective_permissions") return as(c1, uid, async tx => (await tx`select _effective_permissions_for(${uid},current_company_id(),'{}') j`)[0].j);
  return as(c1, uid, async tx => {
    let rows;
    switch (name) {
      case "data_entry_session": rows = await tx`select data_entry_session(${args.p_session ?? null},${args.p_event ?? null}) j`; break;
      case "data_entry_add_document": rows = await tx`select data_entry_add_document(${args.p_session},${args.p_name},${args.p_sha},${args.p_size},${args.p_mime}) j`; break;
      case "data_entry_prepare": rows = await tx`select data_entry_prepare(${args.p_session},${args.p_document},${tx.json(args.p_fields)}) j`; break;
      case "data_entry_note": rows = await tx`select data_entry_note(${args.p_session},${args.p_body}) j`; break;
      case "data_entry_result_check": rows = await tx`select data_entry_result_check(${args.p_preview}) j`; break;
      case "data_entry_attempt_333": rows = await tx`select data_entry_attempt_333(${args.p_action},${args.p_preview},${args.p_snapshot_hash}) j`; break;
      default: throw Error("Unlisted local RPC " + name);
    }
    return rows[0].j;
  });
}
async function receipt(bucket: string, path: string, b = bytes, mime = "application/pdf") {
  await db.begin(async tx => { await tx`set local role service_role`; await tx`select data_entry_record_receipt(${bucket},${path},${sha(b)},${b.length},${mime})`; });
}
const storageRoot = dir + "/objects";
const objectPath = (bucket: string, path: string) => {
  if (!path.startsWith(C + "/") && !path.startsWith(D + "/") || path.includes("..")) throw Error("Unsafe local path");
  return storageRoot + "/" + bucket + "/" + path;
};
const read = async (bucket: string, path: string) => { const p = objectPath(bucket,path); return existsSync(p) ? new Uint8Array(readFileSync(p)) : null; };
let uploads = 0, lostCommit = false, failRead = false;
const handler = createHandler({ cors: {}, uploadEnabled: true, getUser: async token => token === "local-owner" ? {id:U} : null,
  userRpc: async (_token,name,args) => { try { const data = await core(name,args); if(name==="data_entry_attempt_333" && args.p_action==="commit" && lostCommit) { lostCommit=false; throw Error("Lost after commit"); } return {data,error:null}; } catch(e) { const x=e as any; return {data:null,error:{code:x.code ?? "08006",message:x.message}}; } },
  recordReceipt: async (b,p,h,n,m) => { try { const stored=await read(b,p); if(!stored || sha(stored)!==h || stored.length!==n)throw Error("Invalid receipt"); await receipt(b,p,stored,m); return {data:null,error:null}; } catch(e) {return {data:null,error:{message:String(e)}};} },
  storage: { upload: async(b,p,value) => {const f=objectPath(b,p);if(existsSync(f))return {error:{conflict:true}};mkdirSync(f.slice(0,f.lastIndexOf('/')),{recursive:true});writeFileSync(f,value);uploads++;return {error:null};}, download: async(b,p) => {if(failRead)throw Error("Lost check");return read(b,p);} }
});
const call = async (body: any) => handler(new Request("http://local.fixture",{method:"POST",headers:{Authorization:"Bearer local-owner","Content-Type":"application/json"},body:JSON.stringify(body)}));
const fields = (over: any = {}) => ({supplier_name:"Fornecedor Sintético",supplier_nif:"PT500111222",invoice_number:"TEST-"+randomUUID(),invoice_date:"2026-10-17",currency:"EUR",total_amount:123,iva_amount:23,customer_nif:"PT500000001",paid_by_partner_id:U,notes:"nota preservada",...over});
async function prepare() {
  const s=await (await call({action:"session"})).json();
  const form=new FormData();form.set("session_id",s.session.id);form.set("file",new NodeFile([bytes],"synthetic.pdf",{type:"application/pdf"}));
  const upload=await handler(new Request("http://local.fixture",{method:"POST",headers:{Authorization:"Bearer local-owner"},body:form}));if(upload.status!==200)console.log('upload diagnostic',await upload.clone().text());expect(upload.status).toBe(200);
  const doc=await upload.json(), f=fields();const r=await call({action:"preview",session_id:s.session.id,document_id:doc.id,fields:f});expect(r.status).toBe(200);
  return {s,doc,f,p:await r.json()};
}
const execute = (a:any) => call({action:"execute",session_id:a.s.session.id,preview_id:a.p.id,snapshot_hash:a.p.snapshot_hash,authorize:true});
const check = (a:any) => call({action:"check",session_id:a.s.session.id,preview_id:a.p.id});
const attempt = (sql:postgres.Sql,action:string,id:string|null,e:any=null,h:string|null=null,op="scanner_create",uid=U) => as(sql,uid,async tx => (await tx`select standalone_attempt_333(${action},${id},${op},${e===null?null:tx.json(e)},${h}) j`)[0].j);
const envelope = (over:any={}) => ({payload:{file_name:"synthetic.pdf",created_by:U,currency:"EUR",supplier_nif:null,invoice_number:null,total_amount:123,iva_amount:23,notes:randomUUID(),...over},document:{sha256:hash,size_bytes:bytes.length,mime:"application/pdf"},effects:["scanner_create"]});
const transport = (op="scanner_create",uid=U):AttemptTransport => ({rpc:async(action,id,e,h)=>{try{return await attempt(c2,action,id,e,h,op,uid)}catch(error){console.log('SQL diagnostic',action,String(error));throw error}},upload:async(p,b)=>{const f=objectPath("standalone-invoices",p);mkdirSync(f.slice(0,f.lastIndexOf('/')),{recursive:true});if(!existsSync(f))writeFileSync(f,b);},read:p=>read("standalone-invoices",p),verifyReceipt:async(p,b,m)=>{expect(Array.from((await read("standalone-invoices",p)) ?? [])).toEqual(Array.from(b));await receipt("standalone-invoices",p,b,m);}});
const attemptsHandler=createAttemptHandler({user:async token=>token==='local-owner'?{id:U}:null,
  context:async()=>({company_id:C}),transport:(_token,op)=>transport(op),
  snapshot:async(user,company,op,id,h)=>{const row=(await db`select * from standalone_attempts_333 where id=${id} and principal=${user} and company_id=${company} and operation=${op} and envelope_hash=${h}`)[0];return row?{id:row.id,hash:row.envelope_hash,user_id:row.principal,company_id:row.company_id,operation:row.operation,envelope:row.envelope}:null},
  capabilities:async()=>({scanner_create:true,accountant_edit:true}),
  list:(_token,op,after)=>as(c1,U,async tx=>(await tx`select standalone_attempt_list_333(${op},${after}) j`)[0].j),
  cors:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,x-attempt-user,x-attempt-company'}});
beforeAll(async()=>{
  vi.stubGlobal("crypto",webcrypto);
  const probe=new FormData();probe.set('file',new NodeFile([bytes],'probe.pdf',{type:'application/pdf'}));
  const parsed=await new Response(probe).formData();const parsedFile=parsed.get('file');
  if(!parsedFile || typeof parsedFile==='string')throw Error('Local multipart fixture missing');
  vi.stubGlobal("File",parsedFile.constructor);
  execFileSync("chown",["1000:1000",dir]);pg("initdb",["-D",dir+"/data","-U","postgres","--auth=trust","--no-locale","-E","UTF8"]);pg("pg_ctl",["-D",dir+"/data","-w","-l",dir+"/log","-o",`-k ${dir} -p ${port} -c listen_addresses=''`,"start"]);started=true;
  db=connect();c1=connect();c2=connect();
  for(const f of ["docs/testes/issue333/pg/fixture.sql","drizzle/migrations/0190_issue333_core_v2_closed_structure.sql","drizzle/migrations/0191_issue333_attempts_closed_structure.sql","drizzle/migrations/0192_issue333_service_only_capability_reader.sql"])await db.unsafe(readFileSync(f,"utf8"));
  await db`insert into companies values (${C},'Empresa Sintética A','PT500000001','active'),(${D},'Empresa Sintética B','PT500000002','active')`;
  for(const [id,company,role,name] of [[U,C,'manager','Autorizador Sintético'],[V,C,'manager','Outro Gestor'],[W,D,'manager','Gestor B'],[E,C,'editor','Editor Sintético']]) {await db`insert into auth.users values (${id})`;await db`insert into profiles values (${id},${name},${company},${company})`;await db`insert into user_roles(user_id,company_id,role) values (${id},${company},${role})`;}
  await db`insert into data_entry_settings values(true,true,true)`;await db`insert into standalone_attempt_settings_333(operation,enabled) values('assistant_create',true),('scanner_create',true),('accountant_edit',true),('ingest_create',true)`;
  boundary.rpc=async()=>({data:await core('my_effective_permissions',{}),error:null});
  boundary.invoke=async(name:string,options:any)=>{
    if(name!=='standalone-attempt-333')throw Error('External function blocked '+name);
    const response=await attemptsHandler(new Request('http://local.fixture',{method:'POST',headers:{Authorization:'Bearer local-owner','Content-Type':'application/json',...options.headers},body:JSON.stringify(options.body)}));
    return {data:await response.json(),error:response.ok?null:Error('HTTP '+response.status)};
  };
  boundary.query=(table:string)=>{if(table!=='user_roles')throw Error('Unlisted scanner query '+table);const q:any={select:()=>q,eq:()=>q,then:(ok:any)=>Promise.resolve({data:[],error:null}).then(ok)};return q;};
  vi.stubGlobal("fetch",async(input:any,init?:RequestInit)=>{const url=String(input);if(!url.startsWith("http://127.0.0.1:9/functions/v1/data-entry"))throw Error("External egress forbidden: "+url);return handler(new Request(url,init));});
},60000);
afterAll(async()=>{cleanup();
  if(db && process.env.ISSUE333_EVIDENCE){
    const snapshot:Record<string,unknown>={pg_version:(await db`select version() v`)[0].v,storage_root:storageRoot};
    for(const table of ['standalone_invoices','data_entry_sessions','data_entry_documents','data_entry_messages','data_entry_storage_receipts','data_entry_previews','data_entry_results','standalone_attempts_333','standalone_attempt_audit_333','transactions','event_forecasts','transaction_payments','financial_accounts','reimbursements']){
      const exists=(await db`select to_regclass(${table}) t`)[0].t;
      if(exists)snapshot[table]=(await db.unsafe(`select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) rows from ${table} t`))[0].rows;
    }
    const files:Record<string,unknown>={};const walk=(path:string)=>{if(!existsSync(path))return;for(const entry of readdirSync(path,{withFileTypes:true})){const p=path+'/'+entry.name;if(entry.isDirectory())walk(p);else {const b=readFileSync(p);files[p.slice(storageRoot.length+1)]={size:b.length,sha256:sha(b)}}}};walk(storageRoot);snapshot.objects=files;
    writeFileSync(process.env.ISSUE333_EVIDENCE+'/local-sql-bytes-snapshot.json',JSON.stringify(snapshot,null,2));
  }
  await Promise.all([db?.end(),c1?.end(),c2?.end()]);if(started)pg("pg_ctl",["-D",dir+"/data","-m","immediate","stop"]);vi.unstubAllGlobals();});
it("real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit",async()=>{
  const a=await prepare();const r=await execute(a);expect(r.status).toBe(200);const out=await r.json();expect(out.status).toBe("conferido");
  const row=(await db`select * from standalone_invoices where id=${out.result.invoice_id}`)[0];expect(row).toMatchObject({company_id:C,created_by:U,supplier_name:a.f.supplier_name,supplier_nif:a.f.supplier_nif,invoice_number:a.f.invoice_number,notes:expect.stringContaining("nota preservada"),paid_by_partner_id:U});expect(Number(row.total_amount)).toBe(123);expect(Number(row.iva_amount)).toBe(23);expect(row.invoice_date.toISOString().slice(0,10)).toBe("2026-10-17");
  expect(out.result.observation).toContain("autorização de Autorizador Sintético");expect(Array.from((await read("standalone-invoices",row.storage_path)) ?? [])).toEqual(Array.from(bytes));
  expect(Number((await db`select count(*) n from standalone_attempt_audit_333 where attempt_id=(select id from standalone_attempts_333 where destination_id=${row.id})`)[0].n)).toBe(1);
  await db`update standalone_invoices set status='processed' where id=${row.id}`;expect((await (await check(a)).json()).persisted.status).toBe("processed");
  const before=uploads;expect((await (await execute(a)).json()).status).toBe("conferido");expect(uploads).toBe(before);
  expect(Number((await db`select (select count(*) from transactions)+(select count(*) from event_forecasts)+(select count(*) from transaction_payments)+(select count(*) from financial_accounts)+(select count(*) from reimbursements) n`)[0].n)).toBe(0);
});
it("no authorization/stale preview/foreign owner and tenant cannot create an invoice",async()=>{
  const a=await prepare();const n=Number((await db`select count(*) n from standalone_invoices`)[0].n);
  expect((await call({action:"execute",session_id:a.s.session.id,preview_id:a.p.id,snapshot_hash:a.p.snapshot_hash,authorize:false})).status).toBe(400);
  await core("data_entry_prepare",{p_session:a.s.session.id,p_document:a.doc.id,p_fields:{...a.f,notes:"changed"}});expect((await execute(a)).status).toBe(409);
  for(const uid of [V,W,E])expect((await err(core("data_entry_session",{p_session:a.s.session.id},uid)))?.code).toBe("42501");
  expect(Number((await db`select count(*) n from standalone_invoices`)[0].n)).toBe(n);
});
it("lost commit response and failed read-only check preserve candidate; recovery reads one effect",async()=>{
  const a=await prepare();lostCommit=true;expect((await (await execute(a)).json()).status).toBe("por_confirmar");
  failRead=true;expect((await check(a)).status).toBe(503);failRead=false;
  expect((await (await check(a)).json()).status).toBe("conferido");expect(Number((await db`select count(*) n from standalone_invoices where invoice_number=${a.f.invoice_number}`)[0].n)).toBe(1);
});
it("two SQL connections at real row lock: one effect; gate closing while waiting denies commit",async()=>{
  const e=envelope(),a=await attempt(c1,"prepare",null,e);await transport().upload(a.path,bytes,"application/pdf");await receipt("standalone-invoices",a.path);await attempt(c1,"authorize",a.id,null,a.hash);await attempt(c1,"begin",a.id,null,a.hash);
  let release=()=>{},entered=()=>{};const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>entered=r);
  const first=as(c1,U,async tx=>{const r=(await tx`select standalone_attempt_333('commit',${a.id},'scanner_create',null,${a.hash}) j`)[0].j;entered();await gate;return r;});await ready;
  let done=false;const second=attempt(c2,"commit",a.id,null,a.hash).then(r=>{done=true;return r});await new Promise(r=>setTimeout(r,100));expect(done).toBe(false);release();const one=await first,two=await second;expect(one.result.id).toBe(two.result.id);
  expect((await attempt(c1,"prepare",randomUUID(),e)).id).toBe(a.id);
  const b=await attempt(c1,"prepare",null,envelope());await transport().upload(b.path,bytes,"application/pdf");await receipt("standalone-invoices",b.path);await attempt(c1,"authorize",b.id,null,b.hash);await attempt(c1,"begin",b.id,null,b.hash);
  let unlock=()=>{},locked=()=>{};const hold=new Promise<void>(r=>unlock=r),held=new Promise<void>(r=>locked=r);const lock=c2.begin(async tx=>{await tx`select id from standalone_attempts_333 where id=${b.id} for update`;locked();await hold});await held;
  const waiting=err(attempt(c1,"commit",b.id,null,b.hash));await new Promise(r=>setTimeout(r,100));await db`update standalone_attempt_settings_333 set enabled=false where operation='scanner_create'`;unlock();await lock;
  try{expect((await waiting)?.code).toBe("42501");expect(Number((await db`select count(*) n from standalone_invoices where id=${b.destination_id}`)[0].n)).toBe(0);}finally{await db`update standalone_attempt_settings_333 set enabled=true where operation='scanner_create'`;}
});
it("new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review",async()=>{
  const a=await attempt(c1,"prepare",null,envelope());const out=await executeAttempt(transport(),a,bytes);if(out.status!=='conferido')console.log('attempt diagnostic',JSON.stringify(out));expect(out.status).toBe("conferido");
  const b=await attempt(c1,"prepare",null,envelope());await executeAttempt(transport(),b,bytes);
  const n=await attempt(c1,"confirm_new_intent",a.id,null,a.hash);expect(n.prior_attempt_id).toBe(a.id);expect((await executeAttempt(transport(),n,bytes)).status).toBe("conferido");
  expect((await err(attempt(c1,"confirm_new_intent",a.id,null,a.hash)))?.code).toBe("40001");
  const bad=await attempt(c1,"prepare",null,envelope({iva_amount:124}));expect(bad.review_reason).toBe("iva_exceeds_total");expect((await executeAttempt(transport(),bad,bytes)).status).toBe("pendente");
  const e=envelope({supplier_nif:"pt001",invoice_number:"FT1/23"}),strong=await attempt(c1,"prepare",null,e);await executeAttempt(transport(),strong,bytes);
  expect((await err(attempt(c1,"confirm_new_intent",strong.id,null,strong.hash)))?.code).toBe("23505");
  const dup=await attempt(c1,"prepare",null,envelope({supplier_nif:" PT001 ",invoice_number:" ft1/23 "}));expect((await executeAttempt(transport(),dup,bytes)).attempt.state).toBe("review");
  expect((await checkAttempt(transport(),n)).status).toBe("conferido");
});
it("real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter",async()=>{
  localStorage.clear();render(<MemoryRouter><DataEntryDialog open onOpenChange={()=>{}} adapter={edgeDataEntryAdapter}/></MemoryRouter>);
  const button=await screen.findByRole("button",{name:"Novo lote"});await waitFor(()=>expect(button).not.toBeDisabled());fireEvent.click(button);
  const input=await screen.findByLabelText("Escolher documento");fireEvent.change(input,{target:{files:[new NodeFile([bytes],"ui-synthetic.pdf",{type:"application/pdf"})]}});
  await waitFor(()=>expect(screen.getByLabelText("Fornecedor")).not.toBeDisabled());
  for(const [label,value] of [["Fornecedor","Fornecedor UI"],["NIF do fornecedor","PT500111223"],["Número da fatura","UI-"+randomUUID()],["Data da fatura","2026-10-17"],["Total (EUR)","123"],["IVA (EUR)","23"],["NIF do destinatário no documento","PT500000001"]])fireEvent.change(screen.getByLabelText(label),{target:{value}});
  fireEvent.change(screen.getByLabelText("Quem pagou"),{target:{value:U}});fireEvent.click(screen.getByRole("button",{name:"Preparar prévia"}));
  await screen.findByRole("checkbox");fireEvent.click(screen.getByRole("checkbox"));const exec=screen.getByRole("button",{name:"Autorizar e executar este lote"});await waitFor(()=>expect(exec).not.toBeDisabled());fireEvent.click(exec);fireEvent.click(exec);
  await screen.findByText("Registado e conferido");expect(screen.getByRole("link",{name:"Abrir Faturas Avulsas"})).toHaveAttribute("href","/scanner-faturas");
  expect(Number((await db`select count(*) n from standalone_invoices where supplier_name='Fornecedor UI'`)[0].n)).toBe(1);cleanup();
});
it('scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice',async()=>{
  cleanup();sessionStorage.clear();
  const original=await attempt(c1,'prepare',null,envelope());await executeAttempt(transport(),original,bytes);
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><MemoryRouter><StandaloneInvoiceScanner/></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Procurar as minhas tentativas'}));
  const select=await screen.findByLabelText('Tentativa a consultar');
  await waitFor(()=>expect(select.querySelector(`option[value="${original.id}"]`)).not.toBeNull());
  fireEvent.change(select,{target:{value:original.id}});
  fireEvent.click(await screen.findByRole('button',{name:'Registar outra fatura com os mesmos dados…'}));
  fireEvent.click(screen.getByRole('button',{name:'Confirmar nova fatura'}));
  await screen.findByText('Nova intenção técnica confirmada. A fatura não foi gravada.');
  const newId=(select as HTMLSelectElement).value;expect(newId).not.toBe(original.id);
  fireEvent.change(screen.getByLabelText('Documento original da reserva'),{target:{files:[new NodeFile([bytes],'synthetic.pdf',{type:'application/pdf'})]}});
  const before=Number((await db`select count(*) n from standalone_invoices`)[0].n);
  const button=screen.getByRole('button',{name:'Autorizar execução da reserva preparada'});fireEvent.click(button);fireEvent.click(button);
  await screen.findByText('Fatura guardada.');
  expect(Number((await db`select count(*) n from standalone_invoices`)[0].n)).toBe(before+1);
  expect((await attempt(c1,'check',newId,null,original.hash)).record_ok).toBe(true);
  expect(Number((await db`select count(*) n from standalone_attempt_audit_333 where attempt_id=${newId}`)[0].n)).toBe(1);
  cleanup();client.clear();
});
it('prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again',async()=>{
  cleanup();const a=await attempt(c1,'prepare',null,envelope());const before=Number((await db`select count(*) n from standalone_invoices`)[0].n);
  render(<StandaloneReservedExecution id={a.id} hash={a.hash} context={{user_id:U,company_id:C}} onChecked={()=>{throw Error('false success')}}/>);
  fireEvent.change(screen.getByLabelText('Documento original da reserva'),{target:{files:[new NodeFile([pdfFixture('changed')],'synthetic.pdf',{type:'application/pdf'})]}});
  await screen.findByRole('region',{name:'Dados confirmados da reserva'});fireEvent.click(screen.getByRole('button',{name:'Autorizar execução da reserva preparada'}));await screen.findByText('Documento divergente');
  await attempt(c1,'authorize',a.id,null,a.hash);await attempt(c1,'begin',a.id,null,a.hash);
  fireEvent.change(screen.getByLabelText('Documento original da reserva'),{target:{files:[new NodeFile([bytes],'synthetic.pdf',{type:'application/pdf'})]}});
  fireEvent.click(screen.getByRole('button',{name:'Autorizar execução da reserva preparada'}));await screen.findByText('Consulta o resultado; esta reserva não permite uma nova execução.');
  expect(Number((await db`select count(*) n from standalone_invoices`)[0].n)).toBe(before);cleanup();
});
it('actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer',async()=>{
  cleanup();sessionStorage.clear();
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const {container}=render(<QueryClientProvider client={client}><MemoryRouter><StandaloneInvoiceScanner/></MemoryRouter></QueryClientProvider>);
  const input=container.querySelector('input[type="file"]');if(!input)throw Error('Scanner file input absent');
  fireEvent.change(input,{target:{files:[new NodeFile([bytes],'scanner-capture.pdf',{type:'application/pdf'})]}});
  await screen.findByLabelText('Total (EUR)');
  fireEvent.change(screen.getByLabelText('Total (EUR)'),{target:{value:'123'}});fireEvent.change(screen.getByLabelText('IVA (€)'),{target:{value:'23'}});
  fireEvent.change(screen.getByLabelText('Fornecedor (opcional)'),{target:{value:'Scanner capture fixture'}});
  const before=Number((await db`select count(*) n from standalone_invoices where supplier_name='Scanner capture fixture'`)[0].n);
  fireEvent.click(screen.getByRole('button',{name:'Guardar fatura'}));await screen.findByText('Fatura guardada.');
  expect(Number((await db`select count(*) n from standalone_invoices where supplier_name='Scanner capture fixture'`)[0].n)).toBe(before+1);
  expect(Number((await db`select count(*) n from standalone_attempt_audit_333 where result->>'supplier_name'='Scanner capture fixture'`)[0].n)).toBe(1);
  cleanup();client.clear();
});
it.each(['reserve','upload','receipt','commit','check'])('lost response after %s preserves bytes and destination; recovery is read-only',async boundaryName=>{
  const e=envelope();const a=await attempt(c1,'prepare',null,e);const t=transport();let lost=false;
  const wrapped:AttemptTransport={...t,
    rpc:async(action,id,en,h)=>{const result=await t.rpc(action,id,en,h);if(!lost && ((boundaryName==='reserve' && action==='authorize') || boundaryName===action)){lost=true;throw Error('lost response after '+action)}return result},
    upload:async(p,b,m)=>{await t.upload(p,b,m);if(boundaryName==='upload'&&!lost){lost=true;throw Error('lost upload')}},
    verifyReceipt:async(p,b,m)=>{await t.verifyReceipt(p,b,m);if(boundaryName==='receipt'&&!lost){lost=true;throw Error('lost receipt')}}};
  const out=await executeAttempt(wrapped,a,bytes);expect(lost).toBe(true);
  const before=Number((await db`select count(*) n from standalone_invoices where id=${a.destination_id}`)[0].n);
  const checked=await checkAttempt(t,a);expect(checked.status).toBe(boundaryName==='commit'||boundaryName==='check'?'conferido':'pendente');
  expect(Number((await db`select count(*) n from standalone_invoices where id=${a.destination_id}`)[0].n)).toBe(before);
  expect(before).toBe(boundaryName==='commit'||boundaryName==='check'?1:0);
  if(boundaryName!=='reserve')expect(sha((await read('standalone-invoices',a.path))??new Uint8Array())).toBe(hash);
  expect((await attempt(c1,'prepare',randomUUID(),e)).id).toBe(a.id);
  expect(out.status).toBe(checked.status);
});
it('real SQL rollback after mutation before audit leaves zero effect and persistent reservation',async()=>{
  const a=await attempt(c1,'prepare',null,envelope());await transport().upload(a.path,bytes,'application/pdf');await receipt('standalone-invoices',a.path);await attempt(c1,'authorize',a.id,null,a.hash);await attempt(c1,'begin',a.id,null,a.hash);
  await db.unsafe(`create function head_fail_audit() returns trigger language plpgsql as $$ begin if current_setting('test.fail_audit',true)='on' then raise exception 'injected audit failure'; end if; return new; end $$;create trigger head_fail_audit before insert on standalone_attempt_audit_333 for each row execute function head_fail_audit();`);
  const failure=await err(as(c1,U,async tx=>{await tx`select set_config('test.fail_audit','on',true)`;return tx`select standalone_attempt_333('commit',${a.id},'scanner_create',null,${a.hash})`}));expect(failure?.message).toBe('injected audit failure');
  expect(Number((await db`select count(*) n from standalone_invoices where id=${a.destination_id}`)[0].n)).toBe(0);
  expect((await attempt(c2,'check',a.id,null,a.hash)).state).toBe('inprogress');expect(sha((await read('standalone-invoices',a.path))??new Uint8Array())).toBe(hash);
});
it('accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice',async()=>{
  const a=await attempt(c1,'prepare',null,envelope());const result=await executeAttempt(transport(),a,bytes);const row=result.attempt.current;
  expect(row).not.toBeNull();if(!row)throw Error('Missing row');
  const e={...envelope({notes:'edited',file_name:row.file_name}),target:row.id,before:row,effects:['accountant_edit']};
  const edit=await attempt(c1,'prepare',null,e,null,'accountant_edit');const t=transport('accountant_edit');
  await t.upload(edit.path,bytes,'application/pdf');await t.verifyReceipt(edit.path,bytes,'application/pdf');await attempt(c1,'authorize',edit.id,null,edit.hash,'accountant_edit');await attempt(c1,'begin',edit.id,null,edit.hash,'accountant_edit');
  await db`update standalone_invoices set notes='concurrent edit' where id=${row.id}`;
  const refused=await attempt(c1,'commit',edit.id,null,edit.hash,'accountant_edit');expect(refused.state).toBe('review');expect(refused.review_reason).toBe('before_changed');expect(refused.current.notes).toBe('concurrent edit');
  expect(Number((await db`select count(*) n from standalone_invoices where id=${row.id}`)[0].n)).toBe(1);
});
it('SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced',async()=>{
  const a=await attempt(c1,'prepare',null,envelope());await executeAttempt(transport(),a,bytes);
  writeFileSync(objectPath('standalone-invoices',a.path),pdfFixture('corrupted'));expect((await checkAttempt(transport(),a)).status).toBe('pendente');
  expect((await err(db`update standalone_attempts_333 set envelope_hash='bad' where id=${a.id}`))?.message).toBe('#333: Identidade imutável');
  expect(await err(db`delete from standalone_attempt_audit_333 where attempt_id=${a.id}`)).not.toBeNull();
  for(const [input,expected] of [[' FT01/23 ','FT01/23'],['ab-01','AB-01'],['ab/01','AB/01'],['Áb01','ÁB01'],['ab 01','AB 01']])expect((await db`select standalone_strong_key_333(${input}) k`)[0].k).toBe(expected);
  for(const uid of [V,W,E])expect((await err(attempt(c1,'check',a.id,null,a.hash,'scanner_create',uid)))?.code).toBe('42501');
});
it('closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects',async()=>{
  const a=await prepare();await db`delete from data_entry_settings`;await db`update standalone_attempt_settings_333 set enabled=false`;
  try {
    const n=Number((await db`select count(*) n from data_entry_sessions`)[0].n);
    for(const [name,args] of [['data_entry_session',{}],['data_entry_note',{p_session:a.s.session.id,p_body:'note'}],['data_entry_add_document',{p_session:a.s.session.id,p_name:'f.pdf',p_sha:hash,p_size:bytes.length,p_mime:'application/pdf'}],['data_entry_prepare',{p_session:a.s.session.id,p_document:a.doc.id,p_fields:a.f}]] as const)expect((await err(core(name,args)))?.code).toBe('42501');
    expect((await core('data_entry_session',{p_session:a.s.session.id})).session.id).toBe(a.s.session.id);
    expect(Number((await db`select count(*) n from data_entry_sessions`)[0].n)).toBe(n);
    expect((await err(as(c1,U,tx=>tx`select standalone_attempt_capability_333()`)))?.code).toBe('42501');
    expect((await err(as(c1,U,tx=>tx`select * from standalone_attempts_333`)))?.code).toBe('42501');
    expect((await err(attempt(c1,'prepare',null,envelope())))?.code).toBe('42501');
  }finally {await db`insert into data_entry_settings values(true,true,true)`;await db`update standalone_attempt_settings_333 set enabled=true`;}
});
it('Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud',async()=>{
  const a=await attempt(c1,'prepare',null,envelope());const methods:string[]=[];
  const target=createServer(async(req,res)=>{methods.push(req.method??'');let body='';for await(const chunk of req)body+=chunk;const r=await attemptsHandler(new Request('http://local.fixture',{method:req.method,headers:req.headers as Record<string,string>,...(req.method==='POST'?{body}:{})}));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text())});
  const origin=createServer((_,res)=>res.end('<html><body>Local isolated HTTP boundary</body></html>'));
  await new Promise<void>(r=>target.listen(0,'127.0.0.1',r));await new Promise<void>(r=>origin.listen(0,'127.0.0.1',r));const dest=target.address(),source=origin.address();if(!dest||typeof dest==='string'||!source||typeof source==='string')throw Error('Local listeners absent');
  try{const body={action:'execute',operation:'scanner_create',id:a.id,hash:a.hash,conteudo_base64:Buffer.from(bytes).toString('base64')};
    const script=`import asyncio,json\nfrom playwright.async_api import async_playwright\nasync def main():\n async with async_playwright() as p:\n  browser=await p.chromium.launch(headless=True)\n  page=await browser.new_page(viewport={"width":1280,"height":1800})\n  await page.goto('http://127.0.0.1:${source.port}')\n  result=await page.evaluate("""async()=>{const r=await fetch('http://127.0.0.1:${dest.port}',{method:'POST',headers:{'Authorization':'Bearer local-owner','Content-Type':'application/json','X-Attempt-User':'${U}','X-Attempt-Company':'${C}'},body:JSON.stringify(${JSON.stringify(body)})});return {status:r.status,body:await r.json()}}""")\n  print(json.dumps(result))\n  await browser.close()\nasyncio.run(main())`;
    const output=await promisify(execFile)(process.env.ISSUE333_PYTHON??'python3',['-c',script],{env:{PATH:'/bin:/usr/bin',HOME:'/tmp',PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH}});const out=JSON.parse(output.stdout);expect(out.status).toBe(200);expect(out.body.status).toBe('conferido');expect(methods).toEqual(['OPTIONS','POST']);expect((await attempt(c1,'check',a.id,null,a.hash)).record_ok).toBe(true);
  }finally{await Promise.all([new Promise<void>(r=>target.close(()=>r())),new Promise<void>(r=>origin.close(()=>r()))])}
});
it('real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination',async()=>{
  const jsonRow=(row:any)=>JSON.parse(JSON.stringify(row,(_k,v)=>v));
  const query=(table:string)=>{const filters:Record<string,unknown>={};let after:string|null=null,size=200,payload:any;
    const selectRows=async()=>{
      if(table==='companies')return db`select id from companies where id=${filters.id}`;
      if(table!=='standalone_invoices')throw Error('Forbidden ingest table '+table);
      const rows=filters.id?await db`select to_jsonb(i) j from standalone_invoices i where id=${filters.id} and company_id=${filters.company_id}`:await db`select to_jsonb(i) j from standalone_invoices i where company_id=${filters.company_id} and (${after}::uuid is null or id>${after}::uuid) order by id limit ${size}`;
      return rows.map(r=>r.j);
    };
    const q:any={select:()=>q,eq:(k:string,v:any)=>{filters[k]=v;return q},gt:(_k:string,v:string)=>{after=v;return q},order:()=>q,limit:(n:number)=>{size=n;return q},insert:(v:any)=>{payload=v;return q},
      maybeSingle:async()=>({data:(await selectRows())[0]??null,error:null}),
      single:async()=>{try{const row=(await db`insert into standalone_invoices ${db(payload)} returning to_jsonb(standalone_invoices) j`)[0].j;return {data:row,error:null}}catch(error){console.log('local insert error',String(error));return {data:null,error}}},
      then:(ok:any,bad:any)=>selectRows().then(data=>({data,error:null})).then(ok,bad)};return q;
  };
  ingestBoundary.client={from:query,rpc:async(name:string,args:any)=>{try{const data=await db.begin(async tx=>{await tx`set local role service_role`;
    if(name==='data_entry_record_receipt')return tx`select data_entry_record_receipt(${args.p_bucket},${args.p_path},${args.p_sha},${args.p_size},${args.p_mime})`;
    if(name!=='standalone_ingest_attempt_333')throw Error('Unlisted service RPC');
    return (await tx`select standalone_ingest_attempt_333(${args.p_company},${args.p_action},${args.p_id},${args.p_envelope===null?null:tx.json(args.p_envelope)},${args.p_hash}) j`)[0].j});return {data,error:null}}catch(error){return {data:null,error}}},
    storage:{from:(bucket:string)=>({upload:async(path:string,b:Uint8Array)=>{const f=objectPath(bucket,path);if(existsSync(f))return {error:{statusCode:'409'}};mkdirSync(f.slice(0,f.lastIndexOf('/')),{recursive:true});writeFileSync(f,b);return {error:null}},download:async(path:string)=>{const b=await read(bucket,path);return {data:b?new NodeBlob([b]):null,error:null}},remove:()=>{throw Error('candidate removal forbidden')}})}};
  vi.stubGlobal('Deno',{env:{get:(name:string)=>name==='SUPABASE_URL'?'http://127.0.0.1:9':name==='SUPABASE_SERVICE_ROLE_KEY'?'local-service-fixture':undefined},serve:(h:any)=>{ingestBoundary.handler=h}});
  await import('../../../../supabase/functions/ingest-standalone-invoice/index');
  vi.stubGlobal('fetch',async(input:any)=>{if(String(input)==='http://127.0.0.1:9/auth/v1/admin/users?per_page=1')return new Response('{}');throw Error('Business egress blocked '+String(input))});
  const invoke=(body:any)=>ingestBoundary.handler(new Request('http://local.fixture',{method:'POST',headers:{Authorization:'Bearer local-service-fixture','Content-Type':'application/json'},body:JSON.stringify(body)}));
  try{for(const currency of ['EUR','USD','BRL','GBP'])for(const tracked of [false,true]){
    const body={nome:'ingest.pdf',company_id:C,conteudo_base64:Buffer.from(bytes).toString('base64'),supplier_name:'Synthetic ingest',supplier_nif:null,invoice_number:null,invoice_date:'2026-10-17',currency,total_amount:123,iva_amount:23,notes:randomUUID(),created_by:U,paid_by_partner_id:U,...(currency==='EUR'?{}:{original_amount:246,fx_rate:.5,fx_rate_source:'manual fixture'}),...(tracked?{attempt_id:randomUUID()}:{})};
    const response=await invoke(body);if(response.status!==200)console.log('ingest diagnostic',await response.clone().text());expect(response.status).toBe(200);const result=await response.json();
    if(!tracked)expect(result.attempt_coverage).toBe('legacy_untracked');else expect(result.status).toBe('conferido');
    const row=(await db`select to_jsonb(i) j from standalone_invoices i where id=${tracked?result.result.id:result.id}`)[0].j;expect(row.currency).toBe(currency);expect(Number(row.total_amount)).toBe(123);expect(sha((await read('standalone-invoices',row.storage_path))??new Uint8Array())).toBe(hash);
    if(tracked){const retry=await invoke({...body,attempt_id:randomUUID()});expect(retry.status).toBe(200);expect((await retry.json()).result.id).toBe(result.result.id);}
  }}finally{vi.stubGlobal('fetch',()=>{throw Error('Business egress blocked')})}
  expect(Number((await db`select (select count(*) from transactions)+(select count(*) from event_forecasts)+(select count(*) from transaction_payments)+(select count(*) from financial_accounts)+(select count(*) from reimbursements) n`)[0].n)).toBe(0);
});
it('canonical endpoint pages actual owner rows with cursor; populated owner/tenant isolation, no client table access',async()=>{
  for(let i=0;i<55;i++)await attempt(c1,'prepare',null,envelope({notes:'page-'+i}));
  const ids=new Set<string>();let after:string|null=null,pages=0;
  do {const response=await attemptsHandler(new Request('http://local.fixture',{method:'POST',headers:{Authorization:'Bearer local-owner','X-Attempt-User':U,'X-Attempt-Company':C},body:JSON.stringify({action:'list',operation:'scanner_create',after})}));expect(response.status).toBe(200);const page=await response.json();expect(page.items.length).toBeLessThanOrEqual(50);expect(page.next).not.toBe(after===null?'non-null-impossible':after);
    for(const item of page.items){expect(ids.has(item.id)).toBe(false);ids.add(item.id)}after=page.next;pages++;
    if(pages>10)throw Error('Repeated cursor');
  }while(after!==null);
  expect(pages).toBeGreaterThan(1);expect(ids.size).toBe(Number((await db`select count(*) n from standalone_attempts_333 where principal=${U} and company_id=${C} and operation='scanner_create'`)[0].n));
  for(const uid of [V,W]){const page=await as(c1,uid,async tx=>(await tx`select standalone_attempt_list_333('scanner_create',null) j`)[0].j);expect(page.items).toEqual([]);expect(ids.size).toBeGreaterThan(55)}
});
it('attempt endpoint rejects anon/forged context/truncated MIME/oversized stream and never creates an invoice',async()=>{
  const a=await attempt(c1,'prepare',null,envelope());const before=Number((await db`select count(*) n from standalone_invoices`)[0].n);
  const headers={Authorization:'Bearer local-owner','X-Attempt-User':U,'X-Attempt-Company':C};
  const body={action:'execute',operation:'scanner_create',id:a.id,hash:a.hash,conteudo_base64:Buffer.from(bytes.slice(0,5)).toString('base64')};
  for(const [extra,status] of [[{Authorization:''},401],[{'X-Attempt-User':V},409],[{'X-Attempt-Company':D},409],[{},422]] as const){const response=await attemptsHandler(new Request('http://local.fixture',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)}));expect(response.status).toBe(status)}
  let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(28100001))},cancel(){cancelled=true}});
  expect((await attemptsHandler(new Request('http://local.fixture',{method:'POST',headers,body:stream,duplex:'half'} as RequestInit))).status).toBe(413);expect(cancelled).toBe(true);
  expect(Number((await db`select count(*) n from standalone_invoices`)[0].n)).toBe(before);
});
it('actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof',async()=>{
  cleanup();sessionStorage.clear();const a=await attempt(c1,'prepare',null,envelope({supplier_name:'Accountant UI fixture'}));await executeAttempt(transport(),a,bytes);
  const originalQuery=boundary.query;
  boundary.query=(table:string)=>{if(table==='user_roles')return originalQuery(table);if(table!=='standalone_invoices')throw Error('Unlisted editor table '+table);
    const q:any={select:()=>q,eq:()=>q,is:()=>q,gte:()=>q,lt:()=>q,order:()=>q,limit:()=>q,
      then:(ok:any,bad:any)=>db`select to_jsonb(i) j from standalone_invoices i where id=${a.destination_id}`.then(rows=>({data:rows.map(r=>r.j),error:null})).then(ok,bad)};return q;
  };
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  try{render(<QueryClientProvider client={client}><AccountantStandaloneInvoicesTab/></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button',{name:'Editar'}));
    fireEvent.change(await screen.findByLabelText('Nota'),{target:{value:'metadata edit via real UI'}});
    fireEvent.click(screen.getByRole('button',{name:'Guardar',exact:true}));
    await waitFor(()=>expect(screen.queryByRole('heading',{name:'Editar fatura avulsa'})).toBeNull());
    expect((await db`select notes from standalone_invoices where id=${a.destination_id}`)[0].notes).toBe('metadata edit via real UI');
    expect(Number((await db`select count(*) n from standalone_attempt_audit_333 where result->>'notes'='metadata edit via real UI'`)[0].n)).toBe(1);
    expect(sha((await read('standalone-invoices',a.path))??new Uint8Array())).toBe(hash);
  }finally{cleanup();client.clear();boundary.query=originalQuery}
});
it('Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery',async()=>{
  cleanup(); const nativeFetch=globalThis.fetch;
  const nodeUint8=(new TextEncoder().encode('')).constructor;
  vi.stubGlobal('Uint8Array',nodeUint8);
  const {createServer:createVite}=await import('vite');
  const {resolve}=await import('node:path');
  const fault={action:'',lost:false,paused:false,entered:false,release:null as null|(()=>void)};
  const calls:Array<Record<string,unknown>>=[];
  const localTransport=(op:string):AttemptTransport=>{const t=transport(op);return {...t,rpc:async(action,id,e,h)=>{
    calls.push({kind:'rpc',action,id,operation:op});const result=await t.rpc(action,id,e,h);
    if(action===fault.action&&!fault.lost){fault.lost=true;fault.entered=true;if(fault.paused)await new Promise<void>(r=>fault.release=r);throw Error('Proof32 lost after '+action)}return result;
  }}};
  const snapshot=async(user:string,company:string,op:string,id:string,h:string)=>{const row=(await db`select id,company_id,principal,operation,envelope_hash,envelope from standalone_attempts_333 where id=${id} and company_id=${company} and principal=${user} and operation=${op} and envelope_hash=${h}`)[0];return row?{id:row.id,user_id:row.principal,company_id:row.company_id,operation:row.operation,hash:row.envelope_hash,envelope:row.envelope}:null};
  const ah=createAttemptHandler({user:async t=>t==='local-owner'?{id:U}:null,context:async()=>({company_id:C}),transport:(_t,op)=>localTransport(op),snapshot,capabilities:async()=>({scanner_create:true,accountant_edit:true}),list:(_t,op,after)=>as(c1,U,async tx=>(await tx`select standalone_attempt_list_333(${op},${after}) j`)[0].j),cors:{}});
  const ch=createHandler({cors:{},uploadEnabled:true,getUser:async t=>t==='local-owner'?{id:U}:null,userRpc:async(_t,name,args)=>{try{calls.push({kind:'core',name,action:args.p_action,preview:args.p_preview});const data=await core(name,args);if(name==='data_entry_attempt_333'&&args.p_action===fault.action&&!fault.lost){fault.lost=true;fault.entered=true;if(fault.paused)await new Promise<void>(r=>fault.release=r);throw Error('Proof32 core lost '+args.p_action)}return {data,error:null}}catch(e){return {data:null,error:{code:(e as any).code??'08006',message:String(e)}}}},recordReceipt:async(b,p,h,n,m)=>{const stored=await read(b,p);if(!stored||sha(stored)!==h||stored.length!==n)return {data:null,error:{message:'Readback mismatch'}};await receipt(b,p,stored,m);return {data:null,error:null}},storage:{upload:async(b,p,value)=>{const f=objectPath(b,p);if(existsSync(f))return {error:{conflict:true}};mkdirSync(f.slice(0,f.lastIndexOf('/')),{recursive:true});writeFileSync(f,value);calls.push({kind:'upload',path:p,sha256:sha(value)});return {error:null}},download:read}});
  const localCss=resolve('src/index.css');const originalCss=readFileSync(localCss,'utf8');writeFileSync(localCss,originalCss.split('\n').filter(line=>!line.startsWith('@import url(')).join('\n'));
  const vite=await createVite({configFile:false,cacheDir:dir+'/vite-cache',root:process.cwd(),plugins:[(await import('@vitejs/plugin-react')).default()],server:{middlewareMode:true},resolve:{alias:[...['@/integrations/supabase/client','@/contexts/AuthContext','@/hooks/useCompany','@/hooks/use-toast','@/lib/invoice-ocr-prepare'].map(find=>({find,replacement:resolve('docs/testes/issue333/head/react-boundary.tsx')})),{find:'@',replacement:resolve('src')},{find:'@shared',replacement:resolve('supabase/functions/_shared')}]},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(''),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('local-fixture')}});
  const server=createServer(async(req,res)=>{try{
    if(req.url?.startsWith('/local/')||req.url?.startsWith('/functions/')){
      const chunks:Buffer[]=[];for await(const part of req)chunks.push(part);const body=Buffer.concat(chunks);const json=()=>JSON.parse(body.toString());
      if(req.url==='/local/control'){const b=json();if(b.release){fault.release?.();fault.release=null}else{fault.action=b.action??'';fault.lost=false;fault.entered=false;fault.paused=b.paused===true}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({entered:fault.entered,calls}));return;}
      if(req.url==='/local/observed'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({entered:fault.entered,calls}));return;}
      if(req.url==='/local/rpc'){const b=json();const data=b.name==='my_effective_permissions'?{...(await core(b.name,b.args,b.user)),company_id:b.company}:await core(b.name,b.args,b.user);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;}
      if(req.url==='/local/query'){const b=json();if(b.table==='user_roles'){res.end('[]');return}if(b.table!=='standalone_invoices')throw Error('Forbidden browser query '+b.table);const rows=await db`select to_jsonb(i) j from standalone_invoices i where company_id=${b.company} order by created_at desc`;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(rows.map(r=>r.j)));return;}
      if(req.url==='/local/storage'){const b=json();const value=await read(b.bucket,b.path);res.setHeader('Content-Type','application/pdf');res.end(value?Buffer.from(value):undefined);return;}
      const request=new Request('http://local.fixture'+req.url,{method:req.method,headers:req.headers as Record<string,string>,body});const response=await (req.url.endsWith('data-entry')?ch:ah)(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(['/entry','/scanner-faturas','/edit'].includes(req.url??'')){res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/index.html',`<html><head></head><body><div id="root"></div><script type="module" src="/docs/testes/issue333/head/react-main.tsx"></script></body></html>`));return}
    if(req.url?.startsWith('/src/index.css')){const transformed=await vite.transformRequest('/src/index.css');if(!transformed)throw Error('CSS transform absent');res.setHeader('Content-Type','application/javascript');res.end(transformed.code);return}
    vite.middlewares(req,res);
  }catch(e){res.statusCode=500;res.end(JSON.stringify({error:String(e)}))}});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();if(!addr||typeof addr==='string')throw Error('Local server absent');
  const prior=await attempt(c1,'prepare',null,envelope({supplier_name:'Proof32 original owner envelope',notes:'confirmed reserved data'}));await executeAttempt(transport(),prior,bytes);
  const baseInvoiceCount=Number((await db`select count(*) n from standalone_invoices`)[0].n);
  writeFileSync(process.env.ISSUE333_EVIDENCE+'/browser-fixture.pdf',bytes);
  try{vi.stubGlobal('fetch',nativeFetch);
    const output=await promisify(execFile)(process.env.ISSUE333_PYTHON??'python3',['docs/testes/issue333/head/react-journeys.py',String(addr.port),prior.id,process.env.ISSUE333_EVIDENCE??'/tmp'],{env:{PATH:'/bin:/usr/bin',HOME:'/tmp',PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH},timeout:220000,maxBuffer:2000000});
    writeFileSync(process.env.ISSUE333_EVIDENCE+'/react-chromium.log',output.stdout+output.stderr);console.log(output.stdout);
    expect(Number((await db`select count(*) n from standalone_invoices`)[0].n)).toBe(baseInvoiceCount+3);
    const family=await db`select id,state,prior_attempt_id from standalone_attempts_333 where envelope_hash=${prior.hash}`;expect(family.length).toBe(2);expect(family.every(a=>a.state==='completed')).toBe(true);
    expect(calls.filter(c=>c.action==='confirm_new_intent').length).toBe(1);
    expect(Number((await db`select count(*) n from standalone_attempt_audit_333 where result->>'notes'='Proof32 metadata changed'`)[0].n)).toBe(1);
    for(const row of await db`select path,envelope from standalone_attempts_333 where envelope->'payload'->>'supplier_name' like 'Proof32%' and id in (select attempt_id from standalone_attempt_audit_333)`){const actual=await read('standalone-invoices',row.path);if(actual)expect(sha(actual)).toBe(row.envelope.document.sha256)}
    expect(Number((await db`select (select count(*) from transactions)+(select count(*) from event_forecasts)+(select count(*) from transaction_payments)+(select count(*) from financial_accounts)+(select count(*) from reimbursements) n`)[0].n)).toBe(0);
  }catch(e){writeFileSync(process.env.ISSUE333_EVIDENCE+'/react-first-failure.log',String(e)+(e as any).stdout+(e as any).stderr);throw e}
  finally{writeFileSync(process.env.ISSUE333_EVIDENCE+'/react-calls.json',JSON.stringify(calls,null,2));fault.release?.();await vite.close();writeFileSync(localCss,originalCss);await new Promise<void>(r=>server.close(()=>r()));}
},240000);

it.each(['authorize','begin'])('lost %s attempt response then explicit execution request remains read-only',async action=>{
 const a=await attempt(c1,'prepare',null,envelope()),t=transport();let lost=false;const actions:string[]=[];
 const wrapped:AttemptTransport={...t,rpc:async(op,id,e,h)=>{actions.push(op);const out=await t.rpc(op,id,e,h);if(op===action&&!lost){lost=true;throw Error('lost '+op)}return out}};
 const out=await executeAttempt(wrapped,a,bytes);expect(lost).toBe(true);expect(out.status).toBe('pendente');
 const stored=await attempt(c1,'check',a.id,null,a.hash),before=uploads;const recoveryActions:string[]=[];
 await executeAttempt({...t,rpc:async(op,id,e,h)=>{recoveryActions.push(op);return t.rpc(op,id,e,h)}},stored,bytes);
 expect(recoveryActions).toEqual(['check']);expect(uploads).toBe(before);
 expect(Number((await db`select count(*) n from standalone_invoices where id=${a.destination_id}`)[0].n)).toBe(0);
 if(action==='begin')expect(sha((await read('standalone-invoices',a.path))??new Uint8Array())).toBe(hash);
});
