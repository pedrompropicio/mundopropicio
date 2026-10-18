/** Read-only inventory shared by the official relay and disposable driver tests. */
export const financial = ['transactions','event_forecasts','financial_accounts','transaction_payments','reimbursement_notes','reimbursement_note_items','payment_lists'];
export const protectedTables = ['data_entry_sessions','data_entry_documents','data_entry_previews','data_entry_results','standalone_invoices','standalone_attempts_333','standalone_attempt_audit_333','data_entry_storage_receipts'];
export const quote = (v:string) => "'"+v.replace(/'/g,"''")+"'";
// Every explicit column read by baseline, readiness, facts and final checks is inventoried.
export const columns:Record<string,string[]> = {
 'auth.users':['id','email','raw_user_meta_data','last_sign_in_at','banned_until','created_at'], 'auth.sessions':['user_id'],
 ...Object.fromEntries(financial.map(t=>['public.'+t,['id']])),
 'public.reimbursement_notes':['id','payment_transaction_id','total_amount','status','company_id'],
 'public.reimbursement_note_items':['id','reimbursement_note_id','transaction_id','company_id'],
 'public.data_entry_sessions':['id','owner_id'], 'public.data_entry_documents':['id','session_id','path'],
 'public.data_entry_previews':['id','session_id'], 'public.data_entry_results':['approved_by'],
 'public.standalone_invoices':['created_by','storage_path','invoice_number','currency','total_amount','iva_amount','paid_by_partner_id','notes'],
 'public.standalone_attempts_333':['id','principal'], 'public.standalone_attempt_audit_333':['attempt_id'],
 'public.data_entry_storage_receipts':['path'], 'public.data_entry_settings':['preparation_validated','execute_validated'],
 'public.standalone_attempt_settings_333':['enabled'], 'public.data_entry_pilot8_allowlist':['owner_id','company_id','operation','enabled','expires_at','reviewed_note'],
 'public.profiles':['id','company_id','active_company_id','full_name'], 'public.user_roles':['id','user_id','company_id','role'], 'public.companies':['id','tax_id','status'],
 'pg_catalog.pg_proc':['oid','prosrc','proacl','proconfig','proowner','pronamespace','proname'],
};
export function metadataSQL() {
 const values=Object.entries(columns).flatMap(([t,cs])=>cs.map(c=>`(${quote(t)},${quote(c)})`));
 return `SELECT coalesce(jsonb_agg(relation||'.'||column_name ORDER BY relation,column_name),'[]'::jsonb) incompatibilities FROM (VALUES ${values.join(',')}) required(relation,column_name) WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=to_regclass(required.relation) AND a.attname=required.column_name AND a.attnum>0 AND NOT a.attisdropped)`;
}
export function baselineSQL(owner?:string) {
 const scope=quote(owner??'00000000-0000-0000-0000-000000000000');
 const filters:Record<string,string>={data_entry_sessions:`owner_id IS DISTINCT FROM ${scope}::uuid`,data_entry_documents:`session_id NOT IN (SELECT id FROM public.data_entry_sessions WHERE owner_id=${scope}::uuid)`,data_entry_previews:`session_id NOT IN (SELECT id FROM public.data_entry_sessions WHERE owner_id=${scope}::uuid)`,data_entry_results:`approved_by IS DISTINCT FROM ${scope}::uuid`,standalone_invoices:`created_by IS DISTINCT FROM ${scope}::uuid`,standalone_attempts_333:`principal IS DISTINCT FROM ${scope}`,standalone_attempt_audit_333:`attempt_id NOT IN (SELECT id FROM public.standalone_attempts_333 WHERE principal=${scope})`,data_entry_storage_receipts:`path NOT IN (SELECT path FROM public.data_entry_documents WHERE session_id IN (SELECT id FROM public.data_entry_sessions WHERE owner_id=${scope}::uuid)) AND path NOT IN (SELECT storage_path FROM public.standalone_invoices WHERE created_by=${scope}::uuid)`};
 const branches=[...financial,...protectedTables].map(t=>`SELECT '${t}' name,count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) h FROM public.${t} t${filters[t]?' WHERE '+filters[t]:''}`);
 return `SELECT jsonb_build_object('data',(SELECT jsonb_agg(x ORDER BY name) FROM (${branches.join(' UNION ALL ')}) x),'config',(SELECT jsonb_agg(x ORDER BY signature) FROM (SELECT oid::regprocedure::text signature,md5(prosrc) source,proacl::text,proconfig,proowner FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'data_entry%' OR proname IN ('standalone_attempt_gate_333','standalone_attempts_333_internal'))) x),'core_open',(SELECT count(*) FROM public.data_entry_settings WHERE preparation_validated OR execute_validated),'attempt_open',(SELECT count(*) FROM public.standalone_attempt_settings_333 WHERE enabled),'allowlist_count',(SELECT count(*) FROM public.data_entry_pilot8_allowlist)) baseline`;
}
export function compareBaselines(a:any,b:any) {
 return {changedRelations:a.data.filter((x:any)=>JSON.stringify(x)!==JSON.stringify(b.data.find((y:any)=>y.name===x.name))).map((x:any)=>x.name),configChanged:JSON.stringify(a.config)!==JSON.stringify(b.config),globalsClosed:b.core_open===0&&b.attempt_open===0};
}