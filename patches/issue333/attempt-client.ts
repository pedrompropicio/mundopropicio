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