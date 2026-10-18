/** Reviewed metadata/global aggregates only. No identity, row contents or dispatch. */
import {metadataSQL,financial,protectedTables} from './baseline58';
import {contract71,type Schema71,type SchemaNode71} from './controller-checkpoint71';
const str:SchemaNode71={type:'string'},num:SchemaNode71={type:'number',integer:true,minimum:0},bool:SchemaNode71={type:'boolean'};
const nullable=(s:SchemaNode71):SchemaNode71=>({type:'union',options:[s,{type:'null'}]});
const md5:SchemaNode71={type:'string',pattern:'^[a-f0-9]{32}$'};
const obj=(properties:Record<string,SchemaNode71>):SchemaNode71=>({type:'object',properties});
const arr=(items:SchemaNode71):SchemaNode71=>({type:'array',items});
// SQL normalizes optional catalog fields only, never PostgreSQL numeric business values.
export const baselineSchema71=obj({data:arr(obj({name:str,n:num,h:md5})),config:arr(obj({signature:str,source:md5,proacl:nullable(str),proconfig:nullable(arr(str)),proowner:{type:'union',options:[num,{type:'string',pattern:'^[0-9]+$'}]}})),core_open:num,attempt_open:num,allowlist_count:num});
export function globalBaselineSQL71(){
 // No sentinel owner or exclusion: retain every historic artifact, including NULL owners.
 const branches=[...financial,...protectedTables].map(t=>`SELECT '${t}' name,count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) h FROM public.${t} t`);
 return `SELECT jsonb_build_object('data',(SELECT jsonb_agg(x ORDER BY name) FROM (${branches.join(' UNION ALL ')}) x),'config',(SELECT coalesce(jsonb_agg(x ORDER BY signature),'[]'::jsonb) FROM (SELECT oid::regprocedure::text signature,md5(prosrc) source,coalesce(proacl::text,'DEFAULT') proacl,coalesce(proconfig,ARRAY[]::text[]) proconfig,proowner FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'data_entry%' OR proname IN ('standalone_attempt_gate_333','standalone_attempts_333_internal'))) x),'core_open',(SELECT count(*) FROM public.data_entry_settings WHERE preparation_validated OR execute_validated),'attempt_open',(SELECT count(*) FROM public.standalone_attempt_settings_333 WHERE enabled),'allowlist_count',(SELECT count(*) FROM public.data_entry_pilot8_allowlist)) baseline`;
}
export const bundle71=[
 contract71('proof71-metadata-0001',`SELECT (${metadataSQL()}) incompatibilities, (SELECT jsonb_object_agg(oid::regprocedure::text,md5(prosrc)) FROM pg_proc WHERE oid IN (to_regprocedure('current_company_id()'),to_regprocedure('log_table_change()'),to_regprocedure('set_company_id_on_insert()'),to_regprocedure('auth.uid()'),to_regprocedure('data_entry_pilot8_gate(text)'))) sources, (SELECT count(*)::integer FROM public.data_entry_pilot8_allowlist WHERE enabled) active_allowlist`,{type:'object',properties:{incompatibilities:arr(str),sources:obj({'current_company_id()':md5,'log_table_change()':md5,'set_company_id_on_insert()':md5,'auth.uid()':md5,'data_entry_pilot8_gate(text)':md5}),active_allowlist:num}},16384),
 contract71('proof71-baseline-0001',globalBaselineSQL71(),{type:'object',properties:{baseline:baselineSchema71}},32768),
 contract71('proof71-baseline-0002',globalBaselineSQL71(),{type:'object',properties:{baseline:baselineSchema71}},32768),
];
/** Driver projection validators reject unknown projections. Nested optional fields in
 * legacy SQL are described explicitly; absent required fields never pass. */
export function driverSchema71(_query:string,keys:string[]):Schema71 {
 const maps:Record<string,SchemaNode71>={
  incompatibilities:arr(str),sources:obj({'current_company_id()':md5,'log_table_change()':md5,'set_company_id_on_insert()':md5,'auth.uid()':md5,'data_entry_pilot8_gate(text)':md5}),
  checkpoint:obj({exact:num,users:num,rows:num,global_active:num,invoices:num}),
  revoked:obj({count:num,disabled:num}),n:num,
  preflight:obj({marker:num,reference:num,allowlist:num,core:num,attempt:num,sources:obj({'current_company_id()':md5,'log_table_change()':md5,'set_company_id_on_insert()':md5,'auth.uid()':md5,'data_entry_pilot8_gate(text)':md5})}),
  resume:obj({users:num,exact:num,signed:num,sessions:num,reference:num,active:num,core:num,attempt:num,sources:obj({'current_company_id()':md5,'log_table_change()':md5,'set_company_id_on_insert()':md5,'auth.uid()':md5,'data_entry_pilot8_gate(text)':md5})}),
  baseline:baselineSchema71,
  readiness:obj({owner:str,company:str,active:nullable(str),marker:str,sha:str,size:str,mime:str,last_login:nullable(str),ban:nullable(str),sessions:num,role:str,roles:num,rows:arr(obj({operation:str,enabled:bool,reviewed_note:str,expires_at:str})),global:num,name:str,tax:str}),
  fact:obj({sessions:num,documents:num,previews:num,invoices:num,results:num,audits:num,invoice:obj({currency:str,total_amount:{type:'union',options:[num,str]},iva_amount:{type:'union',options:[num,str]},invoice_number:str,paid_by_partner_id:str,created_by:str,notes:str,storage_path:str})}),
 };

 const properties:Record<string,SchemaNode71>={};for(const k of keys){if(!maps[k])throw Error('Identity-bound projection requires reviewed schema: '+k);properties[k]=maps[k]}
 return {type:'object',properties};
}