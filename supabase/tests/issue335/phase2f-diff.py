"""Catalog-only comparison. Missing dependencies are failures, never parity passes."""
import json
from pathlib import Path
import subprocess
import sys

live=json.loads((Path(__file__).parent/'live/phase2f-catalog.json').read_text())
psql=sys.argv[1:]
def q(statement):
    return json.loads(subprocess.check_output(psql+['-At','-c',statement],text=True).strip() or 'null') or []
local={}
local['relations']=q("""SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth') AND c.relkind='r'""")
local['columns']=q("""SELECT jsonb_agg(jsonb_build_object('table',a.attrelid::regclass::text,'name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl::text)) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE c.relnamespace IN('public'::regnamespace,'auth'::regnamespace) AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped""")
local['constraints']=q("""SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'type',contype,'validated',convalidated,'deferrable',condeferrable,'deferred',condeferred,'definition',pg_get_constraintdef(oid))) FROM pg_constraint WHERE connamespace IN('public'::regnamespace,'auth'::regnamespace)""")
local['indexes']=q("""SELECT jsonb_agg(jsonb_build_object('table',i.indrelid::regclass::text,'name',c.relname,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready)) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace IN('public'::regnamespace,'auth'::regnamespace)""")
local['triggers']=q("""SELECT jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'internal',tgisinternal,'enabled',tgenabled,'definition',pg_get_triggerdef(oid),'function',tgfoid::regprocedure::text)) FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace IN('public'::regnamespace,'auth'::regnamespace))""")
local['policies']=q("SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname IN('public','auth')")
local['functions']=q("""SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'prosrc',p.prosrc,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'secdef',p.prosecdef,'config',p.proconfig)) FROM pg_proc p WHERE p.prokind='f' AND p.pronamespace IN('public'::regnamespace,'auth'::regnamespace)""")
local['default_acl']=q("SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(defaclrole),'schema',defaclnamespace::regnamespace::text,'type',defaclobjtype,'acl',defaclacl::text)) FROM pg_default_acl")
local['schemas']=q("SELECT jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text)) FROM pg_namespace WHERE nspname IN('public','auth')")
local['roles']=q("SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'bypass',rolbypassrls,'create',rolcreaterole,'inherit',rolinherit)) FROM pg_roles WHERE rolname NOT LIKE 'pg_%'")
local['memberships']=q("SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'grantor',pg_get_userbyid(grantor),'admin',admin_option,'inherit',inherit_option,'set',set_option)) FROM pg_auth_members")
keys={'relations':['schema','name'],'columns':['table','name'],'constraints':['table','name'],'indexes':['table','name'],'triggers':['table','name'],'policies':['schemaname','tablename','policyname'],'functions':['signature'],'default_acl':['role','schema','type'],'schemas':['name'],'roles':['name'],'memberships':['role','member']}
rows=[]
for category,fields in keys.items():
    key=lambda obj:tuple(str(obj.get(f)) for f in fields)
    a={key(o):o for o in live[category]};b={key(o):o for o in local[category]}
    for ident in sorted(a.keys()|b.keys()):
        left=a.get(ident);right=b.get(ident)
        if left==right:status='equal';reason='exact bytes and attributes'
        elif left is None:status='local_extra';reason='bootstrap dependency or extra object; not certified'
        elif right is None:status='missing';reason='dependency not replayed; parity blocker'
        else:status='different';reason='bootstrap schema/ACL/body/constraint mismatch; full values retained for review'
        rows.append(dict(category=category,object=list(ident),status=status,reason=reason,live=left,local=right))
out=Path('/tmp/issue335-phase2f');out.mkdir(exist_ok=True)
(out/'catalog-differential.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
(out/'harness-catalog.json').write_text(json.dumps(local,ensure_ascii=False,indent=2)+'\n')
print('2f full captured-scope differential:',{s:sum(r['status']==s for r in rows) for s in ['equal','missing','different','local_extra']})
print('NOT CERTIFIED: outgoing FK catalog closure is captured; complete body/dynamic dependency closure and hosted environment are not.')