#!/usr/bin/env python3
"""LOCAL ONLY: compare Live catalog SELECT snapshots with disposable harness catalog."""
import json, subprocess, sys, hashlib
from pathlib import Path
here=Path(__file__).parent/'live'; psql=sys.argv[1:]
def q(sql): return json.loads(subprocess.check_output(psql+['-At','-c',sql],text=True) or 'null')
norm=lambda s:' '.join((s or '').split())
auth=json.load(open(here/'phase2c-auth.json'))+json.load(open(here/'phase2c-transitive.json'))+json.load(open(here/'phase2c-touched.json'))['functions']
rels=json.load(open(here/'phase2c-relations.json'))
local_f={(x['schema'],x['name'],x['args']):x for x in q("""SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'secdef',p.prosecdef,'config',p.proconfig,'definition',pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('auth','public')""") or []}
local_r={x['name']:x for x in q("""SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname),'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'type',contype,'validated',convalidated,'definition',pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid=c.oid))) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'""") or []}
gaps={x['object']:x['reason'] for x in (q("SELECT jsonb_agg(to_jsonb(g)) FROM public.issue335_parity_gaps g") or [])}
EXPLAINED={
 'acl-order':'aclitem order is not semantic; compared as sets.',
 'owner:auth.jwt':'local auth schema replayed with supabase_auth_admin owner (identical)',
}
rows=[];unexplained=[]
def acl(v):
 if not isinstance(v,str) or not v.startswith('{'): return v
 return sorted(x for x in v.strip('{}').split(','))
def add(obj,live,local,explanation=None):
 if obj.endswith('.acl'):
  m=isinstance(live,str) and 'm/' in live
  live,local=acl(live),acl(local)
  if live==local and m: explanation=None
 ok=live==local
 rows.append((obj,'igual' if ok else ('explicada' if explanation else 'DIVERGENTE'),'' if ok else explanation or f'Live={live!r} local={local!r}'))
 if not ok and not explanation: unexplained.append(obj)
seen=set()
for f in auth:
 k=(f['schema'],f['name'],f['args'])
 if k in seen:continue
 seen.add(k); l=local_f.get(k)
 if not l: add('function:%s.%s(%s)'%k,'present','absent'); continue
 for field in ['owner','acl','secdef','config']: add(f'function:{k[1]}({k[2]}).{field}',f.get(field),l.get(field))
 add(f'function:{k[1]}({k[2]}).definition_sha256',hashlib.sha256(norm(f['definition']).encode()).hexdigest()[:16],hashlib.sha256(norm(l['definition']).encode()).hexdigest()[:16])
for r in rels:
 l=local_r.get(r['name'])
 if not l: add('relation:'+r['name'],'present','absent'); continue
 for field in ['owner','acl','rls']: add(f'relation:{r["name"]}.{field}',r[field],l[field])
 pol=lambda xs:sorted((p['policyname'],p['permissive'],p['cmd'],tuple(p['roles']),norm(p['qual']),norm(p['with_check'])) for p in xs or [])
 add(f'relation:{r["name"]}.policies',pol(r['policies']),pol(l['policies']))
 for c in r['constraints'] or []:
  obj=f'constraint:{r["name"]}.{c["name"]}'
  lc=next((v for v in l['constraints'] or [] if v['name']==c['name']),None)
  add(obj, {k:c[k] for k in ['type','validated','definition']}, {k:lc[k] for k in ['type','validated','definition']} if lc else 'absent',gaps.get(obj) and 'fixture dependency absent locally: '+gaps[obj])
out=['# #335 fase 2c — diferencial catálogo Live × harness local','',f'Total: {len(rows)}; iguais: {sum(r[1]=="igual" for r in rows)}; explicadas: {sum(r[1]=="explicada" for r in rows)}; DIVERGENTES: {len(unexplained)}','','| objeto | resultado | nota |','|---|---|---|']
out += [f'| {a} | {b} | {c.replace("|","/")[:300]} |' for a,b,c in rows if b!='igual']
Path('/tmp/issue335-catalog-diff.md').write_text('\n'.join(out)+'\n')
print('\n'.join(out[:5]))
sys.exit(1 if unexplained else 0)
