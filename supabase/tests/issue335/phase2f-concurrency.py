"""Three persistent local sessions. Barrier is an observed lock edge, never elapsed sleep."""
import concurrent.futures
import json
import os
from pathlib import Path
import sys
import time
import uuid
import psycopg2

socket, port, root = sys.argv[1:]
assert socket.startswith('/tmp/issue335phase2f.')
conns = [psycopg2.connect(host=socket, port=port, user='supabase_admin', dbname='postgres', sslmode='disable', application_name=f'issue335_2f_{i}') for i in range(3)]
for c in conns:
    c.autocommit = True
s1, s2, observer = conns
def sql(c, statement, args=None):
    with c.cursor() as cur:
        cur.execute(statement, args)
        return cur.fetchall() if cur.description else []
company='00000000-0000-0000-0000-000000000001'
supplier='00000000-0000-0000-0000-000000000020'
account='00000000-0000-0000-0000-000000000030'
uid='00000000-0000-0000-0000-000000000010'
for c in conns:
    sql(c,"SELECT set_config('request.jwt.claim.sub',%s,false)",(uid,))
    sql(c,"SET statement_timeout='12s'")
def fixture():
    ids=[str(uuid.uuid4()),str(uuid.uuid4())]
    for ident,kind,value in zip(ids,['income','expense'],[100,40]):
        sql(observer,"INSERT INTO transactions(id,type,description,amount,iva_rate,date,supplier_id) VALUES(%s,%s,'2f concurrent',%s,0,'2026-10-13',%s)",(ident,kind,value,supplier))
    return ids
def call(ids,request):
    items=json.dumps([dict(transaction_id=ids[0],mode='settle'),dict(transaction_id=ids[1],mode='offset')])
    movement=json.dumps(dict(account_id=account,date='2026-10-13',amount=60))
    return "SELECT transaction_offset_execute(%s,%s,%s::jsonb,%s::jsonb,'2026-10-13')",(request,supplier,items,movement)
def outcome(c,statement,args):
    try:
        return ('ok',sql(c,statement,args))
    except psycopg2.Error as e:
        return (e.pgcode,e.diag.message_primary)
def blocked(waiter,holder):
    deadline=time.monotonic()+8
    while time.monotonic()<deadline:
        if sql(observer,'SELECT %s=ANY(pg_blocking_pids(%s))',(holder,waiter))[0][0]:
            return
    raise AssertionError('expected exact lock edge not observed')
original=sql(observer,"SELECT pg_get_functiondef('public._issue335_execute(uuid,uuid,jsonb,jsonb,date,text)'::regprocedure)")[0][0]
fence=""" -- Admission fence: recheck after the potentially waiting request lock, and
 -- retain shared advisory fence until commit. Closure drains admitted writes.
 PERFORM pg_advisory_xact_lock_shared(335,1);
 PERFORM 1 FROM public.transaction_offset_control WHERE singleton AND enabled;
 IF NOT FOUND THEN RAISE EXCEPTION 'encontro_desativado'; END IF;
"""
assert fence in original
sql(observer,original.replace(fence,''))
with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
    # Deterministic stale admission BEFORE, then same schedule AFTER correction.
    ids=fixture(); request=str(uuid.uuid4())
    key=sql(s1,'SELECT hashtextextended(%s,335)',(company+request,))[0][0]
    sql(s1,'SELECT pg_advisory_lock(%s)',(key,))
    sql(s2,'SET ROLE authenticated')
    statement,args=call(ids,request)
    future=pool.submit(outcome,s2,statement,args)
    blocked(s2.get_backend_pid(),s1.get_backend_pid())
    sql(observer,Path(root+'/supabase/manual/20261021_issue335_offset_kill_switch.INERTE.sql').read_text())
    assert sql(observer,'SELECT enabled FROM transaction_offset_control')[0][0] is False
    sql(s1,'SELECT pg_advisory_unlock(%s)',(key,))
    result=future.result(timeout=12)
    assert result[0]=='ok',result
    assert sql(observer,"SELECT count(*) FROM transaction_offset_groups WHERE request_id=%s AND status='applied'",(request,))[0][0]==1
    assert sql(observer,"SELECT count(*) FROM transaction_payments WHERE transaction_id=ANY(%s::uuid[]) AND status='paid'",(ids,))[0][0]==3
    result=outcome(s2,*call(ids,str(uuid.uuid4())))
    assert result[0]=='42501',result
    print('REPRODUCED 2f F/I: in-flight invocation applies AFTER switch committed; one group, three legs. Fresh call 42501. OPEN, not corrected.')
    sql(observer,Path(root+'/supabase/manual/20261021_issue335_offset_kill_switch.ROLLBACK-INERTE.sql').read_text())
    sql(observer,original)
    ids=fixture(); request=str(uuid.uuid4())
    key=sql(s1,'SELECT hashtextextended(%s,335)',(company+request,))[0][0]
    sql(s1,'SELECT pg_advisory_lock(%s)',(key,))
    future=pool.submit(outcome,s2,*call(ids,request))
    blocked(s2.get_backend_pid(),s1.get_backend_pid())
    sql(observer,Path(root+'/supabase/manual/20261021_issue335_offset_kill_switch.INERTE.sql').read_text())
    sql(s1,'SELECT pg_advisory_unlock(%s)',(key,))
    result=future.result(timeout=12)
    assert result==('P0001','encontro_desativado'),result
    assert sql(observer,'SELECT count(*) FROM transaction_offset_groups WHERE request_id=%s',(request,))[0][0]==0
    assert sql(observer,'SELECT count(*) FROM transaction_payments WHERE transaction_id=ANY(%s::uuid[])',(ids,))[0][0]==0
    assert outcome(s2,*call(ids,str(uuid.uuid4())))[0]=='42501'
    print('PASS 2f F/I AFTER: same observed request-lock edge; closure committed first; resumed call encontro_desativado, zero group/payments, fresh call 42501.')
    sql(observer,Path(root+'/supabase/manual/20261021_issue335_offset_kill_switch.ROLLBACK-INERTE.sql').read_text())
for c in conns:c.close()