import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { isServiceRoleRequest } from '../_shared/multiTenant.ts';
import { syncTraffic } from '../_shared/artist-ads-hourly-sync.ts';
const schema=z.object({artist_id:z.string().uuid(),mode:z.enum(['today','scheduled','backfill']).default('today'),connection_id:z.string().uuid().optional(),day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),device_only:z.boolean().default(false)}).strict();
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 try{
  const parsed=schema.safeParse(await req.json());if(!parsed.success)return json({error:'invalid_input'},400);
  const body=parsed.data;
  const service=await isServiceRoleRequest(req);
  if(!service&&(body.mode!=='today'||body.connection_id||body.day||body.device_only))return json({error:'service_only'},403);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
  if(!url||!key||!anon)return json({error:'runtime_config_missing'},500);
  const auth=req.headers.get('Authorization')??'';
  const admin=createClient(url,key,{auth:{persistSession:false}});
  const user=createClient(url,anon,{auth:{persistSession:false},global:{headers:{Authorization:auth}}});
  if(!service){const {data,error}=await user.auth.getUser(auth.replace(/^Bearer\s+/i,''));if(error||!data.user)return json({error:'session_required'},401);}
  const {data:claim,error}=await (service?admin:user).rpc('artist_ads_refresh_claim',{p_artist_id:body.artist_id,p_scheduled:service});
  if(error)return json({error:'claim_rejected',code:error.code},error.code==='42501'?403:500);
  if(!claim?.accepted)return json(claim,claim?.reason==='rate_limited'?429:202);
  const {results,detail}=await syncTraffic(admin,body.artist_id,claim.request_id,body.mode,new Date(),body.connection_id,body.day,body.device_only);
  const {data:finish,error:finishError}=await admin.rpc('artist_ads_refresh_finish',{p_artist_id:body.artist_id,p_request_id:claim.request_id,p_results:results});
  if(finishError||!finish?.accepted)return json({error:'finish_rejected',platforms:results,detail},409);
  const failed=Object.values(results).some(p=>p.status==='error'||p.status==='partial');
  return json({...finish,detail},failed?207:200);
 }catch{return json({error:'refresh_failed'},500);}
});