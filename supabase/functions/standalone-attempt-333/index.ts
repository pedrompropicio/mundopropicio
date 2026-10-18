/** Integrated edge entrypoint; server capabilities and mutation gates remain closed. */
import {createClient} from 'npm:@supabase/supabase-js@2';
import {corsHeaders} from 'npm:@supabase/supabase-js@2/cors';
import {createAttemptHandler} from './handler.ts';
import {readCapabilities} from './capabilities.ts';
export const attemptCors = {...corsHeaders, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-attempt-user, x-attempt-company', 'Access-Control-Allow-Methods': 'POST, OPTIONS'};
import {documentHash,type Attempt} from '../_shared/standalone-attempt.ts';
const url=Deno.env.get('SUPABASE_URL')??'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',anon=Deno.env.get('SUPABASE_ANON_KEY')??'';
const admin=createClient(url,key);
const userClient=(token:string)=>createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}});
Deno.serve(createAttemptHandler({cors:attemptCors,
  capabilities:()=>readCapabilities(admin),
 user:async token=>{const {data,error}=await userClient(token).auth.getUser();return error?null:data.user},
 context:async token=>{const {data,error}=await userClient(token).rpc('my_effective_permissions',{p_universe:[]});return error?null:data},
 snapshot:async(user,company,operation,id,hash)=>{const {data,error}=await admin.from('standalone_attempts_333').select('id,company_id,principal,operation,envelope_hash,envelope').eq('id',id).eq('company_id',company).eq('principal',user).eq('operation',operation).eq('envelope_hash',hash).maybeSingle();if(error||!data)return null;const [companyResult,actorResult,payerResult]=await Promise.all([admin.from('companies').select('display_name').eq('id',company).maybeSingle(),admin.from('profiles').select('full_name').eq('id',user).maybeSingle(),data.envelope?.payload?.paid_by_partner_id?admin.from('profiles').select('full_name').eq('id',data.envelope.payload.paid_by_partner_id).maybeSingle():Promise.resolve({data:null})]);return {company_name:companyResult.data?.display_name??null,actor_name:actorResult.data?.full_name??null,payer_name:payerResult.data?.full_name??null,id:data.id,user_id:data.principal,company_id:data.company_id,operation:data.operation,hash:data.envelope_hash,envelope:data.envelope};},
 list:async(token,operation,after)=>{const {data,error}=await userClient(token).rpc('standalone_attempt_list_333',{p_operation:operation,p_after:after});if(error)throw Error('Consulta recusada');return data},
 transport:(token,operation)=>({
  rpc:async(action,id,envelope,hash)=>{const {data,error}=await userClient(token).rpc('standalone_attempt_333',{p_action:action,p_id:id,p_operation:operation,p_envelope:envelope,p_hash:hash});if(error)throw Error('RPC recusado');return data as Attempt},
  upload:async(p,b,mime)=>{const {error}=await admin.storage.from('standalone-invoices').upload(p,b,{contentType:mime,upsert:false});if(error && !['409','Duplicate'].includes(String(error.statusCode??error.error)))throw Error('Upload não conferido')},
  read:async p=>{const {data,error}=await admin.storage.from('standalone-invoices').download(p);if(error||!data||data.size>20971520)return null;return new Uint8Array(await data.arrayBuffer())},
  verifyReceipt:async(p,b,mime)=>{const {data,error}=await admin.storage.from('standalone-invoices').download(p);if(error||!data||data.size!==b.length)throw Error('Readback pendente');const actual=new Uint8Array(await data.arrayBuffer());const hash=await documentHash(b);if(await documentHash(actual)!==hash)throw Error('Readback divergente');const r=await admin.rpc('data_entry_record_receipt',{p_bucket:'standalone-invoices',p_path:p,p_sha:hash,p_size:b.length,p_mime:mime});if(r.error)throw Error('Recibo recusado')},
 })
}));