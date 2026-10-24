"""#352 reviewed local replay. No DSN, remote credentials, or remote target accepted."""
import json,pathlib,hashlib,sys,argparse
parser=argparse.ArgumentParser();parser.add_argument('--target',choices=['local','homolog'],default='local');args=parser.parse_args()
if args.target!='local':raise SystemExit('BLOCKED: homolog overlays not materialized/reviewed; no remote execution supported')
review_root=pathlib.Path(__file__).resolve().parent
plan_path=review_root/'plan.json'
if not plan_path.exists():raise SystemExit('BLOCKED: missing reviewed plan.json; no Docker/SQL started')
plan=json.loads(plan_path.read_text())
if (plan.get('reviewed_by')!='Claude (0 - Cowork)' or plan.get('review_comment_id')!=6387254548
    or plan.get('review_body_sha256')!='a446675785f57a0d746ae0b187ff095217c207d5764acc98959582fa21aefdcb' or not plan.get('execution_allowed') or plan.get('allowed_target')!='local'):
    raise SystemExit('BLOCKED: invalid review reference or target')
for entry in plan['entries']:
    original=pathlib.Path(entry['path']).read_bytes()
    if hashlib.sha256(original).hexdigest()!=entry['original_sha256']:raise SystemExit('BLOCKED: changed source '+entry['path'])
    target=review_root/entry['overlay_path'] if entry.get('overlay_path') else pathlib.Path(entry['path'])
    actual=hashlib.sha256(target.read_bytes()).hexdigest()
    if actual!=entry['executed_sha256']:raise SystemExit('BLOCKED: changed execution bytes '+entry['path'])
    if entry.get('overlay_path') and plan.get('overlay_hashes',{}).get(entry['overlay_path'])!=actual:raise SystemExit('BLOCKED: overlay not reviewed')
if hashlib.sha256((review_root/plan['dedupe_file']).read_bytes()).hexdigest()!=plan['dedupe_sha256']:raise SystemExit('BLOCKED: changed dedupe')
"""#352 native local Supabase replay. No remote credentials or application functions."""
import pathlib, subprocess, json, re, os, hashlib, datetime, sys
root=pathlib.Path.cwd(); out=root/'replay-evidence'; out.mkdir(exist_ok=True)
work=root/'.replay-local';work.mkdir(exist_ok=True)
def run(args,**kw):return subprocess.run(args,capture_output=True,text=True,**kw)
def clean(s):
    s=re.sub(r"'(?:''|[^'])*'","'<redigido>'",s)
    s=re.sub(r'https?://[^\s"<>]+','<redigido>',s,flags=re.I)
    s=re.sub(r'eyJ[A-Za-z0-9_.-]+|sb_secret_[A-Za-z0-9_-]+|sbp_[A-Za-z0-9_-]+','<redigido>',s)
    s=re.sub(r'(?im)^.*(?:Bearer|Authorization|api.key|secret.key|service.role.key|anon.key|publishable.key).*$','<redigido>',s)
    return s
meta={'sha':os.environ.get('GITHUB_SHA'),'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cli':run(['supabase','--version']).stdout.strip(),'scope':'reviewed Supabase/Drizzle deduplicated plan; no manual/seed/functions'}
(out/'metadata.json').write_text(json.dumps(meta,indent=2))
(out/'plan.json').write_bytes(plan_path.read_bytes())
init=run(['supabase','init'],cwd=work)
if init.returncode: (out/'bootstrap.log').write_text(clean(init.stdout+init.stderr));sys.exit(init.returncode)
config=work/'supabase/config.toml';s=config.read_text();s=re.sub(r'^project_id = .*$', 'project_id = "mp352"',s,flags=re.M);s=s.replace('[db.seed]\nenabled = true','[db.seed]\nenabled = false');config.write_text(s)
# Bootstrap without app migrations or functions. Never publish local generated keys.
start=run(['supabase','start','-x','studio,imgproxy,edge-runtime,logflare,vector,supavisor'],cwd=work)
if start.returncode:
    (out/'bootstrap.log').write_text(clean(start.stdout+start.stderr));sys.exit(start.returncode)
db='supabase_db_mp352'
def sql(q,role='postgres'):
    r=run(['docker','exec','-i','-e','PGPASSWORD=postgres',db,'psql','-X','-h','127.0.0.1','-U',role,'-d','postgres','-At','-v','ON_ERROR_STOP=1'],input=q)
    if r.returncode:raise RuntimeError(clean(r.stderr))
    return r.stdout
# Disable scheduled execution before copying any application SQL.
sql("ALTER SYSTEM SET cron.launch_active_jobs = 'off';",role="supabase_admin")
sql("SELECT pg_reload_conf();",role="supabase_admin")
assert sql("SHOW cron.launch_active_jobs;").strip()=='off'
# Firewall: containers may talk to each other, never to external integrations.
network=json.loads(run(['docker','inspect',db]).stdout)[0]['NetworkSettings']['Networks']
for name in network:
    info=json.loads(run(['docker','network','inspect',name]).stdout)[0]
    bridge=info.get('Options',{}).get('com.docker.network.bridge.name') or 'br-'+info['Id'][:12]
    for ipam in info['IPAM']['Config']:
        subnet=ipam.get('Subnet')
        if subnet:
            binary='ip6tables' if ':' in subnet else 'iptables'
            result=run(['sudo',binary,'-I','DOCKER-USER','1','-i',bridge,'!','-d',subnet,'-j','REJECT'])
            if result.returncode:raise RuntimeError('Cannot establish container egress fence')
(out/'isolation.json').write_text(json.dumps({'cron_launch_active_jobs':'off','external_container_egress':'REJECT','functions_copied':False,'manual_copied':False,'drizzle_applied_via_plan':True}))

# Only the disposable CLI bootstrap is reset. Original app migrations are not copied.
reset=run(['supabase','db','reset','--local','--no-seed'],cwd=work)
(out/'bootstrap-reset.log').write_text(clean(reset.stdout+reset.stderr))
if reset.returncode: raise SystemExit(reset.returncode)
# CLI reset restores local configuration; no app SQL has run yet.
(out/'cron-after-empty-reset.json').write_text(json.dumps({'value':sql('SHOW cron.launch_active_jobs;').strip(),'application_migrations_applied':0}))
sql("ALTER SYSTEM SET cron.launch_active_jobs = 'off';",role='supabase_admin')
sql('SELECT pg_reload_conf();',role='supabase_admin')
import time
for attempt in range(20):
    if sql('SHOW cron.launch_active_jobs;').strip()=='off':break
    time.sleep(0.1)
else:raise RuntimeError('Cron guard not restored after empty reset')
# Check the reset did not move containers off the fenced Docker networks.
network_after=json.loads(run(['docker','inspect',db]).stdout)[0]['NetworkSettings']['Networks']
if set(network_after)!=set(network):raise RuntimeError('Docker network changed after reset')
for name in network_after:
    info=json.loads(run(['docker','network','inspect',name]).stdout)[0]
    bridge=info.get('Options',{}).get('com.docker.network.bridge.name') or 'br-'+info['Id'][:12]
    for ipam in info['IPAM']['Config']:
        subnet=ipam.get('Subnet')
        if subnet:
            binary='ip6tables' if ':' in subnet else 'iptables'
            check=run(['sudo',binary,'-C','DOCKER-USER','-i',bridge,'!','-d',subnet,'-j','REJECT'])
            if check.returncode:raise RuntimeError('Egress fence missing after reset')
assert sql('SHOW cron.launch_active_jobs;').strip()=='off'
sql("CREATE SCHEMA IF NOT EXISTS drizzle; CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint);")
sql("CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);")
executed=[]; failure=None
for entry in plan['entries']:
    path=review_root/entry['overlay_path'] if entry.get('overlay_path') else root/entry['path']
    body=path.read_text()
    def literal(v): return "'"+str(v).replace("'","''")+"'"
    # Standard ledger records historical source identity; manifest separately exposes actual overlay bytes.
    if entry['source']=='drizzle':
        record="INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES ("+literal(entry['ledger_hash'])+","+str(entry['candidate_time_ms'])+");"
    else:
        record="INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ("+literal(entry['version'])+","+literal(pathlib.Path(entry['path']).stem)+",ARRAY[]::text[]);"
    result=run(['docker','exec','-i',db,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],input='BEGIN;\n'+body+'\n'+record+'\nCOMMIT;')
    item={**entry,'executed_sha256':hashlib.sha256(body.encode()).hexdigest(),'exit_code':result.returncode}
    executed.append(item)
    (out/'replay.log').open('a').write(entry['path']+' exit='+str(result.returncode)+'\n'+clean(result.stderr)+'\n')
    print(entry['path']+' exit='+str(result.returncode),flush=True)
    (out/'execution-manifest.json').write_text(json.dumps(executed,indent=2))
    if result.returncode:
        print(clean(result.stderr)[:4000],flush=True)
        failure={**item,'message_sanitized':clean(result.stderr)}
        (out/'failure.json').write_text(json.dumps(failure,indent=2))
        break  # Never continue on an unknown failure or manufacture later ledger entries.
    assert sql("SHOW cron.launch_active_jobs;").strip()=='off'
# Local disposable database only: unschedule imported jobs before any downstream test.
cron_exists=sql("SELECT to_regclass('cron.job') IS NOT NULL;").strip()=='t'
if cron_exists:
    snapshot=sql("SELECT coalesce(json_agg(json_build_object('jobid',jobid,'jobname',jobname,'schedule',schedule,'active',active,'command','<redigido>') ORDER BY jobid),'[]') FROM cron.job;",role='supabase_admin')
    (out/'cron-before-unschedule.json').write_text(snapshot)
    before=len(json.loads(snapshot))
    sql('SELECT cron.unschedule(jobid) FROM cron.job;',role='supabase_admin')
    after=int(sql('SELECT count(*) FROM cron.job;',role='supabase_admin').strip())
    assert after==0
else: before=after=0
(out/'cron-cleanup.json').write_text(json.dumps({'before':before,'after':after,'local_only':True,'scheduler_remained_off':True}))
meta['replay_exit_code']=1 if failure else 0
queries=json.loads((root/'docs/estudos/saas-e-desenvolvimento/verificacoes-352/catalogo-queries.json').read_text())
for category,query in queries.items():
    # Query content unchanged; psql CSV envelope is decoded without rewriting the SQL.
    r=run(['docker','exec','-i',db,'psql','-X','-U','postgres','-d','postgres','--csv','-v','ON_ERROR_STOP=1'],input=query)
    if r.returncode:raise RuntimeError(clean(r.stderr))
    import csv,io
    rows=list(csv.DictReader(io.StringIO(r.stdout)))
    (out/(category+'.csv')).write_text(r.stdout)
    (out/(category+'.json')).write_text(json.dumps(rows,ensure_ascii=False,indent=2))
meta['finished_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
(out/'metadata.json').write_text(json.dumps(meta,indent=2))

sys.exit(1 if failure else 0)

