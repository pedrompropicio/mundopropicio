/** Proposed NEW handler; never deployed. All identity and SQL calls are injected. */
import { validateDocument, MAX_DOCUMENT_BYTES } from '../_shared/data-entry-core.ts';
import { z } from 'npm:zod@3.23.8';
import { executeAttempt, checkAttempt, type Attempt, type AttemptTransport } from '../_shared/standalone-attempt.ts';
const uuid=z.string().uuid();
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('capabilities')}).strict(),
 z.object({action:z.literal('list'),operation:z.enum(['scanner_create','accountant_edit']),after:uuid.nullable()}).strict(),
 z.object({action:z.literal('prepare'),operation:z.enum(['scanner_create','accountant_edit']),id:uuid.nullable(),envelope:z.record(z.unknown())}).strict(),
 z.object({action:z.literal('execute'),operation:z.enum(['scanner_create','accountant_edit']),id:uuid,hash:z.string().regex(/^[a-f0-9]{64}$/),conteudo_base64:z.string().max(28000000)}).strict(),
 z.object({action:z.literal('confirm_new_intent'),operation:z.literal('scanner_create'),id:uuid,hash:z.string().regex(/^[a-f0-9]{64}$/),confirm:z.literal(true)}).strict(),
 z.object({action:z.literal('check'),operation:z.enum(['scanner_create','accountant_edit']),id:uuid,hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
]);
export type HandlerDeps = {
 user(token:string):Promise<{id:string}|null>;
 context(token:string):Promise<{company_id:string}|null>;
 transport(token:string,operation:string):AttemptTransport;
 cors:Record<string,string>;
 list?(token:string,operation:string,after:string|null):Promise<unknown>;
 /** Server-side canonical capability; absent => closed. Never client-controlled. */
 capabilities?():Promise<Record<'scanner_create'|'accountant_edit',boolean>>;
};
export function createAttemptHandler(d:HandlerDeps) {
 return async(req:Request)=>{
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...d.cors,'Content-Type':'application/json'}});
  if(req.method==='OPTIONS')return reply({});
  if(req.method!=='POST')return reply({error:'Método recusado'},405);
  try {
   const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
   if(!token)return reply({error:'Inicia sessão'},401);
   const user=await d.user(token);if(!user)return reply({error:'Sessão inválida'},401);
   const context=await d.context(token);if(!context)return reply({error:'Empresa indisponível'},403);
   if(req.headers.get('X-Attempt-User')!==user.id || req.headers.get('X-Attempt-Company')!==context.company_id)return reply({error:'Contexto alterado'},409);
   const reader=req.body?.getReader();if(!reader)return reply({error:'Pedido vazio'},400);
   const chunks:Uint8Array[]=[];let size=0;
   for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>28100000){await reader.cancel();return reply({error:'Pedido demasiado grande'},413)}chunks.push(part.value)}
   const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length}
   const body=schema.parse(JSON.parse(new TextDecoder().decode(raw)));
   if(body.action==='capabilities'){const c=d.capabilities?await d.capabilities().catch(()=>null):null;return reply({capabilities:{scanner_create:c?.scanner_create===true,accountant_edit:c?.accountant_edit===true}})}
   const t=d.transport(token,body.operation);
   if(body.action==='list'){if(!d.list)return reply({error:'Consulta indisponível'},409);return reply(await d.list(token,body.operation,body.after));}
   if(body.action==='prepare')return reply(await t.rpc('prepare',body.id,body.envelope,null));
   // C: typed owner confirmation; server derives owner/company and refuses unknown/strong duplicate.
   if(body.action==='confirm_new_intent')return reply(await t.rpc('confirm_new_intent',body.id,null,body.hash));
   const a:Attempt=await t.rpc('check',body.id,null,body.hash);
   if(a.hash!==body.hash || a.id!==body.id)return reply({error:'Tentativa divergente'},409);
   if(body.action==='check')return reply(await checkAttempt(t,a));
   if(body.conteudo_base64.length>4*Math.ceil(MAX_DOCUMENT_BYTES/3))return reply({error:'Documento demasiado grande'},413);
   const binary=atob(body.conteudo_base64);
   if(binary.length>MAX_DOCUMENT_BYTES)return reply({error:'Documento demasiado grande'},413);
   const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
   try{validateDocument(bytes,a.document.mime)}catch{return reply({error:'Documento incompleto ou incompatível'},422)}
   if((a as {state:string}).state==='review')return reply({status:'revisao',reason:(a as {review_reason?:string}).review_reason??null},409);
   const out=await executeAttempt(t,a,bytes);
   return reply(out,out.status==='conferido'?200:409);
  }catch{return reply({error:'Conferência pendente. Não repitas uma gravação.',status:'pendente'},409)}
 };
}