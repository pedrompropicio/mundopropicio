/** Authorized sole pilot CLI. No effects unless --authorized-single-pilot57 supplied.
 * Official read_query relay requires the executing agent; no SQL executed from shell.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runFuturePilot,resumeExistingPilot,type PilotDriver} from './future-runner';
import {financial,baselineSQL,metadataSQL,compareBaselines} from './baseline58';
import {AuthAdmin57,OfficialSelectBridge,exactPdf57,chromiumDriver57,privateSecret57,MARKER57,COMPANY57,SHA57} from './private-cloud57';

const DIR='/tmp/browser/issue333-pilot57';
let bridge:OfficialSelectBridge;
const q=(v:string)=>"'"+v.replace(/'/g,"''")+"'";
async function select(query:string,expectedKeys?:string[]){const x=await bridge.select(query,expectedKeys);return x;}
export function connectedDriver58(options:{artifact:Awaited<ReturnType<typeof exactPdf57>>;auth:AuthAdmin57;select:(query:string,expectedKeys?:string[])=>Promise<any>;url:string;service:string;pub:string;directory:string;notify?:(message:unknown)=>void;browserOptions?:Record<string,unknown>;expectedSources?:Record<string,string>}) {
 const {artifact,auth,select,url,service,pub,directory:DIR,browserOptions={},expectedSources}=options;
 const MARKER57=artifact.marker,COMPANY57=artifact.company,SHA57=artifact.sha256;
 const notify=options.notify??((message:unknown)=>console.log(JSON.stringify(message)));
 let session:any,before:any,identity:string|undefined,last:any;
 const driver:PilotDriver={
  validatePdf:async()=>{await exactPdf57(DIR+'/pilot8-fiction.pdf')},
  preflightReadOnly:async()=>{
   const metadata=await select(metadataSQL(),['incompatibilities']);
   if(metadata.incompatibilities.length)throw Error('Driver schema incompatibilities: '+metadata.incompatibilities.join(', '));
   const r=await select(`SELECT jsonb_build_object('marker',(SELECT count(*) FROM auth.users WHERE email=${q(MARKER57+'@fixture.invalid')} OR raw_user_meta_data->>'fixture_marker'=${q(MARKER57)}),'reference',(SELECT count(*) FROM standalone_invoices WHERE invoice_number=${q(artifact.reference)}),'allowlist',(SELECT count(*) FROM data_entry_pilot8_allowlist),'core',(SELECT count(*) FROM data_entry_settings WHERE preparation_validated OR execute_validated),'attempt',(SELECT count(*) FROM standalone_attempt_settings_333 WHERE enabled),'sources',(SELECT jsonb_object_agg(oid::regprocedure::text,md5(prosrc)) FROM pg_proc WHERE oid IN ('current_company_id()'::regprocedure,'log_table_change()'::regprocedure,'set_company_id_on_insert()'::regprocedure,'auth.uid()'::regprocedure,'data_entry_pilot8_gate(text)'::regprocedure))) preflight`,['preflight']);
   const p=r.preflight;const expected=expectedSources??{'current_company_id()':'f857f027a44e858399e895d702af7ad0','log_table_change()':'9509fe109550c9e0367fcbe4ffc661c5','set_company_id_on_insert()':'949120b4d6c08f0c8707f63d28708d96','auth.uid()':'cdef18c69c4f4cbbced2eaf81e628b49','data_entry_pilot8_gate(text)':'1e066a6df3637c8d5c8f99f00a255d33'};
   before=(await select(baselineSQL(),['baseline'])).baseline;
   const repeated=(await select(baselineSQL(),['baseline'])).baseline;
   const comparison=compareBaselines(before,repeated);
   await writeFile(DIR+'/preflight-comparison.json',JSON.stringify(comparison),{mode:0o600});
   if(comparison.changedRelations.length||comparison.configChanged)throw Error('Concurrent baseline changes; stop before account');await writeFile(DIR+'/before.json',JSON.stringify(before),{mode:0o600});
   return {markerAbsent:p.marker===0,referenceAbsent:p.reference===0,sourcesExact:Object.entries(expected).every(([k,v])=>p.sources[k]===v),globalsClosed:p.core===0&&p.attempt===0,allowlistCount:p.allowlist};
  },
  preflightResume:async(owner)=>{
   const metadata=await select(metadataSQL(),['incompatibilities']);
   if(metadata.incompatibilities.length)throw Error('Driver schema incompatibilities: '+metadata.incompatibilities.join(', '));
   const r=await select(`SELECT jsonb_build_object('users',(SELECT count(*) FROM auth.users WHERE email=${q(MARKER57+'@fixture.invalid')} OR raw_user_meta_data->>'fixture_marker'=${q(MARKER57)}),'exact',(SELECT count(*) FROM auth.users u JOIN profiles p ON p.id=u.id WHERE u.id=${q(owner.id)}::uuid AND u.email=${q(MARKER57+'@fixture.invalid')} AND u.created_at=${q(owner.createdAt)}::timestamptz AND u.email_confirmed_at IS NOT NULL AND u.raw_user_meta_data->>'fixture_marker'=${q(MARKER57)} AND u.raw_user_meta_data->>'company_id'=${q(COMPANY57)} AND u.raw_user_meta_data->>'pilot_pdf_sha256'=${q(SHA57)} AND u.raw_user_meta_data->>'pilot_pdf_size'=${q(String(artifact.size))} AND u.raw_user_meta_data->>'pilot_pdf_mime'='application/pdf' AND p.company_id=${q(COMPANY57)}::uuid AND (p.active_company_id IS NULL OR p.active_company_id=${q(COMPANY57)}::uuid) AND (SELECT count(*) FROM user_roles WHERE user_id=u.id)=1 AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND company_id=${q(COMPANY57)}::uuid AND role='user')),'signed',(SELECT count(*) FROM auth.users WHERE id=${q(owner.id)}::uuid AND (last_sign_in_at IS NOT NULL OR banned_until IS NOT NULL)),'sessions',(SELECT count(*) FROM auth.sessions WHERE user_id=${q(owner.id)}::uuid),'reference',(SELECT count(*) FROM standalone_invoices WHERE invoice_number=${q(artifact.reference)}),'active',(SELECT count(*) FROM data_entry_pilot8_allowlist WHERE enabled),'core',(SELECT count(*) FROM data_entry_settings WHERE preparation_validated OR execute_validated),'attempt',(SELECT count(*) FROM standalone_attempt_settings_333 WHERE enabled),'sources',(SELECT jsonb_object_agg(oid::regprocedure::text,md5(prosrc)) FROM pg_proc WHERE oid IN ('current_company_id()'::regprocedure,'log_table_change()'::regprocedure,'set_company_id_on_insert()'::regprocedure,'auth.uid()'::regprocedure,'data_entry_pilot8_gate(text)'::regprocedure))) resume`,['resume']);
   const p=r.resume;const expected=expectedSources??{'current_company_id()':'f857f027a44e858399e895d702af7ad0','log_table_change()':'9509fe109550c9e0367fcbe4ffc661c5','set_company_id_on_insert()':'949120b4d6c08f0c8707f63d28708d96','auth.uid()':'cdef18c69c4f4cbbced2eaf81e628b49','data_entry_pilot8_gate(text)':'1e066a6df3637c8d5c8f99f00a255d33'};
   before=(await select(baselineSQL(),['baseline'])).baseline;const repeated=(await select(baselineSQL(),['baseline'])).baseline;const comparison=compareBaselines(before,repeated);
   await writeFile(DIR+'/preflight-comparison.json',JSON.stringify(comparison),{mode:0o600});
   if(comparison.changedRelations.length||comparison.configChanged)throw Error('Concurrent baseline changes; stop before login');await writeFile(DIR+'/before.json',JSON.stringify(before),{mode:0o600});
   identity=owner.id; // ban guard binds to the reviewed identity; createUser is never called on resume.
   return {identityExact:p.users===1&&p.exact===1,referenceAbsent:p.reference===0,sourcesExact:Object.entries(expected).every(([k,v])=>p.sources[k]===v),globalsClosed:p.core===0&&p.attempt===0,activeAllowlist:p.active,sessions:p.sessions,neverSignedIn:p.signed===0};
  },
  createUser:async input=>{const u=await auth.create(input);identity=u.id;return {id:u.id,createdAt:u.created_at}},
  notifyController:async(owner)=>{notify({controller_prepare:true,identity_discovery:'controller SELECT by reviewed marker',pdf_sha256:SHA57,size:artifact.size,mime:'application/pdf',invoice_number:artifact.reference,no_login:true});},
  readReady:async(owner)=>{
   const r=await select(`SELECT jsonb_build_object('owner',u.id,'company',p.company_id,'active',p.active_company_id,'marker',u.raw_user_meta_data->>'fixture_marker','sha',u.raw_user_meta_data->>'pilot_pdf_sha256','size',u.raw_user_meta_data->>'pilot_pdf_size','mime',u.raw_user_meta_data->>'pilot_pdf_mime','last_login',u.last_sign_in_at,'ban',u.banned_until,'sessions',(SELECT count(*) FROM auth.sessions WHERE user_id=u.id),'role',(SELECT role FROM user_roles WHERE user_id=u.id AND company_id=${q(COMPANY57)}::uuid ORDER BY id LIMIT 1),'roles',(SELECT count(*) FROM user_roles WHERE user_id=u.id),'rows',(SELECT jsonb_agg(to_jsonb(a)) FROM data_entry_pilot8_allowlist a WHERE owner_id=u.id AND company_id=${q(COMPANY57)}::uuid),'global',(SELECT count(*) FROM data_entry_settings WHERE preparation_validated OR execute_validated)+(SELECT count(*) FROM standalone_attempt_settings_333 WHERE enabled),'name',p.full_name,'tax',(SELECT tax_id FROM companies WHERE id=${q(COMPANY57)}::uuid)) readiness FROM auth.users u JOIN profiles p ON p.id=u.id WHERE u.id=${q(owner.id)}::uuid AND u.email=${q(MARKER57+'@fixture.invalid')}`,['readiness']);
   const x=r.readiness;if(!x)return null;if(x.roles!==1)throw Error('Fixture membership count drift');if(x.sha!==SHA57||x.size!==String(artifact.size)||x.mime!=='application/pdf'||x.last_login!==null||x.ban!==null)throw Error('Fixture PDF/provenance readiness drift');
   const rows=x.rows??[];const enabled=(op:string)=>rows.length===2&&rows.some((a:any)=>a.operation===op&&a.enabled&&a.reviewed_note===`FICTITIOUS one PDF; ${MARKER57}; SHA256=${SHA57}`&&Date.parse(a.expires_at)>Date.now());
   last={...last,actor_name:x.name,tax_id:x.tax};
   return {owner:x.owner,company:x.company,marker:x.marker,role:x.role,sessionCount:x.sessions,activeCompany:x.active,canonicalCompany:x.company===COMPANY57&&(x.active===null||x.active===COMPANY57)?COMPANY57:'REFUSED',preparation:enabled('preparation'),assistantCreate:enabled('assistant_create'),globalOpen:x.global!==0,expiresAt:Math.min(...rows.map((a:any)=>Date.parse(a.expires_at)))};
  },
  login:async(email,password)=>{session=await auth.login(email,password);return {owner:session.user.id,token:session.access_token}},
  chromium:async(owner)=>{
   const result=await chromiumDriver57('docs/testes/issue333/pilot8/cloud-browser57.py',{...browserOptions,mode:'execute',output:DIR,cloud_url:url,public_key:pub,owner:owner.id,company:COMPANY57,reference:artifact.reference,pdf:DIR+'/pilot8-fiction.pdf',storage_key:'sb-'+new URL(url).hostname.split('.')[0]+'-auth-token',session,actor_name:last.actor_name,tax_id:last.tax_id});last={...last,...result};
   const fact=(await select(`SELECT jsonb_build_object('sessions',(SELECT count(*) FROM data_entry_sessions WHERE owner_id=${q(owner.id)}::uuid),'documents',(SELECT count(*) FROM data_entry_documents WHERE session_id IN (SELECT id FROM data_entry_sessions WHERE owner_id=${q(owner.id)}::uuid)),'previews',(SELECT count(*) FROM data_entry_previews WHERE session_id IN (SELECT id FROM data_entry_sessions WHERE owner_id=${q(owner.id)}::uuid)),'invoices',(SELECT count(*) FROM standalone_invoices WHERE created_by=${q(owner.id)}::uuid),'results',(SELECT count(*) FROM data_entry_results WHERE approved_by=${q(owner.id)}::uuid),'audits',(SELECT count(*) FROM standalone_attempt_audit_333 WHERE attempt_id IN (SELECT id FROM standalone_attempts_333 WHERE principal=${q(owner.id)})),'invoice',(SELECT to_jsonb(i) FROM standalone_invoices i WHERE created_by=${q(owner.id)}::uuid LIMIT 1)) fact`,['fact'])).fact;
   const i=fact.invoice;if(fact.audits>1)throw Error('Fixture audit multiplicity');if(!i||i.currency!=='EUR'||Number(i.total_amount)!==0||Number(i.iva_amount)!==0||i.invoice_number!==artifact.reference||i.paid_by_partner_id!==owner.id||i.created_by!==owner.id||!i.notes.includes('Feito por LLM com autorização de '+last.actor_name))throw Error('Fixture invoice metadata mismatch');
   const download=await fetch(url+'/storage/v1/object/authenticated/standalone-invoices/'+i.storage_path,{headers:{apikey:pub,Authorization:'Bearer '+service}});if(!download.ok)throw Error('Fixture download failed');const bytes=new Uint8Array(await download.arrayBuffer());if(bytes.length!==artifact.size)throw Error('Fixture download size mismatch');
   const after=(await select(baselineSQL(owner.id),['baseline'])).baseline;const unchanged=JSON.stringify(before.data.filter((x:any)=>financial.includes(x.name)))===JSON.stringify(after.data.filter((x:any)=>financial.includes(x.name)));
   await writeFile(DIR+'/fixture-fact.json',JSON.stringify({fact,sha256:createHash('sha256').update(bytes).digest('hex')}),{mode:0o600});
   return {sessions:fact.sessions,documents:fact.documents,previews:fact.previews,executeRequests:result.executeRequests,invoices:fact.invoices,results:fact.results,financialEffects:unchanged?0:1,downloadedSha:createHash('sha256').update(bytes).digest('hex'),approvedOwner:i.created_by,approvedNameFromServer:true,reopenedCheckOk:result.reopenedCheckOk};
  },
  requestRevocation:async owner=>{notify({controller_revoke_exact_two:true,identity_discovery:'controller SELECT by reviewed marker',sha256:SHA57});const end=Date.now()+120000;while(Date.now()<end){const r=await driver.readRevoked(owner,artifact);if(r.count===2&&r.disabled===2)return;await new Promise(r=>setTimeout(r,1000));}throw Error('Controller exclusive revocation not observed');},
  readRevoked:async owner=>{const r=await select(`SELECT jsonb_build_object('count',count(*),'disabled',count(*) FILTER(WHERE NOT enabled)) revoked FROM data_entry_pilot8_allowlist WHERE owner_id=${q(owner.id)}::uuid AND company_id=${q(COMPANY57)}::uuid AND reviewed_note=${q(`FICTITIOUS one PDF; ${MARKER57}; SHA256=${SHA57}`)}`,['revoked']);return r.revoked;},
  checkReadOnly:async(owner,token)=>{const prior=(await select(baselineSQL(),['baseline'])).baseline;const r=await fetch(url+'/functions/v1/data-entry',{method:'POST',headers:{apikey:pub,Authorization:'Bearer '+token,'Content-Type':'application/json','X-Data-Entry-User':owner.id,'X-Data-Entry-Company':COMPANY57},body:JSON.stringify({action:'check',session_id:last.latest.session_id,preview_id:last.latest.preview_id})});const body=await r.json();await writeFile(DIR+'/revoked-check.json',JSON.stringify({http:r.status,body}),{mode:0o600});const after=(await select(baselineSQL(),['baseline'])).baseline;const diff=compareBaselines(prior,after);return {ok:r.status===200&&body.status==='conferido',extraWrites:diff.changedRelations.length+(diff.configChanged?1:0)};},
  logoutGlobal:async token=>{await auth.logout(token)},banOnlyCreatedUser:async owner=>{if(owner!==identity)throw Error('Ban identity drift');await auth.ban(owner)},
  readSessionCount:async owner=>(await select(`SELECT count(*)::int n FROM auth.sessions WHERE user_id=${q(owner)}::uuid`,['n'])).n,
  finalBaselines:async owner=>{const after=(await select(baselineSQL(owner.id),['baseline'])).baseline;await writeFile(DIR+'/after.json',JSON.stringify(after),{mode:0o600});return {financialUnchanged:JSON.stringify(before.data.filter((x:any)=>financial.includes(x.name)))===JSON.stringify(after.data.filter((x:any)=>financial.includes(x.name))),priorCandidatesPreserved:JSON.stringify(before.data)===JSON.stringify(after.data),globalsClosed:after.core_open===0&&after.attempt_open===0&&JSON.stringify(before.config)===JSON.stringify(after.config)};},
  now:()=>Date.now(),wait:ms=>new Promise(r=>setTimeout(r,ms)),secret:privateSecret57,
 };
 return driver;
}
async function main() {
 bridge=await OfficialSelectBridge.fresh();
 console.log(JSON.stringify({official_select_directory:bridge.relayDirectory,response_contract:'{id, fingerprint: sha256(query), data: official row array}',controller_writes:'separate reviewed query_database; never this relay'}));
 const artifact=await exactPdf57(DIR+'/pilot8-fiction.pdf');
 const url=process.env.SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY,pub=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!service||!pub)throw Error('Private AuthAdmin environment absent');
 const auth=new AuthAdmin57(url,service,pub);
 await auth.readProbe();
 await chromiumDriver57('docs/testes/issue333/pilot8/cloud-browser57.py',{mode:'probe',output:DIR,cloud_url:url});
 const driver=connectedDriver58({artifact,auth,select,url,service,pub,directory:DIR});
 if(!process.argv.includes('--authorized-single-pilot57')&&!process.argv.includes('--preflight-only')&&!process.argv.includes('--resume-identity63')){console.log(JSON.stringify({ready:'AuthAdmin/read-only/PDF/Chromium probe',accountCreated:false}));return;}
 if(process.argv.includes('--preflight-only')){console.log(JSON.stringify({preflight:await driver.preflightReadOnly(artifact),accountCreated:false}));return;}
 if(process.argv.includes('--resume-identity63')){
  // prova64: SAME reviewed identity; private state/secret from /tmp 0600 only; never printed; no createUser.
  const state=JSON.parse(await readFile('/tmp/issue333-63/state.json','utf8'));const password=(await readFile('/tmp/issue333-63/secret','utf8')).trim();
  if(state.phase!=='created_checkpoint'||state.no_login!==true)throw Error('Private state drift; ban only and stop');
  const result=await resumeExistingPilot(driver,artifact,{id:state.owner_id,createdAt:state.created_at},password,'PEDRO_AUTHORIZED_SINGLE_PILOT8_RESUME63');console.log(JSON.stringify(result));return;
 }
 if(!process.argv.includes('--authorized-single-pilot57'))return;
 const result=await runFuturePilot(driver,artifact,'PEDRO_AUTHORIZED_SINGLE_PILOT8');console.log(JSON.stringify(result));
}
if(import.meta.main) main().catch(async(error)=>{await mkdir(DIR,{recursive:true,mode:0o700});const reason=error instanceof Error&&(/schema incompatibilities|Concurrent baseline|environment absent|PDF|Official SELECT|Chromium private/.test(error.message))?error.message:'Private driver stopped; read-only recovery only';await writeFile(DIR+'/stopped.json',JSON.stringify({reason}),{mode:0o600});console.log(JSON.stringify({pilot_stopped:true,repeat_forbidden:true,see_sanitized_evidence:true}));process.exitCode=1});
