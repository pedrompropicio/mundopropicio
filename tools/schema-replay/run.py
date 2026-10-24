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
meta={'sha':os.environ.get('GITHUB_SHA'),'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cli':run(['supabase','--version']).stdout.strip(),'scope':'supabase/migrations only; no manual/drizzle/seed/functions'}
(out/'metadata.json').write_text(json.dumps(meta,indent=2))
init=run(['supabase','init'],cwd=work)
if init.returncode: (out/'bootstrap.log').write_text(clean(init.stdout+init.stderr));sys.exit(init.returncode)
config=work/'supabase/config.toml';s=config.read_text();s=re.sub(r'^project_id = .*$', 'project_id = "mp352"',s,flags=re.M);s=s.replace('[db.seed]\nenabled = true','[db.seed]\nenabled = false');config.write_text(s)
# Bootstrap without app migrations or functions. Never publish local generated keys.
start=run(['supabase','start','-x','studio,imgproxy,edge-runtime,logflare,vector,supavisor'],cwd=work)
if start.returncode:
    (out/'bootstrap.log').write_text(clean(start.stdout+start.stderr));sys.exit(start.returncode)
db='supabase_db_mp352'
def sql(q,role='postgres'):
    r=run(['docker','exec','-i',db,'psql','-X','-U',role,'-d','postgres','-At','-v','ON_ERROR_STOP=1'],input=q)
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
(out/'isolation.json').write_text(json.dumps({'cron_launch_active_jobs':'off','external_container_egress':'REJECT','functions_copied':False,'manual_copied':False,'drizzle_copied':False}))
import shutil
shutil.copytree(root/'supabase/migrations',work/'supabase/migrations',dirs_exist_ok=True)
files=sorted((root/'supabase/migrations').glob('*.sql'))
(out/'migration-order.json').write_text(json.dumps([{'order':i+1,'file':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for i,f in enumerate(files)],indent=2))
reset=run(['supabase','db','reset','--local','--no-seed'],cwd=work)
log=clean(reset.stdout+reset.stderr);(out/'reset.log').write_text(log)
print(log[-16000:])
meta['reset_exit_code']=reset.returncode;meta['postgres']=sql('SELECT version();').strip()
applied=sql("SELECT coalesce(json_agg(version ORDER BY version),'[]') FROM supabase_migrations.schema_migrations;")
(out/'applied.json').write_text(applied)
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
# Never continue after a genuine SQL failure; no migrations edited/skipped.
sys.exit(reset.returncode)
