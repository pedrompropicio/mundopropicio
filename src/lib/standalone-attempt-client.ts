/** Proposed browser adapter. No local storage authority and no direct mutations. */
import { supabase } from '@/integrations/supabase/client';
import { documentHash, type Attempt } from '@shared/standalone-attempt';
export type Context={user_id:string;company_id:string};
export async function attemptRequest(body:Record<string,unknown>,context:Context) {
 const session=await supabase.auth.getSession();const token=session.data.session?.access_token;
 if(!token || session.data.session?.user.id!==context.user_id)throw new Error('Contexto alterado');
 const eff=await supabase.rpc('my_effective_permissions',{p_universe:[]});
 if(eff.error || (eff.data as {company_id?:string}|null)?.company_id!==context.company_id)throw new Error('Contexto alterado');
 const {data,error}=await supabase.functions.invoke('standalone-attempt-333',{body,headers:{'X-Attempt-User':context.user_id,'X-Attempt-Company':context.company_id}});
 if(error || !data)throw new Error('Resultado por confirmar. Consulta a tentativa; não repitas.');
 return data;
}
export async function prepareLegacyAttempt(operation:'scanner_create'|'accountant_edit',payload:Record<string,unknown>,file:File,context:Context,before?:Record<string,unknown>,id?:string):Promise<Attempt> {
 const bytes=new Uint8Array(await file.arrayBuffer());
 const envelope={payload,document:{sha256:await documentHash(bytes),size_bytes:bytes.length,mime:file.type},effects:[operation],...(before?{target:before.id,before}:{})};
 return attemptRequest({action:'prepare',operation,id:id??null,envelope},context);
}
export async function executeLegacyAttempt(operation:string,a:Attempt,file:File,context:Context) {
 const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 return attemptRequest({action:'execute',operation,id:a.id,hash:a.hash,conteudo_base64:btoa(binary)},context);
}
export const checkLegacyAttempt=(operation:string,a:Attempt,context:Context)=>attemptRequest({action:'check',operation,id:a.id,hash:a.hash},context);
/** Retoma independente da memória local: ID/hash dados pelo servidor e owner canónico. */
export async function resumeLegacyAttempt(operation:string,id:string,hash:string,context:Context) {
 return attemptRequest({action:'check',operation,id,hash},context);
}
export type AttemptSummary={id:string;hash:string;state:string;review_reason?:string|null;intent_seq?:number;name:string;reference:string|null;created_at:string};
export async function listLegacyAttempts(operation:string,context:Context,after:string|null=null):Promise<{items:AttemptSummary[];next:string|null}> {
 return attemptRequest({action:'list',operation,after},context);
}
/** C: explicit, typed additional intent over a completed attempt; never for unknown/review results. */
export const confirmNewIntent=(a:Pick<Attempt,'id'|'hash'>,context:Context)=>attemptRequest({action:'confirm_new_intent',operation:'scanner_create',id:a.id,hash:a.hash,confirm:true},context);
export const reviewMessage=(reason:string|null|undefined)=>reason==='iva_exceeds_total'?'IVA superior ao total: suspenso para revisão, nada gravado.':reason==='strong_duplicate'?'Já existe uma fatura com o mesmo NIF e número: suspenso para revisão.':reason==='before_changed'?'A fatura mudou entretanto: suspenso para revisão.':'Suspenso para revisão.';
export type AttemptCapabilities=Record<'scanner_create'|'accountant_edit',boolean>;
const CLOSED:AttemptCapabilities={scanner_create:false,accountant_edit:false};
/** Capacidade canónica decidida pelo servidor; qualquer falha/ausência => ramo legacy_untracked. */
export async function attemptCapabilities(context:Context):Promise<AttemptCapabilities> {
 try{const r=await attemptRequest({action:'capabilities'},context) as {capabilities?:Partial<AttemptCapabilities>};
  return {scanner_create:r?.capabilities?.scanner_create===true,accountant_edit:r?.capabilities?.accountant_edit===true};}
 catch{return CLOSED}
}
/** C: só tentativa concluída e mais recente do owner pode receber nova intenção. */
export const canConfirmNewIntent=(a:Pick<AttemptSummary,'state'>,latest:boolean)=>latest && a.state==='completed';
