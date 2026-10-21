"""LOCAL ONLY: effective role x internal-call matrix; no hosted credentials."""
import json
import sys
from pathlib import Path
from uuid import uuid4

import psycopg2
from psycopg2 import sql

sock, port, output = sys.argv[1:]
if not sock.startswith('/tmp/'):
    raise SystemExit('local Unix socket required')
c = psycopg2.connect(host=sock, port=port, user='postgres', dbname='postgres', sslmode='disable')
c.autocommit = True
q = c.cursor()
q.execute('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')
assert q.fetchone() == (False,)
q.execute("SELECT p.oid::regprocedure::text,p.proname,p.prorettype='trigger'::regtype FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'issue335_%' OR p.proname LIKE '_issue335_%') ORDER BY 1")
functions = q.fetchall()
actors = [('authenticated editor','authenticated','17'), ('authenticated manager','authenticated','16'),
          ('authenticated user','authenticated','15'), ('service_role','service_role','10'),
          ('sandbox_exec','sandbox_exec','10'),
          ('sandbox_exec hosted','sandbox_exec_sfohvvlqccmmebvjgibx','10'),
          ('postgres without SET ROLE',None,'10'), ('postgres SET ROLE authenticated','authenticated','10'),
          ('postgres SET ROLE postgres','postgres','10'), ('anon','anon','10')]
calls = {
 '_issue335_execute': "SELECT public._issue335_execute(NULL,NULL,'[]',NULL,CURRENT_DATE,NULL)",
 '_issue335_reverse': 'SELECT public._issue335_reverse(NULL,NULL,NULL)',
 'issue335_lock_parents': "SELECT public.issue335_lock_parents('events',ARRAY[]::uuid[])",
 'issue335_worker': "SELECT public.issue335_worker('{\"op\":\"execute\"}')",
 'issue335_context_valid': 'SELECT public.issue335_context_valid(NULL)',
 'issue335_matching_transactions': 'SELECT public.issue335_matching_transactions(NULL)',
 'issue335_normalize': "SELECT public.issue335_normalize('probe')",
 'issue335_score': "SELECT public.issue335_score('a','b')",
 'issue335_uid': 'SELECT public.issue335_uid()',
 'issue335_payment_flow_blocked': 'SELECT public.issue335_payment_flow_blocked(NULL)',
 'issue335_camarim_leg': 'SELECT public.issue335_camarim_leg(NULL)',
 'issue335_balance_invariant_count': 'SELECT public.issue335_balance_invariant_count()',
 'issue335_invariant_counts': 'SELECT * FROM public.issue335_invariant_counts()',
}
rows = []

def begin(role, uid):
    q.execute('BEGIN')
    q.execute("SELECT set_config('request.jwt.claim.sub',%s,true)", ('00000000-0000-0000-0000-0000000000'+uid,))
    if role:
        q.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(role)))

def probe(label, role, uid, attack, statement, expected, reason):
    begin(role, uid)
    try:
        q.execute(statement)
        value = q.fetchall() if q.description else []
        actual = 'ok:false' if value == [(False,)] else 'ok'
    except psycopg2.Error as e:
        actual = e.pgcode + ':' + e.diag.message_primary
    finally:
        q.execute('ROLLBACK')
    allowed = actual in expected or any(actual.startswith(code+':') for code in expected if len(code)==5)
    rows.append(dict(role=label,attack=attack,expected=expected,actual=actual,pass_=allowed,justification=reason))

owner_helpers = {'issue335_normalize','issue335_score','issue335_matching_transactions','issue335_uid',
                 'issue335_payment_flow_blocked','issue335_camarim_leg','issue335_balance_invariant_count','issue335_invariant_counts'}
for label, role, uid in actors:
    owner = role in (None, 'postgres')
    for signature, name, trigger in functions:
        statement = 'SELECT public.'+name+'()' if trigger else calls[name]
        if trigger:
            expected = ['0A000'] if owner else ['42501']
        elif name=='issue335_context_valid':
            expected=['ok:false']
        elif owner and name in owner_helpers:
            expected=['ok']
        elif owner and name in ('_issue335_execute','_issue335_reverse','issue335_lock_parents'):
            expected=['P0001:managed_operation_required']
        else:
            expected=['42501']
        probe(label,role,uid,'direct '+signature,statement,expected,
              'True table/function owner retains administration; application roles get no internal execution. Context predicate may return false without granting capability.')
    for attack,token in [('forged GUC',str(uuid4())),('token from earlier transaction',str(uuid4()))]:
        probe(label,role,uid,attack,"SELECT set_config('issue335.ctx','"+token+"',true); SELECT public.issue335_context_valid(NULL)",['ok:false'],
              'GUC alone lacks backend/xid/context/trigger proof; earlier-token case does not certify a captured valid cross-session token.')
    probe(label,role,uid,'context INSERT',"INSERT INTO public.issue335_execution_context VALUES(pg_backend_pid(),pg_current_xact_id(),gen_random_uuid(),'execute')",
          ['ok'] if owner else ['42501'], 'True table owner can administer context; application roles cannot forge rows. No claim of protection against owner DDL.')
    probe(label,role,uid,'SET ROLE executor','SET LOCAL ROLE issue335_executor',['42501'],'Installation membership must be revoked; no role may assume executor afterwards.')
    for table in ['companies','suppliers','events','financial_accounts','event_settlements']:
        probe(label,role,uid,'broad UPDATE privilege '+table,
              "SELECT has_table_privilege(current_user,'public."+table+"','UPDATE')",['ok','ok:false'],
              'Observation only: existing legal UPDATE grants are retained. This is not an executed valid-row mutation or a claim that all actors lack UPDATE.')
c.close()
Path(output).write_text(json.dumps(rows,ensure_ascii=False,indent=2))
bad=[r for r in rows if not r['pass_']]
for r in bad:
    print('FAIL',r['role'],r['attack'],r['expected'],r['actual'])
print('matrix',len(rows),'rows;',len(bad),'unexpected; partial: valid cross-session token and five real-row UPDATE matrices outstanding')
if bad:
    raise SystemExit(1)