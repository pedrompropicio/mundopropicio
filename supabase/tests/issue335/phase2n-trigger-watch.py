"""#335 2n1c LOCAL ONLY: full row snapshots and owner-DDL detective boundary.
Runs after phase2n-context.py. Never connects to a hosted database.
"""
import hashlib
import json
import sys
from pathlib import Path
from uuid import uuid4
import psycopg2
from psycopg2 import sql

socket, port, root, output = sys.argv[1:]
assert socket.startswith('/tmp/issue335phase2h.')
root = Path(root)
rows = []
actors = [('editor','authenticated','17'),('manager','authenticated','16'),
 ('user','authenticated','15'),('anon','anon','10'),('service_role','service_role','10'),
 ('sandbox_exec','sandbox_exec','10'),('sandbox_exec specific','sandbox_exec_sfohvvlqccmmebvjgibx','10'),
 ('postgres','postgres','10'),('postgres SET executor','issue335_executor','10')]
company='00000000-0000-0000-0000-000000000001'

def connect(role='postgres', subject='10'):
 c=psycopg2.connect(host=socket,port=port,user='supabase_admin',dbname='postgres',sslmode='disable');c.autocommit=True
 q=c.cursor();session='postgres' if role=='issue335_executor' else role
 q.execute(sql.SQL('SET SESSION AUTHORIZATION {}').format(sql.Identifier(session)))
 q.execute("SELECT set_config('request.jwt.claim.sub',%s,false)",('00000000-0000-0000-0000-0000000000'+subject,))
 q.execute('SELECT rolsuper FROM pg_roles WHERE rolname=current_user');assert q.fetchone()==(False,)
 if role=='issue335_executor':q.execute('SET ROLE issue335_executor')
 return c

def run(c,s,p=None):
 with c.cursor() as q:
  q.execute(s,p);return q.fetchall() if q.description else q.rowcount

admin=connect()
tables=['transaction_offset_groups','transaction_offset_items','transaction_offsets','companies','suppliers','events','financial_accounts','event_settlements']
def snapshot(c):
 result={}
 for t in tables:
  # Every column, every row, deterministic total ordering by complete JSON row.
  data=run(c,sql.SQL("SELECT coalesce(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text FROM (SELECT to_jsonb(t) v FROM public.{} t) s").format(sql.Identifier(t)))[0][0]
  result[t]={'sha256':hashlib.sha256(data.encode()).hexdigest(),'content':json.loads(data)}
 return result

try:
 assert run(admin,'SHOW server_version')==[('17.6',)]
 g=str(run(admin,"SELECT issue335_test.j_group('2n1c-target')")[0][0])
 assert run(admin,'SELECT status FROM transaction_offset_groups WHERE id=%s',(g,))==[('applied',)]
 item,tx=run(admin,'SELECT id,transaction_id FROM transaction_offset_items WHERE group_id=%s ORDER BY id LIMIT 1',(g,))[0]
 # Existing offsets explicitly reference the item: assert target instead of merely counting.
 refs=run(admin,'SELECT id FROM transaction_offsets WHERE receivable_item_id=%s OR payable_item_id=%s',(item,item))
 assert refs, 'item target must be referenced by an offset'
 assert run(admin,'SELECT id FROM transaction_offset_items WHERE group_id=%s',(g,))
 other=str(run(admin,'SELECT id FROM companies WHERE id<>%s ORDER BY id LIMIT 1',(company,))[0][0])
 template=run(admin,'SELECT to_jsonb(i) FROM transaction_offset_items i WHERE id=%s',(item,))[0][0]
 # Preserve real FK ids and every valid existing value; change unique key/order only.
 def item_insert(group_id,company_id):
  v=dict(template);v.update(id=str(uuid4()),group_id=group_id,company_id=company_id,cash_order=99)
  return "INSERT INTO transaction_offset_items SELECT (jsonb_populate_record(NULL::transaction_offset_items,%s::jsonb)).* RETURNING id",(json.dumps(v),)
 attacks=[('INSERT applied group',lambda:item_insert(g,company)),
          ('INSERT missing group',lambda:item_insert(str(uuid4()),company)),
          ('INSERT other company',lambda:item_insert(g,other)),
          ('DELETE referenced group',lambda:('DELETE FROM transaction_offset_groups WHERE id=%s RETURNING id',(g,))),
          ('DELETE referenced item',lambda:('DELETE FROM transaction_offset_items WHERE id=%s RETURNING id',(item,)))]
 # ANTES: actual target state and references not certified in 1b. Positive-control
 # constraints executed in an owner-only test trigger, rolled back in full.
 run(admin,'CREATE SCHEMA issue335_2n1c')
 run(admin,"""CREATE TABLE issue335_2n1c.control(command text);
 CREATE FUNCTION issue335_2n1c.context() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 DECLARE tok uuid:=gen_random_uuid();BEGIN
 INSERT INTO issue335_execution_context VALUES(pg_backend_pid(),pg_current_xact_id(),tok,'execute');
 PERFORM set_config('issue335.ctx',tok::text,true);EXECUTE NEW.command;
 DELETE FROM issue335_execution_context WHERE backend_pid=pg_backend_pid();RETURN NEW;END $$;
 CREATE TRIGGER context BEFORE INSERT ON issue335_2n1c.control FOR EACH ROW EXECUTE FUNCTION issue335_2n1c.context()""")
 for name,args in attacks:
  before=snapshot(admin);run(admin,'BEGIN');st,p=args()
  with admin.cursor() as q:command=q.mogrify(st,p).decode()
  try:
   run(admin,'INSERT INTO issue335_2n1c.control VALUES(%s)',(command,))
   raise AssertionError('constraint control unexpectedly accepted '+name)
  except psycopg2.Error as e:
   assert e.pgcode in ('P0001','23503','23514'),(name,e.pgcode,e.diag.message_primary)
   rows.append(dict(step=1,phase='BEFORE-validity-control',attack=name,actual=e.pgcode+':'+e.diag.message_primary))
  finally:run(admin,'ROLLBACK')
  assert before==snapshot(admin)
 run(admin,'GRANT issue335_executor TO postgres WITH INHERIT FALSE,SET TRUE')
 # Managed attacks outside core: same-session complete snapshot while statement's
 # savepoint is rolled back, THEN COMMIT. Equality is not tautological outer ROLLBACK.
 for label,role,subject in actors:
  for name,args in attacks:
   before=snapshot(admin);b=connect(role,subject);run(b,'BEGIN');run(b,'SAVEPOINT attack')
   try:
    st,p=args();affected=run(b,st,p);assert affected==[],(label,name,affected)
    actual='RLS:0';run(b,'RELEASE SAVEPOINT attack')
   except psycopg2.Error as e:
    actual=e.pgcode+':'+e.diag.message_primary
    assert e.pgcode in ('42501','P0001','23503','23514'),(label,name,actual)
    run(b,'ROLLBACK TO SAVEPOINT attack');run(b,'RELEASE SAVEPOINT attack')
   run(b,'COMMIT');b.close();after=snapshot(admin);assert before==after,(label,name,'business row mutation')
   rows.append(dict(step=1,phase='AFTER',role=label,attack=name,expected='DENY/RLS0',actual=actual,affected=0,before=before,after=after))
 # Explicit expected unmanaged offset bypass, using exact known valid legacy pair.
 for role in ('service_role','postgres'):
  before=snapshot(admin);b=connect(role);run(b,'BEGIN')
  pair=run(admin,"SELECT receivable_transaction_id,payable_transaction_id FROM transaction_offsets WHERE offset_group_id IS NULL ORDER BY id LIMIT 1")
  assert pair,'existing valid legacy offset required'
  oid=str(run(b,'INSERT INTO transaction_offsets(company_id,receivable_transaction_id,payable_transaction_id,amount) VALUES(%s,%s,%s,1) RETURNING id',(company,*pair[0]))[0][0])
  assert str(run(b,'DELETE FROM transaction_offsets WHERE id=%s RETURNING id',(oid,))[0][0])==oid
  run(b,'ROLLBACK');b.close();assert snapshot(admin)==before
  rows.append(dict(step=1,phase='legacy-bypass',role=role,expected='INSERT1 DELETE1 authorized unmanaged bypass',actual='INSERT1 DELETE1; rolled back',before=before,after=snapshot(admin)))
 run(admin,'GRANT issue335_executor TO postgres WITH INHERIT FALSE,SET FALSE')
 # BEFORE detective invariant: previous invariants do not enumerate user triggers.
 run(admin,"""CREATE TABLE issue335_2n1c.attacker(x int);
 CREATE FUNCTION issue335_2n1c.attack() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 BEGIN IF NOT issue335_context_valid('execute') THEN RAISE EXCEPTION 'attacker_not_inside_core';END IF;
 PERFORM current_setting('issue335.ctx');RETURN NEW;END $$;
 CREATE FUNCTION issue335_2n1c.hook() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 BEGIN INSERT INTO issue335_2n1c.attacker VALUES(1);RETURN NEW;END $$""")
 baseline=run(admin,'SELECT * FROM issue335_invariant_counts()')
 run(admin,'CREATE TRIGGER issue335_2n1c_hostile AFTER INSERT ON transaction_offset_groups FOR EACH ROW EXECUTE FUNCTION issue335_2n1c.hook()')
 assert run(admin,'SELECT * FROM issue335_invariant_counts()')==baseline
 rows.append(dict(step=2,phase='BEFORE',expected='old invariants blind to added trigger',actual='unchanged invariant rows'))
 run(admin,'DROP TRIGGER issue335_2n1c_hostile ON transaction_offset_groups')
 run(admin,(root/'supabase/manual/20261021_issue335_trigger_watch.INERTE.sql').read_text())
 legit=run(admin,'SELECT current_count,conforme,sample FROM issue335_trigger_watch()')[0]
 assert legit[0:2]==(0,True),('legitimate catalog false positive',legit)
 rows.append(dict(step=2,phase='AFTER-legitimate',actual=legit))
 run(admin,'BEGIN')
 run(admin,'CREATE TRIGGER issue335_2n1c_hostile AFTER INSERT ON transaction_offset_groups FOR EACH ROW EXECUTE FUNCTION issue335_2n1c.hook()')
 run(admin,"SELECT issue335_test.j_group('2n1c-real-trigger')")
 assert run(admin,'SELECT count(*) FROM issue335_2n1c.attacker')==[(1,)]
 detected=run(admin,'SELECT current_count,conforme,sample FROM issue335_trigger_watch()')[0]
 assert detected[0:2]==(1,False),detected
 assert any(x['trigger_name']=='issue335_2n1c_hostile' and not x['allowed'] for x in detected[2])
 rows.append(dict(step=2,phase='AFTER-attacker-real-core',actual=detected))
 run(admin,'ROLLBACK')
 assert run(admin,'SELECT current_count,conforme FROM issue335_trigger_watch()')==[(0,True)]
 run(admin,(root/'supabase/manual/20261021_issue335_trigger_watch.ROLLBACK-INERTE.sql').read_text())
 print('PASS 2n1c 45 managed attacks; 5 target controls; 2 authorized legacy bypasses; full business-row snapshots equal; detector BEFORE/AFTER')
finally:
 try:
  run(admin,'ROLLBACK');run(admin,'DROP SCHEMA IF EXISTS issue335_2n1c CASCADE')
  run(admin,'GRANT issue335_executor TO postgres WITH INHERIT FALSE,SET FALSE')
 finally:
  Path(output).write_text(json.dumps(rows,indent=2,ensure_ascii=False,default=str));admin.close()
