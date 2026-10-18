"""Disposable PostgreSQL, explicit local socket only; no app credentials or external calls."""
import concurrent.futures, json, os, pathlib, subprocess, tempfile
repo=pathlib.Path.cwd(); folder=repo/'docs/testes/smart-link-choice-ios'
root=pathlib.Path(tempfile.mkdtemp(prefix='choice-ios-pg-')); os.chown(root,1000,1000)
env={'PATH':'/bin:/usr/bin','HOME':str(root),'TMPDIR':str(root),'LC_ALL':'C'}
def demote(): os.setgid(1000); os.setuid(1000)
def command(args): return subprocess.run(args,env=env,preexec_fn=demote,capture_output=True,text=True,check=True)
command(['initdb','-D',str(root/'data'),'-A','trust','-U','postgres','--no-locale'])
command(['pg_ctl','-D',str(root/'data'),'-l',str(root/'server.log'),'-o',f'-k {root} -p 55439 -c listen_addresses=','-w','start'])
def sql(q,ok=True):
 r=subprocess.run(['psql','-X','-h',str(root),'-p','55439','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',q],env=env,capture_output=True,text=True)
 if ok and r.returncode: raise RuntimeError(r.stderr)
 return r.stdout.strip() if ok else r
results=[]
def check(name,condition):
 if not condition: raise AssertionError(name)
 results.append({'test':name,'status':'PASS'})
try:
 fields='link_id uuid,company_id uuid,artist_id uuid,song_id uuid,event text,mode text,destination text,opened text,event_id text,utm_source text,utm_medium text,utm_campaign text,utm_content text,utm_term text,fbclid text,ttclid text,country text,region text,city text,device text,os text,in_app_browser text,ip_hash text,origin text,capi_status text,tiktok_status text'
 sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE public.song_links(id uuid PRIMARY KEY, company_id uuid,artist_id uuid,song_id uuid,active boolean,destinations jsonb); CREATE TABLE public.song_link_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),'+fields+',created_at timestamptz NOT NULL DEFAULT now()); GRANT ALL ON public.song_links,public.song_link_events TO service_role; ALTER TABLE public.song_link_events ENABLE ROW LEVEL SECURITY; CREATE POLICY service_local ON public.song_link_events TO service_role USING(true) WITH CHECK(true);')
 original=(repo/'drizzle/migrations/0080_derp234_song_link_ssr_dedup.sql').read_text()
 sql(original[original.index('CREATE UNIQUE INDEX'):original.index('ALTER TABLE public.song_link_diag')])
 sql(original[original.index('CREATE OR REPLACE FUNCTION'):])
 baseline=sql("SELECT md5(pg_get_functiondef('public.song_link_event_claim(jsonb)'::regprocedure))||':'||proacl::text FROM pg_proc WHERE oid='public.song_link_event_claim(jsonb)'::regprocedure")
 candidate=(folder/'choice-arrival.PROPOSTA.sql').read_text()
 # Original tracked SQL has formatting different from Live; local guard binds to this local baseline only.
 localmd5=baseline.split(':')[0]
 sql(candidate.replace('0fa7ff7255cf58ace770d21abfabe2e1',localmd5))
 check('canonical source and ACL unchanged',baseline==sql("SELECT md5(pg_get_functiondef('public.song_link_event_claim(jsonb)'::regprocedure))||':'||proacl::text FROM pg_proc WHERE oid='public.song_link_event_claim(jsonb)'::regprocedure"))
 link='00000000-0000-4000-8000-000000000001'; arrival='00000000-0000-4000-8000-000000000002'; company='00000000-0000-4000-8000-000000000003'
 sql(f"INSERT INTO song_links VALUES('{link}','{company}',NULL,NULL,true,'{{\"spotify\":{{\"web\":\"https://example.invalid\"}},\"youtube\":{{\"web\":\"https://example.invalid\"}}}}'); INSERT INTO song_link_events(link_id,company_id,event,event_id,origin,utm_campaign) VALUES('{link}','{company}','arrival','{arrival}','ssr','server_campaign')")
 def payload(dest='spotify',aid=arrival,eid='00000000-0000-4000-8000-000000000004',**kw):
  return dict(link_id=link,company_id='00000000-0000-4000-8000-000000000099',event='choice',origin='browser',arrival_event_id=aid,event_id=eid,destination=dest,utm_campaign='forged',**kw)
 def call(p): return "SET ROLE service_role; SELECT public.song_link_choice_claim('"+json.dumps(p)+"'::jsonb)"
 p=payload(); check('first choice claimed',bool(sql(call(p)).splitlines()[-1]))
 check('same destination new UUID duplicate',sql(call(payload(eid='00000000-0000-4000-8000-000000000005'))).splitlines()[-1]=='SET')
 check('identity and campaign server derived',sql("SELECT company_id::text||':'||utm_campaign FROM song_link_events WHERE event='choice'")==company+':server_campaign')
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  values=list(pool.map(lambda i:sql(call(payload(dest='youtube',eid=f'00000000-0000-4000-8000-{i:012d}'))),[6,7]))
 check('two connections one winner',sql("SELECT count(*) FROM song_link_events WHERE event='choice' AND destination='youtube'")=='1')
 check('exactly two destinations accepted',sql("SELECT count(*) FROM song_link_events WHERE event='choice'")=='2')
 for name,params in [('unknown arrival',payload(aid='00000000-0000-4000-8000-000000000098')),('unknown destination',payload(dest='spam')),('malformed ID',payload(aid='bad'))]:
  check(name,sql(call(params),False).returncode!=0)
 for name,change in [('browser not SSR',"origin='browser'"),('two hour boundary',"created_at=now()-interval '2 hours'"),('future arrival',"created_at=now()+interval '1 hour'"),('other company',"company_id='00000000-0000-4000-8000-000000000099'"),('other link',"link_id='00000000-0000-4000-8000-000000000099'")]:
  sql('UPDATE song_link_events SET '+change+" WHERE event='arrival';")
  check(name,sql(call(payload()),False).returncode!=0)
  sql(f"UPDATE song_link_events SET origin='ssr',created_at=now(),company_id='{company}',link_id='{link}' WHERE event='arrival'")
 check('anon cannot execute',sql("SET ROLE anon; SELECT song_link_choice_claim('{}')",False).returncode!=0)
 check('authenticated cannot execute',sql("SET ROLE authenticated; SELECT song_link_choice_claim('{}')",False).returncode!=0)
 before=sql('SELECT count(*) FROM song_link_events')
 sql("BEGIN; DELETE FROM song_link_events WHERE event='choice'; "+call(payload())+'; ROLLBACK;')
 check('rollback preserves counts',sql('SELECT count(*) FROM song_link_events')==before)
 print(json.dumps({'postgres':sql('SHOW server_version'),'live_touched':False,'tests':results,'guard_note':'SQL body tested; guard adapted to local tracked-function formatting, Live expected MD5 unchanged in inert file.'},indent=2))
finally:
 command(['pg_ctl','-D',str(root/'data'),'-m','immediate','-w','stop'])
