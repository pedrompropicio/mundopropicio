// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertNotTraining, isTrainingCompany, TrainingCompanyError } from '../../supabase/functions/_shared/training-guard';

const client = (data: unknown, error: { code?: string; message?: string } | null = null) => ({
  rpc: vi.fn(async () => ({ data, error })),
});
describe('issue562 training boundary', () => {
  it('RPC receives the origin, true is refused with HTTP contract, false preserves real', async () => {
    const sb = client(true);
    await expect(assertNotTraining(sb, 'synthetic')).rejects.toMatchObject({ name:'TrainingCompanyError',status:403,body:{error:'training_company'} });
    expect(sb.rpc).toHaveBeenCalledWith('is_training_company',{_company_id:'synthetic'});
    await expect(assertNotTraining(client(false),'synthetic')).resolves.toBeUndefined();
    expect(new TrainingCompanyError().message).toBe('training_company');
  });
  it('global NULL/undefined does not resolve any company or RPC', async () => {
    const sb=client(true);
    expect(await isTrainingCompany(sb,null)).toBe(false);
    expect(await isTrainingCompany(sb,undefined)).toBe(false);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it.each(['PGRST202','42883'])('absent RPC %s returns false and warns', async code => {
    const warn=vi.fn();
    expect(await isTrainingCompany(client(null,{code,message:'function public.is_training_company(uuid) does not exist'}),'synthetic',warn)).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });
  it('other failures and nonboolean responses do not permit a send', async () => {
    for (const code of ['42501','57014','08006','42883']) {
      await expect(isTrainingCompany(client(null,{code,message:'other RPC'}),'synthetic')).rejects.toThrow('training_guard_unavailable');
    }
    await expect(isTrainingCompany(client({is_training:false}),'synthetic')).rejects.toThrow('training_guard_invalid_response');
    await expect(isTrainingCompany({rpc:async()=>{throw new Error('offline')}},'synthetic')).rejects.toThrow('offline');
  });
  it('legacy empty response stays compatible', async () => {
    expect(await isTrainingCompany(client(null),'synthetic')).toBe(false);
  });
  it.each([
    ['send-system-reminders/index.ts','isTrainingCompany(supabase, r.company_id)','const to ='],
    ['send-push-notification/index.ts','assertNotTraining(adminClient, origin)','resolveTargetUserIds(adminClient'],
    ['whatsapp-dispatcher/index.ts','isTrainingCompany(supabase, item.company_id)','// Lock: marca sending'],
    ['process-email-queue/index.ts','isTrainingCompany(supabase, payload?.company_id)','// Drop expired'],
    ['send-transactional-email/index.ts','isTrainingCompany(supabase, companyId)','// 2. Check suppression'],
    ['generate-accountant-zip/index.ts','assertNotTraining(admin, company_id)','fetchNonAccountingAccountIds(admin'],
    ['capi-v2-send/handler.ts','isTrainingCompany(sb, lead.company_id)','proofStillValid(sb, lead)'],
  ])('%s places origin guard before the effect', (file,guard,effect) => {
    const src=readFileSync('supabase/functions/'+file,'utf8');
    expect(src.indexOf(guard)).toBeGreaterThan(-1);
    expect(src.indexOf(guard)).toBeLessThan(src.indexOf(effect));
  });
});

// Execute the real edge entrypoints with import/network boundaries replaced in a VM.
// This covers the early returns; no service clients, credentials or Deno runtime needed.
import ts from 'typescript';
import vm from 'node:vm';
import { z } from 'zod';
import * as zipSelection from '../../supabase/functions/generate-accountant-zip/selection';
import * as trainingGuard from '../../supabase/functions/_shared/training-guard';
import { createHandler } from '../../supabase/functions/capi-v2-send/handler';
function edgeFixture(file: string, training: boolean, origin: string | null = 'synthetic') {
  const effects = { network: vi.fn(async () => new Response(JSON.stringify({messages:[{id:'synthetic'}]}),{status:200})),
    email:vi.fn(async()=>{}), whatsapp:vi.fn(async()=>({sid:'synthetic'})),push:vi.fn(async()=>{}),writes:[] as any[],queries:[] as string[] };
  const datasets: Record<string,any> = {
    system_reminder_settings:{default_whatsapp_recipient:'+00000000000'},
    system_reminders:[{id:'reminder',company_id:origin,title:'synthetic',message:'synthetic',frequency:'once',send_count:0}],
    notification_queue:[{id:'queue',company_id:origin,attempts:0,recipient_phone:'000000',params:[],template:{meta_template_name:'synthetic',language_code:'pt_PT'}}],
    push_subscriptions:[{endpoint:'https://invalid.test',keys:{},p256dh:'a',auth:'b'}],
    user_roles:[{user_id:'synthetic',role:'admin',company_id:origin}],
    email_send_state:null,
    email_unsubscribe_tokens:{token:'synthetic-token',used_at:null},
  };
  const sb: any = {
    auth:{getUser:async()=>({data:{user:{id:'synthetic'}}})},
    rpc:vi.fn(async(name:string,args:any)=> {
      if(name==='is_training_company') return {data:training,error:null};
      if(name==='get_vault_secret') return {data:'synthetic-secret',error:null};
      if(name==='read_email_batch') return {data:args.queue_name==='transactional_emails' ? [{msg_id:1,message:{company_id:origin,to:'synthetic@invalid.test',message_id:'synthetic',label:'synthetic',sender_domain:'synthetic.invalid'}}] : [],error:null};
      return {data:null,error:null};
    }),
    from:(table:string)=> {
      effects.queries.push(table);
      let mutation=false;
      let single=false;
      const filters: any[]=[];
      const q:any={};
      for (const op of ['select','eq','in','is','lte','lt','not','order','limit','gte']) q[op]=(...a:any[])=>{filters.push([op,...a]);return q};
      for (const op of ['insert','update','delete','upsert']) q[op]=(value:any)=>{mutation=true;effects.writes.push({table,op,value});return q};
      q.maybeSingle=q.single=()=>{single=true;return q};
      q.then=(resolve:any,reject:any)=>Promise.resolve({data:mutation?null:table==='email_send_log'?(single?null:[]):datasets[table]??null,error:null}).then(resolve,reject);
      return q;
    },
  };
  let handler: any;
  const modules: Record<string,any> = {
    'npm:@supabase/supabase-js@2':{createClient:()=>sb},
    'npm:@supabase/supabase-js@2/cors':{corsHeaders:{}},
    'npm:jszip@3.10.1':{}, 'npm:zod@3':{z}, './selection.ts':zipSelection,
    '../_shared/accountant-account-filter.ts':{fetchNonAccountingAccountIds:async()=>[],nonAccountingOrFilter:()=>'',accountingOnlyIds:()=>[]},
    '../_shared/training-guard.ts':trainingGuard,
    '../_shared/twilio.ts':{sendWhatsApp:effects.whatsapp},
    '../_shared/multiTenant.ts':{isServiceRoleRequest:async()=>true},
    '../_shared/paging.ts':{fetchAllPagedQuery:async(q:any)=>await q},
    'npm:@lovable.dev/email-js':{sendLovableEmail:effects.email},
    'npm:web-push@3.6.7':{setVapidDetails:()=>{},sendNotification:effects.push},
    'npm:react@18.3.1':{createElement:()=>null},
    'npm:@react-email/components@0.0.22':{renderAsync:async()=>'<p>synthetic</p>'},
    '../_shared/transactional-email-templates/registry.ts':{TEMPLATES:{synthetic:{component:()=>null,subject:'synthetic'}}},
    '../_shared/transactional-email-templates/sanitize.ts':{sanitizeRenderedEmail:(s:string)=>({out:s,findings:[]})},
  };
  const source=readFileSync('supabase/functions/'+file+'/index.ts','utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled,{
    require:(name:string)=>{if(!(name in modules))throw new Error('unexpected import '+name);return modules[name]},
    exports:{},Deno:{env:{get:(key:string)=>key==='SUPABASE_URL'?'https://synthetic.invalid.test':'synthetic-value'},serve:(h:any)=>{handler=h}},
    console:{log:()=>{},warn:()=>{},error:()=>{}},Request,Response,URL,TextEncoder,Uint8Array,Date,Set,crypto,
    fetch:effects.network,setTimeout:(fn:()=>void)=>{fn();return 1},
  });
  return {handler,effects,sb};
}
const request=(body:any)=>new Request('https://invalid.test',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify(body)});
describe('real entrypoints with synthetic external boundaries',()=>{
  it.each([true,false])('reminders: training=%s, global recipient is guarded',async training=>{
    const {handler,effects}=edgeFixture('send-system-reminders',training);
    const response=await handler(request({}));
    expect(response.status).toBe(200);
    expect(effects.whatsapp).toHaveBeenCalledTimes(training?0:1);
  });
  it('global reminder remains sendable even if another company is training',async()=>{
    const {handler,effects,sb}=edgeFixture('send-system-reminders',true,null);
    expect((await handler(request({}))).status).toBe(200);
    expect(effects.whatsapp).toHaveBeenCalledOnce();
    expect(sb.rpc).not.toHaveBeenCalledWith('is_training_company',expect.anything());
  });
  it.each([true,false])('push service_role user_ids: training=%s, guard covers both channels',async training=>{
    const {handler,effects}=edgeFixture('send-push-notification',training);
    const response=await handler(request({company_id:'synthetic',user_ids:['synthetic'],title:'synthetic',body:'synthetic'}));
    expect(response.status).toBe(training?403:200);
    expect(effects.push).toHaveBeenCalledTimes(training?0:1);
    if(training) expect(await response.json()).toEqual({error:'training_company'});
  });
  it('push company_admins is refused even without a separate origin',async()=>{
    const {handler,effects}=edgeFixture('send-push-notification',true);
    const r=await handler(request({target:{type:'company_admins',company_id:'synthetic'},title:'synthetic',body:'synthetic',whatsapp:true}));
    expect(r.status).toBe(403);expect(effects.push).not.toHaveBeenCalled();expect(effects.whatsapp).not.toHaveBeenCalled();
  });
  it.each([true,false])('WhatsApp queue training=%s never reaches Meta for training',async training=>{
    const {handler,effects}=edgeFixture('whatsapp-dispatcher',training);
    expect((await handler(request({}))).status).toBe(200);
    expect(effects.network).toHaveBeenCalledTimes(training?0:1);
    if(training)expect(effects.writes).toContainEqual(expect.objectContaining({table:'notification_queue',value:expect.objectContaining({status:'skipped',last_error:'suppressed_training'})}));
  });
  it.each([true,false])('email worker training=%s suppresses after resolving origin, before provider',async training=>{
    const {handler,effects}=edgeFixture('process-email-queue',training);
    expect((await handler(request({}))).status).toBe(200);
    expect(effects.email).toHaveBeenCalledTimes(training?0:1);
    if(training)expect(effects.writes).toContainEqual(expect.objectContaining({table:'email_send_log',value:expect.objectContaining({status:'suppressed',company_id:'synthetic'})}));
  });
  it.each([true,false])('transactional producer training=%s never enqueues training',async training=>{
    const {handler,sb,effects}=edgeFixture('send-transactional-email',training);
    expect((await handler(request({companyId:'synthetic',templateName:'synthetic',recipientEmail:'synthetic@invalid.test'}))).status).toBe(200);
    expect(sb.rpc.mock.calls.some(([name]:any[])=>name==='enqueue_email')).toBe(!training);
    if(training)expect(effects.queries).not.toContain('email_unsubscribe_tokens');
  });
  it.each(['lead_capture','club_members'])('CAPI refuses source %s by its company before consent/token/network',async source=>{
    const fetchFn=vi.fn();const writes:any[]=[];
    const row={id:'synthetic',source_table:source,source_id:'synthetic',pixel_id:'synthetic',status:'pending',attempts:0};
    const sb:any={rpc:async(name:string)=>({data:name==='is_training_company'?true:name==='capi_dispatch_allowed'?true:null,error:null}),from:(table:string)=>{
      const data=table==='capi_v2_targets'?[{pixel_id:'synthetic',enabled:true,start_at:'2026-01-01'}]
        :table==='capi_v2_events'?[row]:{company_id:'synthetic',created_at:new Date().toISOString(),confirmed_at:new Date().toISOString()};
      const q:any={};for(const n of ['select','eq','in','or','order','limit','maybeSingle','not'])q[n]=()=>q;
      q.update=(v:any)=>{writes.push(v);return q};q.then=(r:any)=>Promise.resolve({data,error:null}).then(r);return q;
    }};
    const handler=createHandler({sb,fetchFn,env:()=>undefined,now:()=>new Date(),isServiceRole:async()=>true});
    expect((await handler(request({action:'send'}))).status).toBe(200);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(writes).toContainEqual(expect.objectContaining({error_code:'training_company',status:'failed_terminal'}));
  });
});

it('accountant ZIP: training 403 happens after company authorization and before transaction/storage/export reads',async()=>{
  const company='10000000-0000-0000-0000-000000000001';
  const {handler,effects}=edgeFixture('generate-accountant-zip',true,company);
  const r=await handler(request({company_id:company,period:{from:'2030-01-01',to:'2030-01-31'}}));
  expect(r.status).toBe(403);expect(await r.json()).toEqual({error:'training_company'});
  expect(effects.queries).not.toContain('transactions');expect(effects.network).not.toHaveBeenCalled();
  expect(effects.writes).toEqual([]);
});
