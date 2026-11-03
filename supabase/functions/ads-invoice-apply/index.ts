// #486 D23: financial decisions use the caller JWT and D1; no legacy fallback.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AdsContractError, dispatchDecision, httpStatus, parseOperation, requireThat, rpcResult, uuid } from '../_shared/ads-invoice-generation.ts';
import { resumeDocuments } from '../_shared/ads-invoice-documents.ts';
import { fetchAllPagedQuery } from '../_shared/paging.ts';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json = (value: unknown, status=200) => new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null,{headers:cors});
  if (req.method !== 'POST') return json({error:'method_not_allowed'},405);
  try {
    const authorization = req.headers.get('Authorization'); requireThat(authorization,'unauthenticated');
    const caller = createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
    const {data:auth,error:authError} = await caller.auth.getUser(); requireThat(!authError && auth.user,'unauthenticated');
    const body = await req.json(); const invoiceId = uuid(body.invoice_id);
    requireThat(Object.keys(body).every(k => ['action','invoice_id','payload'].includes(k)));
    const payload = body.payload ?? {};
    if (body.action !== 'documents') return json(await dispatchDecision(caller,invoiceId,body.action,payload));
    requireThat(Object.keys(payload).every(k => k === 'retry_errors') && (payload.retry_errors === undefined || typeof payload.retry_errors === 'boolean'));
    const load = async () => parseOperation(await dispatchDecision(caller,invoiceId,'operation',{}),invoiceId).operation;
    const operation = await load(); requireThat(operation && operation.state !== 'reverted','revert_blocked');
    const checkManage=async()=>requireThat(await rpcResult(caller,'has_permission_in',{_company_id:operation.company_id,_permission:'manage_transactions',_user_id:auth.user.id})===true,'forbidden');
    const preflight=async()=>rpcResult(admin,'ads_invoice_maintenance_v1',{p_invoice_id:invoiceId,p_action:'preflight',p_payload:{company_id:operation.company_id}});
    await checkManage();
    await preflight(); // closed control refuses BEFORE any Storage effect
    const outcome=await resumeDocuments({
      current:async()=>{const live=await load();requireThat(live,'request_conflict');await checkManage();await preflight();return live;},
      storage:bucket=>({
        download:async path=>{const {data,error}=await admin.storage.from(bucket).download(path);if(error){if(String(error.statusCode??error.status)==='404')return null;throw error;}return data?new Uint8Array(await data.arrayBuffer()):null;},
        upload:async(path,bytes)=>{const live=await load();requireThat(live?.id===operation.id&&live.state!=='reverted','revert_blocked');await checkManage();await preflight();const {error}=await admin.storage.from(bucket).upload(path,bytes,{contentType:'application/pdf',upsert:false});if(error)throw error;},
      }),
      descriptions:async ids=>{const {data,error}=await fetchAllPagedQuery(caller.from('ads_invoice_line').select('id,raw_description').eq('invoice_id',invoiceId).eq('company_id',operation.company_id).in('id',ids).order('id'));if(error)throw error;return Object.fromEntries((data??[]).map(l=>[l.id,l.raw_description]));},
      complete:async(id,key,p)=>{const live=await load();requireThat(live?.id===id&&live.state!=='reverted','revert_blocked');await checkManage();return rpcResult(admin,'ads_invoice_document_complete_v1',{p_operation_id:id,p_task_key:key,p_payload:p});},
    },operation,payload.retry_errors===true);
    const maintenance=await rpcResult(admin,'ads_invoice_maintenance_v1',{p_invoice_id:invoiceId,p_action:'list',p_payload:{company_id:operation.company_id}});
    return json({...(await dispatchDecision(caller,invoiceId,'operation',{})),documents:outcome,maintenance_pending:maintenance.task!==null});
  } catch (error) {
    return json({error:error instanceof AdsContractError ? error.code : 'internal_error',details:error instanceof AdsContractError ? error.details : undefined},httpStatus(error));
  }
});
