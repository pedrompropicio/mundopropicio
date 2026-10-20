"""Hermetic PG17 proof. Requires explicit opt-in and a local Unix socket only."""
import os, time, threading, hashlib
from pathlib import Path
import psycopg2
assert os.environ.get('ISSUE333_LOCAL_PROOF') == '1', 'Explicit local opt-in required'
ROOT=Path(__file__).resolve().parents[4]
DSN='host=/tmp/issue333-guard-pg port=55439 user=postgres'
def connect(db='guard333'):
 c=psycopg2.connect(DSN+' dbname='+db); c.autocommit=True; return c
admin=connect('postgres'); admin.cursor().execute('DROP DATABASE IF EXISTS guard333'); admin.cursor().execute('CREATE DATABASE guard333'); admin.close()
c=connect(); q=c.cursor()
q.execute((ROOT/'docs/testes/issue333/pg/canon12f-base.sql').read_text())
q.execute((ROOT/'docs/testes/issue333/pg/canon12f-seed.sql').read_text())
q.execute('ALTER TABLE ticket_office_statement_lines ADD CONSTRAINT ticket_office_statement_lines_statement_id_fkey FOREIGN KEY(statement_id) REFERENCES ticket_office_statements(id) ON DELETE CASCADE')
U='11111111-1111-1111-1111-111111111111'; C='22222222-2222-2222-2222-222222222222'; O='0f000000-0000-4000-8000-000000000001'
def claims(cur,user=U): cur.execute("SET request.jwt.claims=%s", ('{"sub":"'+user+'","role":"authenticated"}',))
claims(q)
def parent(n):
 sid='90000000-0000-4000-8000-'+f'{n:012d}'
 q.execute("INSERT INTO ticket_office_statements(id,company_id,financial_account_id,number,statement_date,document_total) VALUES(%s,%s,%s,%s,'2026-10-20',0)",(sid,C,O,'LOCAL-'+str(n)))
 return sid
def ins(s,pending=False): return ("INSERT INTO ticket_office_statement_lines(statement_id,company_id,line_type,description,amount,pending_document) VALUES(%s,%s,'advance','local',%s,%s)",(s,C,None if pending else 0,pending))
def confirm(s): return ('SELECT confirm_ticket_office_statement(%s)',(s,))
def execute(cur,statement): cur.execute(*statement)
def denied(stmt,needle):
 try: execute(q,stmt)
 except psycopg2.Error as e: assert needle in str(e), str(e); return
 raise AssertionError('Expected refusal: '+needle)
def race(label,first,second,expect=None):
 a=connect(); b=connect(); a.autocommit=False; b.autocommit=False
 ca=a.cursor(); cb=b.cursor(); claims(ca); claims(cb)
 execute(ca,first); outcome=[]
 def run():
  try: execute(cb,second); b.commit(); outcome.append('ok')
  except psycopg2.Error as e: b.rollback(); outcome.append(str(e))
 t=threading.Thread(target=run); t.start()
 deadline=time.monotonic()+5
 while time.monotonic()<deadline:
  q.execute('SELECT cardinality(pg_blocking_pids(%s))',(b.get_backend_pid(),))
  if q.fetchone()[0]>0: break
  if outcome: raise AssertionError(label+' did not wait: '+str(outcome))
  time.sleep(.01)
 else: raise AssertionError(label+' no blocking observed')
 a.commit(); t.join(5); assert not t.is_alive(),label+' stuck'
 assert len(outcome)==1 and ((expect in outcome[0]) if expect else outcome[0]=='ok'),(label,outcome)
 a.close(); b.close(); print('PASS',label,'blocking observed;', 'refused' if expect else 'committed')
# Old guard regression: confirmation lock held, BEFORE check sees draft, FK waits then admits insert.
s=parent(1); race('baseline confirms then INSERT reproduces defect',confirm(s),ins(s))
q.execute('SELECT count(*) FROM ticket_office_statement_lines WHERE statement_id=%s',(s,)); assert q.fetchone()[0]==1
q.execute("SELECT proacl::text,proowner,prosecdef,proconfig FROM pg_proc WHERE oid='tosl_guard()'::regprocedure"); acl=q.fetchone()
patch=ROOT/'supabase/manual/20261020_issue333_tosl_guard.INERTE.sql'
q.execute(patch.read_text())
q.execute("SELECT proacl::text,proowner,prosecdef,proconfig FROM pg_proc WHERE oid='tosl_guard()'::regprocedure"); assert q.fetchone()==acl
print('PASS identity/ACL/SECDEF/search_path unchanged')
s=parent(2); race('INSERT pending then confirm revalidates',ins(s,True),confirm(s),'pendente(s)')
q.execute('SELECT status FROM ticket_office_statements WHERE id=%s',(s,)); assert q.fetchone()[0]=='draft'
s=parent(3); race('confirm then INSERT denies after wait',confirm(s),ins(s),'as linhas não se alteram')
for i,op in enumerate(['UPDATE','DELETE'],4):
 s=parent(i); execute(q,ins(s))
 stmt=("UPDATE ticket_office_statement_lines SET description='changed' WHERE statement_id=%s" if op=='UPDATE' else 'DELETE FROM ticket_office_statement_lines WHERE statement_id=%s',(s,))
 race('confirm then '+op,confirm(s),stmt,'as linhas não se alteram')
 s=parent(i+10); execute(q,ins(s)); stmt=(stmt[0],(s,)); race(op+' then confirm',stmt,confirm(s))
# Draft writes, existing permission validation and company rule.
s=parent(20); execute(q,ins(s)); execute(q,("UPDATE ticket_office_statement_lines SET description='draft edit' WHERE statement_id=%s",(s,))); execute(q,('DELETE FROM ticket_office_statement_lines WHERE statement_id=%s',(s,)))
print('PASS draft INSERT UPDATE DELETE allowed')
s=parent(21); claims(q,'77777777-7777-7777-7777-777777777777'); denied(confirm(s),'Só admin'); claims(q,'33333333-3333-3333-3333-333333333333'); denied(confirm(s),'Sem acesso'); claims(q); execute(q,confirm(s)); print('PASS canonical viewer/tenant refusal and manager confirmation')
s=parent(22); denied((ins(s)[0],(s,'44444444-4444-4444-4444-444444444444',0,False)),'mesma empresa'); print('PASS company rule preserved')
# Move from confirmed source to draft destination cannot escape old-parent check.
a=parent(30); b=parent(31); execute(q,ins(a)); execute(q,confirm(a)); denied(('UPDATE ticket_office_statement_lines SET statement_id=%s WHERE statement_id=%s',(b,a)),'as linhas não se alteram'); print('PASS move checks confirmed OLD parent')
a=parent(32); b=parent(33); execute(q,ins(a)); race('destination confirm then move',confirm(b),('UPDATE ticket_office_statement_lines SET statement_id=%s WHERE statement_id=%s',(b,a)),'as linhas não se alteram')
a=parent(34); b=parent(35); execute(q,ins(a)); race('move then source confirm',('UPDATE ticket_office_statement_lines SET statement_id=%s WHERE statement_id=%s',(b,a)),confirm(a))
# Opposite moves acquire both parents in UUID order, no parent-lock cycle.
a=parent(40); b=parent(41); execute(q,ins(a)); execute(q,ins(b))
q.execute('SELECT id FROM ticket_office_statement_lines WHERE statement_id=%s',(a,)); la=q.fetchone()[0]
q.execute('SELECT id FROM ticket_office_statement_lines WHERE statement_id=%s',(b,)); lb=q.fetchone()[0]
race('opposite parent moves ordered',('UPDATE ticket_office_statement_lines SET statement_id=%s WHERE id=%s',(b,la)),('UPDATE ticket_office_statement_lines SET statement_id=%s WHERE id=%s',(a,lb)))
# Local rollback restores byte-identical definition, ACL and retains rows.
q.execute('SELECT count(*) FROM ticket_office_statement_lines'); count=q.fetchone()[0]
q.execute((ROOT/'supabase/manual/20261020_issue333_tosl_guard.ROLLBACK-INERTE.sql').read_text())
q.execute("SELECT md5(prosrc),proacl::text,proowner,prosecdef,proconfig FROM pg_proc WHERE oid='tosl_guard()'::regprocedure"); r=q.fetchone(); assert r[0]=='4cb7d3b770237dd37543ee526089555f' and r[1:]==acl
q.execute('SELECT count(*) FROM ticket_office_statement_lines'); assert q.fetchone()[0]==count
q.execute(patch.read_text())
try:q.execute(patch.read_text())
except psycopg2.Error as e: assert 'source_drift' in str(e); q.execute('ROLLBACK')
else:raise AssertionError('drift must refuse')
print('PASS rollback byte identity/ACL/retention; reapply and drift refusal')
q.execute("SELECT md5(prosrc) FROM pg_proc WHERE oid='confirm_ticket_office_statement(uuid)'::regprocedure"); assert q.fetchone()[0]=='2e868bc2a28ec291581028f6dc579c6a'
print('PASS canonical confirm remains unchanged; no cloud calls')
c.close()
