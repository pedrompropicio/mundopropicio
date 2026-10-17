import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomUUID, createHash, webcrypto } from "node:crypto";
import { File as NodeFile } from "node:buffer";
import postgres from "postgres";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const identity = vi.hoisted(() => ({ id: "22222222-2222-4222-8222-222222222222" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: identity, loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: identity, access_token: "local-owner" } } }) } } }));
import DataEntryDialog from "../../../../src/components/data-entry/DataEntryDialog";
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
  const upload=await handler(new Request("http://local.fixture",{method:"POST",headers:{Authorization:"Bearer local-owner"},body:form}));expect(upload.status).toBe(200);
  const doc=await upload.json(), f=fields();const r=await call({action:"preview",session_id:s.session.id,document_id:doc.id,fields:f});expect(r.status).toBe(200);
  return {s,doc,f,p:await r.json()};
}
const execute = (a:any) => call({action:"execute",session_id:a.s.session.id,preview_id:a.p.id,snapshot_hash:a.p.snapshot_hash,authorize:true});
const check = (a:any) => call({action:"check",session_id:a.s.session.id,preview_id:a.p.id});
const attempt = (sql:postgres.Sql,action:string,id:string|null,e:any=null,h:string|null=null,op="scanner_create",uid=U) => as(sql,uid,async tx => (await tx`select standalone_attempt_333(${action},${id},${op},${e===null?null:tx.json(e)},${h}) j`)[0].j);
const envelope = (over:any={}) => ({payload:{file_name:"synthetic.pdf",created_by:U,currency:"EUR",supplier_nif:null,invoice_number:null,total_amount:123,iva_amount:23,notes:randomUUID(),...over},document:{sha256:hash,size_bytes:bytes.length,mime:"application/pdf"},effects:["scanner_create"]});
const transport = (op="scanner_create",uid=U):AttemptTransport => ({rpc:(action,id,e,h)=>attempt(c2,action,id,e,h,op,uid),upload:async(p,b)=>{const f=objectPath("standalone-invoices",p);mkdirSync(f.slice(0,f.lastIndexOf('/')),{recursive:true});if(!existsSync(f))writeFileSync(f,b);},read:p=>read("standalone-invoices",p),verifyReceipt:async(p,b,m)=>{expect(await read("standalone-invoices",p)).toEqual(b);await receipt("standalone-invoices",p,b,m);}});
beforeAll(async()=>{
  vi.stubGlobal("crypto",webcrypto);vi.stubGlobal("File",NodeFile);
  execFileSync("chown",["1000:1000",dir]);pg("initdb",["-D",dir+"/data","-U","postgres","--auth=trust","--no-locale","-E","UTF8"]);pg("pg_ctl",["-D",dir+"/data","-w","-l",dir+"/log","-o",`-k ${dir} -p ${port} -c listen_addresses=''`,"start"]);started=true;
  db=connect();c1=connect();c2=connect();
  for(const f of ["docs/testes/issue333/pg/fixture.sql","drizzle/migrations/0190_issue333_core_v2_closed_structure.sql","drizzle/migrations/0191_issue333_attempts_closed_structure.sql","drizzle/migrations/0192_issue333_service_only_capability_reader.sql"])await db.unsafe(readFileSync(f,"utf8"));
  await db`insert into companies values (${C},'Empresa Sintética A','PT500000001','active'),(${D},'Empresa Sintética B','PT500000002','active')`;
  for(const [id,company,role,name] of [[U,C,'manager','Autorizador Sintético'],[V,C,'manager','Outro Gestor'],[W,D,'manager','Gestor B'],[E,C,'editor','Editor Sintético']]) {await db`insert into auth.users values (${id})`;await db`insert into profiles values (${id},${name},${company},${company})`;await db`insert into user_roles(user_id,company_id,role) values (${id},${company},${role})`;}
  await db`insert into data_entry_settings values(true,true,true)`;await db`insert into standalone_attempt_settings_333(operation,enabled) values('assistant_create',true),('scanner_create',true),('accountant_edit',true),('ingest_create',true)`;
  vi.stubGlobal("fetch",async(input:any,init?:RequestInit)=>{const url=String(input);if(!url.startsWith("http://127.0.0.1:9/functions/v1/data-entry"))throw Error("External egress forbidden: "+url);return handler(new Request(url,init));});
},60000);
afterAll(async()=>{cleanup();await Promise.all([db?.end(),c1?.end(),c2?.end()]);if(started)pg("pg_ctl",["-D",dir+"/data","-m","immediate","stop"]);vi.unstubAllGlobals();});
it("real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit",async()=>{
  const a=await prepare();const r=await execute(a);expect(r.status).toBe(200);const out=await r.json();expect(out.status).toBe("conferido");
  const row=(await db`select * from standalone_invoices where id=${out.result.invoice_id}`)[0];expect(row).toMatchObject({company_id:C,created_by:U,supplier_name:a.f.supplier_name,supplier_nif:a.f.supplier_nif,invoice_number:a.f.invoice_number,notes:expect.stringContaining("nota preservada"),paid_by_partner_id:U});expect(Number(row.total_amount)).toBe(123);expect(Number(row.iva_amount)).toBe(23);expect(row.invoice_date.toISOString().slice(0,10)).toBe("2026-10-17");
  expect(out.result.observation).toContain("autorização de Autorizador Sintético");expect(await read("standalone-invoices",row.storage_path)).toEqual(bytes);
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
  const a=await attempt(c1,"prepare",null,envelope());expect((await executeAttempt(transport(),a,bytes)).status).toBe("conferido");
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