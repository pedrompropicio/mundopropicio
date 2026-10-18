/** LOCAL preparation only. No dispatch, credentials, SQL functions with effects or retries. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {contract71,type SchemaNode71} from '../pilot8/controller-checkpoint71';
import {bundle71,baselineSchema71,globalBaselineSQL71} from '../pilot8/select-bundle71';
import {baselineSQL,quote} from '../pilot8/baseline58';
const number:SchemaNode71={type:'number',integer:true,minimum:0};
const obj=(properties:Record<string,SchemaNode71>):SchemaNode71=>({type:'object',properties});
export function stageBundles73(m:{marker:string;email:string;reference:string;company:string;full_name:string;sha256:string;size:number;mime:string},identity?:{owner_id:string;role_id:string;created_at:string}){
 if(!/^issue333-pilot8-[a-f0-9]{32}$/.test(m.marker)||['issue333-pilot8-916bd3976502472ab18f39ea0adf7589','issue333-pilot8-11af044ae28127538fe8cc06be67541a'].includes(m.marker)||m.email!==m.marker+'@fixture.invalid'||m.reference!=='FICTICIO-'+m.marker||m.company!=='7c858982-6ccd-47ca-bd65-e0dd3eebf01c')throw Error('Manifest scope refused');
 if(identity&&(![identity.owner_id,identity.role_id].every(s=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s))||!Number.isFinite(Date.parse(identity.created_at))))throw Error('Reviewed identity required');
 const u=identity?.owner_id??'PLACEHOLDER-UUID-OWNER',r=identity?.role_id??'PLACEHOLDER-UUID-ROLE',created=identity?.created_at??'PLACEHOLDER-EXACT-CREATED-AT';
 const count=(q:string)=>`(SELECT count(*)::integer FROM ${q})`;
 const c=quote(m.company)+'::uuid',owner=quote(u)+'::uuid';
 const flags=`'core_open',${count('public.data_entry_settings WHERE preparation_validated OR execute_validated')},'attempt_open',${count('public.standalone_attempt_settings_333 WHERE enabled')},'global_active',${count('public.data_entry_pilot8_allowlist WHERE enabled')}`;
 const absence=`SELECT jsonb_build_object('marker',${count(`auth.users WHERE email=${quote(m.email)} OR raw_user_meta_data->>'fixture_marker'=${quote(m.marker)}`)},'reference',${count(`public.standalone_invoices WHERE company_id=${c} AND invoice_number=${quote(m.reference)}`)},'company_active',${count(`public.companies WHERE id=${c} AND status='active'`)},${flags}) guards`;
 const guards=obj(Object.fromEntries(['marker','reference','company_active','core_open','attempt_open','global_active'].map(k=>[k,number])));
 const output=[contract71('proof73-precreation-0001',absence,{type:'object',properties:{guards}},8192),...bundle71.map((v,i)=>({...v,id:`proof73-${['metadata','baseline1','baseline2'][i]}-0001`}))];
 for(const stage of ['identity','activated','prerevocation','revoked','final']){
  const where=`owner_id=${owner} AND company_id=${c} AND reviewed_note=${quote(`FICTITIOUS one PDF; ${m.marker}; SHA256=${m.sha256}`)}`;
  const exact=`auth.users au JOIN public.profiles pr ON pr.id=au.id JOIN public.user_roles ur ON ur.user_id=au.id WHERE au.id=${owner} AND au.created_at=${quote(created)}::timestamptz AND au.email=${quote(m.email)} AND au.email_confirmed_at IS NOT NULL AND au.raw_user_meta_data->>'fixture_marker'=${quote(m.marker)} AND au.raw_user_meta_data->>'company_id'=${quote(m.company)} AND au.raw_user_meta_data->>'full_name'=${quote(m.full_name)} AND au.raw_user_meta_data->>'pilot_pdf_sha256'=${quote(m.sha256)} AND au.raw_user_meta_data->>'pilot_pdf_size'=${quote(String(m.size))} AND au.raw_user_meta_data->>'pilot_pdf_mime'=${quote(m.mime)} AND pr.full_name=${quote(m.full_name)} AND pr.company_id=${c} AND (pr.active_company_id IS NULL OR pr.active_company_id=${c}) AND ur.id=${quote(r)}::uuid AND ur.company_id=${c} AND ur.role='${stage==='identity'?'user':'manager'}'`;
  const counts={exact:count(exact),roles:count(`public.user_roles WHERE user_id=${owner}`),signed:count(`auth.users WHERE id=${owner} AND last_sign_in_at IS NOT NULL`),banned:count(`auth.users WHERE id=${owner} AND banned_until IS NOT NULL`),sessions:count(`auth.sessions WHERE user_id=${owner}`),refresh_tokens:count(`auth.refresh_tokens WHERE user_id=${quote(u)}`),permissions:count(`public.data_entry_pilot8_allowlist WHERE ${where}`),enabled:count(`public.data_entry_pilot8_allowlist WHERE ${where} AND enabled`),unexpired:count(`public.data_entry_pilot8_allowlist WHERE ${where} AND enabled AND expires_at>clock_timestamp() AND expires_at<=clock_timestamp()+interval '600 seconds'`),invoices:count(`public.standalone_invoices WHERE created_by=${owner} OR (company_id=${c} AND invoice_number=${quote(m.reference)})`),zero_eur_invoices:count(`public.standalone_invoices WHERE created_by=${owner} AND company_id=${c} AND invoice_number=${quote(m.reference)} AND currency='EUR' AND total_amount=0 AND iva_amount=0`),results:count(`public.data_entry_results WHERE approved_by=${owner}`),documents:count(`public.data_entry_documents WHERE session_id IN (SELECT id FROM public.data_entry_sessions WHERE owner_id=${owner})`),previews:count(`public.data_entry_previews WHERE session_id IN (SELECT id FROM public.data_entry_sessions WHERE owner_id=${owner})`)};
  const query=`SELECT jsonb_build_object(${Object.entries(counts).map(([k,v])=>quote(k)+','+v).join(',')},${flags}) guards, (${identity?baselineSQL(u):globalBaselineSQL71()}) baseline`;
  const schema={type:'object' as const,properties:{guards:obj(Object.fromEntries([...Object.keys(counts),'core_open','attempt_open','global_active'].map(k=>[k,number]))),baseline:baselineSchema71}};
  output.push({...contract71(`proof73-${stage}-0001`,query,schema,32768),...(!identity?{templateOnly:true}: {})} as typeof output[number]);
 }
 return output;
}
if(import.meta.main){
 const [src,dest,identityPath]=process.argv.slice(2);if(!src?.startsWith('/tmp/')||!dest?.startsWith('/tmp/'))throw Error('Private /tmp only');
 const m=JSON.parse(await readFile(src,'utf8'));const identity=identityPath?JSON.parse(await readFile(identityPath,'utf8')):undefined;
 await mkdir(dest,{recursive:true,mode:0o700});for(const c of stageBundles73(m,identity))await writeFile(`${dest}/${c.id}.json`,JSON.stringify(c,null,2),{mode:0o600,flag:'wx'});
 console.log('9 reviewed contracts written privately; identity templates are not executable');
}