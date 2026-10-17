import {createClient} from "npm:@supabase/supabase-js@2";
import {corsHeaders} from "npm:@supabase/supabase-js@2/cors";
import {z} from "npm:zod@3";
import {validateDocument,sha256,finalDocumentPath,validCivilDate} from "./core.ts";
/** Fail closed until independent storage/concurrency integration proof. */
const RELEASE = {upload:false, execute:false, analysis:false} as const;
const id=z.string().uuid();
const fields=z.object({
 supplier_name:z.string().trim().min(1).max(200),supplier_nif:z.string().trim().min(1).max(40),
 invoice_number:z.string().trim().min(1).max(100),invoice_date:z.string().refine(validCivilDate),
 currency:z.literal("EUR"),total_amount:z.number().finite().nonnegative(),iva_amount:z.number().finite().nonnegative(),
 customer_nif:z.string().min(1).max(40),paid_by_partner_id:id,notes:z.string().max(2000),
}).strict();
const command=z.discriminatedUnion("action",[
 z.object({action:z.literal("status")}).strict(),
 z.object({action:z.literal("session"),session_id:id.optional(),event_id:id.optional()}).strict(),
 z.object({action:z.literal("note"),session_id:id,body:z.string().trim().min(1).max(4000)}).strict(),
 z.object({action:z.literal("preview"),session_id:id,document_id:id,fields}).strict(),
 z.object({action:z.literal("execute"),session_id:id,preview_id:id,authorize:z.literal(true)}).strict(),
 z.object({action:z.literal("document"),session_id:id,document_id:id}).strict(),
]);
class SafeError extends Error {constructor(message:string,readonly status=400){super(message);}}
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const unavailable=()=>{throw new SafeError("Assistente indisponível: falta validar armazenamento, execução concorrente e conferência. Nenhum lançamento foi criado.",503);};
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response(null,{headers:corsHeaders});
 if(req.method!=="POST") return reply({error:"Método não permitido"},405);
 try {
  const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url || !anon || !service) throw new SafeError("Configuração indisponível",503);
  const auth=req.headers.get("Authorization");
  if(!auth?.startsWith("Bearer ")) throw new SafeError("Inicia sessão para continuar.",401);
  const client=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:authError}=await client.auth.getUser(auth.slice(7));
  if(authError || !identity.user) throw new SafeError("Sessão inválida",401);
  const {data:company,error:companyError}=await client.rpc("current_company_id");
  if(companyError || !company) throw new SafeError("Empresa ativa indisponível",403);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  // Identity comes only from verified Auth, company only from canonical session resolver.
  const {error:guard}=await admin.rpc("data_entry_assert",{p_user:identity.user.id,p_company:company});
  if(guard) throw new SafeError("Sem acesso ao assistente nesta empresa.",403);
  const rpc=async(name:string,args:Record<string,unknown>)=>{
   const {data,error}=await admin.rpc(name,{p_user:identity.user?.id,...args});
   if(error) {
    const conflict=["40001","23505"].includes(error.code);
    throw new SafeError(error.message,conflict?409:error.code==="42501"?403:400);
   }
   return data;
  };
  const session=async(sessionId:string)=>rpc("data_entry_session",{p_session:sessionId,p_event:null});
  const multipart=req.headers.get("Content-Type")?.startsWith("multipart/form-data");
  if(multipart){
   if(!RELEASE.upload) unavailable();
   const size=Number(req.headers.get("Content-Length"));
   if(!size || size>21*1024*1024) throw new SafeError("Ficheiro demasiado grande ou tamanho não declarado",413);
   const form=await req.formData();
   if([...form.keys()].some(k=>!["session_id","file"].includes(k))) throw new SafeError("Campos não permitidos");
   const sessionId=id.parse(form.get("session_id"));const state=await session(sessionId);
   const file=form.get("file");if(!(file instanceof File)) throw new SafeError("Seleciona um ficheiro");
   const bytes=new Uint8Array(await file.arrayBuffer()), mime=validateDocument(bytes,file.type), hash=await sha256(bytes);
   const existing=state.documents.find((d:{sha256:string})=>d.sha256===hash);if(existing)return reply({document_id:existing.id,reused:true});
   const documentId=crypto.randomUUID(),path=`${company}/${sessionId}/${documentId}`;
   const {error:upload}=await admin.storage.from("data-entry-staging").upload(path,bytes,{contentType:mime,upsert:false});
   if(upload)throw new SafeError("Não foi possível guardar o documento",503);
   const result=await rpc("data_entry_add_document",{p_session:sessionId,p_id:documentId,p_name:file.name.replace(/[\x00-\x1f]/g,"").slice(0,255),p_path:path,p_sha:hash,p_size:bytes.length,p_mime:mime});
   // Uncommitted uploads remain staging-only; no unsafe deletion after unknown RPC outcome.
   return reply({document_id:result,reused:result!==documentId});
  }
  if(Number(req.headers.get("Content-Length"))>16000)throw new SafeError("Pedido demasiado grande",413);
  const raw=await req.text();if(raw.length>16000)throw new SafeError("Pedido demasiado grande",413);
  const body=command.parse(JSON.parse(raw));
  if(body.action==="status")return reply({capabilities:{...RELEASE,gmail:false,drive:false,transactions:false,payments:false,bp:false,bank:false,ticket_office:false},reason:"Validação de execução e armazenamento pendente"});
  if(!RELEASE.upload)unavailable();
  if(body.action==="session")return reply(await rpc("data_entry_session",{p_session:body.session_id??null,p_event:body.event_id??null}));
  const state=await session(body.session_id);
  if(body.action==="note")return reply({id:await rpc("data_entry_note",{p_session:body.session_id,p_body:body.body})});
  if(body.action==="preview")return reply(await rpc("data_entry_prepare",{p_session:body.session_id,p_document:body.document_id,p_fields:body.fields}));
  if(body.action==="document"){
   const doc=state.documents.find((d:{id:string})=>d.id===body.document_id);if(!doc)throw new SafeError("Documento não encontrado",404);
   const {data,error}=await admin.storage.from("data-entry-staging").download(doc.path);
   if(error || !data)throw new SafeError("Documento indisponível",503);
   const bytes=new Uint8Array(await data.arrayBuffer());if(await sha256(bytes)!==doc.sha256)throw new SafeError("Documento alterado",409);
   return new Response(bytes,{headers:{...corsHeaders,"Content-Type":doc.mime,"Content-Disposition":"attachment","Cache-Control":"no-store"}});
  }
  if(body.action==="execute"){
   if(!RELEASE.execute)unavailable();
   const persisted=state.results.find((r:{preview_id:string})=>r.preview_id===body.preview_id);if(persisted)return reply(persisted.result);
   const preview=state.preview;if(preview?.id!==body.preview_id)throw new SafeError("Prévia alterada; prepara e autoriza novamente",409);
   const doc=state.documents.find((d:{id:string})=>d.id===preview.document_id);if(!doc)throw new SafeError("Documento indisponível",409);
   const {data,error}=await admin.storage.from("data-entry-staging").download(doc.path);if(error || !data)throw new SafeError("Documento indisponível",503);
   const bytes=new Uint8Array(await data.arrayBuffer());validateDocument(bytes,doc.mime);
   const hash=await sha256(bytes);if(hash!==doc.sha256)throw new SafeError("Documento alterado",409);
   const path=finalDocumentPath(company,doc.id,hash,doc.mime);
   const {error:upload}=await admin.storage.from("standalone-invoices").upload(path,bytes,{contentType:doc.mime,upsert:false});
   if(upload){
    const existing=await admin.storage.from("standalone-invoices").download(path);
    if(existing.error || !existing.data || await sha256(new Uint8Array(await existing.data.arrayBuffer()))!==hash)throw new SafeError("Arquivo não conferido; execução suspensa",409);
   }
   const result=await rpc("data_entry_commit",{p_preview:preview.id,p_verified_sha:hash,p_final_path:path});
   const {data:invoice,error:readError}=await admin.from("standalone_invoices").select("id,company_id,storage_path,total_amount,invoice_date,status,created_by,paid_by_partner_id").eq("id",result.invoice_id).eq("company_id",company).single();
   if(readError || !invoice || invoice.storage_path!==path || Number(invoice.total_amount)!==Number(result.total_amount))throw new SafeError("Registo executado; conferência pendente. Retoma o mesmo lote, sem novo lançamento.",503);
   return reply(result);
  }
  throw new SafeError("Operação indisponível",400);
 }catch(error){
  if(error instanceof SafeError)return reply({error:error.message},error.status);
  if(error instanceof z.ZodError || error instanceof SyntaxError)return reply({error:"Pedido inválido; confirma os campos."},400);
  // Never log request/document/PII, tokens or provider/internal errors.
  return reply({error:"Operação interrompida. Não repitas um lançamento; consulta o resultado do lote."},503);
 }
});